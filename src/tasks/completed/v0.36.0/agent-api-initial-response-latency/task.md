---
title: "Agent APIの初回レスポンス遅延の調査と改善"
type: "tech"
emoji: "⚡️"
topics:
  - Agent API
  - Performance
  - LLM
published: true
targetFiles:
  - packages/llms/src/adapter/axum/agent_handler.rs
  - packages/llms/src/usecase/execute_agent.rs
  - packages/llms/src/usecase/match_agent_protocol.rs
  - packages/llms/src/agent/mcp/cache.rs
  - packages/llms/src/agent/mcp/hub.rs
  - packages/iac/src/configuration.rs
  - packages/llms/src/agent/billing_aware.rs
  - packages/llms/src/agent/billing_aware_test.rs
github: https://github.com/quantum-box/tachyon-apps
---

# Agent APIの初回レスポンス遅延の調査と改善

## 概要

Agent API (`/v1/llms/chatrooms/:id/agent/execute`) の初回レスポンスが遅い問題を調査し、初回SSEイベントまでの遅延を減らすための改善策を整理する。

## 背景・目的

- 現状、Agent APIの初回レスポンスが遅く、UI側で「応答待ち」の時間が長い。
- 初回レスポンスまでの遅延は、体感品質・UXに直結する。
- どの前処理がボトルネックなのかを明確化し、改善インパクトの大きい施策から実施する。

## 詳細仕様

### 機能要件

1. 初回レスポンスまでの遅延要因を列挙し、優先度を決める
2. 可能な限り「初回SSEイベントを早く返す」設計に寄せる
3. 遅延を最小化しつつ、課金・権限制御・MCP接続の安全性は担保する
4. 初回SSEイベントまでの計測を実装し、指標を可視化する

### 非機能要件

- 初回SSEイベント（例: `say` or `status`）が 1s 以内を目標
- バックグラウンド処理によるログ監視・トラブルシュート可能性を確保
- 追加のタイムアウトやリトライでAPI全体の信頼性を低下させない

### 仕様のYAML定義

```yaml
latency_targets:
  first_sse_event_ms: 1000
  p95_first_sse_event_ms: 2000
  measurement:
    - metric: agent_first_sse_latency_ms
      source: server
      aggregation: p50/p95
      labels:
        - route: /v1/llms/chatrooms/:id/agent/execute
        - has_mcp_config: true|false
        - agent_protocol_mode: disabled|auto|manual
        - has_saved_memory_intent: true|false
```

### 改善候補（初回レスポンス遅延の要因別）

#### 1. リクエスト前処理の遅延
- Saved Memory判定のLLM呼び出しを同期で行っているため遅延しやすい。
- AgentProtocolの自動選定でLLM呼び出しが発生するため、初回レスポンスが遅くなる。
- これらは「初回SSEイベント以降に非同期で実行」または「キーワードマッチによる事前判定」で回避する。

#### 2. MCP Hub 初期化の遅延
- MCP Hubが `new_from_json` 時に全サーバ接続を実行しており、初回レスポンスまで待たされる。
- 遅延が大きい場合は「初回レスポンス後に遅延接続」へ切り替え、必要な場合のみ接続する。

#### 3. DB/課金系の同期処理
- ExecutionStateの保存、既存履歴の全件取得、課金計算/課金チェックが全て同期で実行されている。
- これらは「初回レスポンスの後に実行できる範囲」を明確化し、並列化 or 遅延実行の余地を作る。

#### 4. Chat履歴取得の負荷
- `find_all` が全件取得のため履歴が長い場合に遅延する。
- 直近N件のみを取得するなど、初回レスポンス重視のサンプリング戦略を検討する。

#### 5. 計測の仕組み不足
- 初回SSEイベントまでの計測がないため、改善施策の効果が確認しづらい。
- サーバ側で「リクエスト受信〜初回SSE送信」の計測を行い、ログ/メトリクス化する。

## 実装方針

### アーキテクチャ設計

- 「初回レスポンスを返してから重い処理を進める」ストリーム主体の設計へ寄せる
- 非同期処理とトレードオフになるため、状態遷移やエラー処理のロギングを強化する

### 技術選定

- tokio::spawn を用いた遅延実行
- 初回イベントを `status` または `say` で即時送信
- 既存のMCPキャッシュやAgentProtocol判定を早期スキップする分岐を追加
- tracing / metrics を用いた初回SSE遅延計測

### TDD（テスト駆動開発）戦略

#### 既存動作の保証
- 既存のAgent APIエンドツーエンドテストを維持
- Saved Memory/AgentProtocolの既存挙動が壊れないことを保証

#### テストファーストアプローチ
- 遅延実行される処理の副作用が残らないことをテスト

#### 継続的検証
- APIの初回レスポンスまでの計測をベンチマークとして残す

## タスク分解

### 主要タスク
- [x] 要件定義の明確化
- [x] 技術調査・検証
- [x] 初回SSE遅延計測の実装
- [x] 実装
- [x] テスト・品質確認
- [ ] ドキュメント更新

## 実装結果

### 改善 #1: Saved Memory Intent判定の遅延排除
**ファイル**: `packages/llms/src/adapter/axum/agent_handler.rs`

