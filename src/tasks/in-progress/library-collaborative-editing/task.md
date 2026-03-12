---
title: "Library BlockNote エディタのリアルタイム共同編集対応"
type: feature
emoji: "👥"
topics:
  - Library
  - BlockNote
  - Yjs
  - WebSocket
  - Collaboration
  - Real-time
published: true
targetFiles:
  - apps/library/src/app/v1beta/_components/data-detail-ui/html/
  - apps/library-api/
  - packages/collaboration/
github: ""
---

# Library BlockNote エディタのリアルタイム共同編集対応

## 概要

Library アプリの BlockNote エディタにリアルタイム共同編集機能を追加する。複数ユーザーが同一ドキュメントを同時に編集でき、カーソル位置やテキスト変更がリアルタイムに同期される。

## 背景・目的

- **現状**: Library の BlockNote エディタは単一ユーザー向け。編集は「Save」ボタンで一括保存され、他ユーザーの変更はページリロードで反映される（Last-Write-Wins）
- **課題**: 複数人が同時に同じデータを編集すると、後から保存した方の変更で先の変更が上書きされる
- **目的**: Yjs CRDT を導入し、複数ユーザーがリアルタイムで同一ドキュメントを共同編集できるようにする
- **メリット**:
  - 同時編集時のデータ競合を排除
  - カーソル位置の可視化によるコラボレーション体験の向上
  - 変更の即座反映による作業効率の改善

## 現状の実装分析

### BlockNote エディタの構成

```
apps/library/src/app/v1beta/_components/data-detail-ui/html/
├── index.tsx       # dynamic import ラッパー (ssr: false)
├── editor.tsx      # BlockNote エディタ本体 ('use client')
├── viewer.tsx      # 読み取り専用ビューア
├── style.css       # カスタムスタイル
├── html-editor.stories.tsx
└── html-viewer.stories.tsx
```

### 現在のバージョン・依存関係

```json
{
  "@blocknote/core": "^0.15.7",
  "@blocknote/mantine": "^0.15.7",
  "@blocknote/react": "^0.15.7",
  "@blocknote/shadcn": "^0.15.7"
}
```

**Yjs 関連パッケージ**: 未導入

### 現在のデータフロー

```
1. Server Component (page.tsx) が GraphQL でデータ取得
2. Client Component (editor.tsx) が BlockNote エディタをレンダリング
3. useCreateBlockNote() でエディタ初期化
4. ユーザー編集 → onChange → ローカル state 更新
5. 「Save」ボタン → Server Action → GraphQL mutation (updateData)
6. HTML/Markdown として DB に保存
```

### エディタの特徴

- Markdown ペースト検出（ヘッディング、リスト、コードブロック等）
- HTML ↔ Markdown 双方向変換
- Mantine UI テーマ
- ダークモード対応

## 詳細仕様

### 機能要件

1. **リアルタイム同期**: 複数ユーザーのテキスト変更が即座に他のユーザーの画面に反映される
2. **カーソル表示**: 他ユーザーのカーソル位置・選択範囲がリアルタイムに表示される（ユーザー名・色付き）
3. **プレゼンス表示**: 現在ドキュメントを閲覧/編集中のユーザー一覧が表示される
4. **永続化**: Yjs ドキュメントの状態が DB に永続化され、全ユーザーが切断しても最新状態が保持される
5. **既存互換**: HTML/Markdown 形式での保存・取得フローが維持される（Yjs ドキュメントから変換）
6. **オートセーブ**: 手動の「Save」ボタンに加え、変更のオートセーブ機能を提供する

### 非機能要件

- **レイテンシ**: テキスト変更が他ユーザーに 200ms 以内に反映される
- **スケーラビリティ**: 1 ドキュメントにつき同時 10 ユーザー程度をサポート
- **耐障害性**: WebSocket 切断時にローカルで編集継続でき、再接続時に自動同期
- **セキュリティ**: WebSocket 接続は認証済みユーザーのみ。テナント間のデータ分離を保証
- **パフォーマンス**: エディタの初期表示が 2 秒以内（WebSocket 接続含む）

### コンテキスト別の責務

```yaml
contexts:
  collaboration:
    description: "リアルタイム共同編集のコアインフラ"
    responsibilities:
      - Yjs WebSocket サーバーの実装（axum）
      - Y.Doc の永続化（MySQL/TiDB）
      - ドキュメントルーム管理
      - 認証・認可チェック
      - 接続ライフサイクル管理

  library-api:
    description: "Library API への WebSocket エンドポイント統合"
    responsibilities:
      - WebSocket ルーティング（/ws/documents/:id）
      - テナント分離の保証
      - 既存 GraphQL API との整合性維持

  library-frontend:
    description: "フロントエンドのエディタ統合"
    responsibilities:
      - BlockNote + Yjs の統合
      - ユーザーカーソル/プレゼンス UI
      - 再接続・オフライン編集対応
      - 既存の保存フローとの整合
```

## 実装方針

### アーキテクチャ設計

