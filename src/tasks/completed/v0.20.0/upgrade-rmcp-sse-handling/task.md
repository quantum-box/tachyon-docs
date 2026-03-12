title: "rmcp SSEハンドリング改善"
type: tech
emoji: "⚙️"
topics:
  - rmcp
  - mcp
  - rust
  - sse
published: false
targetFiles:
  - Cargo.toml
  - Cargo.lock
  - docs/src/tasks/improvement/upgrade-rmcp-sse-handling/task.md
  - docs/src/tasks/improvement/upgrade-rmcp-sse-handling/verification-report.md
github: https://github.com/quantum-box/tachyon-apps
---

# rmcp SSEハンドリング改善

## 概要

rmcp crate を最新版に更新し、SSEイベントのJSONデシリアライズ失敗による警告ログ連発と処理停止の不具合を解消する。

## 背景・目的

- 現状は rmcp `0.1.5` (commit `22134eb`) を採用しており、SSEフレームに空行やcontrol eventが含まれると `expected value at line 1 column 1` 警告が秒間発生し処理が前に進まない。
- MCPクライアントがSSE経由でClaude Codeなどと通信する際にストリームがハングし、ユーザー体験が大きく損なわれている。
- upstream `main` (version `0.8.3`, commit `34f4823`) ではcontrol eventと非JSONフレームを無視する修正が入っており、これを取り込むことで安定動作を期待できる。

## 詳細仕様

### 機能要件

1. `rmcp` および `rmcp-macros` の依存を upstream `main` の安定コミット (`34f482375c4548a630a480dd9f7c0de74681fab1`) に更新する。
2. Cargo.lock を更新しビルドを通す。依存API変更があれば追従する。
3. 既存のMCPクライアント経由の処理（SSEベースのタスク）が警告なく継続することを確認する。
4. ログ出力レベルが `debug` に変更されたことを確認し、過剰な警告ログが出ない。

### 非機能要件

- ビルド時間とランタイムコストの増大を招かないこと。
- 依存更新によるAPI破壊がない場合でも、将来のrmcp更新に追従しやすい設定（`rev`固定）にする。
- ログベース監視のノイズが減少し、SREの負荷を下げる。

### コンテキスト別の責務

```yaml
contexts:
  tools:
    description: "MCPクライアント/CLIツールでrmcpを利用するレイヤー"
    responsibilities:
      - SSE経由のモデル応答取得
      - ログ出力とエラーハンドリング
  developers:
    description: "開発者のCLI利用体験"
    responsibilities:
      - 連続実行時の安定性確保
      - ログ監視による異常検知
```

### 仕様のYAML定義

```yaml
dependencies:
  rmcp:
    source: "git"
    repo: "https://github.com/modelcontextprotocol/rust-sdk.git"
    rev: "34f482375c4548a630a480dd9f7c0de74681fab1"
    crates:
      - rmcp
      - rmcp-macros
  rationale:
    - "SSE control eventを扱う修正が rev 34f4823 に含まれる"
    - "Cargo.lockも同revに固定することで再現性を確保"
```

## 実装方針

### アーキテクチャ設計

- 依存の更新のみでアプリケーション構造変更は不要。
- `cargo` ワークスペース全体で共通の`git`依存を参照するため、ルート `Cargo.toml` のパッチ適用のみで完結させる。
- SSEクライアントの振る舞いは上流修正に任せ、ローカルコードによるフォールバック実装は追加しない。

### 技術選定

- `git`依存で固定revを指定し、想定外の更新混入を防ぐ。
- 上流コミットを直接指す理由は crates.io 未リリースの修正を取り込むため。

### TDD（テスト駆動開発）戦略

#### 既存動作の保証
- 既存のユニット/統合テスト (`mise run check`, `mise run ci-node` 相当) を実行し回帰がないことを確認。
- 必要に応じて SSE ログ検証用の手動チェックを追加で行い taskdoc に記録する。

#### テストファーストアプローチ
- 前提変更が依存更新のみであるため、既存テスト群をグリーン維持する方針を優先。

#### 継続的検証
- PR作成時にCIが最新依存で動作することを確認。
- 2025-10-29 時点で `mise run check` を実行し成功を確認。
- 2025-10-29 時点で `mise run ci` も通過。

## タスク分解

### 主要タスク
- [x] 要件定義の明確化
- [x] 技術調査・検証（upstream差分確認）
- [x] 実装（依存更新・ビルド）
- [x] テスト・品質確認（チェックコマンド、警告ログ確認）
- [x] ドキュメント更新（動作確認レポート、成果追記）

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] 実装完了後の初回動作確認（必要なSSE利用フローに対する手動/ログチェック）
- [ ] PRレビュー前の最終確認

### 動作確認チェックリスト

- [ ] SSEを利用するツール実行時に警告ログが発生しない（`rmcp::transport::common::client_side_sse`）。
- [ ] SSEストリームが再接続後もイベントを継続受信する。
- [ ] 必要に応じてPlaywright MCPでブラウザ連携ツールを実行し安定動作を確認する。

※ 今回のタスクは依存更新中心のため、UI観点の詳細チェックは必要に応じて追加する。

## スケジュール

- 2025-10-29: 依存更新・ビルド確認・taskdoc反映完了
- 2025-10-30 目処: SSEログ確認（必要時）

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| rmcp upstream の後方互換性変更で追加修正が必要になる | 中 | `rev`固定での取り込みを継続し、変更点はtaskdocに追記する |
| SSEクライアントの挙動が環境依存で変化する | 中 | ローカルでログをモニタし、問題時は旧revへ切り戻すための手順を記録 |

## 参考資料

- rmcp `client_side_sse` 改修コミット `34f4823`
- `packages/llms/src/usecase/command_stack/mcp/hub.rs` リモート接続ロジック
- 以前の警告ログ（`rmcp::transport::common::client_side_sse`）

## 完了条件

- [x] 依存更新とビルド (`mise run check`) が成功している
- [ ] 動作確認レポートでSSEハンドリング改善を確認済み
- [ ] PRレビューを経て main へマージ済み
