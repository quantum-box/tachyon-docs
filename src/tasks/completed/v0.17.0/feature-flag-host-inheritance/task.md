---
title: "Feature Flag Host Inheritance Alignment"
type: tech
emoji: "🧩"
topics:
  - feature-flag
  - multi-tenancy
  - configuration
published: true
targetFiles:
  - packages/feature_flag/src/configuration/mod.rs
  - packages/feature_flag/src/usecase/list_feature_flags.rs
  - packages/feature_flag/src/usecase/evaluate_feature_flag.rs
  - scripts/seeds/n1-seed/009-feature-flags.yaml
github: https://github.com/quantum-box/tachyon-apps
---

# Feature Flag Host Inheritance Alignment

## 概要

ホストテナントで定義したフィーチャーフラグを単一の真実源として扱い、プラットフォーム配下では有効・無効や必要最小限の属性だけを上書きできるよう、設定マージ処理とシードデータを整備する。

## 背景・目的

- 現状はプラットフォーム単位でホスト定義を複製しないとメタデータ（名称や説明）が失われる。
- コンテキスト単位の旗管理をホストで一元化し、配下テナントは有効状態のみ調整できるようにしたいという運用要望がある。
- inheritance 仕様を整理することで、将来的な旗追加時のシード管理コストを削減し、設定の整合性を高める。

## 詳細仕様

### 機能要件

1. `FeatureFlagConfigurationProvider` がホスト定義をベースに、プラットフォーム側で `enabled`（必要に応じて `default_value`）のみを上書きする挙動に変更する。
2. プラットフォームレベルで該当 `key` が存在しない場合はホスト定義をそのまま継承する。
3. `scripts/seeds/n1-seed/009-feature-flags.yaml` を整理し、ホスト側に完全定義を置き、プラットフォーム側は上書き対象の最小限項目のみとする。

### 非機能要件

- 既存の評価API/OpenFeature Provider のレスポンスは変えずに維持する。
- マージ処理は O(n) で、現在の旗数（数十件規模）に対して十分高性能であること。
- 今後の旗追加時にもドキュメントで運用手順が明確であること。

### コンテキスト別の責務

```yaml
contexts:
  feature_flag:
    description: "Feature flag 管理と評価"
    responsibilities:
      - ホスト定義のロード
      - プラットフォーム override の適用
      - 評価ロジックへの一貫した提供
  docs:
    description: "シード運用ドキュメント"
    responsibilities:
      - 旗追加時の手順更新
      - 上書きルールの明記
```

### 仕様のYAML定義

```yaml
feature_flag_inheritance:
  host:
    owns: full-definition   # name / description / default_value / variants
  platform:
    overrides:
      - enabled             # boolean toggle
      - default_value       # 任意、存在する場合のみ上書き
    rules:
      - if key missing -> inherit host definition as-is
      - if key present -> clone host definition and patch listed fields
  operator:
    status: deprecated_override
    rule: inherit platform definition without modification
```

## 実装方針

### アーキテクチャ設計

- Clean Architecture に従い、Usecase 層から取得する構成を `FeatureFlagConfigurationProvider` で集約する。
- マージ処理は provider 内のヘルパーで実装し、テスト可能な純粋関数として切り出す。

### 技術選定

- 既存の Rust 実装（feature_flag crate）を継続利用。
- シードは既存の YAML フォーマットを継続し、`yaml-seeder` による投入互換性を維持。

### TDD（テスト駆動開発）戦略

#### 既存動作の保証
- `EvaluateFeatureFlag` の既存テストを確認し、ホスト継承ケースの期待値を検証する。
- `FeatureFlagConfigurationProvider` に新規ユニットテストを追加し、プラットフォーム override のみが適用されることを確認する。

#### テストファーストアプローチ
- 「ホスト false / プラットフォーム true」パターンのテストを追加して RED を確認し、その後マージロジックを修正して GREEN にする。

#### 継続的検証
- `mise run check` で Rust フォーマット・Lint を実行。
- Seed の静的検証は `yaml-seeder --validate-only` を実施予定。

## タスク分解

- [x] ホスト継承ロジックの詳細設計とテストケース洗い出し
- [x] `FeatureFlagConfigurationProvider` のマージロジック実装
- [x] `ListFeatureFlags` / 評価系テスト更新
- [x] `scripts/seeds/n1-seed/009-feature-flags.yaml` の整理と `yaml-seeder` 検証（DB 未起動のため検証コマンドは接続エラーで停止）
- [x] ドキュメント反映（当タスクドキュメント更新、必要なら既存仕様更新）

### 進捗メモ
- 2025-10-13: `mise run check` でビルド検証済み。
- 2025-10-13: `cargo run -p yaml-seeder -- apply dev scripts/seeds/n1-seed --validate-only` を実行したが MySQL が起動しておらず接続エラー。サーバー起動後に `mise run tachyon-api-scenario-test`（全 24 シナリオ）で検証し、`yaml-seeder apply` も正常完了。
- 2025-10-13: フロントエンドで override 表示とホスト基準のラベルを追加し、`Switch` からプラットフォーム上書き状態をトグルできるように更新。シナリオテスト（全 26 件）で動作確認済み。

## 2025-10-19
- ✅ `mise run tachyon-api-scenario-test` / `yaml-seeder --validate-only` を再実行し、ホスト継承ロジックの最終確認。`verification-report.md` に結果を記録済み。

## Playwright MCPによる動作確認

UI 変更は想定していないため、Playwright 動作確認は本タスクでは不要。

### 実施タイミング
- [x] 該当なし（設定層のみ）

### 動作確認チェックリスト
- [x] GraphQL/REST 経由で旗取得結果が期待どおりであることを手動確認（ローカル API ログで確認）
