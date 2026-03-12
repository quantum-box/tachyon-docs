---
title: "Agent APIからCodex CLIを統括実行する仕組みの追加"
type: feature
emoji: "🤖"
topics:
  - Agent
  - Codex
  - Claude
  - Automation
published: true
targetFiles:
  - apps/agent-api/
  - packages/agents/
  - packages/providers/codex/
  - tools/codex-cli/
github: https://github.com/quantum-box/tachyon-apps
---

# Agent APIからCodex/Claude Code CLIを統括実行する仕組みの追加

## 概要

Agent API が Codex CLI および Claude Code CLI を外部プロセスとして呼び出し、複数の実行を統括管理できるようにするためのタスク。ジョブ生成・監視・出力整形・課金計測を一体化し、エージェントワークフローに両ツールを組み込む。

## 背景・目的

- 現状 Codex/Claude CLI の起動は手作業または個別スクリプト依存で、Agent API から統合制御できない。
- エージェントがサブタスクとして Codex や Claude Code を利用する際に、実行状態と整形済み出力を一元管理したい。
- 課金計測（NanoDollar）や監査ログを Agent API 側で集約し、運用コストとリスクを下げる。

## 詳細仕様

### 機能要件

1. Agent API へ Codex/Claude 実行ジョブの作成・取得・停止 API（REST/GraphQL 両対応）を追加する。
2. Agent API 内部に各 CLI の実行ランナーを実装し、非同期ジョブとして起動・監視する。
3. CLI 実行ログ（標準出力/標準エラー）と成果物ファイルのメタ情報を永続化し、AI が消費しやすい JSON/構造化レスポンスに整形して返す。
4. CLI オプション（Codex: `--json`, `--output-schema`; Claude: `--print --output-format json|stream-json` 等）を活用し、応答フォーマットを統一する。
5. 実行時間・トークン情報を NanoDollar 単位で集計し、Billing コンテキストへ消費イベントを送信する。
6. Agent API 側のタスク定義から CLI への入力（プロンプト、コンテキストファイル、環境変数）を安全に受け渡す。
7. 運用者向けにジョブ再実行、キャンセル、並列制御の管理機能を提供する。

### 非機能要件

- 同時実行上限とキューイングを備え、サーバーリソースを保護する。
- 連続失敗時はサーキットブレーカー的に Codex 呼び出しを停止し、アラートを発火する。
- 実行ログは 14 日間保管し、S3 互換ストレージへオフロード可能とする。
- API 認可は既存の Multi-Tenancy ポリシーで制御し、Executor 情報を必須化する。
- CLI 出力は JSONL/JSON を標準化し、Agent API で構造化変換・正規化する。
- 実装は CLI 実行部分を抽象化し、将来的なツール追加時も最小改修で対応可能とする。

### コンテキスト別の責務

```yaml
contexts:
  agent_api:
    description: "Codex 実行ジョブの受付と状態管理"
    responsibilities:
      - GraphQL/REST エンドポイントの提供
      - ジョブキューと状態遷移の管理
      - 永続化層へのメタデータ保存
  codex_provider:
    description: "Codex CLI 実行アダプタ"
    responsibilities:
      - コマンドライン引数生成と検証
      - 標準入出力ストリームの取り扱い
      - エラー分類とリトライ制御
  claude_provider:
    description: "Claude Code CLI 実行アダプタ"
    responsibilities:
      - `claude --print` 系オプションの管理
      - stream-json の整形とリアルタイムイベント供給
      - モデル選択・権限モードの制御
  billing:
    description: "NanoDollar 課金連携"
    responsibilities:
      - 実行コスト計測
      - BillingPolicy との連携
      - 利用制限・残高チェック
```

### 仕様のYAML定義

```yaml
agent_command_profiles:
  - id: "codex-cli-default"
    executable: "codex"
    args:
      - "exec"
      - "--json"
      - "--output-schema"
      - "{{ schemas.codex_default }}"
    env:
      CODEX_API_KEY: "{{ secrets.codex_api_key }}"
    resource_limits:
      timeout_sec: 180
      max_memory_mb: 2048
  - id: "claude-cli-default"
    executable: "claude"
    args:
      - "--print"
      - "--output-format"
      - "stream-json"
      - "--include-partial-messages"
      - "--model"
      - "claude-sonnet-4"
    env:
      CLAUDE_API_KEY: "{{ secrets.claude_api_key }}"
    resource_limits:
      timeout_sec: 240
      max_memory_mb: 2048

api_contract:
  createJob:
    method: POST
    path: "/v1/agent/tool-jobs"
    request:
      provider: ["codex", "claude"]
      prompt: string
      context_paths:
        - string
      output_profile: string
      executor:
        operator_id: string
        user_id: string
    response:
      job_id: string
      status: "queued"
  getJob:
    method: GET
    path: "/v1/agent/tool-jobs/{job_id}"
    response:
      job_id: string
      provider: string
      status: ["queued", "running", "succeeded", "failed"]
      normalized_output:
        format: "json" | "text" | "events"
        body: object
      raw_events:
        - type: string
          payload: object
      artifacts:
        - type: "file"
          url: string
      billing:
        estimated_nanodollar: integer
```

