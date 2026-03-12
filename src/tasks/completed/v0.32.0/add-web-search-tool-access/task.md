---
title: "Agent API Web Search Tool Access Control"
type: feature
emoji: "🔍"
topics:
  - Agent API
  - ToolAccess
  - Web Search
  - Google Custom Search
published: true
targetFiles:
  - packages/llms/src/agent/tool_access.rs
  - packages/llms/src/adapter/axum/agent_handler.rs
  - packages/llms/domain/src/agent_execution_state.rs
  - packages/llms/src/agent/system_prompt.rs
  - packages/llms/src/usecase/execute_agent.rs
  - packages/llms/src/agent/tool/web_search.rs
  - packages/llms/src/agent/tool/mod.rs
github: ""
---

# Agent API Web Search Tool Access Control

## 概要

Agent APIの`tool_access`設定に`web_search`フィールドを追加し、Web検索ツールの有効/無効を制御できるようにする。

## 背景・目的

### 現状の課題
- `ToolAccessConfig`には`filesystem`, `command`, `coding_agent_job`, `agent_protocol`の4つの制御フィールドがある
- Web検索機能は`tool_access`による有効/無効制御の対象外だった
- セキュリティやコスト管理の観点から、Web検索の有効/無効を制御したいニーズがある

### 期待される成果
- REST API経由で`tool_access.web_search`を指定してWeb検索の有効/無効を切り替えられる
- Web検索無効時はシステムプロンプトにツール定義を含めない（無効メッセージではなく、ツール自体を渡さない）
- 既存の`tool_access`パターンと一貫した実装

## 詳細仕様

### 機能要件

1. **`ToolAccessConfig`の拡張**
   - `web_search: bool`フィールドを追加
   - デフォルト値は`true`（有効）
   - `web_search_disabled()`ヘルパーメソッドを追加

2. **REST APIリクエスト構造の更新**
   - `AgentToolAccessRequest`に`web_search: Option<bool>`を追加
   - 省略時は`false`（無効）として扱う（既存パターンと同様のセキュアデフォルト）

3. **システムプロンプトでのツール定義の条件付き追加**
   - `web_search`が有効な場合のみ`search_with_llm`ツール定義をシステムプロンプトに含める
   - 無効時はツール定義を渡さない（他のツールと同じパターン）

4. **`StoredToolAccessConfig`の更新**
   - `web_search`フィールドを追加（後方互換性のため`#[serde(default)]`付き）

### API仕様

```yaml
# REST API リクエスト例
POST /v1/llms/chatrooms/:id/agent/execute
{
  "tool_access": {
    "filesystem": true,
    "command": false,
    "coding_agent_job": true,
    "agent_protocol": true,
    "web_search": true  # 新規追加
  }
}
```

### 非機能要件

- 既存のツール制御パターンとの一貫性を維持
- パフォーマンスへの影響なし（単純なboolチェック）
- 後方互換性を維持（`web_search`省略時は`false`で既存動作に影響なし、StoredToolAccessConfigは`#[serde(default)]`で対応）

## 実装方針

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `packages/llms/src/agent/tool_access.rs` | `web_search`フィールドと`web_search_disabled()`メソッド追加 |
| `packages/llms/src/adapter/axum/agent_handler.rs` | `AgentToolAccessRequest`に`web_search`追加、変換ロジック更新 |
| `packages/llms/domain/src/agent_execution_state.rs` | `StoredToolAccessConfig`に`web_search`追加 |
| `packages/llms/src/agent/system_prompt.rs` | web_search有効時のみツール定義を含める条件分岐追加 |
| `packages/llms/src/usecase/execute_agent.rs` | `StoredToolAccessConfig`変換に`web_search`追加 |
| `packages/llms/src/agent/tool/mod.rs` | テストコードの`ToolAccessConfig`に`web_search`追加、`search_with_llm`ハンドラ登録 |
| `packages/llms/src/agent/tool/web_search.rs` | **新規** Google Custom Search APIを使ったWeb検索ハンドラ実装 |

### 必要な環境変数

| 環境変数 | 説明 |
|---------|------|
| `GOOGLE_CUSTOM_SEARCH_API_KEY` | Google Custom Search API キー |
| `GOOGLE_CUSTOM_SEARCH_CX` | Google Custom Search Engine ID (CX) |

## タスク分解

### フェーズ1: コア実装 ✅
- [x] `ToolAccessConfig`に`web_search`フィールド追加
- [x] `web_search_disabled()`メソッド追加
- [x] `Default`トレイト実装の更新

### フェーズ2: REST API対応 ✅
- [x] `AgentToolAccessRequest`に`web_search`追加
- [x] 変換ロジック（`unwrap_or(false)`）追加

### フェーズ3: システムプロンプト ✅
- [x] web_search有効時のみ`search_with_llm`ツール定義を含める条件分岐追加
- [x] 全ツールで「無効メッセージ」ではなく「ツール定義を含めない」パターンに統一

### フェーズ4: StoredToolAccessConfig ✅
- [x] `StoredToolAccessConfig`に`web_search`フィールド追加
- [x] 後方互換性のため`#[serde(default = "default_web_search")]`追加
- [x] `execute_agent.rs`の変換ロジック更新

### フェーズ5: ツールハンドラ実装 ✅
- [x] `web_search.rs`新規作成（Google Custom Search API使用）
- [x] `DefaultToolExecutor`に`search_with_llm`ハンドラ登録
- [x] `tool_access.web_search`による有効/無効チェック実装

### フェーズ6: テスト・検証 ✅
- [x] テストコードの`ToolAccessConfig`初期化を更新
- [x] `mise run check`でコンパイル確認

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 既存コードへの影響 | 中 | `Default`実装で`web_search: true`を設定し、既存動作を維持 |
| 保存済みデータの互換性 | 低 | `StoredToolAccessConfig`で`#[serde(default)]`を使用して後方互換性を確保 |

## 完了条件

- [x] すべての機能要件を満たしている
- [x] `mise run check`が通る
- [ ] PRレビュー完了

### バージョン番号

**パッチバージョン（x.x.X）を上げる:**
- [x] 既存機能の微調整（ツールアクセス制御の拡張）

## 参考資料

- 既存実装: `packages/llms/src/agent/tool_access.rs`
- REST API: `packages/llms/src/adapter/axum/agent_handler.rs`
- システムプロンプト: `packages/llms/src/agent/system_prompt.rs`
