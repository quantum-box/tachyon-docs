---
title: "Tool Job チャット形式UI化（OpenCode）"
type: feature
emoji: "💬"
topics: ["tool-job", "chat-ui", "opencode", "streaming", "sse"]
published: true
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/tool-jobs/
  - apps/tachyon/src/hooks/useToolJobStream.ts
  - apps/tachyon/src/lib/agent-tool-jobs.ts
  - packages/llms/src/agent/tool_job/
  - packages/providers/opencode/
github: ""
---

# Tool Job チャット形式UI化（OpenCode）

## 概要

現在の Tool Job UI はジョブ単位の一覧・詳細表示で、チャットとしてのUXが極めて悪い。
これを **チャットセッション形式** に刷新し、ユーザーがメッセージを送信→OpenCodeが応答→さらにメッセージを送る、という自然な対話フローを実現する。

まずは **OpenCode プロバイダーのみ** をスコープとし、他プロバイダー（Claude Code, Codex等）は後続タスクとする。

## 背景・目的

### 現状の課題
1. **非チャット的なUX**: Tool Jobは「ジョブ作成→結果確認」のバッチ処理的UI。対話的にメッセージを送れない
2. **セッション概念が不透明**: `resume_session_id` でセッション継続は可能だが、UIがそれをチャットとして表現していない
3. **情報の分散**: 同一セッション内の複数ジョブが別々のカードとして表示され、会話の流れが掴みにくい

### 目指す姿
- **チャットUI**: メッセージ入力→送信→ストリーミングで応答が表示される
- **セッション = 会話**: 1セッション = 1つのチャットスレッド
- **リアルタイム**: OpenCodeのストリーミングレスポンスがリアルタイムで表示される

### データフロー

```
ユーザー (Tachyon UI)
    │ メッセージ送信
    ↓
Tachyon API (POST /v1/agent/tool-jobs)
    │ resume_session_id 付きでジョブ作成
    ↓
OpenCode Runner
    │ client.send_prompt_stream(session_id, ...)
    ↓
OpenCode Server (ローカルHTTP)
    │ SSEストリーム (StreamChunk)
    ↓
EventPublisher (QUIC/Redis)
    │ ToolJobStreamEvent (text_delta, tool_start, done, ...)
    ↓
Tachyon API (GET /v1/agent/tool-jobs/{id}/stream) SSE
    │ ★ ToolJobStreamEvent → AgentChunk に変換して配信
    ↓
Tachyon UI (useAgentStream 互換) → AgentStream コンポーネントで表示
```

### 核心設計: AgentChunk互換のストリーミング

Tool Jobのストリームを **AgentChunkEvent と同じフォーマット** でフロントエンドに配信する。
これにより:
- フロントの既存 `AgentStream` コンポーネント群をそのまま再利用できる
- 将来的にTool Jobをサブエージェントとして動かす際、チャンク形式が統一されていてシームレス
- `agent` フィールド（`AgentSource`）を付与すれば、メインエージェント vs サブエージェント（Tool Job）の区別も可能

#### ToolJobStreamEvent → AgentChunkEvent 変換マッピング

| ToolJobStreamEvent | AgentChunkEvent | 備考 |
|--------------------|-----------------|------|
| `TextDelta { text }` | `Say(Text { index, text })` | 直接マッピング |
| `Thinking { content }` | `Thinking(Thinking { index, text, is_finished })` | 直接マッピング |
| `ToolStart { tool_name, input_preview }` | `ToolCall(ToolCall { tool_id, tool_name })` | `tool_id` はUUID生成 |
| `ToolEnd { tool_name, success, output_preview }` | `ToolResult(ToolResult { tool_id, result })` | `ToolStart` の `tool_id` と紐付け |
| `Usage { input_tokens, output_tokens }` | `Usage(Usage { prompt_tokens, completion_tokens, ... })` | フィールド名変換 |
| `Done { summary, ... }` | SSE `done` イベント | ストリーム終了シグナル |
| `Error { message, code }` | SSE `error` イベント | エラー処理 |
| `Cost { estimated_cost }` | `Usage` に統合 | `total_cost` フィールドに変換 |
| `StatusChange` | 無視 or メタデータ | チャットチャンクとしては不要 |
| `Heartbeat` | SSE comment (`: heartbeat`) | 接続維持 |

変換はバックエンド側（`tool_job_stream_handler.rs`）で行う。フロントエンドは純粋にAgentChunkを受け取るだけ。

## 詳細仕様

### 機能要件

1. **セッション（チャット）の作成**
   - ユーザーが新しいチャットを開始できる
   - OpenCodeプロバイダーを選択（初期は自動選択でもOK）
   - 最初のメッセージを送信するとセッションが生成される

2. **メッセージ送受信**
   - テキスト入力欄からメッセージを送信
   - 送信するとTool Jobが作成される（`resume_session_id` を使ってセッション継続）
   - OpenCodeのレスポンスがストリーミングでリアルタイム表示される

