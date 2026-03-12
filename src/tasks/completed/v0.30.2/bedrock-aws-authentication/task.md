---
title: "Bedrock AWS認証問題の修正"
type: "bug"
emoji: "🔐"
topics: ["AWS", "Bedrock", "認証", "Docker"]
published: true
targetFiles:
  - compose.yml
github: https://github.com/quantum-box/tachyon-apps
---

# Bedrock AWS認証問題の修正

## 概要
agent APIでAWS Bedrockモデル（`bedrock/claude-4-5-sonnet`等）が動作しない問題を修正する。`aws configure export-credentials --profile n1 --format env`で取得したAWS認証情報をDockerコンテナに渡せるようにする。

## 背景・目的
- BedrockプロバイダーはAWS SDKの標準クレデンシャルチェーンを使用
- 現在、`compose.yml`の`tachyon-api`サービスにAWS認証情報が設定されていない
- ローカル開発環境でBedrockモデルを使用できるようにする

## 詳細仕様

### 機能要件
1. `compose.yml`の`tachyon-api`サービスにAWS環境変数を追加
2. ホスト側の環境変数をDockerコンテナに渡す仕組み

### 非機能要件
- 既存の環境変数設定に影響を与えない
- セキュリティ: AWS認証情報はホスト側の環境変数から取得し、ファイルに保存しない

## 実装方針

### 修正対象ファイル
- `compose.yml` - tachyon-apiサービスの環境変数設定

### AWS認証情報の環境変数
```yaml
environment:
  - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
  - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
  - AWS_SESSION_TOKEN=${AWS_SESSION_TOKEN}
  - AWS_REGION=${AWS_REGION:-ap-northeast-1}
```

### 使用方法
```bash
# 認証情報を取得してDocker環境を起動
eval $(aws configure export-credentials --profile n1 --format env)
mise run up-tachyon
```

## タスク分解
- [x] 調査: Bedrockプロバイダーの認証方式確認
- [x] 調査: compose.ymlの現状確認
- [x] `compose.yml`の修正
- [x] taskdoc作成

## 検証方法
1. AWS認証情報を環境変数に設定
2. Docker環境を起動
3. agent APIでBedrockモデル（`bedrock/claude-4-5-sonnet`）を指定してリクエスト
4. 正常にレスポンスが返ることを確認

## リスクと対策
| リスク | 影響度 | 対策 |
|--------|--------|------|
| 環境変数が設定されていない | 中 | 起動前に認証情報取得を案内 |
| セッショントークンの期限切れ | 低 | 再度`aws configure export-credentials`を実行 |

## 完了条件
- [x] `compose.yml`にAWS環境変数が追加されている
- [x] Bedrockモデルでagent APIが正常に動作する
- [x] taskdocをcompleted/v0.30.2に移動

## 動作確認結果 (2026-01-14)
- モデル: `bedrock/claude-4-5-sonnet`
- リクエスト: "Say hello in Japanese. Just one word."
- レスポンス: **こんにちは** (Hello in Japanese)
- 使用トークン: 173 tokens
- コスト: $0.102595

### バージョン番号の決定基準
**パッチバージョン（x.x.X）を上げる場合:**
- [x] バグ修正（認証情報が渡されない問題の修正）
