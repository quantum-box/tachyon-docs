---
title: "Saved Memory Trigger を LLM 判定に置き換える"
type: "feature"
emoji: "🧠"
topics:
  - llms
  - tachyon
  - frontend
published: true
targetFiles:
  - packages/llms/src/adapter/axum/agent_handler.rs
  - packages/llms/src/usecase/saved_memory_bio_tool.rs
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/memory/*
github: https://github.com/quantum-box/tachyon-apps
---

# Saved Memory Trigger を LLM 判定に置き換える

## 概要

AgentChat の「覚えて/remember」コマンド検出が英語キーワードの手書き判定に依存しており、日本語など他言語での保存要求を拾えない。Saved Memory のトリガー判定を LLM ベースへ置き換え、ユーザーがどの言語で「記憶してほしい」と依頼しても Saved Memory が保存されるようにする。

## 背景・目的

- 現在の `is_saved_memory_command()` は "remember that" 等の固定文字列のみを対象にしているため、日本語 ("覚えて", "記憶して") での入力が保存されない。
- Saved Memory Bio ツールは「ユーザーが記憶を依頼しているか」を既に判定しているため、この結果を利用すればより柔軟なトリガー判定が可能。
- Saved Memory への保存結果は AgentChat とは別の SSE 応答なので、判定が確実になれば UX が向上する。

## 詳細仕様

### 機能要件

1. AgentChat リクエストを受けた際に、LLM（Saved Memory Bio Tool）で「保存依頼」かどうかを判断する。
2. Bio Tool の結果が以下のいずれかに該当する場合は Saved Memory フローを実行する。
   - `should_save` が `true`
   - `sensitive` または `short_term` が `true`
   - `clauses` が 1 件以上
3. 上記に該当しない場合は従来通り Agent 処理へフォールバックし、ユーザーには Saved Memory 応答を返さない。
4. Saved Memory の入力モデルは AgentChat で指定されたモデル（未指定の場合はデフォルト `anthropic/claude-sonnet-4.5`）を使う。
5. LLM 判定がエラーになった場合はログを残して通常の Agent 処理へフォールバックする（ユーザーには影響を与えない）。

### 非機能要件

- Saved Memory 判定は 1 リクエストにつき最大 1 回のみ実施し、重複して LLM を呼び出さない。
- 既存の Saved Memory レスポンス（成功・センシティブ・短期情報など）の文言は維持する。
- 文字列ベースの `is_saved_memory_command` はフォールバック用途に限定するか廃止する。

## 実装方針

1. `execute_agent` 内で Saved Memory Bio Tool を先に呼び出し、判定結果によって Saved Memory フローへ分岐する。
2. Saved Memory フロー（`process_saved_memory_command`）を判定ロジックと保存処理に分割し、判定のみ必要なケースではスキップできるようにする。
3. フロントエンド側は既存の Saved Memory UI を流用し、今回の変更に伴う UX の調整は不要。

## タスク分解

1. 📝 `is_saved_memory_command` の現状動作と Saved Memory Bio Tool の返却値を調査。
2. 📝 LLM 判定を行うヘルパーを実装し、Saved Memory Bio Tool の出力でトリガー判定するように変更。
3. 🔄 Saved Memory フローを「判定 → 保存/拒否応答」へリファクタリングし、AgentChat から呼び出す。
4. 🔄 判定エラー時はログを残しつつ Agent 処理を続行するフォールバックを実装。
5. 📝 テスト（手動確認）：日本語/英語の「覚えて」コマンドで Saved Memory が動作することを確認。

## テスト計画

- AgentChat で以下を入力し、Saved Memory 応答になることを確認。
  - "Remember that I'm a network engineer."（英語）
  - "私はエンジニアであることを覚えて"（日本語）
- センシティブ情報（例: クレジットカード）の場合は警告応答になることを確認。
- 通常のチャットメッセージでは Saved Memory 応答に切り替わらず、Agent が実行されること。

## リスクと対策

| リスク | 影響度 | 対策 |
| --- | --- | --- |
| LLM 判定の誤検知で通常メッセージが Saved Memory 応答になってしまう | 中 | Bio Tool の結果がゼロ件の場合は必ず Agent 処理にフォールバック |
| LLM 判定失敗で Saved Memory が動作しない | 低 | エラー時は Agent 処理へフォールバックし、ログで検知 |

## 完了条件

- [ ] Saved Memory のトリガー判定が LLM ベースへ置き換わっている。
- [ ] 日本語/英語の「覚えて」コマンドで Saved Memory 応答が返ることを確認。
- [ ] 通常メッセージでは AgentChat が従来通り動作する。
- [ ] Taskdoc と verification report を更新。

## 実装メモ

- 2026-01-21: Saved Memory Intent Detector を追加し、LLM で覚えて意図を判定（失敗時のみ英語キーワードフォールバック）。
