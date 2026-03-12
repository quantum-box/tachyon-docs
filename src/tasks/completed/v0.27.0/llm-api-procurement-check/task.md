---
title: "LLM API 調達要件の現状調査"
type: "documentation"
emoji: "🔍"
topics:
  - llm
  - billing
  - procurement
published: false
targetFiles:
  - docs/src/tasks/documentation/llm-api-procurement-check/task.md
github: ""
---

# LLM API 調達要件の現状調査

## 概要

LLM API を利用する際に必須となる外部 API（プロバイダー契約・鍵発行など）の調達要件が、既存の仕様・実装・ドキュメントに適切に組み込まれているかを調査し、ギャップを整理する。

## 背景・目的

- LLM API は外部プロバイダーとの契約・鍵取得を前提とするため、内部システム側でも調達状況を前提にした制御や運用フローが必要。
- 現状の仕様では調達確認が考慮されていない可能性があるとの指摘を受けた。
- 既存のアーキテクチャやドキュメントでどこまで考慮されているかを洗い出し、必要な次アクションを明確にする。

## 詳細仕様

### 機能要件（調査観点）

1. 調達済み API キー／契約情報の保持・参照ロジックが存在するか。
2. LLM 呼び出し処理が調達状況を検証する仕組みを備えているか。
3. 調達未完了時の失敗パターン・エラーハンドリングが定義されているか。

### 非機能要件（調査観点）

- セキュリティ: API キー管理方針が明文化されているか。
- 運用性: 調達フローや更新手順がドキュメント化されているか。
- トレーサビリティ: 調達状況を監査・ログで確認できるか。

### コンテキスト別の責務（仮説）

```yaml
contexts:
  llms:
    description: "LLM プロバイダーとの接続を抽象化する層"
    responsibilities:
      - プロバイダーごとの認証情報を用いた API 呼び出し
      - 呼び出し前の調達確認ロジック（要存在確認）
  payment:
    description: "課金・残高管理を行う層"
    responsibilities:
      - 調達状態に応じた課金可否判定（要存在確認）
  operations:
    description: "外部サービス連携を管理する運用フロー"
    responsibilities:
      - API キー取得手順・更新手順の文書化
      - 契約更新アラート・監査ログ
```

## タスク分解（進捗管理）

### フェーズ1: 既存ドキュメント／仕様の棚卸し 📝

- [x] LLM 関連ドキュメント（例: `docs/src/services/tachyon/procurement-pricing.md`, `docs/src/tachyon-apps/llms/agent-api/*` など）の調査
- [x] `packages/llms` 配下のドメイン・ユースケース実装確認
- [x] 調達に関連しそうな設定ファイル・シード（`scripts/seeds/n1-seed/*`, env 設定）の確認

### フェーズ2: 実装コードの調査 📝

- [x] LLM 呼び出しフロー（`LLMApp`, providers, billing hooks）の確認
- [x] 調達状態を参照するロジックの有無を確認
- [x] エラー処理・ログ出力の確認

### フェーズ3: ギャップ分析と改善方針整理 ✅ (2025-10-15 完了)

- [x] 現状の考慮事項まとめ
- [x] 調達チェックを組み込むべきポイントの洗い出し
- [x] ドキュメント・実装の更新案の整理

#### 現状の考慮事項 (2025-10-15 更新)
- `ProcurementAppService::get_llm_cost()` は `IntegratedPricingProvider` 経由でモデル単価を取得し、未登録モデルは `not_found` + warn を返す（`packages/procurement/src/app.rs:320`）。調達契約や原価シードの有無までは検証していない。
- `ServiceCostCalculator::resolve_mapping_price_nanodollar()` は固定価格未設定時に `BusinessLogicError` を返し、請求漏れを検知できるようになっている（`packages/catalog/src/service_pricing/service_cost_calculator.rs:351`）。
- コスト見積もりユースケース `AgentCostCalculator` は調達未登録時に warn を出しつつ `None` を返すため、見積もりは 0 で継続する（`packages/llms/src/usecase/agent_cost_calculator.rs:224`）。
- 調達データは YAML シードと `PricingRegistry` で別管理されており、契約失効や API キー未設定時の監視・アラート手段が現状存在しない（`scripts/seeds/n1-seed/007-procurement-suppliers.yaml`、`packages/procurement/src/configuration.rs:176`）。

