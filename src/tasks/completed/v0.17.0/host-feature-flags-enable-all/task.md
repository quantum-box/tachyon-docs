---
title: "ホストFeature Flagの既定有効化とUI表示整備"
type: improvement
emoji: "🚩"
topics:
  - Feature Flag
  - Multi Tenancy
  - Frontend
published: true
targetFiles:
  - scripts/seeds/n1-seed/009-feature-flags.yaml
  - apps/tachyon-api/tests/scenarios/feature_flag_host_platform_alignment.yaml
  - apps/tachyon/src/app/v1beta/[tenant_id]/feature-flags/components/feature-flag-list-graphql.tsx
github: https://github.com/quantum-box/tachyon-apps
---

# ホストFeature Flagの既定有効化とUI表示整備

## 概要

ホストテナント上のFeature Flag既定値をすべて有効状態へそろえ、プラットフォーム側UIの上書き状態表示と多言語対応状況を整理する。合わせて、ホストの無効化制御を検証するシナリオテストを更新し、挙動を自動確認できる状態にする。

## 背景・目的

- Tachyon Dev環境ではホスト側のFeature Flag既定値が一部無効のままで、プラットフォームやオペレーターの利用機能が揃わない。
- ホストで無効化されている場合はプラットフォーム側で強制的に無効上書きされる仕様だが、UIとテスト双方で覆いきれていない部分があった。
- UI言語についてチーム内確認が入り、多言語化方針を明示する必要がある。
- 以上をまとめて整備し、ST/QA時に安定した挙動と確認観点を提供する。

## 詳細仕様

### 機能要件

1. `scripts/seeds/n1-seed/009-feature-flags.yaml` 内のホストテナント (`tn_01jcjtqxah6mhyw4e5mahg02nd`) に属するFeature Flagは `enabled: 1` を既定とする。
2. プラットフォームテナントでホスト設定を上書きした場合、UI上で「上書き中」バッジおよびホスト基準値ラベルを表示し続ける。
3. シナリオテストでは「ホストが一旦無効化した場合はプラットフォームで有効化できない」ことを再現できるよう、前提にホストを明示的に無効へ切り替えるステップを追加する。
4. プラットフォーム/ホストでのUIナビゲーションは常に基準機能を表示し、OperatorコンテキストのみFeature Flagの無効化でメニューを隠す。

#### ユーザーストーリー

- **Platform Admin**: 「ホスト全体が機能を有効化している状態を前提にプラットフォーム個別の無効化だけを管理したい。」
- **QA Engineer**: 「ホストが意図的に無効化した場合にプラットフォームが有効化できない制御を自動テストで確認したい。」
- **Product Manager**: 「UIでホスト由来か上書きか判断でき、多言語対応の方針も把握したい。」

#### 受け入れ条件

- シード投入後にホスト全Feature Flagが有効であること。
- シナリオテスト `mise run tachyon-api-scenario-test` の該当ケースがグリーンであること。
- UI上の文言が既存の日本語固定表記のままである旨をチームへ共有する記述がタスク内に残っていること。

### 非機能要件

- パフォーマンス: シナリオテスト追加による実行時間は+5秒以内を目安とする。
- セキュリティ: マルチテナント権限判定ロジックは既存のUsecaseを利用し、新たな権限緩和を行わない。
- 保守性: Seedファイルの有効・無効状態はコメントとYAMLセクションで明示し、将来の変更箇所を特定しやすくする。

### コンテキスト別の責務

```yaml
contexts:
  host:
    description: "SaaS全体で共有される基準Feature Flagを管理"
    responsibilities:
      - プロダクト全体で必須となる機能を有効化
      - プラットフォームでの上書き許容範囲を決定
  platform:
    description: "顧客群向けの個別機能可否を制御"
    responsibilities:
      - ホストが許可した機能のみ無効化できる
      - Override状態をUIおよびAPIレスポンスに反映
```

