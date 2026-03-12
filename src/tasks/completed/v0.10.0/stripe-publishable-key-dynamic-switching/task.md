---
title: "フロントエンドStripe公開可能キーの動的切り替え実装"
type: "feature"
emoji: "💳"
topics: ["stripe", "payment", "iac-context", "frontend", "graphql"]
published: true
targetFiles: [
  "apps/tachyon/src/app/v1beta/[tenant_id]/billing/components/",
  "apps/bakuure-ui/src/features/PaymentCheckoutForm/",
  "apps/tachyon-api/src/graphql/",
  "packages/payment/"
]
github: ""
---

# フロントエンドStripe公開可能キーの動的切り替え実装

## 概要

現在フロントエンドで環境変数により静的に設定されているStripe公開可能キーを、バックエンドのiac-context基盤を活用して動的に切り替えられるよう実装する。これにより、テナント別・環境別のStripeアカウント切り替えを実現する。

## 背景・目的

### 現状の問題
- **静的設定の限界**: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`による固定キー使用
- **iac-context未活用**: バックエンドは対応済みだが、フロントエンドとの連携が未実装
- **マルチテナント非対応**: テナント別のStripeアカウント管理ができない
- **環境切り替えの手動作業**: 環境別のキー管理が煩雑

### 解決すべき課題
1. フロントエンドからの動的なStripe公開可能キー取得
2. iac-contextベースの設定管理との統合
3. テナント・環境別の自動キー切り替え
4. 既存の決済フローへの影響最小化

## 詳細仕様

### 機能要件

#### 1. GraphQL API追加
```graphql
type Query {
  """
  指定されたテナントのStripe公開可能キーを取得
  """
  getStripePublishableKey(tenantId: String!): String!
}

type Mutation {
  """
  テナントのStripe設定を更新（管理者用）
  """
  updateStripeConfiguration(
    tenantId: String!
    publishableKey: String!
    secretKey: String!
  ): StripeConfiguration!
}

type StripeConfiguration {
  tenantId: String!
  publishableKey: String!
  environment: StripeEnvironment!
  createdAt: String!
  updatedAt: String!
}

enum StripeEnvironment {
  TEST
  LIVE
}
```

#### 2. フロントエンド改修仕様
```typescript
// 改修対象コンポーネント
- apps/tachyon/src/app/v1beta/[tenant_id]/billing/components/add-payment-method-dialog.tsx
- apps/bakuure-ui/src/features/PaymentCheckoutForm/index.tsx

// 新しい実装パターン
const { data: stripeConfig } = useQuery(GetStripePublishableKeyDocument, {
  variables: { tenantId },
  skip: !tenantId
});

const stripePromise = useMemo(() => {
  return stripeConfig?.getStripePublishableKey 
    ? loadStripe(stripeConfig.getStripePublishableKey)
    : null;
}, [stripeConfig?.getStripePublishableKey]);
```

#### 3. バックエンド実装仕様
```rust
// GraphQLリゾルバー
impl QueryResolvers {
    async fn get_stripe_publishable_key(
        &self,
        ctx: &Context<'_>,
        tenant_id: String,
    ) -> async_graphql::Result<String> {
        // 1. iac-contextからStripe設定を取得
        // 2. テナント階層に基づく設定継承
        // 3. 公開可能キーを安全に返却
    }
}

// usecase実装
pub struct GetStripePublishableKey {
    iac_config_provider: Arc<dyn IacConfigurationProvider>,
}

impl GetStripePublishableKey {
    pub async fn execute(
        &self, 
        tenant_id: &TenantId
    ) -> Result<String> {
        // iac-contextからStripe設定を取得
        let config = self.iac_config_provider
            .get_provider_config(tenant_id, "payment")
            .await?;
        
        // 公開可能キーを抽出
        config.get("publishable_key")
            .ok_or_else(|| Error::StripeConfigNotFound)
    }
}
```

### 非機能要件

#### セキュリティ
- 公開可能キーのみ返却（シークレットキーは除外）
- 認証されたユーザーのみアクセス可能
- テナント権限の検証実装

#### パフォーマンス
- GraphQLクエリのキャッシュ実装
- 不要なAPIコール削減
- Stripe初期化の遅延実行

#### 可用性
- フォールバック機能（環境変数への自動フォールバック）
- エラーハンドリングの実装
- ローディング状態の適切な管理

## 実装方針

### アーキテクチャ決定

#### 1. 段階的移行戦略
- **Phase 1**: GraphQL API実装とバックエンド基盤整備
- **Phase 2**: フロントエンド改修（既存機能の並行稼働）
- **Phase 3**: 環境変数の段階的廃止

#### 2. iac-context統合パターン
```rust
// 設定継承ルール活用
InheritanceRule {
    field_path: "providers.stripe.publishable_key".to_string(),
    inheritance_type: InheritanceType::Mandatory,
    description: Some("Stripe公開可能キーはPlatformレベルで管理".to_string()),
}
```

#### 3. エラーハンドリング戦略
```typescript
// フロントエンド側
const stripePromise = useMemo(() => {
  if (stripeConfig?.getStripePublishableKey) {
    return loadStripe(stripeConfig.getStripePublishableKey);
  }
  
  // フォールバック: 環境変数
  if (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    console.warn('Using fallback Stripe key from environment variable');
    return loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  }
  
  return null;
}, [stripeConfig]);
```

## タスク分解

### Phase 1: バックエンド基盤実装 🔄
- [ ] GraphQLスキーマ定義の追加
- [ ] GetStripePublishableKey usecase実装
- [ ] GraphQLリゾルバー実装
- [ ] iac-context統合実装
- [ ] 単体テスト作成
- [ ] 統合テスト作成

### Phase 2: フロントエンド改修 📝
- [ ] GraphQLクエリ定義作成
- [ ] useStripePublishableKeyカスタムフック作成
- [ ] add-payment-method-dialog.tsx改修
- [ ] PaymentCheckoutForm/index.tsx改修
- [ ] エラーハンドリング実装
- [ ] ローディング状態実装

### Phase 3: テスト・デプロイメント 📝
- [ ] E2Eテストシナリオ作成
- [ ] 決済フローの動作確認
- [ ] 環境別動作検証
- [ ] パフォーマンステスト
- [ ] セキュリティテスト
- [ ] ドキュメント更新

### Phase 4: 本番対応・クリーンアップ 📝
- [ ] 環境変数の段階的廃止
- [ ] 監視・ログ実装
- [ ] 運用マニュアル作成
- [ ] アラート設定
- [ ] 完了報告とナレッジ共有

## テスト計画

### 単体テスト
```rust
#[tokio::test]
async fn test_get_stripe_publishable_key_success() {
    // iac-contextのモック設定
    // 正常ケースのテスト
}