#### 調達チェックを組み込むべきポイント (2025-10-15 更新)
- LLM 実行開始前の `ExecuteAgent` 系ユースケースで、対象モデルに対する調達契約・原価が揃っているかを検証し、欠落時はビジネスロジックエラーとして処理を中断する。
- `ServiceCostCalculator` 内の価格解決で `None` を返す代わりに `Error::business_logic` 相当を発生させ、Catalog経由の課金系フローすべてで調達漏れを検知できるようにする。（2025-10-15 実装済み）
- `ProcurementConfigurationProvider` に契約有効期限とAPIキー設定状況のバリデーションを追加し、期限切れデータを検出した場合は警告メトリクスを吐き出す。

#### ドキュメント・実装更新案 (2025-10-15 草案)
- Agent API 仕様 (`docs/src/tachyon-apps/llms/agent-api/overview.md`) と LLM プロバイダー統合手順に、調達契約適用・価格シード更新フローを必須前提として追記する。
- `ProcurementAppService::get_llm_cost()` を拡張し、契約リポジトリと調達価格リポジトリを参照して「契約未締結」「原価未登録」を明示的に区別する戻り値を追加。LLM ユースケース側でこの区別を利用した警告ロギングを行う。
- Catalog の `ServicePriceMapping` に「調達必須」フラグを導入し、調達前提のマッピングでは固定価格が欠落している場合にマイグレーションエラーとなるようバリデーションを追加。マイグレーション時に既存データへフラグ設定と固定価格の再計算を行う。

## 調査結果メモ

- 調達アプリケーション  
  - `ProcurementAppService::get_llm_cost()` が `IntegratedPricingProvider` 経由でモデル単価を取得し、未登録モデルは `not_found` + warn を返す実装（`packages/procurement/src/app.rs:320`、`packages/procurement/src/pricing_registry.rs:92`）。  
  - プロバイダーごとの単価テーブルは `packages/providers/<vendor>/src/pricing.rs` にハードコードされ、`PricingRegistry` 初期化で登録。
- シード／マスターデータ  
  - サプライヤー・契約・調達原価は `scripts/seeds/n1-seed/007-procurement-suppliers.yaml` に集約。  
  - 価格マッピングの初期投入は `scripts/seeds/n1-seed/005-order-products.yaml` と `scripts/seeds/n1-seed/010-order-service-price-mappings.yaml` に存在する。
- LLM 実装  
  - コスト見積もりユースケースは調達単価を取得し、取得できない場合は warn を出しつつ 0 で推計を継続する（`packages/llms/src/usecase/agent_cost_calculator.rs:224`）。  
  - 実行フローの課金はカタログの価格マッピング（fixed 価格）に依存し、調達原価は実請求には直接使われていない。
- 認証情報  
  - 各プロバイダーで API キー未設定時に panic/expect で失敗する実装（例: `packages/providers/openai/src/api.rs:29`）。運用手順も `docs/src/services/tachyon/llm-xai-grok4.md` に記載。
- ドキュメント  
  - 調達・価格のアーキテクチャ文書は存在するが、Agent API 仕様 (`docs/src/tachyon-apps/llms/agent-api/overview.md`) では調達前提や契約更新フローが明示されていない。

## 追加調査結果 (2026-01-12)

### 料金計算フロー整理

- LLM モデル価格の解決は `PricingRegistry` で行われ、`ProcurementAppService::get_llm_cost()` が `IntegratedPricingProvider` を通じてプロバイダー名を判定している（`packages/procurement/src/pricing_registry.rs:96`）。契約や調達価格の存在チェックは行っていない。
- `ProcurementConfigurationProvider` は `PricingRegistry` と `ProviderInfoRegistry` から Host 設定を構成し、operator/platform のオーバーライドは未実装（`packages/procurement/src/configuration.rs:176`）。
- `AgentCostCalculator` は調達価格が見つからない場合に warn を出し、見積もりは 0 で継続する。実運用の課金単価はここではなく Catalog 側の fixed 価格が前提（`packages/llms/src/usecase/agent_cost_calculator.rs:224`）。
- `ServiceCostCalculator` は `ServicePriceMapping` の fixed 価格のみを参照し、`procurement_price_id` や `ProcurementPriceRepository` は直接使われていない（`packages/catalog/src/service_pricing/service_cost_calculator.rs:351`）。固定価格が無い場合は `BusinessLogicError`。
- `SimpleCalculateServiceCost` も fixed 価格（nano か catalog 内部単位）を参照するだけで調達原価は使わない（`packages/catalog/src/usecase/calculate_service_cost.rs:72`）。
- 調達原価の参照は `ProfitService` で行われ、fixed 価格が無い場合に `procurement_price_id` + `markup_rate` を使って収益推定を行う（`packages/profit/src/service/profit_service.rs:206`）。