```
[Next.js Frontend]                    [Rust Backend (library-api)]
┌─────────────────────┐              ┌──────────────────────────────┐
│  CollaborativeEditor │              │  axum Router                 │
│  ┌───────────────┐  │   WebSocket  │  ┌────────────────────────┐  │
│  │ BlockNote     │  │◄────────────►│  │ /ws/documents/:id      │  │
│  │ + Yjs         │  │   y-sync     │  │ (WebSocket handler)    │  │
│  │ + y-websocket │  │   protocol   │  │                        │  │
│  └───────────────┘  │              │  │  ┌──────────────────┐  │  │
│  ┌───────────────┐  │              │  │  │ yrs (Rust CRDT)  │  │  │
│  │ Awareness     │  │              │  │  │ - BroadcastGroup │  │  │
│  │ (cursors/     │  │              │  │  │ - Awareness      │  │  │
│  │  presence)    │  │              │  │  └──────────────────┘  │  │
│  └───────────────┘  │              │  └────────────────────────┘  │
└─────────────────────┘              │                              │
                                     │  ┌────────────────────────┐  │
                                     │  │ Persistence Layer      │  │
                                     │  │ - Y.Doc → binary blob  │  │
                                     │  │ - MySQL/TiDB storage   │  │
                                     │  │ - HTML/MD conversion   │  │
                                     │  └────────────────────────┘  │
                                     └──────────────────────────────┘
```

### 技術選定

| 技術 | 選定理由 |
|------|---------|
| **Yjs** (frontend) | BlockNote 公式サポート。CRDT ベースで競合解決が堅牢 |
| **y-websocket** (frontend) | Yjs 公式 WebSocket プロバイダー。安定性が高い |
| **yrs** (backend) | Yjs の Rust ポート。バイナリプロトコル互換。既存 axum バックエンドに統合可能 |
| **axum WebSocket** (backend) | 既存の axum 0.7 ルーターに WebSocket ハンドラーを追加。別プロセス不要 |

#### axum バージョンに関する注意

- 現在プロジェクトは **axum 0.7** を使用
- `yrs-axum` クレートは axum 0.8.1 向けのため直接利用不可
- **対応方針**: axum 0.7 の WebSocket サポート (`axum::extract::ws`) と `yrs` クレートを直接組み合わせて実装する
- `yrs-axum` のソースコードを参考に、axum 0.7 互換の WebSocket ハンドラーを自前で実装

#### BlockNote バージョンアップの検討

- 現在: v0.15.7 → 最新: v0.47.0
- v0.42.0 以降で `@blocknote/core/yjs` エクスポートが追加（サーバーサイド変換に有用）
- **アップグレードが推奨だが、Breaking Changes が多いため段階的に進める**
- Phase 1 では v0.15.7 のまま Yjs 統合を試み、必要に応じてアップグレード

### データ永続化戦略

```yaml
storage:
  primary:
    format: "Yjs binary update (BLOB)"
    table: "library_api.collaborative_documents"
    columns:
      - id: "VARCHAR(29) PRIMARY KEY"           # data_id に対応
      - property_id: "VARCHAR(29) NOT NULL"     # property_id
      - yjs_state: "LONGBLOB NOT NULL"          # Y.Doc のエンコード済みバイナリ
      - version: "BIGINT NOT NULL DEFAULT 0"    # 楽観的ロック用
      - updated_at: "DATETIME(6) NOT NULL"
      - created_at: "DATETIME(6) NOT NULL"

  conversion:
    description: "Yjs ドキュメントから HTML/Markdown への変換"
    timing: "永続化時に同時実行"
    note: "既存の PropertyData (html/markdown) も更新し、非共同編集ユーザーとの互換性を維持"

  lifecycle:
    - "WebSocket 接続時: DB から Y.Doc を復元しメモリにロード"
    - "編集中: メモリ上の Y.Doc をリアルタイム更新（クライアント間の同期はすべてメモリ上で完結）"
    - "永続化: 全員切断時に DB に保存し、メモリから解放（DBへの通信は低頻度）"
    - "フォールバック: 長時間セッション向けに30秒間隔のデバウンス付き定期保存（変更がある場合のみ）"
```

## タスク分解

### Phase 1: バックエンド WebSocket 基盤 ✅

- [x] `apps/library-api/src/collaboration/` モジュール作成（library-api 内に統合）
  - `encoding.rs`: lib0 VarUint エンコーディング
  - `protocol.rs`: y-sync プロトコル実装（SyncStep1/2/Update + Awareness relay）
  - `room.rs`: ドキュメントルーム管理（Y.Doc + ピア管理）
  - `manager.rs`: ルームライフサイクル管理（作成/切断/バックグラウンド永続化）
  - `handler.rs`: axum 0.7 WebSocket ハンドラー
  - `persistence.rs`: SqlxDocumentPersistence（Y.Doc binary BLOB → MySQL）
- [x] `collaborative_documents` テーブルのマイグレーション作成
- [x] `GET /ws/collab/:document_key?operator_id=...` エンドポイント統合
- [x] 30秒間隔のバックグラウンド永続化 + 全員切断時の即時永続化

