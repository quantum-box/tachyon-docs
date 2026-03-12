---
title: "tachyond ワーカーに OpenCode サーバー自動管理機能を追加"
type: feature
emoji: "🔧"
topics:
  - tachyond
  - opencode
  - worker
  - process-management
published: true
targetFiles:
  - apps/tachyond/src/worker.rs
  - apps/tachyond/src/main.rs
  - packages/providers/opencode/src/
  - packages/llms/src/agent/tool_job/runners/opencode.rs
github: https://github.com/quantum-box/tachyon-apps
---

# tachyond ワーカーに OpenCode サーバー自動管理機能を追加

## 概要

tachyond ワーカー起動時に OpenCode サーバーを自動で起動・管理し、ログ収集も行う機能を追加する。現状 `use_worktree=false`（デフォルト）の場合、`localhost:4096` にサーバーが手動で起動されている前提だが、サーバーが落ちていると Tool Job が即座に failed になる運用上の問題がある。

## 背景・目的

### 現状の問題

1. **手動管理の脆弱性**: OpenCode サーバーは別プロセスとして手動起動が必要。サーバーが落ちるとジョブが即 failed
2. **ログが消失**: `ManagedOpenCodeServer` は stdout/stderr を `Stdio::piped()` でキャプチャしているが、実際にはどこにも読み出していない
3. **Worktree時との不整合**: `use_worktree=true` の場合はジョブ毎に動的サーバーを起動する仕組みがあるが、デフォルト（非worktree）では同様の管理がない

### 本番での再現（2026-02-21確認）

```
Job ID: 01KJ06BTZG9X6SJ40CYJ7QK8NG
Status: failed
Error: ServiceUnavailable: Failed to create session: error sending request for url (http://localhost:4096/session)
```

ワーカー（`worker-01KHZ380KB49D34KS7W64VQZY0`）は active だが、OpenCode サーバーが応答しないためジョブが即失敗した。

### 他プロバイダーとの比較

| Provider | 実行方式 | サーバー管理 |
|----------|---------|-------------|
| Codex | CLI exec (`codex exec --json`) | 不要（ワンショット） |
| Claude Code | CLI exec (`claude -p`) | 不要（ワンショット） |
| Cursor Agent | CLI exec (`cursor-agent`) | 不要（ワンショット） |
| **OpenCode** | **HTTP API（常駐サーバー）** | **手動起動が必要** ← 問題 |

OpenCode だけが常駐サーバーを必要とするため、ワーカーが自動管理すべき。

## 詳細仕様

### 機能要件

1. **ワーカー起動時のサーバー自動起動**
   - `--manage-opencode-server` フラグ（または `MANAGE_OPENCODE_SERVER=true`）で有効化
   - ワーカー起動と同時に `opencode serve` をサブプロセスとして起動
   - ランダムポートで起動し、ワーカー内で URL を保持

2. **ヘルスチェック & 自動再起動**
   - 定期的に `/global/health` をポーリング（30秒間隔）
   - 応答がなければサーバーを再起動
   - 再起動回数の上限（例: 5回）を設け、超えたらワーカーを停止

3. **ログ収集**
   - OpenCode サーバーの stdout/stderr をキャプチャ
   - tachyond のログシステム（tracing）に統合出力
   - ログレベル: stdout → `INFO`、stderr → `WARN`
   - ログプレフィックス: `[opencode-server]` で識別可能に

4. **Graceful shutdown**
   - ワーカー停止時（Ctrl+C / SIGTERM）にサーバーも graceful に停止
   - 実行中のジョブがある場合はジョブ完了を待ってから停止

5. **非worktreeジョブでのシェアードサーバー利用**
   - `use_worktree=false` のジョブは起動済みの共有サーバーを利用
   - `use_worktree=true` のジョブは従来通りジョブ毎にサーバーを起動

### 非機能要件

- ワーカー起動時間への影響を最小限に（ヘルスチェック: 最大30秒）
- メモリ/CPU オーバーヘッドは OpenCode サーバー1プロセス分のみ
- ログの出力量制御（verbose モード以外では重要なログのみ）

### CLI引数・環境変数

```yaml
new_args:
  --manage-opencode-server:
    env: MANAGE_OPENCODE_SERVER
    default: false
    description: "ワーカー起動時にOpenCodeサーバーを自動管理する"

  --opencode-server-port:
    env: OPENCODE_SERVER_PORT
    default: 0  # OS自動割当
    description: "OpenCodeサーバーのポート（0=自動割当）"

  --opencode-restart-limit:
    env: OPENCODE_RESTART_LIMIT
    default: 5
    description: "OpenCodeサーバーの最大再起動回数"

  --opencode-health-interval:
    env: OPENCODE_HEALTH_INTERVAL_SECS
    default: 30
    description: "ヘルスチェック間隔（秒）"
```

## 実装方針

### アーキテクチャ設計