### 調達品目の読み込み経路

- 調達原価 (`procurement_prices`) は `SqlxProcurementPriceRepository` で DB から取得し、`ProcurementApp` や `ProfitService` で参照される（`apps/tachyon-api/src/di.rs:349`、`packages/profit/src/service/profit_service.rs:304`）。
- 価格マッピングの初期投入は `scripts/seeds/n1-seed/005-order-products.yaml`（固定価格中心）と `scripts/seeds/n1-seed/010-order-service-price-mappings.yaml`（調達連動価格）で行われる。
- `PricingRegistry` 側のモデル単価はプロバイダー SDK 内の定義で、調達シードとは別管理。

### 既存テスト状況

- `ServiceCostCalculator` は fixed 価格未設定時にエラーになるテストが存在する（`packages/catalog/src/service_pricing/service_cost_calculator.rs:677`）。
- `AgentCostCalculator` のフォールバックと `ProcurementAppService::get_llm_cost()` の not_found 取り扱いはテスト追加済み（`packages/llms/src/usecase/agent_cost_calculator.rs:255`、`packages/procurement/src/app.rs:477`）。
- `PricingRegistry` の provider 未登録時の not_found もテスト追加済み（`packages/procurement/src/pricing_registry.rs:134`）。

## 実装進捗メモ (2025-10-15 更新)
- Catalog: `ServiceCostCalculator` が固定価格未設定時に `BusinessLogicError` を返すよう更新し、`service_price_mappings` に `price_mode` カラムを追加。`Create/UpdateServicePriceMapping` で価格モードを取り扱えるよう GraphQL/API/フロントエンドを整備。
- LLM: `AgentCostCalculator` は調達価格未登録時に `WARN` ログを吐きつつ推計を0として継続するフェイルセーフを追加（実課金は Catalog 固定価格で継続）。
- Procurement: `ProcurementAppService::get_llm_cost()` が調達未登録時に警告ログと明示的な `NotFound` メッセージを返すよう調整。

## 実装進捗メモ (2026-01-12 更新)
- LLM: `AgentCostCalculator` の調達未登録フォールバックを単体テストで確認（`packages/llms/src/usecase/agent_cost_calculator.rs`）。
- Procurement: `PricingRegistry` の未登録 provider と `ProcurementAppService::get_llm_cost()` の not_found をテストで確認（`packages/procurement/src/pricing_registry.rs`、`packages/procurement/src/app.rs`）。
- Catalog: `SimpleCalculateServiceCost` の fixed 価格未設定時挙動をテストで確認（`packages/catalog/src/usecase/calculate_service_cost.rs`）。

## 判明したギャップ

1. **調達原価が実課金フローに反映されない**  
   - `ServiceCostCalculator` と `SimpleCalculateServiceCost` は fixed 価格のみを参照し、`procurement_price_id` が設定されていても調達原価は参照されない。固定価格が未設定の経路では明示的なエラーにならないケースがある（`packages/catalog/src/usecase/calculate_service_cost.rs:72`）。  
   - LLM 実行開始前に「調達原価が存在するか」を検証する仕組みがない。
2. **ドキュメントの前提不足**  
   - プロバイダー追加手順で「調達契約とシード更新が必須」である点が記述されていない。  
   - Agent API の仕様／運用ガイドに調達前提・契約有効期限の扱いがない。
3. **監視・アラートの欠如**  
   - `ProcurementConfigurationProvider` は Host 基準で設定を返すだけで、契約期限切れや API キー失効を検知・通知する機構が見つからない。

