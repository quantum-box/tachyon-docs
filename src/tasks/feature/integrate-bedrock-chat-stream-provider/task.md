---
title: AWS Bedrock ChatStreamProviderV2 統合
type: feature
emoji: "🔧"
topics:
  - AWS Bedrock
  - Claude
  - LLM Provider
published: true
targetFiles:
  - packages/providers/aws/src/bedrock/
  - apps/tachyon-api/src/di.rs
github: https://github.com/quantum-box/tachyon-apps
---

# AWS Bedrock ChatStreamProviderV2 統合

## 概要

AWS Bedrock経由でClaudeを使用できるようにするため、`ChatStreamProviderV2`トレイトをBedrock実装に追加し、`chat_stream_providers`に登録する。

## 背景・目的

- 現在、`aws::Bedrock`は`llm_providers`には登録されているが、`chat_stream_providers`には登録されていない
- `ChatStreamProviderV2`トレイトを実装することで、Agent APIやChat APIでBedrock経由のClaudeを使用可能になる
- AWS環境でのClaudeアクセスを統一的に管理できるようになる

## 詳細仕様

### 機能要件

1. `ChatStreamProviderV2`トレイトをBedrock実装に追加
2. `chat_stream_v2`メソッドでストリーミングレスポンスを返す
3. `get_supported_models`メソッドでBedrock経由で利用可能なClaudeモデルを返す
4. `provider_name`メソッドで"bedrock"を返す
5. `di.rs`で`chat_stream_providers`にBedrockを登録

### 非機能要件

- 既存のBedrock実装との互換性を維持
- エラーハンドリングは既存のパターンに従う

## 実装方針

### アーキテクチャ設計

既存の`packages/providers/aws/src/bedrock/`に`stream_v2.rs`を追加し、`ChatStreamProviderV2`トレイトを実装する。

### 技術選定

- 既存の`invoke_model_stream`メソッドを活用
- `ChatStreamChunk`への変換ロジックを追加

## タスク分解

### 主要タスク

- ✅ 要件定義の明確化
- ✅ 技術調査・検証
- ✅ 実装
  - ✅ `stream_v2.rs`の作成
  - ✅ `ChatStreamProviderV2`トレイトの実装
  - ✅ `di.rs`への登録
- ✅ テスト・品質確認（CI通過）
- ✅ ドキュメント更新

## 完了条件

- ✅ `cargo check`が通る
- ✅ `mise run docker-check`が通る
- 📝 Bedrock経由でClaudeが使用可能になる（AWS認証情報が必要）

## PR

- https://github.com/quantum-box/tachyon-apps/pull/943