```
tachyond worker 起動
  │
  ├─ WorkerArgs 解析
  │   └─ manage_opencode_server = true?
  │
  ├─ SharedOpenCodeServer::spawn()  ← 新規
  │   ├─ opencode serve --port <N> --hostname 127.0.0.1
  │   ├─ stdout/stderr → tracing ログへ転送 (spawn bg tasks)
  │   ├─ wait_healthy(30s)
  │   └─ health_monitor loop (bg task)
  │       └─ /global/health を定期ポーリング → 失敗時 restart
  │
  ├─ register_with_api()
  ├─ spawn_heartbeat_loop()
  ├─ run_poll_loop()
  │   └─ process_job()
  │       ├─ use_worktree=false + OpenCode → 共有サーバー使用
  │       └─ use_worktree=true  + OpenCode → 従来通りジョブ毎spawn
  │
  └─ shutdown signal
      └─ SharedOpenCodeServer::shutdown()
```

### 主要コンポーネント

#### 1. `SharedOpenCodeServer`（新規）

`ManagedOpenCodeServer` を拡張し、ワーカーレベルの長期稼働に対応:

```rust
struct SharedOpenCodeServer {
    process: tokio::process::Child,
    port: u16,
    base_url: String,
    restart_count: AtomicU32,
    restart_limit: u32,
    health_interval: Duration,
    // Background task handles
    log_stdout_handle: JoinHandle<()>,
    log_stderr_handle: JoinHandle<()>,
    health_monitor_handle: JoinHandle<()>,
}
```

#### 2. ログ転送タスク

```rust
async fn forward_logs(
    reader: tokio::io::BufReader<ChildStdout>,
    level: tracing::Level,
) {
    let mut lines = reader.lines();
    while let Ok(Some(line)) = lines.next_line().await {
        match level {
            Level::INFO => info!(target: "opencode_server", "{}", line),
            Level::WARN => warn!(target: "opencode_server", "{}", line),
            _ => {}
        }
    }
}
```

#### 3. ヘルスモニタ

```rust
async fn health_monitor(
    base_url: String,
    interval: Duration,
    restart_tx: mpsc::Sender<()>,
) {
    loop {
        tokio::time::sleep(interval).await;
        if !check_health(&base_url).await {
            warn!("OpenCode server unhealthy, requesting restart");
            let _ = restart_tx.send(()).await;
        }
    }
}
```

### 既存コードへの影響

| ファイル | 変更内容 |
|---------|---------|
| `worker.rs` | `SharedOpenCodeServer` 追加、`run_worker()` に共有サーバー管理を統合 |
| `worker.rs` | `process_job()` で共有サーバーURL参照を追加 |
| `main.rs` (WorkerArgs) | 新規CLI引数追加 |
| `ManagedOpenCodeServer` | ログ転送ロジックを共通化（SharedとManagedで再利用） |

## タスク分解

### 主要タスク

- [x] `SharedOpenCodeServer` の実装（spawn, shutdown, restart）
- [x] stdout/stderr ログ転送の実装
- [x] ヘルスモニタ（定期チェック + 自動再起動）の実装
- [x] WorkerArgs に新規CLI引数を追加
- [x] `process_job()` に共有サーバー参照ロジックを統合
- [x] 既存 `ManagedOpenCodeServer` のログ転送を共通化
- [x] `mise run check` でビルド通過確認
- [ ] 本番（api.n1.tachy.one）での動作確認

## 動作確認チェックリスト

- [ ] `--manage-opencode-server` 付きでワーカー起動 → OpenCode サーバーが自動起動
- [ ] OpenCode ジョブ（use_worktree=false）がサーバー経由で正常実行
- [ ] OpenCode サーバーのログがワーカーログに `[opencode_server]` プレフィックスで出力
- [ ] OpenCode サーバーを手動 kill → ヘルスモニタが検出して自動再起動
- [ ] 再起動上限超過 → ワーカーがエラーログを出力して停止
- [ ] ワーカー Ctrl+C → OpenCode サーバーも graceful に停止
- [ ] use_worktree=true のジョブは従来通りジョブ毎にサーバーをspawn

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| OpenCode バイナリが PATH にない | 高 | 起動時チェック + 明確なエラーメッセージ |
| ポート競合 | 中 | ポート0（OS自動割当）をデフォルトに |
| サーバー再起動ループ | 高 | restart_limit で上限を設定 |
| ログが膨大になる | 中 | verbose フラグでログレベル制御 |
| worktree ジョブとの競合 | 低 | worktree ジョブは独立サーバーを使うため影響なし |

## 参考資料

- 既存実装: `apps/tachyond/src/worker.rs` の `ManagedOpenCodeServer`
- OpenCode API: `packages/providers/opencode/src/client.rs`
- OpenCode Runner: `packages/llms/src/agent/tool_job/runners/opencode.rs`
- 本番環境: `api.n1.tachy.one`, worker `worker-01KHZ380KB49D34KS7W64VQZY0`

## 完了条件

- [ ] SharedOpenCodeServer が実装され、ワーカー起動時に自動管理可能
- [ ] stdout/stderr ログがワーカーログに統合出力される
- [ ] ヘルスモニタによる自動再起動が動作する
- [ ] 本番環境で OpenCode Tool Job が正常にストリーミング実行される
- [ ] 既存の worktree ジョブに影響がないことを確認

### バージョン番号

- [x] マイナーバージョン（新機能追加: ワーカーのプロセス管理機能）
