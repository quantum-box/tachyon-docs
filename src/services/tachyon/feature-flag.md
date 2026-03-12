---
title: "Feature Flag管理システム"
emoji: "🚩"
type: "service"
topics: ["feature-flag", "openfeature", "a-b-testing", "canary-release", "multi-tenancy"]
published: true
---

# Feature Flag管理システム

## 概要

Tachyon Feature Flag管理システムは、エンタープライズレベルの機能フラグ管理を提供する包括的なソリューションです。段階的ロールアウト、A/Bテスト、プラン別機能制御など、製品開発とリリース管理に必要な高度な機能を備えています。

### 主な特徴

- **OpenFeature互換API**: 業界標準のOpenFeature仕様に準拠した実装
- **9種類の評価戦略**: パーセンテージ、ユーザー/テナントターゲティング、プラン別、時間ベース、バージョンベースなど
- **A/Bテスト機能**: 決定的ハッシュアルゴリズムによる一貫性のあるバリアント割り当て
- **リアルタイム更新**: サーバー再起動なしでフラグの有効/無効を切り替え
- **包括的な管理UI**: Next.js + TypeScriptによる直感的な管理インターフェース
- **監視・分析機能**: メトリクス収集、リアルタイムダッシュボード、アラート機能

## アーキテクチャ

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Rust Backend    │────▶│ OpenFeature API │────▶│ Tachyon Provider│
│ (tachyon-api)   │     └─────────────────┘     └─────────────────┘
└─────────────────┘              │                        │
                                 │                        ▼
┌─────────────────┐              │              ┌─────────────────┐
│ Next.js Frontend│──────────────┘              │ Feature Service │
│   (via API)     │                             └─────────────────┘
└─────────────────┘                                      │
                                                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ In-Memory Cache │◀────│ Evaluation Engine│────▶│   MySQL (TiDB)  │
│ (Arc<RwLock>)   │     └─────────────────┘     └─────────────────┘
└─────────────────┘
```

## 評価戦略

### 1. Percentage Rollout (段階的ロールアウト)
指定したパーセンテージのユーザーに機能を公開します。

```yaml
type: "percentage_rollout"
parameters:
  percentage: 25  # 25%のユーザーに公開
```

### 2. User/Tenant Targeting (特定ユーザー/テナント対象)
特定のユーザーIDまたはテナントIDのリストに基づいて機能を制御します。

```yaml
type: "user_targeting"
parameters:
  user_ids: ["us_001", "us_002"]

type: "tenant_targeting"  
parameters:
  tenant_ids: ["tn_001", "tn_002"]
```

### 3. Plan Based (プラン別制御)
ユーザーのサブスクリプションプランに基づいて機能を制御します。

```yaml
type: "plan_based"
parameters:
  allowed_plans: ["pro", "enterprise"]
```

### 4. Time Based (時間ベース制御)
指定した期間内のみ機能を有効化します。

```yaml
type: "time_based"
parameters:
  start_time: "2024-01-15T00:00:00Z"
  end_time: "2024-02-15T00:00:00Z"
```

### 5. Version Based (バージョンベース制御)
クライアントバージョンに基づいて機能を制御します。

```yaml
type: "version_based"
parameters:
  min_version: "1.2.0"  # 1.2.0以上のバージョンで有効
  max_version: "2.0.0"  # 2.0.0未満まで有効（オプション）
```

### 6. Semantic Version Targeting
より柔軟なセマンティックバージョニング対応。

```yaml
type: "semantic_version_targeting"
parameters:
  versions:
    - ">=1.0.0 <2.0.0"  # 1.x系
    - "=2.1.0"          # 特定バージョンのみ
    - "~3.0.0"          # 3.0.x系（パッチバージョンのみ許可）
    - "^4.0.0"          # 4.x.x系（マイナー・パッチバージョン許可）
```

### 7. Custom Rule (カスタムルール)
複雑な条件式に基づく評価。

```yaml
type: "custom_rule"
parameters:
  expression: "user.created_at < '2024-01-01' AND user.country == 'JP'"