### Phase 2: フロントエンド Yjs 統合 ✅

- [x] `yjs@13.6.20`, `y-websocket`, `y-protocols` をインストール（BlockNote バンドル版と一致）
- [x] `use-collaboration.ts` フック作成（Y.Doc/WebSocketProvider ライフサイクル管理）
- [x] `editor.tsx` に `collaboration` prop 追加（`useCreateBlockNote({ collaboration })` で統合）
- [x] 非共同編集モード（フォールバック）を維持
- [x] `index.tsx` → `html-section.tsx` → `DataDetailUi` → `page.tsx` で props リレー
- [x] 環境変数 `NEXT_PUBLIC_LIBRARY_COLLAB_WS_URL` で WebSocket URL を設定

### Phase 3: プレゼンス・カーソル UI ✅

- [x] BlockNote 内蔵のカーソル表示（Awareness プロトコル経由、ユーザー名+色）
- [x] `collaboration-presence.tsx` — 接続中ユーザーのアバター一覧表示
- [x] `CollaborationStatus` — 接続状態インジケーター（緑/黄）

### Phase 4: 堅牢性・品質 ✅

- [x] 再接続: y-websocket 内蔵の exponential backoff（maxBackoffTime: 5000ms）
- [x] オフライン編集: ローカル Y.Doc に保持、再接続時に自動マージ
- [x] TypeScript 型チェック通過（`yarn workspace library ts`）
- [x] Lint 通過（`yarn workspace library lint`）
- [x] Rust コンパイルチェック通過（collaboration モジュール単体）
- [ ] E2E テスト: 複数ブラウザでの同時編集シナリオ（動作確認時に実施）

## Playwright MCP による動作確認

### 動作確認チェックリスト

#### 基本的な共同編集
- [ ] エディタを開くと WebSocket 接続が確立される
- [ ] テキストを入力すると他のブラウザタブにリアルタイム反映
- [ ] 他ユーザーのカーソル位置が表示される
- [ ] 同時に異なる箇所を編集しても競合しない

#### 再接続・堅牢性
- [ ] WebSocket 切断後に自動再接続される
- [ ] 切断中のローカル編集が再接続後にマージされる
- [ ] ページリロード後もドキュメント内容が保持される

#### 既存機能との互換
- [ ] 「Save」ボタンで HTML/Markdown として保存される
- [ ] Viewer モードで正しく表示される
- [ ] Markdown ペースト機能が動作する

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| BlockNote v0.15.7 で Yjs 統合が困難 | 高 | Phase 2 冒頭で PoC を実施。不可の場合はバージョンアップを先行 |
| axum 0.7 と yrs の WebSocket 統合が複雑 | 中 | yrs-axum のソースを参考に最小限の実装。axum 0.7 の ws サポートは十分 |
| 大量同時接続時のメモリ圧迫 | 中 | ドキュメントルームの LRU キャッシュ。未使用ルームの積極的な解放 |
| Y.Doc ↔ HTML/Markdown 変換の精度低下 | 中 | 変換ロジックのテストを充実させる。変換は yrs 側で実施 |
| TiDB の LONGBLOB パフォーマンス | 低 | Y.Doc バイナリは通常数十KB。問題が出たら GC を検討 |

## 参考資料

- [BlockNote 公式 - Real-time Collaboration](https://www.blocknotejs.org/docs/collaboration/real-time-collaboration)
- [Yjs 公式ドキュメント](https://docs.yjs.dev/)
- [y-crdt/y-crdt (yrs) GitHub](https://github.com/y-crdt/y-crdt)
- [yrs-axum ソースコード](https://github.com/vagmi/yrs-axum/) - axum 0.7 互換実装の参考
- [BlockNote Yjs Integration - DeepWiki](https://deepwiki.com/TypeCellOS/BlockNote/8.1-yjs-integration)
- [Hocuspocus ドキュメント](https://tiptap.dev/docs/hocuspocus/getting-started/overview)

## 完了条件

- [ ] 複数ユーザーが同一ドキュメントをリアルタイムで同時編集できる
- [ ] 他ユーザーのカーソル位置が表示される
- [ ] WebSocket 切断・再接続が正しく処理される
- [ ] Y.Doc が DB に永続化され、セッション間で状態が維持される
- [ ] 既存の HTML/Markdown 保存フローとの互換性が維持される
- [ ] コードレビューが完了
- [ ] 動作確認レポートが完成している（複数ブラウザでの同時編集テスト含む）

### バージョン番号

**マイナーバージョン（x.X.x）を上げる**: 新機能（リアルタイム共同編集）の追加

## 備考

- BlockNote の最新版 (v0.47.0) では `@blocknote/core/yjs` で Yjs 変換プリミティブが提供されているが、v0.15.7 → v0.47.0 のアップグレードは Breaking Changes が多いため慎重に進める
- Hocuspocus (Node.js) を使う選択肢もあるが、既存の axum バックエンドに統合する方がインフラ構成がシンプル
- 将来的にコメント機能（BlockNote Comments Extension）の追加も検討可能