### スケジュール

- ✅ フェーズ1（設計・PoC）: 2025-11-01 〜 2025-11-05
- ✅ フェーズ2（実装）: 2025-11-06 〜 2025-11-15
- 🔄 フェーズ3（検証・ドキュメント）: 2025-11-16 〜 2025-11-20

## 実装方針

- Agent API に外部ツール実行サービスを新設し、Codex/Claude をプラグインとして実装する。
- 非同期実行は既存のキュー基盤があれば再利用し、未整備の場合は `tokio::task` + 永続キューで構築する。
- CLI 実行は Tokio の `Command` を利用し、リアルタイム出力をイベントとして記録する。
- `ToolRunner` トレイトを定義し、`CodexRunner` と `ClaudeRunner` を実装する。
- Codex は `--json` + `--output-schema` を利用し、最後のメッセージを JSON として受け取る。必要に応じて `--output-last-message` でファイル出力を補助する。
- Claude Code は `--print --output-format stream-json` を利用し、`assistant` イベントを JSON としてパースして正規化する。
- NanoDollar 計測は `BillingPolicy` を活用し、各実行完了時に課金イベントを発火する。
- 実行プロファイルは構成ファイルで管理し、環境ごとに CLI パラメータを切り替えられるようにする。

### リポジトリ構成（2025-11-04 更新）
- ✅ `apps/agent-api/`: Axum ベースの API バイナリを新設し、ジョブ作成/取得/停止 REST エンドポイントを提供（GraphQL 統合は今後対応）。
- ✅ `packages/agents/`: エージェント向けツール統括のドメイン層を切り出し、ジョブマネージャ・永続化・課金連携を実装するライブラリとして追加（初期版を作成）。
- ✅ `packages/providers/codex/`: Codex CLI をラップするプロバイダー層を追加。CLI 実行・JSON 正規化の最小実装を追加済み。
- 📝 `tools/codex-cli/`: Codex 向けの設定テンプレートや実行スクリプト、CI 用のラッパーを配置し、バージョンロックと配布手順を文書化する。
- 📝 既存 `packages/llms` の `ExecuteAgent` はチャット主導のストリーム処理に留め、CLI オーケストレーションは新 `packages/agents` から API 経由で呼び出すよう責務分離する。

## タスク分解

### フェーズ1: 設計・PoC ✅ (2025-11-04 完了)
- [x] 既存 Agent API と Codex/Claude 利用シーンの現状調査
- [x] Codex CLI オプション調査（`--json`, `--output-schema`, `--output-last-message` 等）
- [x] Claude CLI オプション調査（`--print`, `--output-format stream-json`, `--max-turns`, `--permission-mode`, `--verbose` などを整理し Runner へ反映）
- [x] 両 CLI の出力整形 PoC と正規化フォーマット案作成（メタデータで CLI フラグを差し替え、フェイク CLI スクリプトを用いた統合テストで JSON 正規化を検証済み）
- [x] セキュリティ/権限モデルの整理（`executor.operator_id` 必須チェックを Agent API で実装し、Claude 実行時は `ANTHROPIC_API_KEY` の有無を検証するフックを追加）

実装メモ (2025-11-04):
- `packages/llms` の既存エージェント実行フローは SSE ストリーム中心で Codex/Claude CLI 連携は未着手。`agent_handler.rs` がユースケース `ExecuteAgent` を直接呼び出している。
- `packages/providers/claude-code` は存在するが Codex 向けプロバイダーや CLI アダプタは未実装。新たな `ToolRunner` 相当の抽象化が必要。
- 新規クレート `packages/agents` / `packages/providers/codex` を追加し、Codex/Claude CLI を呼び出すランナーとインメモリジョブ管理の骨格を実装。API 統合・課金連携は未着手。
- Codex Runner は metadata で `extra_args` / `output_schema` / `output_last_message` / `prompt_mode` を受け取れるよう拡張済み。Claude Code 側は CLI オプション調査後に同等拡張予定。
- `packages/agents` の Claude Runner も `timeout_sec` / `permission_mode` / `max_turns` / `output_format` メタデータに対応。CLI 引数は実行前に `--permission-mode` / `--max-turns` / `--output-format` を付与する実装へ更新。
- `apps/agent-api/src/tests.rs` にフェイク Codex CLI スクリプトを用いたエンドポイントテストを追加し、実際の外部プロセス呼び出し経路を確認済み。
- 2025-11-04 時点のテスト: `cargo test -p agents --features claude`, `cargo test -p agents --features axum`, `cargo test -p codex-provider` を実行し、Codex/Claude Runner と Tachyon API 経由の REST ルーターが期待通りに動作することを確認。
- `AGENT_JOB_STORE_DIR` を設定すると、ジョブ完了時に `packages/agents/src/storage.rs` が `{job_id}.json` を生成するため、成果物メタデータや計測結果を後続バッチで再利用できる。

