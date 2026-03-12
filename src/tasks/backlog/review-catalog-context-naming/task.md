---
title: "Review Catalog Context Naming and Responsibility Split"
type: "refactor"
emoji: "🗂️"
topics: ["Catalog", "Pricing", "Architecture"]
status: "backlog"
assignees: []
---

## 背景

`packages/catalog` クレートはプロダクトメタデータ管理・従量課金レート計算・REST/GraphQL アダプタをすべて内包しており、「Catalog」という名称と実際の責務が乖離してきている。特に NanoDollar ベースの料金計算やサービスコスト見積もり API は Pricing/Billing に近い役割を担っている。

## 課題

- 名前が抽象的で、料金計算ロジックの所在が分かりづらい。
- `catalog::pricing` / `service_pricing` / `adapter::axum` など多層に広がり、メンテナンス時に境界が曖昧。
- 他クレートでも `pricing` というモジュール名が散在しており、今後のリネームや切り出しが衝突しやすい。

## 検討事項

- プロダクトカタログ責務と料金計算責務を分離するか検討する (`product_catalog` + `product_pricing` 等)。
- Naming の再検討：`product_pricing` / `pricing_catalog` / `pricing-service` など候補案を評価する。
- Axum / GraphQL アダプタを別クレート（例: `catalog-api`）へ切り出す是非。
- 依存関係への影響を洗い出し、段階的なリファクタリング計画を作成する。

## 次のアクション案

1. 現行クレート構造と依存図を整理し、責務境界をドキュメント化する。
2. リネーム/分割時の影響箇所（Cargo.toml、import path、feature flag）を調査する。
3. 実施する場合のマイルストーンを設定し、段階的に再編を進める。

## 備考

- 2025-10-10 時点で独立した `pricing` クレートは存在しないが、各プロバイダで `pricing` モジュールが利用されているため命名衝突に注意。*** End Patch***
