# async-stripe 1.0.0-alpha.2 調査結果

## 概要

async-stripe 1.0.0-alpha.2（nextブランチ）の使用例とAPIパターンについて調査しました。

## 1. Cargo.toml設定

```toml
[dependencies]
# nextブランチを使用する場合
async-stripe = { git = "https://github.com/arlyon/async-stripe", branch = "next" }

# または各モジュールを個別に指定
async-stripe = { path = "../async-stripe", features = ["uuid"] }
async-stripe-types = { path = "../async-stripe-types" }
async-stripe-core = { path = "../stripe_core", features = ["customer", "payment_intent"] }
async-stripe-product = { path = "../stripe_product", features = ["product", "price"] }
async-stripe-billing = { path = "../stripe_billing", features = ["subscription"] }
async-stripe-checkout = { path = "../stripe_checkout", features = ["checkout_session"] }
async-stripe-payment = { path = "../stripe_payment", features = ["payment_method", "payment_link"] }
async-stripe-connect = { path = "../stripe_connect", features = ["account", "account_link"] }
```

## 2. Customer APIの使用例

### インポートパス
```rust
use stripe::{Client, StripeError};
use stripe_core::customer::{CreateCustomer, ListCustomer};
```

### CreateCustomerの使用
```rust
let customer = CreateCustomer::new()
    .name("Alexander Lyon")
    .email("test@async-stripe.com")
    .description("A fake customer that is used to illustrate the examples in async-stripe.")
    .metadata([(String::from("async-stripe"), String::from("true"))])
    .send(client)
    .await?;
```

### ListCustomerの使用（ページネーション）
```rust
let mut stream = ListCustomer::new().paginate().stream(client);

// 次の顧客を取得
let _next = stream.next().await.unwrap();

// または全て収集
let customers = stream.try_collect::<Vec<_>>().await.unwrap();
```

## 3. Product APIの使用例

### インポートパス
```rust
use stripe_product::product::CreateProduct;
```

### CreateProductの使用
```rust
let product = CreateProduct::new("T-Shirt")
    .metadata([(String::from("async-stripe"), String::from("true"))])
    .send(client)
    .await?;

// サブスクリプション商品の例
let product = CreateProduct::new("Monthly T-Shirt Subscription")
    .send(client)
    .await?;
```

## 4. Price APIの使用例

### インポートパス
```rust
use stripe_product::price::{CreatePrice, CreatePriceRecurring, CreatePriceRecurringInterval};
use stripe_types::Currency;
```

### CreatePriceの使用（一回限りの価格）
```rust
let price = CreatePrice::new(Currency::USD)
    .product(product.id.as_str())
    .metadata([(String::from("async-stripe"), String::from("true"))])
    .unit_amount(1000)  // $10.00
    .expand([String::from("product")])
    .send(client)
    .await?;
```

### CreatePriceの使用（定期的な価格）
```rust
let price = CreatePrice::new(Currency::USD)
    .product(&product.id)
    .unit_amount(1000)
    .recurring(CreatePriceRecurring::new(CreatePriceRecurringInterval::Month))
    .send(client)
    .await?;
```

## 5. 新しい.send()パターン

### 基本パターン
すべてのCreate/Update/List操作は以下のパターンに従います：

```rust
let result = CreateXXX::new(required_params)
    .optional_field(value)
    .another_field(value)
    .send(client)  // ← ここで実際のAPIリクエストを送信
    .await?;
```

### 特徴
- ビルダーパターンで必要なフィールドを設定
- `.send(client)`でAPIリクエストを実行
- `await?`で非同期処理を完了

## 6. 共通型の配置場所

### stripe_types クレート
- `Currency`: 通貨コード
- `Expandable`: 展開可能なフィールド
- その他の共通型

### 各ドメインクレート内の型
- `CreatePriceRecurring`: `stripe_product::price`内
- `CreatePriceRecurringInterval`: `stripe_product::price`内
- `CheckoutSessionMode`: `stripe_checkout`内

## 7. モジュール構造

1.0.0-alpha.2では、APIがドメインごとに分割されています：

- **stripe_core**: 顧客、支払いインテント等のコア機能
- **stripe_product**: 商品と価格
- **stripe_billing**: サブスクリプションと請求
- **stripe_checkout**: チェックアウトセッション
- **stripe_payment**: 支払い方法とリンク
- **stripe_connect**: Connect関連機能

## 8. その他の重要な変更点

### パフォーマンス改善
- ビルド時間: ~4分 → 50秒（min-ser有効時）
- インクリメンタルビルド: 75秒 → 7秒
- バイナリサイズ: ~70MB → ~20MB（fat LTOで~13MB）

### 互換性
- 最小Rustバージョン: 1.86.0
- ランタイム: tokio、async-std両対応
- TLS: native-tls、rustls両対応

## 9. マイグレーション時の注意点

1. **インポートパスの変更**: 各APIは専用のクレートに移動
2. **ビルダーパターンの採用**: すべてのAPIリクエストは`.new()`から始まる
3. **`.send()`の必須化**: APIリクエストの実行には明示的な`.send(client)`が必要
4. **型の配置変更**: 共通型は`stripe_types`に、ドメイン固有型は各クレートに

## 参考リンク

- [GitHub - arlyon/async-stripe nextブランチ](https://github.com/arlyon/async-stripe/tree/next)
- [examples/endpoints](https://github.com/arlyon/async-stripe/tree/next/examples/endpoints)