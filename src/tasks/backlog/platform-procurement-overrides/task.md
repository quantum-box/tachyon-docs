---
title: "Platform Procurement Pricing Overrides"
type: improvement
emoji: "🏷️"
topics:
  - procurement
  - pricing
  - platform
published: false
targetFiles:
  - packages/procurement/src/configuration.rs
  - packages/procurement/src/app.rs
  - packages/procurement/src/pricing_registry.rs
  - apps/tachyon-api/src/di.rs
github: ""
---

# Platform Procurement Pricing Overrides

## 概要
Platform テナント向けに LLM 原価・ツールコストのオーバーライドを許可する仕組みを整備し、Host 設定をベースにしつつ合理的な条件付きで値下げできるようにする。

## 背景・目的
- 現在は Host レベルの原価がコード内（各プロバイダーの `PricingProvider`）でハードコードされ、`PricingRegistry` → `ProcurementConfigurationProvider` を介して Host 設定として提供されている。
- Platform テナントが長期契約やキャンペーン等で特別料金を適用したい場合に、既存実装では上書き不可。
- Host 原価を下回る設定は赤字の恐れがあるため、理由コードや期間など最低限のメタ情報を伴って承認できる仕組みが必要。

## 詳細仕様
### 機能要件
1. Platform 向けの原価オーバーライドを保存する永続化レイヤーを追加する。
   - 項目例: `platform_id`, `model_name`, `override_prompt_cost`, `override_completion_cost`, `reason_code`, `effective_from`, `effective_to`, `approved_by`。
2. `ProcurementConfigurationProvider::get_platform_config()` で上記オーバーライドを読み込み、Host 設定に対してマージした Platform 設定を返す。
3. Host 原価を下回る場合は `reason_code` が `LONG_TERM_CONTRACT` / `CAMPAIGN` / `CUSTOM_DEAL` 等のホワイトリストに含まれることを必須とする。
4. Platform 設定の `last_updated` を更新し、API から返される構造体に反映する。
5. 将来的に契約情報と連動させる余地を残しつつ、当面は軽量な承認フロー（例: 管理画面での承認がなければ適用不可）で運用する。

### 非機能要件
- 既存 Host 設定の算出ロジックを壊さない。
- Platform Overrides が未登録の場合は従来通り Host 設定が適用される。
- `yaml-seeder` 等の既存シードに影響を与えない（新規テーブルは必要に応じてシードを作成）。

### コンテキスト別の責務
```yaml
contexts:
  procurement:
    responsibilities:
      - Platform override の永続化・取得
      - Host 設定と Platform 設定のマージ
  catalog:
    responsibilities:
      - ProcurementAppService から取得した原価をもとに顧客向け価格を決定
  host:
    responsibilities:
      - ベースとなる原価・ツールコストの管理（現状はコード固定）
```

### 仕様のYAML定義（案）
```yaml
platform_procurement_overrides:
  - platform_id: tn_platform_01xxxxx
    model_name: claude-sonnet-4-5-20250929
    override_prompt_cost_nanodollar: 2_700
    override_completion_cost_nanodollar: 13_500
    reason_code: LONG_TERM_CONTRACT
    effective_from: 2025-11-01T00:00:00Z
    effective_to: 2026-10-31T23:59:59Z
    approved_by: user_admin
    note: "年次契約ボリューム500万トークン以上での割引"

reason_codes:
  - code: LONG_TERM_CONTRACT
    description: "長期契約割引"
  - code: CAMPAIGN
    description: "期間限定キャンペーン"
  - code: CUSTOM_DEAL
    description: "個別交渉による特別単価"
```

## 実装方針
- 新テーブル（例: `platform_procurement_overrides`）と対応する `SqlxPlatformProcurementOverrideRepository` を追加。
- `ProcurementConfigurationProvider::get_platform_config()` でリポジトリを参照し、適用期間内のレコードを抽出。
- `merge_configs()` 内で Host 原価と比較し、下回る場合は理由コードチェックおよびポリシー違反時のエラーを返す。
- `apps/tachyon-api/src/di.rs` で新リポジトリを組み込み、`ProcurementApp` に注入。
- 監査ログや承認フローは別途タスクで整備する前提で、当面は理由コード＋承認者の簡易記録に留める。

## タスク分解
### フェーズ1: 設計・スキーマ整備 📝
- [ ] オーバーライドテーブルのスキーマを定義し、マイグレーションを準備
- [ ] 理由コードの列挙と運用ルールを確定

### フェーズ2: 実装 🔄
- [ ] リポジトリとドメインモデルを追加
- [ ] `get_platform_config()` / `merge_configs()` を拡張
- [ ] DI 層でリポジトリを登録

### フェーズ3: テスト・検証 📝
- [ ] 正常系: Host > Platform で同額 or 以上の場合
- [ ] 異常系: Host 原価を下回る + 理由コード未入力
- [ ] 期間外レコードのフィルタリング

### フェーズ4: ドキュメント/運用整備 📝
- [ ] 管理画面 or CLI からオーバーライド登録手順を整理
- [ ] 将来の契約連動タスクをバックログに記録

## テスト計画
- プロキシ的に `ProcurementConfigurationProvider::get_config()` をモックし、Platform override が反映されるユニットテストを追加。
- `ProcurementAppService::get_llm_cost()` で Platform override が効くかを結合テストで確認。

## リスクと対策
| リスク | 影響度 | 対策 |
|--------|--------|------|
| Host 原価を下回る設定がコントロールできない | 高 | 理由コード必須 + 将来の承認フロー拡張を前提にロジックで強制 |
| オーバーライド期間の終了忘れ | 中 | `effective_to` で明示し、Config生成時に期限超過データを除外 |
| データ不整合（Platform ID 誤指定など） | 中 | FK 制約 or enum チェック、管理UI でバリデーション |

## 今後の検討事項
- 契約情報とのひも付け、承認ワークフローの導入は別タスクで検討。
- Host 原価自体を DB に移す長期的方針を策定する。

## 参考資料
- `docs/src/architecture/nanodollar-system.md`
- `docs/src/tasks/improvement/align-chat-api-usage-pricing/task.md`
- `packages/procurement/src/configuration.rs`

## 完了条件
- Platform オーバーライドが設定でき、Host 原価ルールを保持したまま反映される
- 単体/結合テストが追加されている
- 管理手順がドキュメント化されている
- バックログに契約連動タスクを登録済み
