# justからmiseへの移行ガイド

このドキュメントは、justfileからmiseへの移行について説明します。

## 概要

- **mise**は、開発ツールのバージョン管理とタスク実行を統一的に行えるツールです
- justやvoltaの機能を統合し、より一貫性のある開発環境を提供します
- cargo-watchは廃止され、baconを使用するように移行しました

## インストール

```bash
# miseのインストール
curl https://mise.run | sh

# プロジェクトのツールを自動インストール
mise install
```

## 主な変更点

### 1. コマンドの変更

| 以前（just） | 現在（mise） |
|------------|------------|
| `just setup` | `mise run setup` |
| `just up` | `mise run up` |
| `just dev-watch-tachyon-api` | `mise run dev-backend` |
| `just test` | `mise run test` |
| `just build` | `mise run build` |

### 2. cargo-watchからbaconへの移行

cargo-watchは全面的に廃止され、baconを使用するようになりました：

```bash
# 以前
cargo watch -x "run -p tachyon-api --bin tachyon-api"

# 現在
bacon api -- tachyon-api
# または
mise run dev-backend
```

### 3. エイリアスの設定

よく使うコマンドにはエイリアスが設定されています：

- `mise run dev` → `mise run dev-frontend`（フロントエンド開発）
- `mise run dev-backend` → `mise run dev-watch-tachyon-api`（バックエンド開発）

## タスク一覧

利用可能なすべてのタスクを確認するには：

```bash
mise run --list
```

### 主要なタスク

#### セットアップ・環境管理
- `mise run setup` - プロジェクトの初期セットアップ
- `mise run up` - ローカル環境起動
- `mise run down` - ローカル環境停止
- `mise run clean` - クリーンアップ

#### 開発サーバー
- `mise run dev` - フロントエンド開発サーバー
- `mise run dev-backend` - Tachyon APIサーバー（bacon使用）
- `mise run dev-library` - Libraryアプリ開発サーバー
- `mise run dev-tachyon` - Tachyonアプリ開発サーバー
- `mise run dev-bakuure` - Bakuure UI開発サーバー
- `mise run dev-bakuure-admin` - Bakuure Admin UI開発サーバー

#### ビルド・テスト（すべてDocker内で実行）
- `mise run build` - ビルド実行
- `mise run test` - テスト実行（**Docker内で実行**）
- `mise run ci` - CI相当のチェック（**Docker内でRust + Node.js**）
- `mise run check` - コンパイルチェック（**Docker内で実行**）
- `mise run fmt` - フォーマットチェック（**Docker内で実行**）
- `mise run clippy` - 静的解析（**Docker内で実行**）
- `mise run lint` - リント実行
- `mise run format` - フォーマット実行

#### データベース
- `mise run prepare` - 全データベースの準備
- `mise run migrate <args>` - マイグレーション実行
- `mise run db-repl` - MySQLクライアント起動

#### デプロイ
- `mise run deploy <version>` - Kubernetesデプロイ
- `mise run deploy-lambda <name>` - Lambdaデプロイ
- `mise run build-bakuure-image <version>` - Dockerイメージビルド

## 引数付きタスクの実行

引数を取るタスクは以下のように実行します：

```bash
# 例: デプロイ
mise run deploy v1.0.0

# 例: SQLXマイグレーション
mise run sqlx-migrate ./packages/auth

# 例: シナリオテスト
mise run scenario-test-tachyon-api default
```

## 環境変数

miseは自動的に`.env`ファイルを読み込みます。これにより、justfileの`set dotenv-load`と同じ動作をします。

## トラブルシューティング

### baconが見つからない場合

```bash
mise exec rust -- cargo install bacon
```

### タスクが実行できない場合

```bash
# 実験的機能を有効化
mise settings set experimental true
```

## 移行のメリット

1. **統一されたツール管理**: Node.js、Rust、その他のツールを一元管理
2. **バージョン固定**: `.mise.toml`でツールのバージョンを固定
3. **高速な自動リロード**: baconによる効率的な開発体験
4. **シンプルなコマンド**: `mise run <task>`で統一

## 互換性

既存の`justfile`は残されているため、移行期間中は両方のツールを使用できます。新規開発ではmiseの使用を推奨します。