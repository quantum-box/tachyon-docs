# Feature Flag Playground 仕様書

## 概要

Feature Flag Playgroundは、開発者やプロダクトマネージャーが Feature Flag の動作をリアルタイムでテストできるインタラクティブな環境を提供します。実際のアプリケーションにデプロイする前に、様々な評価コンテキストでフラグがどのように動作するかを確認できます。

## 目的

1. **即座のフィードバック**: 評価コンテキストを変更すると、リアルタイムで評価結果が表示される
2. **デバッグ支援**: なぜそのような評価結果になったのかを理解できる詳細な説明
3. **安全な検証**: 本番環境に影響を与えることなく、フラグの設定をテスト
4. **教育的価値**: 新しいチームメンバーがFeature Flagの仕組みを理解する

## UI/UX設計

### ページレイアウト

```
┌─────────────────────────────────────────────────────────────┐
│ Feature Flag Playground                                      │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────┐ ┌─────────────────────────────────┐ │
│ │ Feature Flag選択    │ │ 評価結果                       │ │
│ │ [Dropdown]         │ │ ┌───────────────────────────┐ │ │
│ └─────────────────────┘ │ │ 結果: ✅ 有効              │ │ │
│                         │ │ バリアント: treatment_a    │ │ │
│ ┌─────────────────────┐ │ │ 理由: ユーザーターゲティング│ │ │
│ │ 評価コンテキスト    │ │ └───────────────────────────┘ │ │
│ │ ┌─────────────────┐ │ │                               │ │
│ │ │ tenant_id       │ │ │ 詳細な評価ログ               │ │
│ │ │ [___________]   │ │ │ ┌───────────────────────────┐ │ │
│ │ │ user_id         │ │ │ │ 1. PercentageRollout: ❌  │ │ │
│ │ │ [___________]   │ │ │ │    → 25% < 67.3%         │ │ │
│ │ │ plan            │ │ │ │ 2. UserTargeting: ✅      │ │ │
│ │ │ [Dropdown]      │ │ │ │    → user_123 in list    │ │ │
│ │ │ + カスタム属性   │ │ │ │ 3. Final: ✅ (OR条件)     │ │ │
│ │ └─────────────────┘ │ │ └───────────────────────────┘ │ │
│ │ [評価を実行]        │ │                               │ │
│ └─────────────────────┘ └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 主要コンポーネント

1. **Feature Flag セレクター**
   - ドロップダウンで既存のFeature Flagを選択
   - 検索機能付き
   - 選択したフラグの基本情報を表示

2. **評価コンテキスト入力フォーム**
   - 基本フィールド:
     - tenant_id (必須)
     - user_id (オプション)
     - plan (ドロップダウン: free/basic/pro/enterprise)
     - client_version (オプション)
   - カスタム属性の追加:
     - キー/値のペアを動的に追加
     - 型選択: string/number/boolean/date

3. **評価結果表示**
   - 評価結果（有効/無効）
   - 選択されたバリアント（A/Bテストの場合）
   - 評価理由の説明
   - ストラテジーごとの評価ステップ

4. **シミュレーション機能**
   - 複数ユーザーでの一括テスト
   - パーセンテージロールアウトの分布確認
   - 時系列シミュレーション（TimeBased戦略用）

### インタラクション

1. **リアルタイム評価**
   - コンテキストを変更すると自動で再評価
   - デバウンス処理で過度なAPI呼び出しを防止

2. **コンテキストのプリセット**
   - よく使うコンテキストを保存
   - チーム間で共有可能

3. **履歴機能**
   - 過去の評価履歴を表示
   - 比較機能

## 技術実装

### GraphQLクエリ

```graphql
# 単一評価
query EvaluateFeatureFlag(
  $flagKey: String!
  $context: FeatureFlagContextInput!
) {
  evaluateFeatureFlag(flagKey: $flagKey, context: $context) {
    enabled
    variant
    reason
    evaluationDetails {
      strategy
      result
      explanation
    }
  }
}

# バッチ評価（シミュレーション用）
query BatchEvaluateFeatureFlag(
  $flagKey: String!
  $contexts: [FeatureFlagContextInput!]!
) {
  batchEvaluateFeatureFlag(flagKey: $flagKey, contexts: $contexts) {
    results {
      context
      enabled
      variant
    }
    summary {
      enabledCount
      variantDistribution {
        variant
        count
        percentage
      }
    }
  }
}
```

### ルーティング

- `/v1beta/[tenant_id]/feature-flags/playground` - Playground メインページ
- `/v1beta/[tenant_id]/feature-flags/playground/[flag_key]` - 特定フラグのPlayground（直接リンク対応）

### コンポーネント構造

```
feature-flag-playground/
├── page.tsx                    # メインページ
├── components/
│   ├── flag-selector.tsx       # Feature Flag選択
│   ├── context-form.tsx        # 評価コンテキスト入力
│   ├── evaluation-result.tsx   # 評価結果表示
│   ├── evaluation-details.tsx  # 詳細な評価ログ
│   ├── simulation-panel.tsx    # シミュレーション機能
│   └── context-presets.tsx     # プリセット管理
└── queries/
    └── playground.graphql      # GraphQLクエリ定義
```

## 拡張機能（将来的な実装）

1. **比較モード**
   - 2つの異なるコンテキストを並べて比較
   - フラグ設定変更前後の比較

2. **エクスポート機能**
   - テスト結果のCSV/JSONエクスポート
   - レポート生成

3. **統合テスト生成**
   - Playgroundでテストしたシナリオから自動でテストコード生成

4. **WebSocket対応**
   - フラグ設定の変更をリアルタイムで反映

## セキュリティ考慮事項

- Playgroundは開発/ステージング環境でのみ利用可能
- 本番環境では読み取り専用モード
- 機密情報を含むコンテキストの扱いに注意

## まとめ

Feature Flag Playgroundは、Feature Flagの動作を安全かつ効率的にテストできる環境を提供します。開発者の生産性向上と、Feature Flagの理解促進に貢献します。
