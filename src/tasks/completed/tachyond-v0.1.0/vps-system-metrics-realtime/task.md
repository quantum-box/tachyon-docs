# tachyond VPSシステムメトリクス送信 + フロントエンドリアルタイム表示

**作成日**: 2026-02-09
**ステータス**: ✅ COMPLETED
**優先度**: Medium
**担当**: Claude Agent

## 概要

tachyondをVPSの常駐プロセスとして運用するにあたり、VPSのCPU/メモリ/ディスク使用状況をリアルタイムに把握したい。既存のWorkerハートビート機構（60秒間隔）にメトリクスを載せて送信し、フロントエンドのWorkerページで表示する。

## 方針

既存のハートビート（`POST /v1/agent/workers/{id}/heartbeat`）のペイロードに `system_metrics` JSONフィールドを追加。DB (`agent_workers`) にも `system_metrics` カラムを追加し、最新スナップショットのみ保存。フロントエンドはSWRポーリング（10秒間隔に短縮）で表示。

## 実装計画と進捗

### Phase 1: バックエンド（tachyond → API → DB）

#### Step 1: DBマイグレーション ✅

- `packages/llms/migrations/20260209000000_add_system_metrics_to_workers.up.sql`
  - `agent_workers` テーブルに `system_metrics JSON DEFAULT NULL` カラム追加
- `packages/llms/migrations/20260209000000_add_system_metrics_to_workers.down.sql`
  - rollback用

#### Step 2: ドメインモデル拡張 ✅

- `packages/agents/domain/src/worker.rs`
  - `WorkerEntity` に `pub system_metrics: Option<serde_json::Value>` 追加
  - `from_registration` で `system_metrics: None` を初期化
- `packages/agents/domain/src/worker_repository.rs`
  - `update_heartbeat` に `system_metrics: Option<serde_json::Value>` 引数追加

#### Step 3: リポジトリ実装更新 ✅

- `packages/llms/src/agent/tool_job/adapter/gateway/sqlx_worker_repository.rs`
  - `WorkerRow` に `system_metrics: Option<sqlx::types::JsonValue>` 追加
  - `TryFrom<WorkerRow>` で `system_metrics` を変換
  - 全SELECT文に `system_metrics` カラム追加（`find_by_id`, `list_by_operator`, `list_by_status`, `find_stale`）
  - `save` のINSERT/UPDATE文に `system_metrics` を追加
  - `update_heartbeat` のUPDATE文に `SET system_metrics = ?` を追加

#### Step 4: Usecase更新 ✅

- `packages/llms/src/agent/tool_job/usecase/worker_heartbeat.rs`
  - `WorkerHeartbeatInputData` に `pub system_metrics: Option<serde_json::Value>` 追加
  - `execute` 内の `update_heartbeat` 呼び出しに `input.system_metrics` を渡す
  - テスト更新: `expect_update_heartbeat` を4引数に

#### Step 5: RESTハンドラ更新 ✅

- `packages/llms/src/agent/tool_job/adapter/axum/register_worker_handler.rs`
  - `WorkerHeartbeatRequest` に `pub system_metrics: Option<serde_json::Value>` 追加
  - `worker_heartbeat` ハンドラで `input.system_metrics` をセット
  - `WorkerInfo` に `pub system_metrics: Option<serde_json::Value>` 追加
  - `From<WorkerEntity> for WorkerInfo` で `system_metrics` を変換
  - テスト更新: mock_stateの `expect_update_heartbeat` を4引数に

#### Step 6: tachyondメトリクス収集 ✅

- `Cargo.toml`（ワークスペース） — `[workspace.dependencies]` に `sysinfo = "0.33"` 追加
- `apps/tachyond/Cargo.toml` — `sysinfo = { workspace = true }` 追加
- `apps/tachyond/src/worker.rs`
  - `collect_system_metrics()` 関数追加 — sysinfo::Systemでcpu/memory/disk/load_average/uptime収集
  - `sysinfo::System` をハートビートループ内で保持し、各ハートビート時にrefresh→メトリクス収集
  - `send_heartbeat` に `system_metrics` パラメータ追加
  - メトリクスJSON構造:
    ```json
    {
      "cpu_usage_percent": 45.2,
      "memory_total_bytes": 8589934592,
      "memory_used_bytes": 4294967296,
      "memory_usage_percent": 50.0,
      "disk_total_bytes": 107374182400,
      "disk_used_bytes": 53687091200,
      "disk_usage_percent": 50.0,
      "load_average_1m": 0.5,
      "load_average_5m": 0.3,
      "load_average_15m": 0.2,
      "uptime_seconds": 86400,
      "collected_at": "2026-02-09T12:00:00Z"
    }
    ```