```

### 8. Composite Strategy (複合戦略)
複数の戦略をAND/OR演算子で組み合わせます。

```yaml
type: "composite"
parameters:
  operator: "AND"
  strategies:
    - type: "plan_based"
      parameters:
        allowed_plans: ["enterprise"]
    - type: "percentage_rollout"
      parameters:
        percentage: 50
```

## 使用方法

### Rustバックエンドでの使用

```rust
use feature_flag::{FeatureClient, EvaluationContext};

// axumハンドラーでの使用例
pub async fn get_user_profile(
    Extension(feature_client): Extension<Arc<FeatureClient>>,
    Extension(auth): Extension<AuthInfo>,
) -> impl IntoResponse {
    let context = EvaluationContext::builder()
        .add("tenant_id", auth.tenant_id())
        .add("user_id", auth.user_id())
        .add("plan", auth.plan())
        .build();
    
    // 新UIフラグの評価
    let use_new_ui = feature_client
        .get_boolean_value("new-profile-ui", false, &context)
        .await?;
    
    if use_new_ui {
        // 新しいプロファイルUIを返す
    } else {
        // 既存のプロファイルUIを返す
    }
}
```

### A/Bテストの実装

```rust
// 決済フローのA/Bテスト
let payment_flow = feature_client
    .get_string_value("payment-flow", "standard", &context)
    .await?;

match payment_flow.as_str() {
    "express" => self.process_express_payment(payment).await,
    "optimized" => self.process_optimized_payment(payment).await,
    _ => self.process_standard_payment(payment).await,
}
```

### バージョンベースの機能制御

```rust
let client_version = extract_version(&headers);

let context = EvaluationContext::builder()
    .add("client_version", client_version.to_string())
    .build();

// 古いAPIの廃止チェック
let api_deprecated = feature_client
    .get_boolean_value("deprecate-old-api", false, &context)
    .await?;

if api_deprecated && client_version < Version::parse("2.0.0")? {
    return Ok((
        StatusCode::GONE,
        Json(json!({
            "error": "This API version is deprecated",
            "message": "Please upgrade to client version 2.0.0 or higher"
        }))
    ));
}
```

## GraphQL API

### Queries

```graphql
# フラグ一覧取得
query GetFeatureFlags {
  featureFlags(
    filter: { enabled: true, strategyType: PERCENTAGE_ROLLOUT }
    pagination: { limit: 20, offset: 0 }
  ) {
    items {
      id
      key
      name
      description
      enabled
      evaluationStrategy
      variants
    }
    totalCount
    pageInfo {
      hasNextPage
      hasPreviousPage
    }
  }
}

# 単一フラグ取得
query GetFeatureFlag($id: ID!) {
  featureFlag(id: $id) {
    id
    key
    name
    enabled
    evaluationStrategy
    variants
    createdAt
    updatedAt
  }
}

# フラグ評価
query EvaluateFeatureFlag($key: String!, $context: EvaluationContextInput!) {
  evaluateFeatureFlag(key: $key, context: $context) {
    value
    variant
    reason
  }
}
```

### Mutations

```graphql
# フラグ作成
mutation CreateFeatureFlag($input: CreateFeatureFlagInput!) {
  createFeatureFlag(input: $input) {
    id
    key
    name
  }
}

# フラグ更新
mutation UpdateFeatureFlag($id: ID!, $input: UpdateFeatureFlagInput!) {
  updateFeatureFlag(id: $id, input: $input) {
    id
    name
    enabled
  }
}

# フラグ有効/無効切り替え
mutation ToggleFeatureFlag($id: ID!, $enabled: Boolean!) {
  toggleFeatureFlag(id: $id, enabled: $enabled) {
    id
    enabled
  }
}

