# async-stripe初期化パフォーマンス問題の詳細調査報告

## 問題の核心：コンパイル時間 vs 実行時初期化

調査の結果、async-stripeクレートの「初期化が遅い」という問題は、実際には**コンパイル時の極端な遅延**が原因であることが判明しました。Client::new()やStripeClient::new()の実行時初期化自体は高速ですが、開発者が経験する「遅さ」は主にビルド時間に起因しています。

## 主要な発見事項

### 1. コンパイル時間の問題（主要課題）

**深刻なパフォーマンス数値**
- デバッグビルド：約50秒
- リリースビルド：約2分
- メモリ要件：16GB以上のRAMが必要
- バイナリサイズ：約70MB（ストリップ後）
- 生成コード量：約100万行（serdeによる自動生成）

**技術的原因**
- StripeのOpenAPI仕様からの大規模なコード生成
- serdeマクロの過度な使用
- 高度なモノモーフィゼーション
- フィーチャーフラグの相互依存性

### 2. HTTP/TLSクライアントの初期化遅延

**reqwest + native-tlsの組み合わせ問題**
```toml
# 問題のある設定（デフォルト）
async-stripe = { version = "*", features = ["default"] }  # native-tlsを使用

# 推奨設定（60倍高速）
async-stripe = { version = "*", default-features = false, features = ["runtime-tokio-hyper-rustls"] }
```

**TLS実装による初期化時間の違い**
- **rustls**：最速、純Rustで依存関係なし
- **native-tls**：最遅、OSのTLSライブラリのロードが必要
- **OpenSSL**：遅い、複雑な初期化手順

### 3. 実行時の初期化パターン

**現在の実装**
- lazy_staticやonce_cellは使用されていない
- Client::new()は軽量で高速
- 主な遅延はHTTPクライアントの初回TLSハンドシェイク

**推奨される最適化**
```rust
use once_cell::sync::Lazy;
use stripe::Client;

// クライアントの再利用でコネクションプーリングを活用
static STRIPE_CLIENT: Lazy<Client> = Lazy::new(|| {
    Client::new("sk_test_...")
});
```

### 4. "next"ブランチでの劇的な改善

開発者は現在、パフォーマンス問題を解決する大規模な書き換えを行っています：

**パフォーマンス改善**
- コンパイル時間：4分 → 50秒（min-ser有効時）
- インクリメンタルビルド：75秒 → 7秒
- バイナリサイズ：70MB → 20MB（LTO使用で13MB）

**現在のステータス**
- nextブランチでテスト可能
- RC（リリース候補）に近づいている
- テスターを積極的に募集中

## 推奨される解決策

### 1. 即時の回避策（現行バージョン）

```toml
# Cargo.tomlの最適化
[dependencies]
async-stripe = { 
    version = "0.37", 
    default-features = false, 
    features = ["runtime-tokio-hyper-rustls", "billing"]  # 必要な機能のみ
}
```

### 2. コネクションプーリングの最適化

```rust
// カスタムHTTPクライアントの設定例
use reqwest::Client;
use std::time::Duration;

let client = Client::builder()
    .pool_idle_timeout(Duration::from_secs(120))
    .pool_max_idle_per_host(5)
    .timeout(Duration::from_secs(10))
    .build()?;
```

### 3. サーバーレス環境での対策

AWS Lambdaなどでのコールドスタート問題：
- rustls-tlsフィーチャーを使用（native-tlsの60倍高速）
- クライアントインスタンスの事前初期化
- コネクションのウォームアップ

### 4. 長期的な解決策

- nextブランチへの移行を検討
- クリティカルなパスでは手動のreqwest実装を検討
- ビルドマシンのメモリを16GB以上に増強

## 結論

async-stripeの「初期化が遅い」問題は、実際には**コンパイル時間の問題**であり、実行時のClient::new()初期化は高速です。TLS実装の選択（rustls推奨）とクライアントの再利用により、実行時パフォーマンスは大幅に改善できます。根本的な解決には、現在開発中のnextブランチへの移行が推奨されます。

## async-stripe-connect 1.0.0-alpha.2について

調査の結果、`async-stripe-connect` 1.0.0-alpha.2はnextブランチと**直接関係があります**：

### nextブランチとの関連性

1. **nextブランチの成果物の一部**
   - Libraries.ioのページにnextブランチの説明が含まれている
   - パフォーマンス改善の数値（ビルド時間4分→50秒、バイナリサイズ70MB→20MB）が記載
   - nextブランチの使用方法も同じページに記載

2. **新しいアーキテクチャの一部**
   - nextブランチでは機能を複数のクレートに分割する設計を採用
   - `async-stripe-connect`は、Stripe Connect API専用の独立したクレート
   - コンパイル時間短縮のための分割戦略の実装

3. **使用方法**
   ```toml
   # メインのasync-stripeをnextブランチから使用
   [dependencies]
   async-stripe = { git = "https://github.com/arlyon/async-stripe", branch = "next" }
   
   # または個別のクレートとして使用
   async-stripe-connect = "1.0.0-alpha.2"
   ```

つまり、1.0.0-alpha.2はnextブランチで進行中の大規模リファクタリングプロジェクトの成果物であり、将来的にはこのような分割されたクレート構造が正式版として採用される可能性が高いです。