# Fine-Grained Feature Flags for Trunk-Based Development

## Overview

- **Status**: 🔄 IN PROGRESS
- **Priority**: Medium
- **Estimated Scope**: Medium（Backend + Frontend + ドキュメント）

## Background

現在のフィーチャーフラグシステムは `context.*` パターン（サブシステム全体のON/OFF）でのみ使われている。未完成の機能をフラグの裏に隠してmainにマージし、段階的にリリースできるようにしたい。

既存インフラ（DB、ドメインモデル、評価エンジン、テナント継承、GraphQL API、管理UI）は完成しているが、**キーベースの単純なフラグチェック**が欠けている。

### 現状の課題

- `ensure_enabled()` はアクション文字列ベースで、シンプルな `is_enabled("feature.xxx")` がない
- フロントエンドの `TachyonGraphQLProvider`（OpenFeature）はスタブで常にデフォルト値を返している
- 開発中の機能をmainにマージするとき、機能を隠す標準的な方法がない

## Goals

1. Backend: `is_enabled(key, tenant_id) -> bool` でフラグをキーベースでチェックできるようにする
2. Frontend: `useFeatureFlag(key)` hook と `<FeatureFlag>` コンポーネントを提供する
3. 開発ワークフロー: フラグの作成→使用→卒業の標準パターンを確立する

## Implementation Plan

### Phase 1: Backend - `is_enabled` メソッド追加

**`FeatureFlagApp` トレイトに2メソッド追加:**

```rust
async fn is_enabled(&self, key: &str, tenant_id: &TenantId) -> Result<bool>;
async fn is_enabled_batch(&self, keys: &[&str], tenant_id: &TenantId) -> Result<HashMap<String, bool>>;
```

- 既存の `EvaluateFeatureFlag` usecase に委譲（テナント継承・ストラテジー評価を再利用）
- フラグ未発見時は `false` を返す（未リリース機能のセーフデフォルト）
- `NoopFeatureFlagApp` にも実装追加（`Ok(true)` を返す）

**変更ファイル:**
- `packages/tachyon_apps/src/feature_flag.rs` - トレイト定義
- `packages/feature_flag/src/sdk.rs` - 実装

### Phase 2: GraphQL - バッチ評価クエリ追加

**新しいクエリ `featureFlagValues(keys: [String!]!)`:**

```graphql
query GetFeatureFlagValues($keys: [String!]!) {
  featureFlagValues(keys: $keys) {
    key
    enabled
  }
}
```

- `is_enabled_batch` に委譲
- 1リクエストで複数フラグを評価（N+1回避）

**変更ファイル:**
- `packages/feature_flag/src/adapter/graphql/types.rs` - `FeatureFlagValue` 型追加
- `packages/feature_flag/src/adapter/graphql/query.rs` - クエリ追加

### Phase 3: Frontend - React Hook & Component

**3つのファイルを新規作成:**

| ファイル | 役割 |
|---------|------|
| `apps/tachyon/src/lib/feature-flags/feature-flag-provider.tsx` | Context Provider（バッチfetch） |
| `apps/tachyon/src/lib/feature-flags/use-feature-flag.ts` | `useFeatureFlag(key)` hook |
| `apps/tachyon/src/lib/feature-flags/feature-flag.tsx` | `<FeatureFlag>` 条件付きレンダリングコンポーネント |

**使い方:**
```tsx
// Hook
const { enabled } = useFeatureFlag('feature.storage.ui')

// Component
<FeatureFlag flag="feature.storage.ui" fallback={<OldView />}>
  <NewView />
</FeatureFlag>
```

**統合箇所:**
- `apps/tachyon/src/app/providers/TenantProvider.tsx` に `FeatureFlagProvider` をラップ
- フラグキーは `apps/tachyon/src/lib/feature-flags/keys.ts` に集約管理

### Phase 4: 命名規約 & シードデータ

**フラグキー命名規約:**
```
feature.<domain>.<name>      # 開発中の機能フラグ（本タスクの主目的）
context.<name>               # コンテキストレベルゲーティング（既存）
experiment.<name>            # A/Bテスト
```

**シードデータにサンプル追加:**
- `scripts/seeds/n1-seed/009-feature-flags.yaml`
- 本番Platform: `enabled: 0`（無効）
- 開発Platform: `enabled: 1`（有効）

### Phase 5: ドキュメント

`docs/src/tachyon-apps/feature-flags/trunk-based-development.md` にワークフローガイドを作成:
1. フラグ作成 → 2. コードにフラグチェック追加 → 3. mainにマージ → 4. 段階的に有効化 → 5. コードからフラグ除去

## Design Decisions

| 判断 | 理由 |
|------|------|
| 未発見フラグは `false` | フラグ定義前にコードをマージしても安全 |
| 既存 `EvaluateFeatureFlag` に委譲 | テナント継承・ストラテジー評価を再利用、新しい評価パスを作らない |
| OpenFeatureスタブはそのまま | 独自hookの方がシンプルで、既存OpenFeatureインフラの修正不要 |
| フラグキー集約管理 | 1クエリでバッチfetch、使われているフラグの一覧性 |

## Key Files (Reference)

### 既存インフラ（変更対象）
- `packages/tachyon_apps/src/feature_flag.rs` - `FeatureFlagApp` トレイト定義
- `packages/feature_flag/src/sdk.rs` - トレイト実装
- `packages/feature_flag/src/adapter/graphql/query.rs` - GraphQLクエリ
- `packages/feature_flag/src/adapter/graphql/types.rs` - GraphQL型
- `apps/tachyon/src/app/providers/TenantProvider.tsx` - テナントプロバイダー

### 既存インフラ（参考）
- `packages/feature_flag/src/usecase/evaluate_feature_flag.rs` - 評価ロジック（委譲先）
- `packages/feature_flag/domain/src/feature.rs` - `FeatureV2` エンティティ
- `packages/feature_flag/domain/src/evaluation_strategy.rs` - ストラテジー定義
- `apps/tachyon/src/lib/openfeature/tachyon-graphql-provider.ts` - OpenFeatureスタブ（変更しない）
- `scripts/seeds/n1-seed/009-feature-flags.yaml` - シードデータ

## Verification

1. **Backend**: シナリオテスト追加 - `featureFlagValues` クエリでフラグが正しく評価されることを確認
2. **Frontend**: Storybook で `<FeatureFlag>` コンポーネントの動作確認
3. **E2E**: 管理UIでフラグをトグル → ページリロード → UIの表示/非表示が切り替わることを確認

## Progress

- [x] Phase 1: Backend `is_enabled` メソッド
- [x] Phase 2: GraphQL バッチクエリ
- [x] Phase 3: Frontend Hook & Component
- [x] Phase 4: 命名規約 & シードデータ
- [x] Phase 5: ドキュメント