### フェーズ4: 実装プラン策定と実装着手 🔄 (2025-10-15 開始)
- [x] Catalog 価格モード仕様の反映方針を確定しタスク化
- [x] 価格モード導入に伴うスキーマ変更案（migration）の文書化
- [x] LLM 実行時の調達チェックとフォールバック戦略の整理
- [x] 関連ドキュメント更新対象の洗い出し
- [x] Claude 4.5 Sonnet 向け調達価格シードと UI フィルタ更新（2025-10-15）

## 次アクション案

1. **仕様・ドキュメント更新**  
   - Agent API / LLM プロバイダー統合手順に調達シード更新フローと必須契約情報を追記。  
   - オペレーションガイドへ「調達未完了時は LLM API を有効化しない」ルールを追加。
2. **実装のガード強化**  
   - `ServicePriceMapping` に価格モードを追加し、「調達連動で算出した結果を fixed_price（NanoDollar）として保存し、請求計算は常に fixed を参照する」構成にリファクタリング。  
   - 固定価格が空の状態で請求計算が呼ばれた場合のみビジネスロジックエラーにし、調達漏れを早期検知。  
   - `ExecuteAgent` 等で `ProcurementAppService::get_llm_cost()` が `not_found` を返したら、「調達未登録」警告を出しつつ、既存の fixed 価格で請求を継続できるようエラー設計を見直す。  
   - 新規プロバイダー登録時に「調達シード適用 → 固定価格更新」がセットで行われる CI/コマンドを整備。
3. **運用モニタリング**  
   - 調達契約の有効期限監視・API キー期限チェックの自動化タスクをバックログ化。  
   - `ProcurementConfigurationProvider` を拡張し、期限切れデータが存在する場合に警告を出す差分タスクを検討。  
   - 価格モードが `PROCUREMENT_LINKED` のマッピングに fixed 価格が存在するかを定期的にバリデーションする仕組みを追加。

## テスト計画（予定）

- `AgentCostCalculator` の warn + 0 フォールバックを検証する単体テストを追加（対応済み）。
- `ProcurementAppService::get_llm_cost()` の not_found 判定とメッセージを検証するテストを追加（対応済み）。
- `PricingRegistry` が未登録 provider で `not_found` を返すケースのテストを追加（対応済み）。
- `SimpleCalculateServiceCost` が fixed 価格未設定時にどう振る舞うか（エラー or 無視）を明示化するテストを追加（対応済み）。
- 価格マッピング投入経路が判明したため、`apps/tachyon-api/tests/scenarios/catalog_service_price_mapping.yaml` に調達連動マッピングの検証ケースを追加（対応済み）。
- `mise run docker-test` はビルドロック待ちでタイムアウトしたため、ロック解消後に再実行が必要。

## テスト実行メモ (2026-01-12)

- `mise run docker-scenario-test-tachyon-api` はビルドロック待ちでタイムアウト。後続で手動確認済み（ユーザー報告: 成功）。
- `mise run docker-test` はビルドロック待ちでタイムアウトしたが、後続で手動確認済み（ユーザー報告: 成功）。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 調達フローが非公開情報に依存しており調査不能 | 中 | 関係者へのヒアリングポイントを整理する |
| 調達確認ロジックが多数のコンポーネントに散在 | 高 | 関連ソースコードの参照経路をマッピングして整理 |

## 参考資料（調査予定）

- `docs/src/services/tachyon/procurement-pricing.md`
- `docs/src/services/tachyon/llm-xai-grok4.md`
- `docs/src/tachyon-apps/llms/agent-api/overview.md`
- `packages/procurement/src/app.rs`
- `packages/procurement/src/pricing_registry.rs`
- `packages/catalog/src/service_pricing/service_cost_calculator.rs`
- `packages/llms/src/usecase/agent_cost_calculator.rs`
- `packages/providers/openai/src/api.rs`
- `scripts/seeds/n1-seed/005-order-products.yaml`
- `scripts/seeds/n1-seed/007-procurement-suppliers.yaml`
- `scripts/seeds/n1-seed/010-order-service-price-mappings.yaml`

## 完了条件（調査フェーズ）

- [x] LLM API 調達に関する既存仕様・実装の確認結果が整理できている
- [x] ギャップと改善の方向性が列挙されている
- [ ] 次フェーズで実装／ドキュメント修正に移れる状態になっている

## 備考

- 調達プロセスに関わる機密情報はタスクドキュメントに直接記載せず、扱い方針のみ整理する。
