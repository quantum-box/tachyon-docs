---
title: "Agent APIのMCP初期化高速化"
type: "tech"
emoji: "⚡"
topics: ["agent-api", "mcp", "performance", "rust"]
published: true
targetFiles: [
  "packages/llms/src/usecase/command_stack/mcp/hub.rs",
  "packages/llms/src/usecase/command_stack/mcp/mod.rs",
  "packages/llms/src/usecase/execute_agent.rs",
  "docs/src/tachyon-apps/llms/agent-api"
]
github: "https://github.com/quantum-box/tachyon-apps"
---

# Agent APIのMCP初期化高速化

## 概要

Agent APIでMCP設定を含むリクエストを処理する際、MCP Hubの初期化と接続確立に数秒以上を要しており、チャット開始から最初のレスポンスまでの体感遅延が大きい。MCP初期化パスのボトルネックを特定し、冗長接続の解消とキャッシュ/並列化による高速化を図る。

## 背景・目的

### なぜ必要か
- `ExecuteAgent`ユースケースで毎回`McpHub::new_from_json` → `connect_all_servers`を同期実行しており、MCPサーバー数に比例して初期化が遅延。
- 現状コードでは`new_from_json`内部で接続済みのサーバーに対し、`execute()`側で再度`connect_all_servers`を呼び出しており、Stdioプロセス起動やSSE接続を二重実行。
- 接続は逐次処理で並列化されていないため、複数サーバーを登録すると遅延が累積。

### 解決したい課題
- MCP初期化の冗長処理を排除し、1回の接続確立に統一する。
- 同一設定での連続実行時に再初期化を避け、ウォームキャッシュを活用できる設計に変更。
- 接続処理を非同期並列化し、Stdio/リモート双方で初期化時間を短縮。

### 期待される成果・メリット
- MCP設定付きエージェント実行のレスポンスタイム短縮（初回3秒→1秒台、キャッシュヒット時500ms未満を目標）。
- MCPサーバーの多重起動によるリソース消費・エラーを削減。
- 将来的なMCPサーバー増加に耐えられるスケール性を確保。

## 詳細仕様

### 機能要件

1. `ExecuteAgent`でのMCP初期化は1回だけ行い、同一リクエスト内で追加接続を実行しない。
2. 同一`mcp_hub_config_json`で短時間に複数実行する場合、既存接続を再利用できるキャッシュレイヤを追加する（LRUもしくはTTL管理）。
3. MCPサーバーの接続・ツール一覧取得を可能な限り並列化し、失敗時は個別サーバーのみ`Disconnected`扱いにする既存仕様を維持。
4. 初期化時間を計測するメトリクス（例: `llms_agent_mcp_init_ms`ヒストグラム）を追加し、`tracing`ログにも計測結果を出力。
5. 設定エラー時は既存と同等のHTTPレスポンスおよびエラーメッセージを維持。

### 非機能要件

- パフォーマンス: テスト用`mcp_servers`（stdio 2件 + remote 1件）で初期化時間 P95 ≦ 1200ms。キャッシュヒット時 ≦ 200ms。
- セキュリティ: キャッシュされた設定はテナントスコープ内でのみ再利用し、認証ヘッダー・トークンを共有しない。
- 保守性: `McpHub` APIの非同期境界は現行ユースケースとの互換性を維持し、主要ロジックに単体テストを追加。

### コンテキスト別の責務

- **LLMSコンテキスト**: MCP Hubライフサイクル管理、高速化実装、計測ロジックの追加。
- **Catalog/Paymentコンテキスト**: 変更なし。既存課金・見積もりフローを利用。
- **Aichatフロント**: 変更なし。APIレスポンス遅延の改善を受けるのみ。

### 仕様のYAML定義

```yaml
mcp_init_metrics:
  histogram_name: "llms_agent_mcp_init_ms"
  labels:
    - tenant_id
    - server_count
    - cache_hit
  objectives:
    p50: 800
    p95: 1200
    p99: 1800

cache_policy:
  key: sha256(mcp_hub_config_json)
  scope: tenant
  ttl_seconds: 300
  eviction: lru
  max_entries_per_tenant: 4

parallel_connection:
  max_in_flight: 4
  error_handling: "log_warn_and_continue"
  timeout_seconds:
    stdio: 30
    remote: 20
```

## 実装方針

### 技術的アプローチ

