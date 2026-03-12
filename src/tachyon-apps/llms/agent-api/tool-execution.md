# Agent API ツール実行基盤

## 概要
Agent API の標準ツール実行レイヤーを Rust で実装し、エージェントが発行するファイル操作・検索・コマンド実行リクエストを安全かつ即時に処理できるようにした。MCP ツールと同一のストリーミング経路を利用しつつ、ワークスペース制約とエラーレポートを強化している。

## 対応ツール
| ツール | 主な機能 | 追加仕様 |
| --- | --- | --- |
| `write_to_file` | 既存ファイルの上書き保存 | UTF-8 想定。1MB 超過時は先頭のみ書き込み警告を付与。 |
| `append_to_file` | 末尾追記 | 追記結果を差分ダイジェストで返却。 |
| `replace_in_file` | 正規表現置換 | 置換件数とヒットしなかった場合の警告を出力。 |
| `read_file` | ファイル読み出し | 1MB 超過時は先頭のみ返却し、残りバイト数を明示。 |
| `list_directory` / `list_files` | ディレクトリ/ファイル列挙 | ソート済みリストと件数上限を返却。隠しファイルはデフォルト非表示。 |
| `search_files` | テキスト検索 | ヒット上限 (初期値 50) と前後 2 行のコンテキストを返す。打ち切り時は通知。 |
| `execute_command` | シェルコマンド実行 | `bash -lc` で実行し、120 秒タイムアウトと stdout/stderr 分離で返却。 |

## 処理フロー
1. `AttemptApiRequest` が `AgentChunk` からツールイベントを受信。 
2. ルートディレクトリ (`AGENT_WORKSPACE_ROOT`、未設定時はリポジトリルート) を基準に `resolve_path` でパスを正規化。 
3. ワークスペース外アクセスは `errors::permission_denied` を返却。 
4. I/O 集約処理は `tokio::task::spawn_blocking` でオフロードし、SSE 送出スレッドをブロックしない。 
5. 正常終了時は整形済み文字列を `ToolResult` としてストリームへプッシュ。異常時は `ToolError` を構築しつつ、ユーザーに復旧ガイダンスを含むメッセージを返す。

## 安全性とリソース制御
- すべてのファイルアクセスで canonicalize 後にルートプレフィックスを検証。シンボリックリンクはリンク先もチェック。
- コマンド実行時は環境変数の継承を禁止し、ホワイトリスト化した追加変数のみ許可。
- 出力が 4KB を超える場合はサマリー + 末尾トリミングを行い、完全ログは `tracing` に記録。 
- エラーは `ToolError::WorkspaceViolation` / `ToolError::CommandTimeout` など粒度の細かいドメインエラーへマッピング。

## 設定値
```yaml
workspace_root_env: "AGENT_WORKSPACE_ROOT"
max_read_bytes: 1_048_576
search:
  default_context_lines: 2
  default_max_results: 50
command:
  shell: ["bash", "-lc"]
  default_timeout_sec: 120
```

## テレメトリ
- `llms_agent_tool_duration_ms` ヒストグラムでツール種別ごとの処理時間を収集。
- エラー発生時は `tool_name`, `error_kind`, `path` を含む構造化ログを出力。
- コマンド実行の stdout/stderr は 512 文字まで `info`、以降は `debug` 出力へ退避。

## テスト
- `packages/llms/src/usecase/command_stack/chat_stream.rs` のユニットテストで正常系・異常系を網羅。
- `cargo nextest run -p llms --lib` で並列テストを実行し、ファイル操作の整合性とタイムアウト処理を検証。

## 関連タスク
- [Agent API ツール実行基盤の実装](../../tasks/completed/v0.20.0/agent-api-tool-execution/task.md)
