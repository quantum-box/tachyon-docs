---
title: "Feature Flagを親テナント設定と連携"
type: "refactor"
emoji: "🛠️"
topics: ["feature-flag", "multi-tenancy", "auth"]
published: true
targetFiles:
  - "packages/feature_flag/src/configuration/mod.rs"
  - "packages/feature_flag/src/usecase/ensure_feature_enabled.rs"
  - "packages/feature_flag/src/usecase/evaluate_feature_flag.rs"
  - "packages/feature_flag/src/usecase/list_feature_flags.rs"
  - "packages/feature_flag/src/sdk.rs"
  - "packages/auth/src"
github: ""
---

## 概要
- Feature Flag の判定・取得が Operator テナントのレコードだけに依存している課題を解消し、Platform/Host テナントの設定を継承して参照できるようにする。
- Auth コンテキスト経由でテナント階層情報を取得し、Feature Flag パッケージで親テナント設定を利用できるようにアーキテクチャを整理する。

## 背景・目的
- 現状、Feature Flag の CRUD と判定がいずれも Operator テナント単位で完結しており、Platform レベルでの集中管理ができていない。
- Host/Platform にフラグを設定しても Operator 側の UI／判定が反映しないため、実運用で権限管理や段階的リリースを制御する際に不整合が生じる。
- Feature Flag の継承モデルを整備することで、Platform で一括設定した内容を Operator 全体に適用でき、運用負荷と設定ミスを減らす。

## 詳細仕様
- Feature Flag の CRUD は Platform テナントのみが実行可能とし、Operator テナントでは参照のみ許可される（ユースケース候補: `CreateFeatureFlagForPlatform`, `UpdateFeatureFlagForPlatform`, `DeleteFeatureFlagForPlatform`, `ListFeatureFlagsForPlatform`, `GetFeatureFlagForPlatform`）。
- 判定ロジック (`EnsureFeatureEnabled` / `EvaluateFeatureFlag` / GraphQL `feature_flag` 系) は Operator ID を受け取った際に親テナント（Platform/Host）の設定を参照する。
- Auth App に `TenantHierarchyService` をラップした階層問い合わせ API を用意し、Feature Flag から Auth を経由して Platform/Host ID を取得できるようにする。
- Feature Flag の ConfigurationProvider を拡張し、Host → Platform → Operator (Operatorは空のまま) の順に Feature Flag を取得・マージする仕組みを実装する。
- GraphQL／SDK／一覧取得 (`ListFeatureFlags`) でも親テナント設定を返すように変更する。
- シードデータで Host/Platform に登録されたフラグが自動的に Operator 側に反映されること。

## 実装方針
1. Auth パッケージに階層問い合わせ用の新ユースケース (例: `GetTenantHierarchy`) を追加し、`TenantHierarchyService` を内部で利用して Platform/Host 情報を返す。
   - Platform CRUD ユースケースを `CreateFeatureFlagForPlatform` / `UpdateFeatureFlagForPlatform` / `DeleteFeatureFlagForPlatform` として整理し、Operator からは呼べないようにする。
2. Feature Flag の `App` に Auth の階層問い合わせ API を注入し、`EnsureFeatureEnabled` / `EvaluateFeatureFlag` / `ListFeatureFlagsForOperator` が親テナント設定を参照できるようにする。
3. `FeatureFlagConfigurationProvider` へ階層問い合わせロジックを追加し、Host → Platform の順に Feature Flag を取得・マージする処理を実装する。
4. `EnsureFeatureEnabled` と `EvaluateFeatureFlag` を ConfigurationProvider 経由の参照に切り替え、Operator の判定が親設定に従うよう改修する。
5. GraphQL／SDK (`feature_flags`, `feature_flag_by_key`, `FeatureFlagApp::ensure_enabled` 等) を新しい継承モデルに対応させる。
6. 影響するテスト（ユニット／統合／E2E）があれば更新または新規追加する。

## タスク分解
- 📝 Auth: 階層問い合わせユースケースを追加
  - [x] Platform/Operator Repository から階層情報を返す新メソッドを追加
  - [x] Auth App 内で依存を配線し、外部から呼び出せるよう公開
- 📝 Feature Flag: Platform 管理ユースケースの整備
  - [x] `CreateFeatureFlagForPlatform` / `UpdateFeatureFlagForPlatform` / `DeleteFeatureFlagForPlatform` / `ListFeatureFlagsForPlatform` / `GetFeatureFlagForPlatform` を実装し、Platform CRUD 専用にする
  - [x] Operator 向け参照ユースケース (`ListFeatureFlagsForOperator`, `EnsureFeatureEnabledForOperator`, `EvaluateFeatureFlagForOperator`) を親設定参照前提で整理
- 📝 Feature Flag: コンフィグ継承ロジック実装
  - [x] `FeatureFlagConfigurationProvider` に Auth ユースケースを注入し、親テナント設定を取得する
  - [x] Host→Platform の順序で Feature Flag をマージする処理を実装
- 📝 Feature Flag: 判定／取得ロジックの改修
  - [x] `EnsureFeatureEnabled` と `EvaluateFeatureFlag` を親設定参照に切り替える
  - [x] `ListFeatureFlagsForOperator` / GraphQL / SDK を新ロジックに対応
- 📝 シード・移行対応
  - [x] Host/Platform のフラグが Operator に反映されることを確認し、必要ならシードデータを更新

## テスト計画
- ユニットテスト: TenantHierarchy 問い合わせ、ConfigurationProvider、EnsureFeatureEnabled の新経路を検証
- 統合テスト: GraphQL `featureFlags` / `featureFlagByKey` / `evaluate_feature_flag_actions` のレスポンスを確認
- E2E (任意): 管理 UI で Platform フラグを更新 → Operator メニューに反映されること

## リスクと対策
- Auth と Feature Flag の依存ループ: `AuthApp` から提供する抽象インターフェースを導入し、直接依存を避ける。
- 判定パフォーマンス: キャッシュ層（FeatureFlagConfigurationProvider 内でのキャッシュ）を導入する余地を検討。
- 既存 Operator テナントに保存されたフラグの取り扱い: 必要なら移行スクリプトを事前に実行し、Platform へ移す方針を決める。

## スケジュール
- 設計・Auth API 追加: 1 日
- Feature Flag 継承実装: 2 日
- テスト・ドキュメント整備: 1 日

## 完了条件
- [x] Feature Flag 判定が親テナントの設定を参照し、Operator 側の Feature Flag レコードが不要になる。
- [x] GraphQL や SDK で返却される Feature Flag 情報が親テナント設定を反映している。
- [x] 追加した Auth API／Feature Flag 実装に関するテストが整備され、CI (`mise run check`) を通過する。
- [x] 新しい運用フロー（Platform/Host が CRUD、Operator が参照のみ）がドキュメント化されている。

## 2025-10-19
- ✅ 親テナント継承ロジックを本番同等環境で再検証し、`mise run check` / `mise run ci-node` / `mise run ci` を完走。
- ✅ GraphQL `featureFlags` / `featureFlagByKey` / SDK `ensure_enabled` が Platform 設定を反映することをシナリオテストで確認。
- ✅ ドキュメント（本タスク・`docs/src/tasks/improvement/feature-flag-host-inheritance/task.md` 等）を更新し、運用手順をチームへ共有。