3. **チャット表示**
   - ユーザーメッセージ（右寄せまたは識別可能なスタイル）
   - アシスタントメッセージ（左寄せ、ストリーミング中はカーソル点滅）
   - ツール実行の表示（折りたたみ可能）: `tool_start` / `tool_end` イベント
   - thinking表示: `thinking` イベント
   - エラー表示: `error` イベント

4. **セッション一覧**
   - 既存のセッション一覧からチャットを再開できる
   - 各セッションには最新メッセージのプレビューと日時を表示

5. **ストリーミング対応**
   - `text_delta` イベントを逐次表示（既存の `useToolJobStream` を活用）
   - ストリーミング中は送信ボタンを無効化
   - エラー時は適切なメッセージを表示

### 非機能要件

- パフォーマンス: ストリーミング表示がスムーズであること（60fps目標）
- UX: メッセージ送信後3秒以内にストリーミング開始が視認できること
- アクセシビリティ: キーボード操作対応（Enter送信、Shift+Enter改行）

### コンテキスト別の責務

```yaml
contexts:
  llms (backend):
    description: "Tool Job の管理とストリーミング配信"
    responsibilities:
      - ToolJobStreamEvent → AgentChunkEvent への変換レイヤー追加
      - セッション一覧APIの追加（既存ジョブから集約）
      - 既存のTool Job API・OpenCode Runnerはそのまま活用

  tachyon (frontend):
    description: "チャットUIの実装"
    responsibilities:
      - 既存の AgentStream コンポーネントを活用したチャット画面
      - メッセージ入力・送信UI
      - useAgentStream 互換のストリーミング処理
      - セッション管理UI
```

## 実装方針

### アーキテクチャ設計

#### バックエンド

現在のTool Job APIは既にセッション継続をサポートしている。主な追加作業:

- **変換レイヤー**: `tool_job_stream_handler.rs` で `ToolJobStreamEvent` → `AgentChunkEvent` に変換してSSE配信
  - 新規ストリームエンドポイント or 既存エンドポイントにクエリパラメータ `?format=agent_chunk` で切り替え
  - `tool_id` の採番管理（`ToolStart` → `ToolEnd` の対応付け）
- `POST /v1/agent/tool-jobs`: 既存そのまま（`resume_session_id` でセッション継続）
- **追加**: `GET /v1/agent/tool-jobs/sessions`: セッション一覧を返す（既存ジョブを `session_id` でグルーピング）

#### フロントエンド

既存の `AgentStream` コンポーネントと `useAgentStream` を **そのまま活用** する。
バックエンドがAgentChunk形式で配信するので、フロント側で独自のチャットコンポーネントを新規作成する必要が大幅に減る。

```
apps/tachyon/src/app/v1beta/[tenant_id]/ai/tool-jobs/
├── chat/                              # 新規: チャットUI
│   ├── page.tsx                       # セッション一覧（Server Component）
│   ├── chat-list-client.tsx           # セッション一覧（Client）
│   ├── [session_id]/
│   │   ├── page.tsx                   # チャット画面（Server Component）
│   │   └── chat-session-client.tsx    # チャット画面（Client）
│   └── components/
│       └── chat-input.tsx             # メッセージ入力（新規）
│       # AgentStream / AgentSay / AgentToolCall 等は既存コンポーネントを再利用
├── page.tsx                           # 既存: ジョブ一覧（維持）
└── ...                                # 既存ファイル（維持）
```

### 技術選定

- **チャットUI**: 既存の `AgentStream` / `AgentSay` / `AgentToolCall` 等をそのまま再利用
- **ストリーミング**: `useAgentStream` 互換のフック（Tool Job SSE → AgentChunk）
- **状態管理**: SWR（ポーリング） + useState（ストリーミング状態）
- **スタイリング**: Tailwind CSS + shadcn/ui

### 主要な設計判断

1. **AgentChunk互換**: バックエンドがToolJobStreamEventをAgentChunkEventに変換して配信。フロントは既存のAgentStreamコンポーネントをそのまま使う
2. **サブエージェント拡張を見据える**: `AgentChunk.agent` フィールド（`AgentSource`）を付与すれば、将来的にTool Jobをサブエージェントとして動かす際にもチャンク形式が統一されている
3. **セッション一覧は集約クエリ**: 新テーブルは作らず、既存の `tool_jobs` テーブルから `session_id` でグルーピング
4. **新規チャットの開始**: 最初のメッセージ送信時に `resume_session_id` なしでジョブ作成 → `session_id` を取得 → 以降はそれを `resume_session_id` に設定
5. **チャット履歴**: 既存の `raw_events` から AgentChunk 形式に変換して再構築

## タスク分解

### フェーズ1: バックエンド — AgentChunk変換レイヤー + セッションAPI 📝
- [ ] `ToolJobStreamEvent` → `AgentChunkEvent` の変換関数実装
  - `TextDelta` → `Say`、`Thinking` → `Thinking` の直接マッピング
  - `ToolStart`/`ToolEnd` → `ToolCall`/`ToolResult` の `tool_id` 採番管理
  - `Usage`/`Cost` → `Usage` の単位変換
