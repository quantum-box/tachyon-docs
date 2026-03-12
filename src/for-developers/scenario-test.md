# シナリオテスト方針

## 概要

シナリオテストは、APIエンドポイントの機能を検証するための統合テストです。実際のサーバー実装を使用して、エンドポイントが期待通りに動作することを確認します。このドキュメントでは、Tachyon Appsプロジェクトでのシナリオテストの方針と実装方法について説明します。

## テスト構造

### 1. 共通ユーティリティの活用

`util.rs`モジュールには、テストを効率的に実行するためのヘルパー関数を提供しています：

- `setup_test_server()`: テスト用のサーバーをセットアップする
- `create_test_client()`: テスト用のHTTPクライアントを作成する
- `generate_timestamp()`: テストデータの一意性を確保するためのタイムスタンプを生成する
- `send_api_request()`: APIリクエストを送信する
- `process_response()`: APIレスポンスを処理する
- `send_and_process_request()`: リクエスト送信とレスポンス処理を一括で行う
- `parse_json_response()`: レスポンスボディをJSONとしてパースする
- `print_response_result()`: レスポンス結果を表示する

### 2. テスト関数の統合

各APIグループのテストは、以下のパターンで実装します：

1. 一つの大きなテスト関数にすべてのシナリオをまとめる（例：`test_repository_api_all`）
2. 各シナリオテストは明確に区分けされ、順序付けられている
3. 各シナリオテスト間には、待機時間を設けて影響を最小限に抑える

### 3. エラーハンドリング

- `anyhow::Result<()>`を戻り値として使用し、エラー処理を標準化
- HTTPステータスコードと期待値を比較して検証
- エラーメッセージには具体的なコンテキスト情報を含める

## テストシナリオのパターン

各APIグループには、以下の共通テストパターンを実装します：

### 1. 正常系テスト（リソース作成と取得）

1. 一意のテストデータを生成
2. リソースを作成するAPIを呼び出す
3. レスポンスを検証（ステータスコードとボディの内容）
4. 作成したリソースを取得するAPIを呼び出す
5. レスポンスを検証（取得したデータが作成したデータと一致することを確認）

### 2. 存在しないリソースの取得テスト

1. 存在しないリソースIDを生成
2. リソース取得APIを呼び出す
3. 404 Not Foundが返されることを確認

### 3. 無効なリクエストでのリソース作成テスト

1. 無効なデータ（空の必須フィールドなど）を含むリクエストを作成
2. リソース作成APIを呼び出す
3. 400 Bad Requestまたは403 Forbidden、404 Not Foundなどの適切なエラーコードが返されることを確認

## 実装例

### リポジトリAPI

```rust
#[tokio::test]
#[tracing::instrument]
async fn test_repository_api_all() -> anyhow::Result<()> {
    // テスト用のサーバーを設定
    let (server_url, shutdown_tx) = setup_test_server().await;
    
    // 1. リポジトリの作成と取得テスト
    // ...

    // 2. 存在しないリポジトリの取得テスト
    // ...

    // 3. 無効なリクエストでのリポジトリ作成テスト
    // ...

    // サーバーをシャットダウン
    shutdown_tx.send(()).unwrap();

    Ok(())
}
```

### 組織API

```rust
#[tokio::test]
#[tracing::instrument]
async fn test_organization_api_all() -> anyhow::Result<()> {
    // テスト用のサーバーを設定
    let (server_url, shutdown_tx) = setup_test_server().await;
    
    // 1. 組織の作成と取得テスト
    // ...

    // 2. 存在しない組織の取得テスト
    // ...

    // 3. 無効なリクエストでの組織作成テスト
    // ...

    // サーバーをシャットダウン
    shutdown_tx.send(()).unwrap();

    Ok(())
}
```

### データAPI

```rust
#[tokio::test]
#[tracing::instrument]
async fn test_data_api_all() -> anyhow::Result<()> {
    // テスト用のサーバーを設定
    let (server_url, shutdown_tx) = setup_test_server().await;
    
    // 1. データの作成と取得テスト
    // ...

    // 2. データ検索API機能テスト
    // ...

    // 3. 存在しないデータの取得テスト
    // ...

    // サーバーをシャットダウン
    shutdown_tx.send(()).unwrap();

    Ok(())
}
```

## シナリオテスト作成の流れ

1. 新しいAPIグループのテストを作成する際は、既存のテストファイルを参考にする
2. `util.rs`の共通ユーティリティを積極的に活用する
3. 一つのテスト関数にすべてのシナリオをまとめて実装する
4. ポジティブケースとネガティブケースの両方をテストする
5. テスト間の影響を最小限に抑えるため、一意のリソース名を使用する
6. テスト完了後は必ずサーバーをシャットダウンする

## 実行方法

シナリオテストは以下のコマンドで実行できます：

```bash
cargo test -p library-api --test data -- --nocapture
cargo test -p library-api --test repos -- --nocapture
cargo test -p library-api --test organization -- --nocapture
```

特定のテストだけを実行する場合は、テスト名を指定します：

```bash
cargo test -p library-api --test repos test_repository_api_all
```