### 仕様のYAML定義

```yaml
host_feature_flags:
  tenant_id: tn_01jcjtqxah6mhyw4e5mahg02nd
  flags:
    - key: context.auth
      enabled: true
    - key: context.order
      enabled: true
    - key: context.payment
      enabled: true
    - key: context.procurement
      enabled: true
    - key: context.crm
      enabled: true
    - key: context.llms
      enabled: true
    - key: context.profit
      enabled: true

scenario_preconditions:
  - name: disable_host_flag_temporarily
    description: "シナリオテスト内でホストを一時的にOFFにして制限挙動を再確認する"
```

## 実装方針

### アーキテクチャ設計

- Seed→API→フロントの一貫性を維持するため、既存のClean Architecture層構成を流用する。
- Usecase層には新たな分岐を追加せず、Seedデータとシナリオテストによる検証で整合性を取る。
- フロントのUI表示はGraphQLで取得済みの `baselineEnabled` / `isOverride` を活用し、ラベル更新のみで対応する。

### 技術選定

- Seed: `yaml-seeder` フォーマット（既存運用）。
- Backend Test: `apps/tachyon-api/tests/scenarios` (HTTPベースシナリオ)。
- Frontend: Next.js + Apollo Client + shadcn/ui。文言は現状日本語固定を維持する。

### TDD（テスト駆動開発）戦略

#### 既存動作の保証

- 既存シナリオテスト群がグリーンであることを出発点にし、ホスト無効化ケースを前後で比較する。
- Feature FlagトグルUsecaseのユニットテストは既存を流用し、Seed変更のみで破壊的影響が出ないことを確認。

#### テストファーストアプローチ

- シナリオテストにホストOFFステップを追加→Red。
- Seed調整とUI実装の整合性確認→Green。
- 追加でStorybookやVRTの更新は不要（UI表示は既存Storyのまま動作確認）。

#### 継続的検証

- `mise run check` と `mise run tachyon-api-scenario-test` を定期的に実行し、Seed変更との整合性を監視する。
- 動作確認結果は `verification-report.md` に逐次追記する。

## タスク分解と進捗

### フェーズ1: ホスト既定値とUI整備 ✅
- [x] ホストテナントのコンテキスト系フラグをすべて `enabled: true` に統一
- [x] プラットフォームUIでホスト基準と上書き状態を視覚化
- [x] `feature_flag_host_platform_alignment.yaml` シナリオで override のON/OFFを自動検証

### フェーズ2: feature_flagコンテキスト拡張 ✅
- [x] `context.feature_flag` フラグをホスト/主要プラットフォームに追加し、有効状態をデフォルト化
- [x] Feature Flag管理系アクション（`feature_flag:*`）が新しいコンテキストフラグにフォールバックすることをシナリオで確認
- [x] UIのFeature Flagsページで上書き作成→保存まで一連のフローが成功することを再確認（2025-10-19 手動確認済み）

### フェーズ3: 回帰テスト整備 ✅
- [x] `apps/tachyon-api/tests/scenarios/multi_tenancy_access.yaml` のレスポンス順序差異を反映
- [x] `mise run test` / `mise run tachyon-api-scenario-test` の完走ログを `verification-report.md` へ追記

## メモ

- `EnsureFeatureEnabled` は `action` → `context.*` の優先順でフラグ探索を行うため、`context.feature_flag` を定義すれば既存アクションに追加実装なしで適用できる想定。
- `feature_flag:ToggleFeatureFlag` はポリシーのみ参照しており、コンテキストOFF時でも再有効化が可能なため、シナリオではOFF→ONの手順を含めておく。
- UI文言は引き続き日本語固定。将来的な多言語化対応は別タスクで管理する。

## 2025-10-19
- ✅ `mise run test` / `mise run tachyon-api-scenario-test` を再実行し、Feature Flagsページの上書き作成〜保存フローを手動確認。`verification-report.md` に結果を追記済み。