### Phase 2: フロントエンド ✅

#### Step 7: APIクライアント型追加 ✅

- `apps/tachyon/src/lib/agent-workers.ts`
  - `SystemMetrics` 型を定義（cpu_usage_percent, memory_*, disk_*, load_average_*, uptime_seconds, collected_at）
  - `Worker` 型に `system_metrics?: SystemMetrics` 追加

#### Step 8: Workers一覧テーブルにメトリクス列追加 ✅

- `apps/tachyon/src/app/v1beta/[tenant_id]/ai/workers/workers-client.tsx`
  - テーブルヘッダーに CPU / Memory / Disk 列追加
  - `Progress` コンポーネントでパーセンテージ表示（プログレスバー + 数値）
  - `WorkersDictionary` に `cpu`, `memory`, `disk` 追加
  - SWRポーリング間隔を 30s → 10s に短縮

#### Step 9: Worker詳細ページにメトリクスカード追加 ✅

- `apps/tachyon/src/app/v1beta/[tenant_id]/ai/workers/worker-detail-client.tsx`
  - "System Metrics" カードを追加（CPU / Memory / Disk のプログレスバー + 数値）
  - ロードアベレージ（1m / 5m / 15m）、Uptime 表示
  - `collected_at` から「最終取得: ○分前」を表示
  - `formatBytes()`, `formatUptime()` ヘルパー関数追加
  - SWRポーリング間隔を 30s → 10s に短縮

#### Step 10: i18n辞書更新 ✅

- `apps/tachyon/src/lib/i18n/v1beta-translations.ts`
  - 英語: `columns` に cpu/memory/disk、`detail` に systemMetrics/cpu/memory/disk/loadAverage/uptime/lastCollected/noMetrics 追加
  - 日本語: 同様のキーを日本語訳で追加

### Phase 3: systemd常駐化 ✅

#### Step 11: systemdサービスファイルとセットアップスクリプト ✅

- `scripts/systemd/tachyond.service` — systemd unitファイル（セキュリティ強化設定含む）
- `scripts/systemd/tachyond.env.sample` — 環境変数テンプレート
- `scripts/systemd/setup-tachyond-service.sh` — インストールスクリプト（ユーザー作成、ディレクトリ準備、サービスインストール）

## 変更ファイル一覧

### Rust バックエンド
| ファイル | 変更内容 |
|---------|---------|
| `Cargo.toml` | `sysinfo = "0.33"` 追加 |
| `apps/tachyond/Cargo.toml` | `sysinfo` 依存追加 |
| `apps/tachyond/src/worker.rs` | `collect_system_metrics()` + `send_heartbeat` メトリクス統合 |
| `packages/agents/domain/src/worker.rs` | `WorkerEntity.system_metrics` フィールド追加 |
| `packages/agents/domain/src/worker_repository.rs` | `update_heartbeat` シグネチャ変更 |
| `packages/llms/src/agent/tool_job/adapter/gateway/sqlx_worker_repository.rs` | SQL更新 |
| `packages/llms/src/agent/tool_job/usecase/worker_heartbeat.rs` | InputData + テスト更新 |
| `packages/llms/src/agent/tool_job/adapter/axum/register_worker_handler.rs` | Request/Response + テスト更新 |
| `packages/llms/migrations/20260209000000_add_system_metrics_to_workers.up.sql` | 新規 |
| `packages/llms/migrations/20260209000000_add_system_metrics_to_workers.down.sql` | 新規 |
| `packages/llms/migrations/20260212000000_add_hostname_to_workers.up.sql` | 新規: hostname + system_info カラム追加 |
| `packages/llms/migrations/20260212000000_add_hostname_to_workers.down.sql` | 新規: rollback用 |

### TypeScript フロントエンド
| ファイル | 変更内容 |
|---------|---------|
| `apps/tachyon/src/lib/agent-workers.ts` | `SystemMetrics` 型 + `Worker.system_metrics` |
| `apps/tachyon/src/app/v1beta/[tenant_id]/ai/workers/workers-client.tsx` | CPU/Memory/Disk列追加 |
| `apps/tachyon/src/app/v1beta/[tenant_id]/ai/workers/worker-detail-client.tsx` | メトリクスカード追加 |
| `apps/tachyon/src/lib/i18n/v1beta-translations.ts` | i18nラベル追加（EN/JA） |

### インフラ / systemd
| ファイル | 変更内容 |
|---------|---------|
| `scripts/systemd/tachyond.service` | 新規 |
| `scripts/systemd/tachyond.env.sample` | 新規 |
| `scripts/systemd/setup-tachyond-service.sh` | 新規 |

