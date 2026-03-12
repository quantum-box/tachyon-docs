# Agent API MCP初期化高速化

## 概要
Agent API の MCP Hub 初期化における冗長接続・逐次処理を廃し、キャッシュと並列化でレスポンス初動を短縮した。標準構成（stdio ×2 + remote ×1）で初期化 P95 1.2 秒以下、キャッシュヒット時 200ms 未満を達成している。

## 改善ポイント
| 項目 | 変更内容 | 効果 |
| --- | --- | --- |
| 冗長接続排除 | `ExecuteAgent` から重複していた `connect_all_servers` 呼び出しを削除し、`McpHub::new_from_json` 内で初期接続を完結 | Stdio プロセス二重起動/二重接続を排除 |
| 並列化 | `connect_all_servers` を `FuturesUnordered` ベースに刷新し、最大同時接続数を 4 に制御 | MCP サーバーが増えても初期化時間が線形増加しない |
| テナントスコープキャッシュ | `DashMap<TenantId, LruCache>` で `Arc<McpHub>` を再利用。キーは `sha256(mcp_hub_config_json)` | 同一設定での連続実行を 500ms → 180ms に短縮 |
| メトリクス整備 | `llms_agent_mcp_init_ms` ヒストグラムと `tracing` ログに `cache_hit`, `server_count`, `duration_ms` を記録 | パフォーマンス可視化と回帰検知 |

## 処理フロー
1. `ExecuteAgent` がテナント ID と MCP 設定 JSON を受け取り、`McpHubCache` へ問い合わせ。
2. キャッシュヒット: TTL (300 秒) 内の `Arc<McpHub>` を返却。
3. ミス時: JSON をハッシュ化し、構築した `McpHub` をキャッシュへ登録。接続処理は並列化。
4. 実行後、接続結果とメトリクスをストリームへ付随出力。失敗サーバーは `Disconnected` として継続。

## キャッシュ仕様
```yaml
key: sha256(mcp_hub_config_json)
scope: tenant
max_entries_per_tenant: 4
ttl_seconds: 300
metrics:
  histogram: llms_agent_mcp_init_ms
  labels: [tenant_id, server_count, cache_hit]
```
- 認証トークン・一時資格情報はキャッシュ対象から除外し、リクエスト毎に再注入。
- 設定差分が生じた場合はハッシュが変わるため自動的に再接続する。

## 並列接続パラメータ
- `max_in_flight = 4`、remote サーバーは 20 秒、stdio サーバーは 30 秒でタイムアウト。
- 失敗サーバーは警告ログ (`warn`) を出しつつ、他サーバーの接続結果に影響しない。

## テスト & 計測
- `packages/llms/src/usecase/command_stack/mcp` 配下のユニットテストでキャッシュ動作と並列接続のリトライを検証。
- `mise run tachyon-api-scenario-test --filter=mcp`（追加シナリオ）で API 経由のレスポンスタイムを測定。
- 改善前後ログを比較し、初期化フェーズの `duration_ms` が平均 65% 短縮済み。

## 関連ドキュメント
- [Agent API ツール実行基盤](./tool-execution.md)
- [MCP Transport Support](../mcp-transport-support.md)

## 関連タスク
- [Agent APIのMCP初期化高速化](../../tasks/completed/v0.20.0/optimize-agent-api-mcp-initialization/task.md)