- [ ] `tool_job_stream_handler.rs` でAgentChunk形式のSSEストリーム配信
- [ ] `GET /v1/agent/tool-jobs/sessions` エンドポイント追加
  - 既存ジョブを `session_id` でグルーピング
  - 各セッションの最新ジョブ情報、メッセージ数、最終更新日時を返す
- [ ] シナリオテストの追加

### フェーズ2: フロントエンド — チャットUI基本実装 📝
- [ ] チャットセッション画面のレイアウト
- [ ] メッセージ入力コンポーネント（テキスト入力 + 送信ボタン）
- [ ] 既存 `AgentStream` コンポーネントを使ったメッセージ表示
- [ ] Tool Job作成（メッセージ送信）→ AgentChunk SSEストリームの接続
- [ ] セッション継続（`resume_session_id`）の自動管理

### フェーズ3: セッション一覧と管理 📝
- [ ] セッション一覧画面（サイドバーまたは一覧ページ）
- [ ] セッション間の遷移
- [ ] 過去の会話履歴表示（`raw_events` → AgentChunk変換で再構築）
- [ ] サイドバーのナビゲーション更新

### フェーズ4: 動作確認と品質改善 📝
- [ ] Playwright MCPでの動作確認
- [ ] エラーハンドリング（OpenCode未起動、ストリーム切断等）
- [ ] レスポンシブ対応
- [ ] キーボード操作対応

## Playwright MCPによる動作確認

### 動作確認チェックリスト

#### チャット画面
- [ ] チャット画面の初期表示（空のメッセージエリア + 入力欄）
- [ ] メッセージ入力と送信（Enter / 送信ボタン）
- [ ] ストリーミングレスポンスのリアルタイム表示
- [ ] ツール実行の表示（折りたたみ）
- [ ] エラー時の表示
- [ ] 連続メッセージ送信（セッション継続）

#### セッション管理
- [ ] セッション一覧の表示
- [ ] 既存セッションの再開
- [ ] 新規セッションの作成

#### レスポンシブ
- [ ] デスクトップ（1440x900）での表示
- [ ] タブレット（768x1024）での表示

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| OpenCodeサーバーが起動していない場合 | 中 | 接続エラーの適切なUI表示、ヘルプメッセージ |
| ストリーミング接続の切断 | 中 | 自動再接続、既存メッセージの保持 |
| セッション一覧が大量になった場合 | 低 | ページネーション、日時フィルター |
| 既存のTool Job UIとの共存 | 低 | 既存UIは維持し、チャットUIを新規パスで追加 |

## 参考資料

### AgentChunk（変換先の型）
- AgentChunkEvent型定義（Rust）: `packages/llms/src/agent/types.rs`
- AgentChunk型定義（TypeScript / 自動生成）: `apps/tachyon/src/gen/api/@types/index.ts`
- AgentChunk型定義（TypeScript / レガシー）: `apps/tachyon/src/lib/agent-api.ts`
- SSE配信ハンドラ: `packages/llms/src/adapter/axum/agent_handler.rs`
- Message → AgentChunk 変換の既存実装: `packages/llms/src/agent/messages_to_chunk.rs`

### 既存チャットUI（再利用先）
- AgentStreamコンポーネント: `apps/tachyon/src/components/agent/AgentStream.tsx`
- useAgentStream フック: `apps/tachyon/src/hooks/useAgentStream.ts`
- AgentチャットUI: `apps/tachyon/src/app/v1beta/[tenant_id]/ai/agent/chat/`

### ToolJobStreamEvent（変換元）
- ToolJobStreamEvent型定義: `packages/llms/src/agent/tool_job/stream/event.rs`
- 既存ストリームハンドラ: `packages/llms/src/adapter/axum/tool_job_stream_handler.rs`
- useToolJobStream フック: `apps/tachyon/src/hooks/useToolJobStream.ts`

### OpenCode
- OpenCode Runner: `packages/llms/src/agent/tool_job/runners/opencode.rs`
- OpenCode Client: `packages/providers/opencode/src/client.rs`

### セッション（現行）
- セッション詳細: `apps/tachyon/src/app/v1beta/[tenant_id]/ai/tool-jobs/sessions/session-detail-client.tsx`

## 完了条件

- [ ] Tool JobストリームがAgentChunkEvent形式で配信される
- [ ] フロントの既存AgentStreamコンポーネントでTool Jobのストリームが正しく表示される
- [ ] OpenCodeでチャット形式のメッセージ送受信ができる
- [ ] ストリーミングレスポンスがリアルタイムで表示される
- [ ] セッション（会話）が継続できる
- [ ] セッション一覧から過去の会話を閲覧・再開できる
- [ ] 動作確認レポートが完成している
- [ ] 既存のTool Job機能（ジョブ一覧・詳細等）に影響がない

### バージョン番号の決定基準

**マイナーバージョン（x.X.x）を上げる**: 新しいチャットUIという新機能の追加に該当。

## 備考

- 今回は **OpenCodeプロバイダーのみ** をスコープとする。Claude Code / Codex / Cursor Agent への拡張は後続タスク
- 既存のTool Job一覧・詳細UIは削除せず並行して維持する（管理用途として有用）
- バックエンドの変更は最小限にし、フロントエンドのUI刷新をメインとする
