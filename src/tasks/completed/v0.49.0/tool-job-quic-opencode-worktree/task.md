---
title: "Tool Job: QUIC有効化 + OpenCode worktree対応 + ストリーミングE2E"
type: "feature"
emoji: "🔧"
topics: ["tool-job", "quic", "opencode", "worktree", "streaming", "sse"]
published: true
targetFiles:
  - apps/tachyond/src/worker.rs
  - packages/llms/src/agent/tool_job/runners/opencode.rs
  - packages/providers/opencode/src/client.rs
  - apps/tachyon-api/src/main.rs
  - apps/tachyon/src/hooks/useToolJobStream.ts
github: ""
---

# Tool Job: QUIC有効化 + OpenCode worktree対応 + ストリーミングE2E

## 概要

Tool Job の opencode 実行で以下を実現する:
1. QUIC によるリアルタイムストリーミング（ローカル＆本番）
2. worktree 毎に opencode serve を動的起動し、ジョブの作業ディレクトリを分離
3. opencode → tachyond → tachyon-api → フロントエンドの SSE ストリーミング E2E 動作

## 背景・目的

### 現状の問題

| # | 問題 | 影響 |
|---|------|------|
| 1 | ローカルで QUIC 無効 → `NoopEventPublisher` | ストリーミングイベントが全て破棄。5秒ポーリングのみ |
| 2 | `OpenCodeRunner` が `request.environment` (WORKING_DIRECTORY) を無視 | worktree を作成しても opencode server の作業ディレクトリは変わらない |
| 3 | `opencode serve` API にセッション毎の cwd 指定がない | 1 つの opencode server では 1 ディレクトリ固定 |

### 解決策

- **QUIC**: ローカル・本番ともに QUIC Gateway を有効化
- **worktree**: ジョブ毎に worktree ディレクトリ内で `opencode serve` を別ポートで起動し、完了後にプロセスを終了

## 詳細仕様

### 機能要件