- SSE返却前にLLM呼び出し（claude-haiku-4.5）を行っていた `detect_saved_memory_intent()` をstream内に移動
- キーワードマッチ (`matches_saved_memory_keywords`) のみをSSE返却前に実行
- **効果**: SSEレスポンスヘッダ返却までの時間から LLM呼び出し（0.5-2秒）を排除

### 改善 #2: 初回SSE遅延計測の追加
**ファイル**: `packages/llms/src/adapter/axum/agent_handler.rs`

- `request_received_at = Instant::now()` でリクエスト受信時刻を記録
- 初回SSEイベント送信時に `first_sse_latency_ms` と `execute_latency_ms` をログ出力
- 3つの経路（saved_memory, agent_protocol_chunk, agent_stream）それぞれで計測

### 改善 #3: DB/MCP Hub操作の並列化
**ファイル**: `packages/llms/src/usecase/execute_agent.rs`

- 以下の3つの独立I/O操作を `tokio::join!` で並列実行:
  1. MCP Hub初期化（ネットワークI/O、最大の遅延要因）
  2. Saved Memory Clauses取得（DB）
  3. チャット履歴取得（DB）
- **効果**: 直列で合計 0.15-0.6秒 + MCP Hubの時間 → 最大のもの1つ分に短縮

### 改善 #4: AgentProtocol自動選定の最適化
**ファイル**: `packages/llms/src/usecase/match_agent_protocol.rs`

- キーワードスコアリングでトップ候補が明確に突出している場合（スコア≥8.0、2位の2倍以上）はLLM呼び出しをスキップ
- **効果**: 明確なマッチがある場合にLLM呼び出し（1-5秒）を完全排除

### 改善 #5: IacConfigurationProvider にキャッシュ層追加
**ファイル**: `packages/iac/src/configuration.rs`

- `get_config()` にTTLベースのインメモリキャッシュを追加（TTL: 5分、最大100エントリ）
- キャッシュヒット時はDB読み出し（5-10回/リクエスト）を完全にスキップ
- `update_config()` 実行時に該当テナントのキャッシュを無効化
- **効果**: billing pipeline 内の IaC 読み出し 2-3回 → 0回（キャッシュヒット時）、推定 50-150ms 削減

### 改善 #6: Billing Check の遅延実行
**ファイル**: `packages/llms/src/usecase/execute_agent.rs`, `packages/llms/src/agent/billing_aware.rs`

- `execute_agent.rs` から blocking な `check_billing` 呼び出しを削除
- `billing_aware.rs` の最初の Usage SSE イベント処理時に deferred billing check を実行
- **効果**: billing pipeline 539ms のうち、check_billing + cost_calc 部分（推定 300-500ms）を削除

### 改善 #6 のユニットテスト
**ファイル**: `packages/llms/src/agent/billing_aware_test.rs`

- `MockPaymentAppWithBillingCheckFailure` - check_billing が PaymentRequired を返すモック
- `test_deferred_billing_check_fails_on_first_usage` - 残高不足時のエラーハンドリング検証
- `test_deferred_billing_check_only_on_first_usage` - check_billing が最初の Usage イベントでのみ呼ばれることを検証

### 遅延改善の期待効果サマリー

| 改善 | 削減される遅延 | 条件 |
|------|--------------|------|
| #1 Saved Memory判定移動 | 0.5-2秒 | 常に適用 |
| #3 I/O並列化 | 0.15-0.6秒 | 常に適用 |
| #4 AgentProtocol最適化 | 1-5秒 | Auto mode + 明確なキーワードマッチ時 |
| #5 IaCキャッシュ | 50-150ms | キャッシュヒット時 |
| #6 Deferred Billing | 300-500ms | 常に適用 |

## Playwright MCPによる動作確認

- [ ] UI側のAgent実行画面で初回レスポンスの体感改善を確認

## スケジュール

省略（AI Codingにより短期で完了想定）。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 初回レスポンス後に後続処理が失敗する | 高 | エラーイベントの通知とログ強化 |
| 課金チェックのタイミング変更で不整合 | 高 | 「初回レスポンスは即時返すが課金チェック前に実行は開始しない」設計を維持 |
| MCP接続の遅延実行でTool実行時に遅延が発生 | 中 | Tool使用時の接続をキャッシュし、リトライ・ウォームアップを検討 |

## 参考資料

- packages/llms/src/adapter/axum/agent_handler.rs
- packages/llms/src/usecase/execute_agent.rs
- packages/llms/src/usecase/match_agent_protocol.rs
- packages/llms/src/agent/mcp/cache.rs
- packages/llms/src/agent/mcp/hub.rs

## 完了条件

- [x] 初回レスポンス遅延の主要因が洗い出されている
- [x] 改善施策の優先度と実装計画が明文化されている
- [x] テスト・検証手順が記載されている
- [x] IaCキャッシュとDeferred Billing実装完了
- [x] ユニットテスト追加完了
- [x] タスクディレクトリを completed/[新バージョン]/ に移動済み

## 備考

本タスクは「初回レスポンスの遅延改善」を最優先とし、2次的なリファクタリングは後続タスクで扱う。
