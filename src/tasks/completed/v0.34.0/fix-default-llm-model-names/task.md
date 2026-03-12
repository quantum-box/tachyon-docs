# Fix Default LLM Model Names (Chatroom Name Generation Bug)

## Status: Already Fixed in Main

## Problem

`/ai/agent` (Agent UI) で新規chatroomを作成して最初のメッセージを送信しても、名前が "New Room" のまま自動生成されない。

## Root Cause (Original Analysis)

`AutoGenerateChatroomName` は `LLMModelOption::default()` を使用しており、そのデフォルトモデルは `LLMModelName::Small` で、無効なモデル名 `openai:gpt-4.1-mini` が使われていた。

## Resolution

**mainで既に修正済み:**

1. **PR #982** `fix(llms): make FirstOnly always generate name on first message`
   - 最初のメッセージで名前生成が確実に行われるよう修正

2. **PR #951** `feat(secrets): シークレット管理機能の実装`
   - `LLMModelName::Large/Small` を `"default:large"` / `"default:small"` として実行時に解決するアプローチに変更
   - 特定のモデル名をハードコードせず、利用可能なプロバイダーで動的に解決

## Code Flow

1. `ExecuteAgent.execute()` - `is_first_message = true` (新規chatroom)
2. stream終了時 - `tokio::spawn` で `AutoGenerateChatroomName.execute()` を呼び出し
3. `AutoGenerateChatroomName.execute()` - `LLMModelOption::default()` を使用
4. `LLMModelOption::default()` - `model: LLMModelName::Small` = `"openai:gpt-4.1-mini"`
5. `llm_completion.completion()` - 無効なモデル名でエラー → `?` でエラー伝播
6. `execute_agent.rs` - `Err(e) => tracing::warn!(...)` でエラーログ出力、名前は未更新

## Solution

デフォルトモデル名を有効なGoogle AIモデルに変更:

| Model | Before | After |
|-------|--------|-------|
| Large | `openai:gpt-4.1` | `google_ai:gemini-3-pro-preview` |
| Small | `openai:gpt-4.1-mini` | `google_ai:gemini-2.5-flash-lite` |

**選定理由**:
- `gemini-2.5-flash-lite` は最小価格モデル（input: 100 nanodollars/token）
- 名前生成のような軽量タスクに最適
- コードベース内で既にサポートされているモデル

## Files Changed

- `packages/llms/domain/src/llm_option.rs` - モデル名を有効なものに修正

## Verification

1. バックエンドを起動してログを監視
2. `/ai/agent` にアクセス
3. 新規chatroomを作成してメッセージを送信
4. chatroomの名前が自動生成されていることを確認

## Progress

- [x] 問題の特定
- [x] taskdoc作成
- [x] mainの最新を取り込み → mainで既に修正済みであることを確認
- [ ] 動作確認（mainの修正が正しく動作するか確認）

## Next Steps

このtaskdocは不要となった。mainの修正で動作確認を行い、問題がなければこのtaskdocを削除またはcompletedに移動する。
