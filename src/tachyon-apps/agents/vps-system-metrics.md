# VPS System Metrics (tachyond)

## 概要

tachyondのWorkerハートビート機構（60秒間隔）にVPSのシステムメトリクス（CPU/メモリ/ディスク）を載せて送信し、フロントエンドのWorkerページでリアルタイム表示する。

## アーキテクチャ

```
tachyond (VPS)                      tachyon-api                 Frontend
┌──────────────┐   heartbeat/60s   ┌──────────────┐   SWR/10s  ┌──────────────┐
│ sysinfo crate├──────────────────►│ agent_workers ├──────────►│ Workers Page │
│ System.refresh│  system_metrics  │ JSON column   │           │ Progress bars│
└──────────────┘                   └──────────────┘            └──────────────┘
```

### データフロー

1. **tachyond**: `sysinfo::System` でCPU/メモリ/ディスク/ロードアベレージ/uptimeを収集
2. **Heartbeat API**: `POST /v1/agent/workers/{id}/heartbeat` に `system_metrics` JSONフィールドを追加
3. **DB**: `agent_workers.system_metrics` (JSON) に最新スナップショットのみ保存
4. **Frontend**: SWRポーリング（10秒間隔）でWorker一覧/詳細を更新表示

## メトリクス構造

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

## REST API

### Worker Heartbeat

```
POST /v1/agent/workers/{worker_id}/heartbeat
```

```json
{
  "system_metrics": {
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
}
```

### Worker Info Response

Worker一覧・詳細のレスポンスに `system_metrics` フィールドが追加される。

## フロントエンド表示

### Workers一覧テーブル

CPU / Memory / Disk 列をプログレスバー＋パーセンテージで表示。

### Worker詳細ページ

- "System Metrics" カード: CPU / Memory / Disk のプログレスバー + 使用量/総量
- ロードアベレージ（1m / 5m / 15m）
- Uptime（日/時間/分で表示）
- 最終取得時刻（「○分前」形式）

## systemd常駐化

tachyondをsystemdサービスとして運用するための設定ファイルを提供。

| ファイル | 用途 |
|---------|------|
| `scripts/systemd/tachyond.service` | systemd unitファイル（セキュリティ強化設定含む） |
| `scripts/systemd/tachyond.env.sample` | 環境変数テンプレート |
| `scripts/systemd/setup-tachyond-service.sh` | インストールスクリプト |

### セットアップ手順

```bash
# 1. 環境変数ファイルを準備
cp scripts/systemd/tachyond.env.sample /etc/tachyond/tachyond.env
vi /etc/tachyond/tachyond.env

# 2. セットアップスクリプトを実行
sudo bash scripts/systemd/setup-tachyond-service.sh

# 3. サービス管理
sudo systemctl start tachyond
sudo systemctl status tachyond
journalctl -u tachyond -f
```

## 技術的注意事項

- `sysinfo::System::refresh_cpu_all()` は前回のrefreshからの差分でCPU使用率を計算するため、初回呼び出し直後の値は不正確。ハートビートループ開始前に1回refreshしてベースラインを確立する。
- `sysinfo::Disks::new_with_refreshed_list()` は毎回新しいリストを生成するため、ディスクのホットプラグに対応可能。
- メトリクスのパーセンテージは小数点1位に丸めている。

## 関連ファイル

### Rust バックエンド
- `apps/tachyond/src/worker.rs` — メトリクス収集 (`collect_system_metrics()`)
- `packages/agents/domain/src/worker.rs` — `WorkerEntity.system_metrics`
- `packages/agents/domain/src/worker_repository.rs` — `update_heartbeat` シグネチャ
- `packages/llms/src/agent/tool_job/adapter/gateway/sqlx_worker_repository.rs` — SQL更新
- `packages/llms/src/agent/tool_job/usecase/worker_heartbeat.rs` — InputData拡張
- `packages/llms/src/agent/tool_job/adapter/axum/register_worker_handler.rs` — REST Request/Response拡張

### TypeScript フロントエンド
- `apps/tachyon/src/lib/agent-workers.ts` — `SystemMetrics` 型定義
- `apps/tachyon/src/app/v1beta/[tenant_id]/ai/workers/workers-client.tsx` — 一覧テーブル
- `apps/tachyon/src/app/v1beta/[tenant_id]/ai/workers/worker-detail-client.tsx` — 詳細ページ
- `apps/tachyon/src/lib/i18n/v1beta-translations.ts` — i18nラベル (EN/JA)

### インフラ
- `scripts/systemd/tachyond.service` — systemd unitファイル
- `scripts/systemd/tachyond.env.sample` — 環境変数テンプレート
- `scripts/systemd/setup-tachyond-service.sh` — セットアップスクリプト
