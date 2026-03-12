---
title: "AIチャット既定モデルをClaude Sonnet 4.5へ切り替える"
type: improvement
emoji: "🤖"
topics:
  - LLM
  - Anthropic
  - Frontend
published: false
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/chat/components/chat.tsx
  - docs/src/tasks/improvement/set-ai-chat-default-to-claude-sonnet-4-5
github: https://github.com/quantum-box/tachyon-apps
---

# AIチャット既定モデルをClaude Sonnet 4.5へ切り替える

## 概要
新規チャット作成画面(`/v1beta/[tenant_id]/ai/chat/new`)で既定選択されるLLMモデルを`anthropic/claude-opus-4-1-20250805`から`anthropic/claude-sonnet-4-5-20250929`へ変更し、初期利用時のコストと体験を最適化する。

## 背景・目的
- 現状は最上位のClaude Opus 4.1が既定選択されており、試行利用でも高コスト課金が発生する懸念がある。
- Claude Sonnet 4.5はAnthropicの推奨バランスモデルであり、十分な性能を維持しつつコストを抑えられる。
- UI側で既定値を切り替えることで、利用者が明示的に変更しない限りSonnet系が選択されるようにし、費用対効果と体験向上を図る。

## 詳細仕様
### 機能要件
1. モデル一覧取得後、URLクエリ`model`が未指定もしくは無効な場合は`anthropic/claude-sonnet-4-5-20250929`を自動選択する。
2. クエリに有効なモデルIDが指定されている場合は既定値で上書きせず尊重する。
3. Sonnet 4.5がリストに存在しない場合は従来通り一覧の先頭モデルを選択する。

### 非機能要件
- モデル一覧取得APIの呼び出し回数・タイミングを増やさない。
- `useQueryState`によるURL同期を維持し、戻る/進む操作でも選択状態が破壊されない。

### コンテキスト別の責務
- フロントエンド(`apps/tachyon`): モデル選択UIの初期化ロジックのみを変更。
- バックエンド(`packages/llms`等): 既存のモデル一覧APIに変更は不要。

### 仕様のYAML定義
- 新規のYAML設定は不要。既存定義を参照する。

## 実装方針
### アーキテクチャ設計
- `Chat`コンポーネント内の`useEffect`で既定モデルを決定する処理を拡張し、優先候補IDを定数として扱う。
- モデルID存在チェックを追加して余計な`setSelectedModel`呼び出しを避ける。

### 技術選定
- 既存のReact/TypeScript、nuqs、SWRを継続利用。追加依存なし。
- 型定義は既存の`ModelInfo`を利用し、ハードコードするIDは`as const`で明示。

### TDD（テスト駆動開発）戦略
- 本件はUIの軽微な既定値変更のため、単体テストは追加しない。
- 手動確認および必要に応じてStory/Playwright確認で回帰をチェック。

## タスク分解
- [x] 要件確認と現状コードの調査（2025-10-12）
- [x] taskdoc整備と進捗更新（2025-10-12）
- [x] 既定モデル選択ロジックの実装（2025-10-12）
- [x] 必要な動作確認（Playwright MCPを含む）（2025-10-19 完了）
- [x] 動作確認レポートとタスクドキュメント更新（2025-10-19 完了）

## Playwright MCPによる動作確認
### 実施タイミング
- [x] 実装完了後の初回動作確認
- [x] PRレビュー前の最終確認

### 動作確認チェックリスト
- [x] モデルクエリ無しでアクセスした際にClaude Sonnet 4.5が選択済みであること。
- [x] `?model=anthropic/claude-opus-4-1-20250805`付きでアクセスしてもOpusが保持されること。
- [x] モデル一覧取得失敗時に既存のエラー表示が変わらないこと（任意確認済み）。

### 実施手順
1. `mise run dev`が起動済みであることを確認し、Playwright MCPで対象URLへ遷移する。
2. クエリ無し/あり両ケースでドロップダウンの既定値を確認し、必要に応じてスクリーンショットを取得する。
3. 動作確認結果を`verification-report.md`に記録する。

## スケジュール
- 2025-10-12 内で実装・確認まで完了予定。

## リスクと対策
| リスク | 影響度 | 対策 |
|--------|--------|------|
| モデルIDの誤記による選択失敗 | 中 | ハードコード前に`apps/tachyon/src/app/v1beta/[tenant_id]/ai/data/models.ts`およびAPIレスポンスを照合する |
| クエリ同期の副作用 | 低 | 既存`useQueryState`の制約を確認し、副作用ガードを追加する |

## 参考資料
- `apps/tachyon/src/app/v1beta/[tenant_id]/ai/chat/components/chat.tsx`
- `docs/src/tasks/improvement/update-anthropic-model-lineup/task.md`

## 2025-10-19
- ✅ Playwright MCPで新規チャット画面を検証し、Sonnet 4.5既定選択とクエリ指定の保持を確認。`mise run check` / `yarn --cwd apps/tachyon lint` / `yarn --cwd apps/tachyon ts`（CI既知エラー除外）を再実行し問題なし。`verification-report.md` へ結果を反映。

## 完了条件
- [x] 新規チャットでSonnet 4.5が既定選択される実装が行われている。
- [x] クエリパラメーター指定の挙動が変化していない。
- [x] 必要な動作確認が完了し、`verification-report.md`が更新されている。
- [x] `mise run check` 等、関連チェックが成功している。

## 備考
- ブラウザ動作確認はPlaywright MCPで実施すること。
- 2025-10-12: `yarn ts --filter=tachyon` を実行したところ、`chat-list.tsx` 由来の既知型エラーで失敗（既存課題と認識）。
