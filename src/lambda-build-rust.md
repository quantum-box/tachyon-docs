# Lambda Rust Build Guide

## エラー: linking with `zigcc-aarch64-unknown-linux-gnu-aef7.sh` failed

### エラーメッセージ

```
error: linking with /Users/takanorifukuyama/Library/Caches/cargo-zigbuild/0.19.0/zigcc-aarch64-unknown-linux-gnu-aef7.sh failed: exit status: 1
...
error: unable to find dynamic system library 'ssl' using strategy 'no_fallback'. searched paths:
...
error: unable to find dynamic system library 'crypto' using strategy 'no_fallback'. searched paths:
...
error: could not compile bakuure-api (bin "lambda-bakuure-api") due to 1 previous error
error: Recipe deploy-lambda failed on line 279 with exit code 101
```

### 原因
このエラーメッセージは、クロスコンパイル時に必要な動的ライブラリ（`ssl`と`crypto`）が見つからないことを示しています。これは、Linux用のOpenSSLライブラリがMacOS上で利用できないために発生しています。

### 解決方法
この問題を解決するには、以下の手順を実行してください：

1. **OpenSSLをクロスコンパイル用にインストールする**：

    ```bash
    brew install FiloSottile/musl-cross/musl-cross
    brew install mingw-w64
    ```

2. **環境変数を設定して、クロスコンパイル用のOpenSSLを指定する**：

    ```bash
    export OPENSSL_DIR=/usr/local/opt/openssl@1.1
    export OPENSSL_INCLUDE_DIR=/usr/local/opt/openssl@1.1/include
    export OPENSSL_LIB_DIR=/usr/local/opt/openssl@1.1/lib
    ```

3. **`Cargo.toml`ファイルに以下の行を追加して、OpenSSLをスタティックリンクするように指定する**：

    ```toml
    [dependencies]
    openssl = { version = "0.10", features = ["vendored"] }
    ```

4. **クロスコンパイル用のターゲットを追加する**：

    ```bash
    rustup target add aarch64-unknown-linux-gnu
    ```

5. **`.cargo/config.toml`ファイルを作成または編集して、リンカーの設定を追加する**：

    ```toml
    [target.aarch64-unknown-linux-gnu]
    linker = "aarch64-linux-gnu-gcc"
    ```

これらの手順を実行した後、再度ビルドを試みてください。

もし問題が解決しない場合は、Docker を使用してLinux環境でビルドすることも検討してください。これにより、クロスコンパイルの問題を回避できる可能性があります。
