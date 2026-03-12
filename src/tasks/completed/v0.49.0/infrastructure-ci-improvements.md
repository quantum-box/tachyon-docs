# Infrastructure and CI Improvements - v0.49.0

## 概要

v0.49.0 リリースにて、インフラストラクチャとCI/CD環境の各種改善が実装されました。

## 実装内容

### AWS Lambda Environment Variables
- **bakuure-api Lambda**: `COGNITO_USER_POOL_ID` 環境変数を追加
- **REST API Gateway Lambdas**: `AWS_LAMBDA_HTTP_IGNORE_STAGE_IN_PATH` の修正

### MySQL Health Checks
- ローカル・CI環境両対応の改善実装
- `docker exec` を使用したMySQLヘルスチェックに変更
- `wait-db` スクリプトの環境間互換性向上

### CI/CD Workflow Improvements
- `prepare-release` ワークフローがリリースコミットで再実行されないよう修正
- ビルドプロセスの安定性向上

### SQLx Build System
- `.sqlx` キャッシュをルートレベルに統一（重複除去）
- `sqlx-migrate-all` に pricing パッケージを含める
- オフラインビルドの信頼性向上

## 技術的詳細

### Lambda Environment Configuration
```yaml
# bakuure-api Lambda 環境変数追加
COGNITO_USER_POOL_ID: ${cognito_user_pool_id}

# REST API Gateway Lambda 設定修正
AWS_LAMBDA_HTTP_IGNORE_STAGE_IN_PATH: true
```

### MySQL Health Check Enhancement
```bash
# Before: 直接 mysql コマンド
mysql -h mysql -u root -p... -e "SELECT 1"

# After: docker exec 経由
docker exec mysql-container mysql -u root -p... -e "SELECT 1"
```

### SQLx Cache Management
```
# Before: 各パッケージに分散
packages/pricing/.sqlx/
packages/catalog/.sqlx/
...

# After: ルートレベルに統一
.sqlx/
```

## 関連 PR/Issues

- #1140: bakuure-api Lambda 環境変数修正
- #1139: MySQL ヘルスチェック改善
- #1136: prepare-release ワークフロー修正
- #1132: SQLx キャッシュ統合

## 影響範囲

### 開発環境
- MySQL接続の信頼性向上
- ビルド時間の短縮（キャッシュ統合による）

### 本番環境
- Lambda 実行時の安定性向上
- 認証機能の正常動作保証

### CI/CD
- 自動リリースプロセスの安定化
- ビルドキャッシュの最適化

## 完了日
2026-02-19

## バージョン
v0.49.0

## ステータス
✅ 完了