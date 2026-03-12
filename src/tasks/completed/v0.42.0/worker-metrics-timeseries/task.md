---
title: "ワーカーシステムメトリクスの時系列表示機能"
type: "feature"
emoji: "📊"
topics: ["Workers", "Metrics", "Time Series", "Charts", "Backend", "Frontend"]
published: true
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/workers/
  - apps/tachyon/src/lib/agent-workers.ts
  - packages/llms/src/agent/worker/
  - apps/tachyon-api/
github: ""
---

# ワーカーシステムメトリクスの時系列表示機能

## 概要

ワーカー詳細画面にシステムメトリクス（CPU使用率、メモリ使用率、ディスク使用率）の時系列グラフを追加する。現在はスナップショット（最新値のみ）しか表示されていないが、過去のメトリクス推移を可視化できるようにする。

## 背景・目的

- 現在のワーカー詳細画面ではCPU/メモリ/ディスク使用率が最新値のプログレスバーのみで表示されている
- ワーカーの負荷傾向やリソース利用パターンを把握するには時系列データが必要
- 異常検知やキャパシティプランニングの基礎データとして時系列メトリクスが有用

## 詳細仕様

### 機能要件

1. **メトリクスの永続化**
   - ワーカーハートビート時に送信されるsystem_metricsをDBに時系列保存
   - 保存項目: cpu_usage_percent, memory_usage_percent, disk_usage_percent, timestamp
   - 保存間隔: ハートビート間隔（現在10秒ごと）に連動

2. **メトリクス取得API**
   - REST: `GET /v1/agent/workers/:worker_id/metrics?period=1h|6h|24h|7d`
   - レスポンス: タイムスタンプ付きメトリクス配列
   - データポイントの間引き: 長期間の場合は適切にダウンサンプリング

3. **フロントエンド時系列グラフ**
   - ワーカー詳細画面にメトリクスタブまたはセクション追加
   - 折れ線グラフでCPU/メモリ/ディスクを表示
   - 期間切り替え（1h, 6h, 24h, 7d）
   - ホバー時のツールチップで正確な値表示

### 非機能要件

- メトリクスデータの保持期間: 30日（それ以降は自動削除）
- API応答時間: 1秒以内
- グラフ描画: クライアントサイドレンダリング

## 実装方針

### バックエンド

#### DBテーブル設計
```sql
CREATE TABLE worker_metrics_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  worker_id VARCHAR(64) NOT NULL,
  operator_id VARCHAR(64) NOT NULL,
  cpu_usage_percent DECIMAL(5,2),
  memory_usage_percent DECIMAL(5,2),
  disk_usage_percent DECIMAL(5,2),
  recorded_at DATETIME(6) NOT NULL,
  INDEX idx_worker_recorded (worker_id, recorded_at),
  INDEX idx_operator_recorded (operator_id, recorded_at)
);
```

#### メトリクス保存
- 既存のハートビート処理（`update_worker_heartbeat`）にメトリクス保存を追加
- バッチINSERTまたは個別INSERTで保存

#### メトリクス取得API
- `GET /v1/agent/workers/:worker_id/metrics`
- クエリパラメータ: `period` (1h/6h/24h/7d), `resolution` (auto/1m/5m/1h)
- ダウンサンプリング: `GROUP BY` + `AVG` で集約

### フロントエンド

#### チャートライブラリ
- Recharts（既にプロジェクトで使用されている場合）またはChart.js
- shadcn/uiのChartコンポーネント（Rechartsベース）が利用可能か確認

#### コンポーネント構成
```
worker-detail-client.tsx
  └── WorkerMetricsChart (新規)
        ├── PeriodSelector (1h/6h/24h/7d)
        ├── MetricsLineChart (CPU/Memory/Disk)
        └── MetricsTooltip
```

## タスク分解

### フェーズ1: バックエンド - メトリクス永続化 ✅
- [x] DBマイグレーション作成（`worker_metrics_history`テーブル）
- [x] メトリクスリポジトリ実装（保存・取得、ダウンサンプリング付き）
- [x] ハートビート処理にメトリクス保存追加（失敗時はwarnログのみ）
- [ ] 古いメトリクスの自動削除（30日以上）— 後続タスク

### フェーズ2: バックエンド - メトリクス取得API ✅
- [x] REST エンドポイント `GET /v1/agent/workers/:worker_id/metrics?period=` 実装
- [x] ダウンサンプリングクエリ実装（`GROUP BY UNIX_TIMESTAMP DIV bucket`）
- [x] 認可チェック追加（`agents:GetWorkerMetrics`アクション）
- [x] シードにアクション・ポリシー追加（AdminPolicy, WorkerPolicy）

### フェーズ3: フロントエンド - グラフ表示 ✅
- [x] Recharts（既存インストール済み）を使用
- [x] メトリクスAPI呼び出し関数追加（`getWorkerMetrics`）
- [x] `WorkerMetricsChart`コンポーネント実装（AreaChart、グラデーション、カスタムツールチップ）
- [x] 期間切り替えUI実装（1h/6h/24h/7d タブ）
- [x] ワーカー詳細画面への組み込み
- [x] EN/JA翻訳追加

### フェーズ4: テスト・品質確認 ✅
- [x] Rustコンパイルチェック通過
- [x] TypeScript型チェック・lint通過
- [x] Playwright MCPでUI動作確認
- [x] メトリクスAPI動作確認（12件テストデータで検証）
- [x] グラフ表示確認（AreaChart、ツールチップ、期間切り替え）

実装メモ:
- `DECIMAL(5,2)`の`AVG()`はDECIMAL型を返すため、Rustの`f64`と型不一致が発生。SQLで`CAST(AVG(...) AS DOUBLE)`を追加して解決。
- テストデータは`UTC_TIMESTAMP()`で挿入する必要あり（`NOW()`はJSTになるためRustの`Utc::now()`と範囲が合わない）。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| メトリクスデータ量増大 | 中 | 30日保持制限 + ダウンサンプリング |
| ハートビート処理の遅延 | 低 | 非同期INSERT、バルクINSERT検討 |
| TiDB DDL互換性 | 中 | `create-migration`スキル使用 |
| DECIMAL→f64型不一致 | 低 | CAST(AVG(...) AS DOUBLE)で解決済み |

## 参考資料

- 既存ワーカーAPI: `packages/llms/src/agent/worker/`
- ワーカー詳細UI: `apps/tachyon/src/app/v1beta/[tenant_id]/ai/workers/worker-detail-client.tsx`
- shadcn/ui Charts: https://ui.shadcn.com/docs/components/chart

## 完了条件

- [x] ワーカーハートビートごとにメトリクスがDBに保存される
- [x] REST APIで指定期間のメトリクスが取得できる
- [x] ワーカー詳細画面で時系列グラフが表示される
- [x] 期間切り替え（1h/6h/24h/7d）が動作する
- [x] TypeScript/Rust品質チェック通過
- [x] 動作確認完了
