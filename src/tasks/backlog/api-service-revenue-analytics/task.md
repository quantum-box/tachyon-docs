---
title: "APIサービス課金内訳の永続化と収益ダッシュボード"
type: "improvement"
emoji: "💰"
topics:
  - analytics
  - billing
  - pricing
published: false
targetFiles:
  - packages/catalog/src/service_pricing/service_cost_calculator.rs
  - packages/catalog/src/service_pricing/service_price_mapping.rs
  - packages/llms/src/usecase/agent_cost_calculator.rs
  - packages/payment/src/domain/transaction.rs
  - apps/tachyon-api/src/graphql/
  - apps/tachyon/src/app/v1beta/[tenant_id]/pricing/
  - scripts/seeds/
---

# APIサービス課金内訳の永続化と収益ダッシュボード

## 概要

- エージェント実行・API利用時に算出される課金内訳（トークン単価、調達原価、マークアップ、ツールコストなど）をトランザクション単位で保持し、後から参照できるようにする。
- 各 API サービスごとに売上／原価／粗利を集計し、テナント／プラットフォーム単位のダッシュボードで可視化する。
- 将来的な会計連携・監査対応を見据え、課金ロジックの再現性を高める。

## 背景・目的

- 現状は実行時のコスト計算を即時に算出するだけで、後から計算根拠を追跡できない。
- SaaS 内で API サービス別の売上や利益率を把握できず、価格戦略の最適化が難しい。
- 監査や料金トラブル時に、当該トランザクションの内訳を確認できる仕組みが必要。

## 詳細仕様

1. トランザクション内訳の永続化
   - `service_price_mappings` と `Procurement` 情報から算出した各コンポーネント（金額、マークアップ率、ベース原価）を JSON 形式または正規化テーブルで保存。
   - エージェント実行（LLMsコンテキスト）と API カタログ（Catalogコンテキスト）の双方で利用できる共通スキーマを検討。
   - 既存の `payment::transactions` や `agent_execution_costs` にメタデータとして紐づけ。

2. API サービス収益ダッシュボード
   - 売上（日次／月次）、原価、粗利をテナント単位で集計。
   - サービス別、モデル別、ツール別などでフィルタリング可能な UI を `apps/tachyon` に追加。
   - GraphQL 経由で集計 API を提供し、BI 連携も想定。

3. 監査・再計算のサポート
   - 保存した内訳から、当該トランザクションの再計算を行い整合性を検証できる仕組みを設計。
   - マイグレーション時のロールフォワード／ロールバック手順を明文化。

## タスク分解

- [ ] 現状のコスト計算フローと保存先を調査（Catalog / LLMs / Payment）
- [ ] トランザクション内訳スキーマ案を策定（正規化 vs JSON）
- [ ] API サービス別収益集計の要件・KPI を定義
- [ ] GraphQL / UI の情報設計（フィルター、期間、グラフ種類）
- [ ] 内訳保存のライフサイクル（書き込みタイミング・再計算）を設計
- [ ] シードデータ／テストケースの準備（高負荷時の検証含む）

## テスト計画

- 単体テスト：内訳保存ロジック、再計算の整合性を検証。
- 結合テスト：エージェント実行～課金～ダッシュボードまでのフローをシナリオテスト化。
- パフォーマンス：大量トランザクション集計時のレスポンス検証。

## リスクと対策

| リスク | 対策 |
|--------|------|
| 保存データ量の増加によるストレージ圧迫 | 圧縮やアーカイブ方針を定義 |
| 集計クエリの負荷 | マテリアライズドビュー、インデックス設計を検討 |
| 計算ロジック変更時の再計算 | バージョン管理と再適用手順を文書化 |

## スケジュール案

- 2025-10-20: 調査・スキーマ検討
- 2025-10-27: MVP 実装（内訳保存 + 基本集計API）
- 2025-11-03: ダッシュボード UI / 追加集計
- 2025-11-10: 負荷試験・改善

## 参考リンク

- `packages/catalog/src/service_pricing/service_cost_calculator.rs`
- `packages/llms/src/usecase/agent_cost_calculator.rs`
- `packages/payment/src/domain/transaction.rs`
- `docs/src/architecture/nanodollar-system.md`
