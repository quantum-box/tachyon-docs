---
title: Agent API クレジット課金システム
description: Tachyon AppsのAgent APIに対するクレジットチャージ式課金システムの仕様
published: true
---

# Agent API クレジット課金システム

## 概要

Tachyon AppsのAgent APIでは、クレジットチャージ式の使用量ベース課金システムを採用しています。ユーザーは事前にクレジットを購入し、Agent API実行時にトークン数とツール使用に応じてクレジットを消費します。

## クレジットシステム

### クレジットレート

| 通貨 | レート |
|------|--------|
| JPY | 1クレジット = ¥1 |
| USD | 1クレジット = $0.01 |

### 内部表現

0.1クレジット単位の精度を実現するため、内部では10倍の値で管理しています。

| ユーザー表示 | 内部値 | Stripe API |
|------------|--------|-----------|
| 1000クレジット | 10000 | -10000（負の値） |
| 0.1クレジット | 1 | -1 |
| 61.3クレジット | 613 | -613 |

## 料金体系

### Agent API実行料金

#### 基本料金
- **基本コスト**: 10クレジット/実行

#### トークン料金
- **プロンプトトークン**: 0.01クレジット/トークン（100万トークン = 10,000クレジット）
- **生成トークン**: 0.02クレジット/トークン（100万トークン = 20,000クレジット）

#### ツール使用料金

| ツール名 | 料金（クレジット/回） |
|----------|---------------------|
| MCP Search | 50 |
| MCP Read | 20 |
| MCP Write | 30 |
| MCP Execute | 40 |
| Web Search | 50 |
| Code Execution | 30 |
| File Operation | 20 |

### 料金計算例

1000トークンのプロンプトと500トークンの生成、MCP Search 2回使用の場合：
- 基本料金: 10クレジット
- プロンプト: 1000 × 0.01 = 10クレジット
- 生成: 500 × 0.02 = 10クレジット
- ツール: 50 × 2 = 100クレジット
- **合計: 130クレジット（¥130）**

## クレジットパッケージ

### パッケージ一覧

| パッケージ | 基本クレジット | ボーナス | 合計クレジット | 価格（JPY） | 価格（USD） |
|-----------|--------------|---------|--------------|------------|------------|
| Starter | 1,000 | 0% | 1,000 | ¥1,000 | $10.00 |
| Standard | 5,000 | 10% | 5,500 | ¥5,000 | $50.00 |
| Pro | 10,000 | 20% | 12,000 | ¥10,000 | $100.00 |
| Enterprise | 50,000 | 30% | 65,000 | ¥50,000 | $500.00 |

### 購入方法

1. ビリングページ（`/v1beta/[tenant_id]/billing`）にアクセス
2. 「クレジット購入」タブを選択
3. パッケージを選択して「購入する」をクリック
4. Stripe Checkoutで決済
5. 決済完了後、自動的にクレジットが付与

## 支払い方法

### 対応カード
- Visa
- Mastercard
- American Express
- JCB
- Diners Club
- Discover

### カード管理
- 複数のカードを登録可能
- デフォルトカードの設定
- 不要なカードの削除

## 取引履歴

### 取引タイプ

| タイプ | 説明 | 表示例 |
|--------|------|--------|
| Charge | クレジット購入 | +1,000 |
| Usage | Agent API使用 | -61.3 |
| Grant | 管理者による付与 | +500 |
| Refund | 返金 | +100 |

### 履歴の確認
- ビリングページの「取引履歴」タブで確認
- 取引日時、タイプ、金額、残高を表示
- 決済IDやリソースIDの詳細情報も記録

## API統合

### GraphQL API

#### クレジット残高取得
```graphql
query GetCreditBalance {
  creditBalance {
    balance      # 現在の残高
    reserved     # 予約済み
    available    # 利用可能
    currency     # 通貨（JPY/USD）
    lastUpdated  # 最終更新日時
  }
}
```

#### 取引履歴取得
```graphql
query GetCreditTransactions($limit: Int!, $offset: Int!) {
  creditTransactions(limit: $limit, offset: $offset) {
    nodes {
      id
      type                    # 取引タイプ
      amount                  # 金額（正/負）
      balanceAfter           # 取引後残高
      description            # 説明
      createdAt              # 作成日時
      stripePaymentIntentId  # Stripe決済ID
    }
    totalCount
    pageInfo {
      hasNextPage
      hasPreviousPage
    }
  }
}
```

### エラーハンドリング

#### 残高不足エラー
```json
{
  "error": "payment_required",
  "message": "Insufficient credits. Required: 130, Available: 100",
  "code": "INSUFFICIENT_CREDITS"
}
```

HTTPステータスコード: 402 Payment Required

## 環境設定

### 環境変数

| 変数名 | 説明 | 開発環境 | 本番環境 |
|--------|------|----------|----------|
| BILLING_ENABLED | 課金機能の有効化 | false | true |
| STRIPE_SECRET_KEY | Stripe秘密鍵 | sk_test_... | sk_live_... |
| STRIPE_PUBLISHABLE_KEY | Stripe公開鍵 | pk_test_... | pk_live_... |
| STRIPE_WEBHOOK_SECRET | Webhook署名シークレット | whsec_... | whsec_... |

### 開発環境での動作
- `BILLING_ENABLED=false`の場合、課金チェックをスキップ
- Agent APIは無制限に実行可能
- 残高表示は常に最大値

## セキュリティ

### 支払い情報
- カード情報はStripeで安全に管理
- Tachyon Appsではカード番号を保存しない
- PCI DSS準拠

### アクセス制御
- クレジット付与は管理者権限が必要
- 他テナントの残高・履歴は閲覧不可
- APIキーによる認証必須

## よくある質問

### Q: クレジットの有効期限はありますか？
A: いいえ、購入したクレジットは無期限で利用可能です。

### Q: 返金は可能ですか？
A: 未使用のクレジットについては、購入から7日以内であれば返金可能です。サポートにお問い合わせください。

### Q: 自動チャージは設定できますか？
A: 現在は手動購入のみですが、将来的に自動チャージ機能を実装予定です。

### Q: 使用量の予測はできますか？
A: Agent実行前に見積もりコストが表示されます。実際の使用量は実行内容により変動します。

### Q: チーム内でクレジットを共有できますか？
A: 同一テナント内のユーザーは自動的にクレジットを共有します。

## 関連ドキュメント

- [Agent API リファレンス](../agent-api-reference.md)
- [MCP (Model Context Protocol) 設定ガイド](../mcp-configuration.md)
- [Tachyon AI Studio](./ai-studio.md)