# フラグ削除
mutation DeleteFeatureFlag($id: ID!) {
  deleteFeatureFlag(id: $id)
}
```

### Subscriptions

```graphql
# リアルタイムメトリクス
subscription FeatureFlagMetrics($flagId: ID!) {
  featureFlagMetrics(flagId: $flagId) {
    evaluationCount
    uniqueUsers
    variantDistribution {
      variant
      count
      percentage
    }
    timestamp
  }
}
```

## 管理UI

### Feature Flag一覧画面
- フラグの状態管理（有効/無効の切り替え）
- 検索・フィルタリング機能
- ページネーション
- 一括操作

### フラグ作成・編集画面
- 基本情報設定（キー、名前、説明、タグ）
- 評価戦略の設定
- バリアント設定（A/Bテスト用）
- プレビュー機能

### A/Bテストレポート画面
- テスト結果の概要表示
- バリアント比較グラフ
- 時系列推移グラフ
- 統計的有意性の表示
- 推奨アクションの提示

## パフォーマンス

### レスポンスタイム
- フラグ評価: < 1ms（メモリキャッシュヒット時）
- API応答時間: 100-300ms（GraphQL作成リクエスト）
- UI読み込み時間: 1-2秒（初回ページ表示）

### キャッシュ戦略
- インメモリキャッシュ（Arc<RwLock<HashMap>>）
- TTL: 60秒（設定可能）
- キャッシュクリア機能

### スケーラビリティ
- 10,000+ req/s のフラグ評価に対応
- バッチ評価API対応
- 将来的なRedis対応準備

## 監視とアラート

### メトリクス収集
- 評価回数とユニークユーザー数
- バリアント分布
- エラー率とパフォーマンス指標
- 5分/1時間単位での集計

### アラート条件
- エラー率閾値超過
- フラグ使用率低下
- バリアント分布異常
- パフォーマンス劣化
- 長期間未使用フラグ

### アラートアクション
- Email通知
- Webhook呼び出し
- Slack通知
- ログ記録

## セキュリティ

### マルチテナンシー対応
- テナントレベルでの完全な分離
- MultiTenancyパターンによる権限制御
- x-operator-idヘッダーによるテナント識別

### 認証・認可
- Bearer tokenによる認証
- GraphQL層での権限チェック
- usecase層でのビジネスルール検証

### 入力検証
- GraphQL型システムによる基本検証
- ビジネスルールレベルの検証
- SQLインジェクション対策

## ベストプラクティス

### フラグ命名規則
```
<機能カテゴリ>-<具体的な機能>-<オプショナルな修飾子>

例:
- payment-express-checkout
- ui-dark-mode
- api-v2-migration
- algorithm-optimized-search
```

### 評価戦略の選び方
1. **新機能リリース**: Percentage Rollout + Plan Based
2. **A/Bテスト**: Variants + Percentage Rollout
3. **プレビュー機能**: User/Tenant Targeting
4. **時限リリース**: Time Based
5. **API廃止**: Version Based + Time Based

### フラグのライフサイクル
1. **作成**: 無効状態で作成し、戦略を設定
2. **テスト**: 内部ユーザーでテスト（User Targeting）
3. **段階的公開**: Percentage Rolloutで徐々に拡大
4. **全体公開**: 100%に到達後、フラグを削除またはアーカイブ
5. **クリーンアップ**: 不要になったフラグとコードを削除

## トラブルシューティング

### よくある問題

#### フラグが期待通りに評価されない
- EvaluationContextに必要な属性が含まれているか確認
- キャッシュTTLを確認（デフォルト60秒）
- 評価戦略の優先順位を確認

#### パフォーマンスの問題
- キャッシュが有効になっているか確認
- バッチ評価APIの使用を検討
- メトリクス収集の頻度を調整

#### A/Bテストの結果が不安定
- 決定的ハッシュが正しく機能しているか確認
- 十分なサンプルサイズが確保されているか確認
- バリアントの重み配分を再確認

## 今後の拡張予定

- Redis対応によるスケーラビリティ向上
- Webhook通知による外部システム連携
- より高度な統計分析機能
- フラグ依存関係の管理
- フラグのバージョニング機能