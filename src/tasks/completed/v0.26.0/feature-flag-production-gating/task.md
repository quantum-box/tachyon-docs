---
title: "新規機能をFeature Flagで本番非公開にする運用ガイド"
type: "improvement"
emoji: "🚦"
topics:
  - FeatureFlag
  - Release
  - Policy
published: true
targetFiles:
  - packages/feature_flag/src/usecase/ensure_feature_enabled.rs
  - packages/feature_flag/src/configuration/mod.rs
  - packages/tachyon_apps/src/feature_flag.rs
  - scripts/seeds/n1-seed/009-feature-flags.yaml
  - scripts/seeds/n1-seed/008-auth-policies.yaml
  - docs/src/tachyon-apps/feature-flag/overview.md
  - docs/src/tachyon-apps/feature-flag/policy-action-integration.md
github: "https://github.com/quantum-box/tachyon-apps"
---

# 新規機能をFeature Flagで本番非公開にする運用ガイド

## 概要

新規機能を実装する際に、Feature Flagで本番公開を制御できる状態を標準化する。既存のFeature Flag基盤（Action/Contextキー、テナント階層の継承、UI/GraphQL管理）を前提に、実装手順と運用フローを整理する。

## 背景・目的

- 新規機能を即時リリースせず、段階的に公開できる運用が必要。
- 既存のFeature Flag基盤は整備済みだが、実装時の使い方が分散している。
- 本番環境だけ無効化し、検証環境（tachyon-dev等）は有効化する運用を明確化したい。

## 詳細仕様

### 機能要件

1. 新規UsecaseはFeature Flagで有効/無効を判定できる。
2. フラグのキーはAction文字列（例: `llms:ExecuteAgent`）を基本とし、必要に応じて `context.<context>` にフォールバックする。
3. 本番プラットフォームではフラグを無効化でき、検証用プラットフォームでは有効化できる。
4. フラグの作成・変更は既存のFeature Flag管理UIまたはGraphQL経由で実行できる。

### 非機能要件

- 既存テナント階層（Host → Platform → Operator）の継承ルールに準拠する。
- 未定義フラグは `not_found` になるため、事前にフラグ登録を必須とする。
- Feature Flag評価時の監査/メトリクス記録を維持する。

### コンテキスト別の責務

```yaml
contexts:
  auth:
    description: "Action管理・Policy検証の入口"
    responsibilities:
      - 新規Actionを定義する
      - Policyと整合するActionキーを維持する
  feature_flag:
    description: "Feature Flag管理と評価"
    responsibilities:
      - Action/ContextキーのFeature Flag登録
      - テナント階層の有効/無効判定
      - UI/GraphQLでの運用
  usecase:
    description: "業務ロジック"
    responsibilities:
      - check_policyの後にensure_enabledを実行
      - 失敗時はFeature Disabledとして処理を中断
```

### 仕様のYAML定義

```yaml
feature_flag_gating:
  action_key: "<context>:<ActionName>" # 例: procurement:ListProcurementPrices
  fallback_context_key: "context.<context>" # 例: context.procurement
  tenant_overrides:
    host:
      enabled: true
    platform:
      production:
        enabled: false
      staging:
        enabled: true
      dev:
        enabled: true
```

## 実装方針

### アーキテクチャ設計

- Usecase層で `AuthApp::check_policy` の後に `FeatureFlagApp::ensure_enabled` を必ず呼ぶ。
- Feature Flagの候補キーは `EnsureFeatureEnabled` が `action` → `context.<context>` → `additional_flag_keys` の順で評価する設計を利用する。
- Feature Flag設定は `FeatureFlagConfigurationProvider` を通じて Host/Platform の継承ルールに従う。

### 技術選定

- 既存の `FeatureFlagApp` / `EnsureFeatureEnabled` を利用し、新規実装は最小限にする。
- フラグ作成は GraphQL (`featureFlags`, `createFeatureFlag`, `updateFeatureFlag`, `toggleFeatureFlag`) または管理UIで実施する。

## タスク分解

### 主要タスク
- [ ] 既存Feature Flag基盤の調査（Action/Contextキーの評価順序、継承、UI運用）
- [ ] 新規Usecase追加時の標準手順の整理
- [ ] 本番/検証環境のフラグ運用方法の整理（seed/GUI/GraphQL）
- [ ] taskdocに実装例と注意点を追記
- [ ] 必要であれば関連ドキュメントを更新

## Playwright MCPによる動作確認

運用手順の確認として、Feature Flag管理UIの有効/無効切り替えを検証する。

### 実施タイミング
- [ ] ドキュメント完成後

### 動作確認チェックリスト
- [ ] `/v1beta/{tenant_id}/feature-flags` で対象フラグが表示される
- [ ] `enabled` をOFFにすると該当機能が拒否される
- [ ] `enabled` をONに戻すと機能が実行できる

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| フラグ未登録で `not_found` | 中 | Action追加時にフラグ登録を必須化する |
| 本番だけ無効化が漏れる | 高 | Platform/HostのseedやUI設定で明示的にOFFにする |
| Action名の不一致 | 中 | Policy ActionとFeature Flagキーを同一にする |

## 参考資料

- `docs/src/tachyon-apps/feature-flag/overview.md`
- `docs/src/tachyon-apps/feature-flag/policy-action-integration.md`
- `packages/feature_flag/src/usecase/ensure_feature_enabled.rs`
- `scripts/seeds/n1-seed/009-feature-flags.yaml`

## 完了条件

- [ ] 新規機能でFeature Flagを使う標準手順がtaskdocに整理されている
- [ ] 本番/検証の有効/無効切り替え方法が明記されている
- [ ] Feature Flag管理UIでの運用手順が記載されている
- [ ] 必要に応じて関連ドキュメントの更新方針が定義されている

### バージョン番号の決定基準

**パッチバージョン（x.x.X）を上げる場合:**
- [ ] ドキュメント更新

**マイナーバージョン（x.X.x）を上げる場合:**
- [ ] 新機能の追加

**メジャーバージョン（X.x.x）を上げる場合:**
- [ ] 破壊的変更

## 備考

- Feature Flagは Host → Platform の継承ルールで評価され、Operatorのフラグは無視される。
- `EnsureFeatureEnabled` は `action` / `context.<context>` / `additional_flag_keys` の順で評価し、該当フラグが無い場合は `not_found` になる。