#[tokio::test]
async fn test_get_stripe_publishable_key_not_found() {
    // 設定が見つからない場合のエラーハンドリング
}
```

### 統合テスト
```typescript
describe('Stripe設定の動的取得', () => {
  test('有効なテナントIDで公開可能キーを取得', async () => {
    // GraphQLクエリのテスト
  });
  
  test('無効なテナントIDでエラーハンドリング', async () => {
    // エラーケースのテスト
  });
});
```

### E2Eテスト
- 決済フローの完全テスト
- テナント切り替え時の動作確認
- フォールバック機能の検証

## リスクと対策

### 高リスク項目

#### 1. 既存決済機能への影響
- **リスク**: 改修により既存の決済フローが停止
- **対策**: 段階的移行とフォールバック機能の実装

#### 2. iac-context設定の複雑性
- **リスク**: 設定継承ルールの理解不足による不具合
- **対策**: 詳細な設定例とテストケースの準備

#### 3. セキュリティホール
- **リスク**: 意図しないキー情報の漏洩
- **対策**: セキュリティレビューとペネトレーションテスト

### 中リスク項目

#### 1. パフォーマンス劣化
- **リスク**: APIコール増加による応答時間悪化
- **対策**: 適切なキャッシュ戦略とクエリ最適化

#### 2. 環境別設定の不整合
- **リスク**: 開発・ステージング・本番環境での設定ミス
- **対策**: 自動化されたデプロイメントと検証スクリプト

## スケジュール

### マイルストーン
- **Week 1**: Phase 1完了（バックエンド基盤）
- **Week 2**: Phase 2完了（フロントエンド改修）
- **Week 3**: Phase 3完了（テスト・検証）
- **Week 4**: Phase 4完了（本番デプロイ・クリーンアップ）

### 重要な期限
- **中間チェックポイント**: Week 2終了時（フロントエンド改修完了）
- **本番リリース予定**: Week 4終了時
- **環境変数廃止予定**: 本番リリース後2週間

## 完了条件

### 機能完了条件
1. ✅ GraphQL APIによる公開可能キー取得が正常動作
2. ✅ フロントエンドでの動的キー切り替えが実装済み
3. ✅ テナント別・環境別の設定が正しく動作
4. ✅ 既存の決済フローに影響がない
5. ✅ フォールバック機能が正常動作

### 品質完了条件
1. ✅ 全自動テストが通過（単体・統合・E2E）
2. ✅ セキュリティレビュー完了
3. ✅ パフォーマンステスト合格
4. ✅ 運用ドキュメント整備完了
5. ✅ チームメンバーへの知識共有完了

### 技術的完了条件
1. ✅ iac-context基盤との完全統合
2. ✅ 適切なエラーハンドリング実装
3. ✅ 監視・ログ機能実装
4. ✅ 自動デプロイメント対応
5. ✅ レガシー環境変数の安全な廃止

## 関連ドキュメント

- [IAC Configuration Provider仕様](../../tachyon-apps/iac/configuration-provider.md)
- [Payment Package Architecture](../../tachyon-apps/payment/)
- [Stripe Integration Guidelines](../../guidelines/stripe-integration.md)
- [Multi-Tenant Configuration Management](../../tachyon-apps/authentication/multi-tenancy.md)

## 実装メモ

### 技術決定事項
- GraphQLクエリでの公開可能キー取得を採用
- iac-contextとの統合によるマニフェストベース設定管理
- 段階的移行による既存機能への影響最小化

### 学習事項
（実装進行中に追記予定）

### 発生した問題と解決策
（実装進行中に追記予定）