1. **QUIC有効化**
   - ローカル: 自己署名証明書で QUIC Gateway を起動
   - tachyond: `--use-quic-streaming --quic-insecure` でローカル接続
   - 本番: `quic.n1.tachy.one:4433` (Let's Encrypt) で既存設定を活用

2. **OpenCode worktree 対応**
   - `use_worktree=true` + provider=OpenCode の場合:
     1. `WorktreeManager.create()` で git worktree 作成（既存処理）
     2. worktree ディレクトリ内で `opencode serve --port 0 --hostname 127.0.0.1` を起動
     3. ポート 0 指定で OS にランダム空きポートを取得させる
     4. ヘルスチェック (`/global/health`) で起動完了を待機
     5. そのポートに対して `OpenCodeRunner` を作成・実行
     6. ジョブ完了後に opencode プロセスを kill
   - `use_worktree=false` の場合: 従来通りデフォルト URL (localhost:4096) を使用

3. **ストリーミング E2E**
   - OpenCodeRunner の `EventPublisher.publish()` → QUIC → tachyon-api SSE → フロントエンド
   - フロントエンドの `useToolJobStream` hook で text_delta をリアルタイム表示

### 非機能要件

- opencode serve の起動タイムアウト: 30秒
- opencode serve プロセスのクリーンアップ: ジョブ終了時に確実に kill（panic 時も）
- ポート競合: port=0 で OS 自動割当のため回避
- 並列ジョブ: 各ジョブが別ポートの opencode server を持つため安全

## 実装方針

### アーキテクチャ

```
ジョブ投入 (use_worktree=true, provider=opencode)
  ↓
tachyond worker (process_job)
  ├── WorktreeManager.create() → worktree-<job_id>/
  ├── spawn opencode serve --port 0 in worktree dir
  │    └── wait for /global/health → get actual port
  ├── OpenCodeRunner::from_config(port=N)
  │    └── create_session → send_prompt_stream → events
  │         └── EventPublisher (QUIC) → tachyon-api → SSE → Frontend
  ├── kill opencode process
  └── WorktreeManager.remove() / push_and_create_pr()
```

### 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `apps/tachyond/src/worker.rs` | opencode worktree 時の動的サーバー起動ロジック追加 |
| `packages/llms/src/agent/tool_job/runners/opencode.rs` | `from_config` で任意の base_url を受け取れるようにする（既にある） |
| `.env` (worktree1) | QUIC 関連設定追加 |
| `docker-compose.yml` 等 | QUIC ポート公開設定（必要に応じて） |

### OpenCode サーバー管理ヘルパー

`worker.rs` に以下のヘルパーを追加:

```rust
struct ManagedOpenCodeServer {
    process: tokio::process::Child,
    port: u16,
    base_url: String,
}

impl ManagedOpenCodeServer {
    async fn spawn_in_dir(dir: &Path) -> Result<Self>;
    async fn wait_healthy(&self, timeout: Duration) -> Result<()>;
    async fn shutdown(mut self) -> Result<()>;
}
```

## タスク分解

### フェーズ1: QUIC 有効化 ✅
- [x] ローカル `.env` に QUIC 設定追加（compose.yml に QUIC_INSECURE=true 追加）
- [x] tachyond worker の QUIC 接続確認（既存設定 USE_QUIC_STREAMING=true を確認）
- [x] tachyon-api の QUIC Gateway 起動確認（既存設定 QUIC_GATEWAY_ENABLED=true を確認）

実装メモ: compose.yml に既に QUIC_GATEWAY_ENABLED=true, USE_QUIC_STREAMING=true が設定済み。
ローカル自己署名証明書用に tachyond へ `QUIC_INSECURE=true` を追加するだけで完了。

### フェーズ2: OpenCode worktree 対応 ✅
- [x] `ManagedOpenCodeServer` ヘルパー実装
- [x] `process_job()` で opencode worktree 時の動的サーバー起動
- [x] ヘルスチェック・ポート取得ロジック
- [x] プロセスクリーンアップ（正常終了 + kill_on_drop guard）

実装メモ:
- `ManagedOpenCodeServer` 構造体を `worker.rs` に追加
- `spawn_in_dir()`: TCP bind port=0 で空きポート取得 → `opencode serve --port N` を worktree ディレクトリで起動
- `wait_healthy()`: `/global/health` を 500ms 間隔でポーリング（30秒タイムアウト）
- `shutdown()`: `process.kill()` + `wait()` で確実に終了
- `kill_on_drop(true)` でパニック時もプロセスリーク防止
- ランナー作成を worktree 作成の後に移動し、OpenCode + worktree 時はマネージドサーバーの URL を使用

### フェーズ3: ストリーミング E2E 確認 ✅
- [x] ローカル QUIC Gateway 動作確認（自己署名証明書 + insecure モード）
- [x] tachyond → QUIC → tachyon-api イベント送受信確認
- [x] SSE エンドポイント QUIC バックエンド接続確認
- [x] SSE で text_delta がリアルタイム受信される（OpenCode ジョブで確認）
- [x] opencode serve がコンテナ内で自動起動（compose.yml command 修正）
- [ ] worktree 使用時の OpenCode ストリーミング動作確認（要実環境テスト）
- [ ] 本番 API (api.n1.tachy.one) での動作確認

実装メモ:
- compose.yml を修正し、tachyond コンテナ内で opencode serve を自動起動
- OPENCODE_API_URL を `http://127.0.0.1:4096` に変更（コンテナ内接続）
- E2E テストで「こんにちは、世界！」がチャンク単位（4 text_delta イベント）でSSE経由到着を確認
- フルパイプライン: opencode serve → OpenCodeRunner → QuicEventPublisher → QUIC → tachyon-api → SSE → クライアント
- フロントエンドは 5秒ポーリングも並行しているため、QUIC/SSE が一時的に切れてもフォールバック可能

### フェーズ4: Worker/PC 選択機能 ✅
- [x] DB マイグレーション: `agent_tool_jobs` テーブルに `assigned_worker_id` カラム追加
- [x] ドメイン: `ToolJobCreateRequest.worker_id` + `ToolJobSnapshot.assigned_worker_id`
- [x] ユースケース: `CreateToolJobInputData.worker_id` を受け取り snapshot に反映
- [x] REST ハンドラー: `ToolJobCreatePayload.worker_id` → InputData へ伝達
- [x] REST レスポンス: `ToolJobResponse.assigned_worker_id` を返却
- [x] リポジトリ: save/find_by_id/list_by_operator/list_all で `assigned_worker_id` 対応
- [x] tachyond Worker: `HttpJobQueue.dequeue()` で `assigned_worker_id` によるフィルタリング
- [x] フロントエンド: Worker 選択ドロップダウン追加（"Any worker (auto)" がデフォルト）
- [x] i18n: 日英ラベル追加
- [x] `.sqlx/` キャッシュ更新
- [x] UI 動作確認（ドロップダウンに 7 ワーカー表示）

実装メモ:
- `assigned_worker_id` が `None` のジョブは全ワーカーが取得可能（従来通り）
- `assigned_worker_id` が設定されたジョブは該当ワーカーのみが `dequeue()` で取得
- Worker 一覧は `/v1/agent/workers` API から取得（30秒間隔でリフレッシュ、active のみ）
- `ToolJobApiItem` に `assigned_worker_id` フィールドを追加し、tachyond 側でデシリアライズ

## 動作確認チェックリスト

- [x] ローカルで QUIC Gateway が起動する（自己署名証明書、0.0.0.0:4433）
- [x] tachyond が QUIC でイベントを送信できる（QUIC_INSECURE=true で接続成功）
- [x] SSE エンドポイントが QUIC バックエンドで動作する
- [x] SSE で text_delta がリアルタイム受信される（「こんにちは、世界！」4チャンク確認）
- [x] opencode serve がコンテナ内で自動起動する
- [ ] use_worktree=true のジョブで opencode serve が worktree ディレクトリで起動する（要実環境テスト）
- [ ] ジョブ完了後に opencode プロセスが正しく終了する（コード実装済み、要実環境テスト）
- [ ] 並列ジョブで異なるポートの opencode server が独立して動作する（要実環境テスト）
- [ ] 本番 API (api.n1.tachy.one) でストリーミングが動作する
- [x] Worker 選択ドロップダウンが正しく動作する（UI 確認済み）
- [x] Worker 指定時に `assigned_worker_id` が API レスポンスに含まれる

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| opencode serve の起動が遅い | 中 | 30秒タイムアウト + エラーハンドリング |
| opencode プロセスのリーク | 高 | Drop guard / SIGKILL でクリーンアップ保証 |
| ローカル QUIC の自己署名証明書 | 低 | `--quic-insecure` フラグで回避 |
| opencode port=0 の実ポート取得 | 中 | stdout パース or ヘルスチェックでポートスキャン |

## 参考資料

- `docs/src/tachyon-apps/providers/opencode.md` - OpenCode プロバイダードキュメント
- `docs/src/tasks/completed/v0.41.0/tachyond-opencode-serve-integration/` - 前回の統合タスク
- `packages/llms/src/agent/tool_job/worktree/manager.rs` - WorktreeManager 実装
- `packages/llms/src/agent/tool_job/stream/publisher.rs` - EventPublisher (QUIC/Redis)

## 完了条件

- [x] ローカルで QUIC ストリーミングが動作する
- [ ] worktree 使用時に opencode が正しいディレクトリで実行される
- [x] フロントエンド SSE でリアルタイムテキスト表示される
- [ ] 本番環境で同等の動作が確認できる
- [ ] opencode プロセスのリークがない
- [x] 複数ワーカー（PC）からの選択が UI で可能

### バージョン番号

**パッチバージョン (v0.x.x+1)**: 既存 Tool Job 機能の改善・バグ修正に相当
