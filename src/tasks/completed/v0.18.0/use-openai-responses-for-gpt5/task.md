---
title: "GPT-5 ストリーミングを Responses API に移行する"
type: "bug"
emoji: "🛠️"
topics:
  - LLMS
  - OpenAI
  - Streaming
published: true
targetFiles:
  - packages/providers/openai/src
  - packages/llms/src/usecase/command_stack
  - docs/src/tasks/completed/v0.18.0/use-openai-responses-for-gpt5
github: https://github.com/quantum-box/tachyon-apps
---

# GPT-5 ストリーミングを Responses API に移行する

## 概要

OpenAI GPT-5 モデルでエージェント実行が途中終了する不具合を解消するため、既存の Chat Completions API から Responses API への移行とストリーミング処理の再設計を行う。Responses API の出力形式に追従し、安定したテキスト取得と Usage 計測を実現する。

## 背景・目的

- 現状のチャットストリームは Chat Completions ( `/v1/chat/completions` ) 前提であり、GPT-5 の `delta.content` が配列形式で返る仕様に非対応。
- JSON パースに失敗したチャンクが破棄され、Usage 情報も欠落するため、BillingAwareCommandStack が意図したレスポンスを得られず、MCP 側でタスクがキャンセルされる。
- Responses API (`/v1/responses`) は GPT-4.1 以降で推奨される新形式であり、出力ブロックの型情報が明示されるため、今後のマルチモーダル対応にも有利。

## 詳細仕様

### 機能要件

1. GPT-5 系モデルを対象に、LLM プロバイダーが Responses API を使用してストリーミングを行う。
2. Responses API の `output` / `output_text` / `tool_call` ブロックを解析し、テキスト・ツール呼び出し・Usage を既存の内部表現に変換する。
3. Usage 情報を `ChatStreamChunk::Usage` として必ず 1 回送出する。
4. 既存の GPT-4 系モデルでは従来どおり Chat Completions API を利用できるよう互換性を保持する。
5. エージェント実行時に GPT-5 でも途切れず応答が返ること。

### 非機能要件

- **パフォーマンス**: 既存のストリームとの比較で平均レイテンシが大幅に悪化しない（+10% 以内）。
- **セキュリティ**: API キーやログに機微情報を出力しない。リトライ・タイムアウト設定は従来値を維持する。
- **保守性**: 新旧エンドポイント切り替えが明確に分離され、モデル追加時に判定を拡張しやすい構造とする。

### コンテキスト別の責務

- **providers/openai**: Responses API クライアント実装、ストリーム変換ロジック、Usage 集計。
- **llms/usecase/command_stack**: 新しいチャンク構造への適合（必要な場合のみ軽微な調整）。
- **catalog/payment**: 既存の価格計算フローは変更なし。モデル識別子の整合性のみ確認。

### 仕様のYAML定義

```yaml
openai:
  models:
    gpt-5:
      transport: responses_api
      endpoint: "/v1/responses"
      stream_mode: "sse"
      output_blocks:
        - type: "message"
          key: "output"
        - type: "text"
          key: "output_text"
        - type: "tool_call"
          key: "tool_calls"
      usage_fields:
        prompt: "usage.input_tokens"
        completion: "usage.output_tokens"
        total: "usage.total_tokens"
```

## 実装方針

### アーキテクチャ設計

- `OpenAI` プロバイダーに Responses API 用のクライアントメソッドを追加し、モデル種別でエンドポイントを切り替える。
- ストリーム処理は `llms_provider::v2::ChatStreamChunk` を直接生成するアダプター層を導入し、テキストと Usage を逐次発火させる。
- ツール呼び出しが存在する場合は、既存の XML ストリームパーサーに渡せる形式へ統合する。

### 技術選定

- HTTP クライアントは既存の `reqwest` を継続使用。
- JSON 解析は `serde_json::Value` ベースで段階的にパースし、Responses API 固有のブロック構造を吸収する。
- ストリームは SSE (text/event-stream) で提供されるため、既存の `bytes_stream()` を用いて逐次処理。

### TDD（テスト駆動開発）戦略

#### 既存動作の保証
- GPT-4.1 等 Chat Completions 依存モデル向けのストリーミングテストを流用し、回帰を防ぐ。
- Usage 情報が欠落した場合のエラーハンドリングテストを追加。

#### テストファーストアプローチ
- Responses API の SSE サンプルをフィクスチャ化し、テキスト・ツール・Usage の順序が乱れても期待値どおりに変換されるか検証する。

#### 継続的検証
- `mise run ci-node` に含まれるユニットテストをローカルで確認。
- 必要に応じて `yarn ts` などフロント系チェックはスキップ（今回影響なし）。

## タスク分解

- [x] 仕様確認と既存ストリームコードの洗い出し（2025-10-22 着手・完了）
- [x] Responses API の SSE サンプル収集とテストデータ作成（2025-10-22 完了）
- [x] OpenAI プロバイダーの Responses API 実装（2025-10-22 完了）
- [x] ChatStreamChunk 変換ロジックの更新と既存コード調整（2025-10-22 完了）
- [x] 単体テスト・結合テスト実行（2025-10-22 `cargo test -p openai`, `cargo test -p llms` 実施）
- [x] ドキュメント更新（本 taskdoc・関連仕様書）

## Playwright MCPによる動作確認

- [ ] 実装完了後の初回動作確認（UI 変更が無いため実施不要）
- [ ] PRレビュー前の最終確認
- [ ] バグ修正後の再確認

### 動作確認チェックリスト

今回の変更はサーバーサイドの LLM プロバイダー実装に限定されるため、ブラウザ UI の確認は不要。代わりに以下を確認する：
- [x] GPT-5 模倣のモックレスポンスでストリームが最後まで到達する（単体テストでSSEモックを検証）
- [x] Usage チャンクが 1 度だけ送信される（`completed_event_emits_usage_once` で確認）
- [x] BillingAwareCommandStack 経由でエージェント応答がキャンセルされない（`cargo test -p llms` のストリーム系テストで確認）

## テスト計画

- ユニットテスト: OpenAI プロバイダーのストリーム処理テスト、新しいデータ構造のパーステストを追加。
- 結合テスト: `packages/llms` のコマンドスタックテストに GPT-5 用ケースを追加。
- 手動検証: `mise run dev-backend` + エージェント起動で実レスポンス確認（キーのレート制限に注意）。

## リスクと対策

- **API 仕様変更リスク**: OpenAI 側の仕様追加に備え、未定義ブロックを無視するフォールバックを実装。
- **Usage 欠落**: Usage 未提供時に暫定値を記録し、ログで警告する。
- **互換性**: 既存の GPT-4 系モデルが従来のチャット API を利用し続けることをテストで保証。

## スケジュール

- 調査・設計: 2025-10-21
- 実装: 2025-10-22
- テストと動作確認: 2025-10-22
- ドキュメント更新と振り返り: 2025-10-23

## 完了条件

- GPT-5 モデルに対して Responses API 経由でストリーミングが最後まで完了し、Usage 情報が取得できる。
- 既存モデルのストリーミングユースケースが全てグリーンになる。
- 関連ドキュメント（taskdoc, 仕様書）が最新状態に更新される。
- Playwright MCP 以外の必要な動作確認（手動 or テスト）が完了している。