1. **計測基盤の追加**: `ExecuteAgent`で`McpHub`初期化前後を`tracing::info_span`で囲み、`metrics`クレートへヒストグラムを記録。
2. **冗長接続の排除**: `McpHub::new_from_json`の戻り値をそのまま利用し、`execute()`側での二重`connect_all_servers()`呼び出しを削除。必要に応じてAPIを明示的に`ensure_connected()`へリネーム。
3. **並列接続**: `McpHub::connect_all_servers`内の逐次ループを`FuturesUnordered`で並列化し、同時接続数を制限できる仕組みを導入。
4. **キャッシュレイヤ**: テナントスコープの`DashMap` + LRUで`Arc<McpHub>`を管理し、設定ハッシュ一致時は再利用。無効化/TTL切れの場合は再初期化。
5. **エラーハンドリング整理**: 並列化後も個別サーバーの失敗は全体を止めない設計を維持しつつ、エラー内容を接続結果に反映。
6. **ドキュメント更新**: Agent APIドキュメントに初期化キャッシュ仕様とメトリクス出力を追記。

### タスク分解（進捗マーカー）

#### フェーズ1: 現状把握と計測 🔄
- [ ] ローカルでMCP設定付きサンプルを実行し、現行初期化時間を計測
- [x] ログとコードレビューで冗長接続パス・同期処理箇所を整理
- [ ] タスクドキュメントにベースライン値と課題点を追記

#### フェーズ2: 冗長接続解消と並列化 🔄
- [x] `ExecuteAgent`からの二重`connect_all_servers`呼び出しを削除し、テストを更新
- [x] `McpHub::connect_all_servers`を並列化し、最大同時接続数を制御可能にする
- [ ] Stdio/Remote双方の接続ユニットテストを追加

#### フェーズ3: キャッシュ導入とメトリクス 🔄
- [x] テナント別キャッシュレイヤを実装し、TTL/エビクション戦略を適用
- [x] メトリクス・ログに初期化結果（所要時間、ヒット有無、サーバー数）を記録
- [ ] 改善結果をタスクドキュメントとAgent APIドキュメントに反映
- [x] MCP設定保存APIで接続検証・ステータスを返却
- [x] MCP設定エディタから接続テストボタンとステータス表示を利用可能にする

## スケジュール

| フェーズ | 期限 (目安) | 内容 |
|----------|--------------|------|
| フェーズ1 | 2025-10-28 | ベースライン計測とボトルネック特定、改善案確定 |
| フェーズ2 | 2025-10-29 | 再接続解消・並列接続の実装と単体テスト整備 |
| フェーズ3 | 2025-10-30 | キャッシュ導入・メトリクス追加・動作確認 |

## テスト計画

- `packages/llms/src/usecase/command_stack/mcp`配下のユニットテストを拡充し、接続並列化とキャッシュ動作を検証。
- `apps/tachyon/src/lib/agent-api.test.ts`でMCP設定付きパスのモックテストを追加/更新。
- `mise run tachyon-api-scenario-test`でMCP設定取得/保存APIのレグレッションを確認。
- 必要に応じてPlaywrightシナリオでレスポンス初動の体感改善を確認（時間計測含む）。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| キャッシュのキー衝突により異なるテナント設定が共有される | 高 | テナントID＋設定ハッシュでスコープを分離し、TTLを短く設定 |
| 並列接続化に伴うリモートMCPサーバーの同時接続制限 | 中 | 同時実行数を設定で制御し、失敗時は逐次リトライ |
| 既存APIレスポンス構造の変更によるフロント影響 | 低 | レスポンスペイロードは変えず、内部メトリクスのみ追加 |
| キャッシュウォーミングにより古い設定が残る | 中 | TTL短縮と手動クリア関数で対応、構成変更時はハッシュが変わる設計 |

## 参考資料

- `docs/src/tachyon-apps/llms/agent-api/overview.md`
- `docs/src/tachyon-apps/llms/agent-api/ask-followup-question-streaming.md`
- `packages/llms/src/usecase/command_stack/mcp/hub.rs`
- Model Context Protocol実装ガイド (internal memo)

## 完了条件

- [ ] MCP初期化時間のベースラインと改善後結果を計測し、タスクドキュメントに記録
- [ ] 再接続防止・並列化・キャッシュのテストを追加し`mise run test`が成功
- [ ] `docs/src/tachyon-apps/llms/agent-api/overview.md`に初期化仕様とキャッシュ設計を追記
- [ ] 動作確認レポートにUIレスポンス改善を記載
- [ ] CI (`mise run ci-node`, `mise run ci`) が成功