### フェーズ2: 実装 ✅ (2025-11-05 完了)
- [x] Agent API に共通ツールジョブ API を追加（`packages/agents` の `axum` feature で REST ルーターを実装し、`tachyon-api` から `/v1/agent/tool-jobs` を提供）
- [x] CodexRunner 実装とジョブキュー統合（metadata 対応、Agent API から呼び出せる基盤を整備）
- [x] ClaudeRunner 実装とジョブキュー統合（CLI オプションは拡張済み。Agent API から実行でき、フェイク CLI を用いた統合テストで確認）
- [x] CLI 出力・成果物の永続化処理追加（`AGENT_JOB_STORE_DIR` 指定でジョブスナップショットを JSON 保存）
- [x] 正規化レスポンス整形レイヤーの実装（`NormalizedOutput` で `format/body` に統一）
- [x] NanoDollar 課金連携実装（推定/実績コストを `ToolJobResult.billing` に設定）

### フェーズ3: 検証・ドキュメント 🔄 (2025-11-05 着手)
- [x] フロントエンド仕上げ（`apps/tachyon/src/lib/i18n/v1beta-translations.ts`, `sidebar-config.ts`, `ai/tool-jobs/` 配下で翻訳・導線・SWR を整備）
- [x] Rust テストコマンド実行（`cargo test -p agents --features claude`, `cargo test -p agents --features axum`, `cargo check -p tachyon-api`）
- [x] TypeScript チェック＆Lint 実行（`yarn lint --filter=tachyon`, `yarn ts --filter=tachyon`）
- [x] 実 Codex CLI で `codex exec --json 'Say hello in 3 words'` を実行しレスポンス整合性を確認
- [x] `mise run test` を用いたフルスイート実行
- [x] `mise run ci` を実行し、CI 相当のチェックとlint/clippyを完了
- [x] Codex CLI 実行例 (`cargo run -p agents --example run_codex_job`) を追加し、実ツール経路の動作確認手順を整備
- [x] LLMS コマンドスタックに `create_tool_job` ツールを追加し、エージェントから Codex/Claude CLI を起動できるようにした
- [x] Agent API の `tool_access` フラグを追加し、`execute_agent` / `resume_agent` の双方で Filesystem / Command / create_tool_job の ON/OFF を検証
- [x] tachyon-api シナリオによる API 動作確認（`mise run tachyon-api-scenario-test` 実行済み）
- [x] verification-report.md 更新（2025-11-05 実行ログと CLI 検証を追記）
- [x] 利用ガイドと README 追記

補足: シナリオテスト用に `scripts/test/bin/mock-codex-cli` を追加し、`apps/tachyon-api/tests/config/default.yaml` で `CODEX_CLI_PATH` をモックへ切り替え。新シナリオ `apps/tachyon-api/tests/scenarios/tool_job_rest.yaml` では `/v1/agent/tool-jobs` の作成・取得・一覧・キャンセルをカバーした。

## テスト計画

- `ToolRunner` をモック化したユニットテストで成功・失敗パターンを網羅。
- Agent API 経由で Codex/Claude ジョブを作成し、完了まで実行するシナリオテストを `apps/tachyon-api/tests/scenarios/` へ追加。
- 負荷テストとして同時 10 ジョブでのリソース使用量を計測し、スロットル設定を検証。
- NanoDollar 計測が Billing コンテキストと一致するかを自動テストで確認。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| Codex CLI の仕様変更 | 中 | バージョン固定と定期的な互換性テスト |
| 同時実行によるリソース逼迫 | 高 | 同時実行上限とキュー制御の実装 |
| 実行ログに機密情報が含まれる | 高 | ログマスキングとアクセス制御の強化 |
| 課金計測の不整合 | 中 | Billing テストとメトリクス監視で検知 |

## 参考資料

- Codex CLI ドキュメント（社内 Confluence）
- Claude Code CLI ドキュメント（公式リファレンス）
- `docs/src/architecture/nanodollar-system.md`
- `docs/src/tachyon-apps/tools/tachyon-code.md`

## 完了条件

- [x] Agent API から Codex/Claude CLI を統括実行できる
- [x] ジョブ状態・ログ・成果物を API で参照できる
- [x] NanoDollar 課金が正しく連携される
- [x] テストおよび verification-report.md が整備されている
- [x] 関連ドキュメントを更新済み

## 備考

- Codex 以外の CLI 追加を想定し、実行プロファイルの一般化を優先する。
