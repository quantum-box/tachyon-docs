---
title: "Agent API ツール実行基盤の実装"
type: feature
emoji: "🛠️"
topics:
  - LLM
  - Agent API
  - Tooling
published: false
targetFiles:
  - packages/llms/src/usecase/command_stack/chat_stream.rs
  - packages/llms/src/usecase/command_stack/mcp/hub.rs
  - packages/llms/Cargo.toml
  - packages/llms/src
github: https://github.com/quantum-box/tachyon-apps
---

# Agent API ツール実行基盤の実装

## 概要

Agent API のストリーミング実行で発火する標準ツール（ファイル操作・検索・コマンド実行など）が現在はダミー応答しか返せない。ユーザータスクを実際に完遂できるよう、各ツールの実体を Rust 側に実装する。

## 背景・目的

- Agent API は `write_to_file` や `execute_command` などのツール呼び出しイベントを生成するが、現状は固定メッセージを返すだけで処理が終了する。
- ダミー応答のままでは、AI Studio や外部連携クライアントでエージェントを活用できない。
- ファイル更新や検索を伴うタスクを完結できるよう、ツール実行レイヤーを整備する。

## 詳細仕様

### 機能要件

1. `write_to_file` `append_to_file` `replace_in_file` `read_file` `list_directory`/`list_files` `search_files` `execute_command` の各ツールに対して実際の処理を実装する。
2. ルートディレクトリを基準にパスをサニタイズし、ワークスペース外へのアクセスを禁止する。
3. 出力はテキスト整形済みの人間可読な文字列で返し、エラー時は `errors::Error` に適切なメッセージを含める。
4. MCP ツール (`use_mcp_tool` / `access_mcp_resource`) 既存処理との互換性を維持する。

### 非機能要件

- ファイル読み書きは UTF-8 想定、最大 1MB 超過時は警告を含む出力にする。
- `search_files` はヒット上限とコンテキスト行数を指定可能にし、結果件数が多い場合は打ち切りを明示する。
- `execute_command` は `bash -lc` で実行し、タイムアウト（デフォルト 120 秒）を設ける。

### コンテキスト別の責務

```yaml
contexts:
  llms:
    responsibilities:
      - AgentChunk に紐づくツール実行のオーケストレーション
      - SSE ストリームへの結果送出
  filesystem:
    responsibilities:
      - パス正規化とアクセス制御
      - 読み書きと検索の I/O 実装
  runtime:
    responsibilities:
      - コマンド実行のプロセス管理
      - タイムアウトと stdout/stderr の集約
```

### 仕様のYAML定義

```yaml
tools:
  workspace_root_env: AGENT_WORKSPACE_ROOT
  default_root: .
  max_read_bytes: 1048576
  search:
    default_context_lines: 2
    default_max_results: 50
  command:
    default_timeout_sec: 120
    shell: ["bash", "-lc"]
```

## 実装方針

- `AttemptApiRequest::execute_tool` を中心にマッチング分岐を追加し、ツールごとに専用ハンドラ関数へ委譲する。
- ハンドラ群は `AttemptApiRequest` のプライベートメソッドとして実装し、共通で利用する `resolve_path` `read_limited_file` を抽出する。
- 正規化には `std::fs::canonicalize`（blocking）ではなく `tokio::fs` + `Path::canonicalize` を `spawn_blocking` で包む。
- `search_files` は `walkdir` + `regex` を使用するため、`packages/llms/Cargo.toml` に `walkdir` を追加する。
- 大きな処理は `tokio::task::spawn_blocking` でオフロードし、SSE スレッドをブロックしない。

## タスク分解

### フェーズ1: 調査と設計 ✅ (2025-10-27 完了)
- [x] 既存コードと仕様ドキュメントの確認
- [x] 対応が必要なツール一覧の洗い出し
- [x] エラーハンドリング方針の整理

### フェーズ2: 実装 🔄
- [x] `Cargo.toml` への依存追加とユーティリティ関数の実装
- [x] 各ツールハンドラの実装
- [ ] ログ・トレース出力の整備

### フェーズ3: テスト計画 🔄
- [x] ユニットテスト／統合テストの追加または更新
- [x] `cargo nextest run -p llms --lib` での検証
- [ ] 失敗時の再現ケース整理

## テスト計画

- ツールごとに正常系／異常系の単体テストを追加（特に `replace_in_file` と `search_files`）。
- `execute_command` は短時間で完了するコマンド (`pwd` など) を使用して統合テスト。
- ファイル操作後に内容をアサートし、クリーンアップはテスト毎に実施。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| パス正規化の抜けでワークスペース外を操作 | 高 | `resolve_path` で canonicalize 後に prefix チェック |
| 長時間コマンドでワーカーが詰まる | 中 | タイムアウトと出力長の制限を実装 |
| 巨大ファイル読み込みでメモリが逼迫 | 中 | 既定サイズ超過時は冒頭のみ返却し警告 |

## 参考資料

- `docs/src/tachyon-apps/llms/agent-api/overview.md`
- `docs/src/tachyon-apps/llms/mcp-api-specification.md`
- 既存 `AttemptApiRequest` 実装

## 完了条件

- [ ] 全ツールが期待通りに動作し、AgentChunk の ToolResult に具体的な結果が流れること
- [ ] 主要な正常系・異常系テストが追加され、`cargo nextest run -p llms --lib` が成功すること
- [ ] 影響範囲のドキュメント更新が完了していること
- [ ] 動作確認レポート（必要時）が作成されていること
