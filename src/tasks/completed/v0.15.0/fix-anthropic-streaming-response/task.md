---
title: "Anthropicストリーミングで[DONE]のみが返る不具合修正"
type: bugfix
emoji: "🛠️"
topics:
  - LLM
  - Anthropic
  - Streaming
published: true
targetFiles:
  - packages/providers/anthropic/src/chat/client.rs
  - packages/providers/anthropic/src/chat/stream.rs
  - packages/providers/anthropic/src/chat/stream_v2.rs
  - packages/llms/src/adapter/axum/chat_completion_handler.rs
  - packages/llms/src/adapter/axum/chat_completion_on_chatroom_handler.rs
  - packages/llms/src/usecase/stream_completion_chat.rs
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/chat/api.ts
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/chat/components/chat.tsx
  - packages/providers/anthropic/Cargo.toml
github: https://github.com/quantum-box/tachyon-apps
---

# Anthropicストリーミングで[DONE]のみが返る不具合修正

## 概要
- Anthropicモデルで `stream=true` のチャット補完を呼び出した際、本文チャンクが全く流れず `[DONE]` のみで終了してしまう現象を解消する。
- プロバイダー層のヘッダー修正後もAPI経由のSSEが `[DONE]` のみで終端するため、サーバーおよびフロントのチャンク処理を見直す。

## 背景・目的
- フロントエンド (`apps/tachyon` の AI チャット) から SSE で補完を再生する設計だが、現在は `[DONE]` 以外のイベントが届かず UI が空白になる。
- `curl` による再現テストでも `/v1/llms/chatrooms/{id}/chat/completions` と `/v1/llms/chat/completions` が `[DONE]` しか返さないことを確認。
- プロバイダー単体（`cargo run --package anthropic --example stream`）ではチャンクを取得できるため、API層のSSE変換またはフロントでのパースに問題が残っている。
- 早期に修正し、Anthropic系モデルのストリーミング体験を復旧させる。

## 詳細仕様

### 機能要件
1. Anthropic API へのストリーミングリクエストで `Accept: text/event-stream` を送る（対応済み）。
2. `send_chat_completion_stream` / `send_chat_completion_raw_stream` の双方で適切なヘッダーを設定する（対応済み）。
3. Tachyon API のチャットストリームハンドラで `delta.content` やツール情報などのチャンクを欠損させない。
4. Billingラッパーによる `StreamOutput` 処理で本文が消えないことを保証する。
5. フロントエンドの SSE パーサーが文字列・配列の両方の `delta.content` をハンドリングできる。
6. フロント側で初回チャンクを含めてテキストを蓄積し、最終的に空文字が保存されない。
7. SSE 出力で本文チャンクが1件以上流れることを手動検証で確認する。
8. Anthropicプロバイダーのストリーム処理で部分チャンクをバッファリングし、`data: `行の途中切れでも復元して配信する。

### 非機能要件
- 外部APIの仕様変更に追従しやすいようにヘッダー設定の意図をコメント化する。
- 変更範囲を最小化し、リファクタは必要最低限に留める。
- `mise run check` で回帰がないことを確認する。

### コンテキスト別の責務
- **providers/anthropic**: APIクライアントのヘッダー更新・ストリーム処理の挙動維持。
- **apps/tachyon-api**: 依存先の挙動が変わるのみで追加変更は不要。
- **apps/tachyon**: バックエンド修正後にイベントが流れるか動作確認を実施。

### 仕様のYAML定義
- 今回は設定値の追加変更なし。

## タスク分解と進捗

| フェーズ | ステータス | 内容 |
| --- | --- | --- |
| フェーズ1: 原因分析 | ✅ 2025-10-14 | `curl` で `[DONE]` のみ返ることを再現し、Anthropic API Accept ヘッダーが原因と推測 |
| フェーズ2: プロバイダー修正 | ✅ 2025-10-14 | ヘッダー調整とコメント追加を実施 |
| フェーズ3: プロバイダー単体テスト | ✅ 2025-10-14 | `mise run check` / `cargo run --package anthropic --example stream` 実行 |
| フェーズ4: API/フロント調査 | ✅ 2025-10-14 | Tachyon API ハンドラとフロント SSE パーサーの詳細追跡と原因究明を完了 |
| フェーズ5: API/フロント修正 | ✅ 2025-10-14 | SSE を通じて本文チャンクとメタ情報を保持するようバックエンド・フロント双方を更新 |
| フェーズ6: E2E動作確認 | ✅ 2025-10-14 | `curl` と UI で SSE チャンクが表示されることを確認（新規チャットで再生成功） |
| フェーズ7: 文書更新 | ✅ 2025-10-14 | taskdoc / verification-report / スクリーンショットを最終反映 |

## テスト計画
- `mise run check` ✅
- 手動テスト
  - `cargo run --package anthropic --example stream` でSSE本文が流れることを確認 ✅
  - `/v1/llms/chatrooms/{id}/chat/completions` への `curl -N` で本文チャンクが流れることを確認 ✅（新規チャットIDで計測）
  - フロントエンド UI でアシスタントの返答が表示されることを確認 ✅（Playwright で新規チャットを再生）
  - `stream=false` で通常レスポンスが取得できることを再確認（変更なし）

## リスクと対策
| リスク | 影響 | 対策 |
| --- | --- | --- |
| Anthropic API 側仕様が将来的に変わる | 中 | ヘッダーの根拠をコメント化し、今後の変更点を taskdoc に記録 |
| 既存コードへの副作用 | 低 | 変更範囲を `anthropic` プロバイダー内に限定し、CI チェックを実行 |

## スケジュール
- 2025-10-14: 調査・修正・テスト完了を目標。

## 参考資料
- Anthropic API ドキュメント（Streaming Messages: `Accept: text/event-stream` 必須）
- 現行実装: `packages/providers/anthropic/src/chat/stream.rs`

## 完了条件
- [x] SSE で本文チャンクが取得できることを確認。（Anthropic stream example）
- [x] `mise run check` が成功。
- [x] Tachyon API / フロント経由で本文チャンクが取得できることを確認。
- [x] taskdoc / verification-report を更新して完了ステータスを残す。
- [ ] 必要に応じてスクリーンショットやログを保存。（スクリーンショット不要につき未実施）