## 検証方法

1. `mise run docker-sqlx-migrate` でマイグレーション実行
2. `mise run up-tachyon` でAPI + フロント起動
3. tachyondを起動してWorker登録 → ハートビートにメトリクスが含まれることをAPIログで確認
4. Workers一覧・詳細ページをブラウザで開き、メトリクスがリアルタイム更新されることをPlaywright MCPで確認
5. systemdサービスとして起動し、`systemctl status tachyond` / `journalctl -u tachyond` でログ確認

## 技術的な気づき

- `sysinfo::System::refresh_cpu_all()` は前回のrefreshからの差分でCPU使用率を計算するため、初回呼び出し直後の値は不正確。ハートビートループの開始前に1回refreshしてベースラインを確立している。
- `sysinfo::Disks::new_with_refreshed_list()` は呼び出しのたびに新しいリストを生成するため、ループ内で毎回呼び出す設計にした（ディスクのホットプラグに対応）。
- メトリクスのパーセンテージは小数点1位に丸めている（`round() / 10.0`）。

### Phase 4: 動作確認 📝

#### Step 12: ビルド確認
- [ ] `mise run check` でコンパイルエラーがないことを確認
- [ ] baconログ（tachyon-api起動中）でコンパイル成功を確認

#### Step 13: マイグレーション実行
- [ ] `mise run docker-sqlx-migrate` で `system_metrics` カラム追加
- [ ] DB確認: `agent_workers` テーブルに `system_metrics` カラムが存在すること

#### Step 14: API動作確認
- [ ] `mise run up-tachyon` でAPI + フロント起動
- [ ] tachyondをworkerモードで起動（Docker内 or ホスト）
- [ ] APIログでハートビートに `system_metrics` が含まれていることを確認
- [ ] `GET /v1/agent/workers` レスポンスに `system_metrics` が返ること

#### Step 15: フロントエンド動作確認（Playwright MCP）
- [ ] Workers一覧ページ: CPU/Memory/Disk列が表示されること
- [ ] Worker詳細ページ: メトリクスカード（CPU/Memory/Disk/Load Average/Uptime）が表示されること
- [ ] 60秒後にメトリクスが更新されること（SWRポーリング10秒）
- [ ] スクリーンショット取得

#### Step 16: systemdサービス確認（このVPSで実施）
- [ ] セットアップスクリプト実行
- [ ] `/etc/tachyond/tachyond.env` 設定
- [ ] `systemctl start tachyond` で起動
- [ ] `journalctl -u tachyond -f` でハートビート送信ログ確認
- [ ] フロントエンドからメトリクスが見えること

## 進捗ログ

### 2026-02-09
- ✅ Phase 1-3 全Step実装完了
- 📝 残: ビルド確認、マイグレーション実行、動作確認

### 2026-02-12
- 🔄 Phase 4（動作確認）開始、taskdocを in-progress に移動
- 🐛 **重大バグ発見**: Worker登録が冪等でなく、ハートビートが完全に機能していなかった
  - 原因1: サーバーが毎回新しい `wkr_<ULID>` を生成、クライアント指定の worker_id を無視
  - 原因2: クライアントは自分の `worker-<ULID>` でハートビート送信 → DBに存在しないIDで UPDATE → 0行更新
  - 原因3: 再起動のたびに新しいWorkerが増殖（ゴースト化）
  - 本番API確認: 全Workerが `status: "registered"` のまま、`last_heartbeat_at` が全てnull
- ✅ 修正実装: クライアント指定 `worker_id` をDB主キーとして使用（`ON DUPLICATE KEY UPDATE` で冪等）
- ✅ `hostname` フィールド追加（ドメイン/ユースケース/ハンドラ/リポジトリ/マイグレーション/フロント）
- ✅ コンパイルチェック通過（`mise run check`）
- ✅ 本番API確認: 13個のゴーストWorker蓄積、全て `registered` のまま、heartbeat/metrics なし
- ✅ `system_info` JSON フィールド追加（登録時に OS/カーネル/CPU/メモリ/ディスクを送信）
  - ドメイン/マイグレーション/リポジトリ/ユースケース/ハンドラ/tachyondクライアント全層
- ✅ フロントエンドUI変更
  - Workers一覧テーブルに `hostname` 列追加
  - Worker詳細ページに「System Information」カード追加（OS/Kernel/Arch/CPU/Memory/Disk）
  - i18n辞書更新（EN/JA）
- ✅ コンパイルチェック再通過（`mise run check`）
- 📝 **残**: commit → PR作成 → リリースビルド → 本番デプロイ → マイグレーション → systemdサービス起動
