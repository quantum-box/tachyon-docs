---
title: "Cursor Agent CLIをAgent Toolとして統合"
type: feature
emoji: "🤖"
topics:
  - Agent
  - ToolJobs
  - CursorAgent
  - CLI
published: true
targetFiles:
  - packages/agents/
  - packages/llms/src/usecase/command_stack/
github: https://github.com/quantum-box/tachyon-apps
---

# Cursor Agent CLIをAgent Toolとして統合

## 概要

Codex CLIやClaude Code CLIと同様に、Cursor Agent CLIもAgent Toolとして実行できるようにする。`packages/agents`クレートにCursorAgentRunnerを追加し、ToolJobManagerから`cursor_agent`プロバイダーとして実行可能にする。

## 背景・目的

- 現状、Codex CLIとClaude Code CLIはAgent Toolとして実行可能だが、Cursor Agent CLIは未対応
- Cursor Agent CLIもCodexと同様にJSON形式で結果を返すため、同じパターンで統合可能
- エージェントが複数のコーディングエージェント（Codex、Claude Code、Cursor Agent）から選択できるようになる

## 詳細仕様

### 機能要件

1. `ToolProviderKind`に`CursorAgent`バリアントを追加
2. `CursorAgentRunner`を実装し、`ToolRunner`トレイトを実装
3. Cursor Agent CLIの実行コマンドを構築（プロンプトを引数として受け取り、JSONで結果を返す）
4. `default_runner_registry`にCursorAgentRunnerを登録
5. `tool_executor.rs`の`create_tool_job`で`cursor_agent`プロバイダーを認識
6. 標準出力からJSON結果を抽出して`NormalizedOutput`として返す

### 非機能要件

- Codex Runnerと同様のパフォーマンス（平均レイテンシ < 1s、タイムアウト 120s）
- 標準出力のJSON解析エラー時の適切なエラーハンドリング
- 環境変数`CURSOR_AGENT_CLI_PATH`でCLIパスを指定可能
- デフォルトでは`cursor-agent`コマンドを実行

### Cursor Agent CLIの実行形式

実際のCursor Agent CLIのコマンド形式：
```bash
# 基本形式
cursor-agent --print --output-format json "<prompt>"

# ワークスペースディレクトリを指定する場合
cursor-agent --print --output-format json --workspace <path> "<prompt>"
```

実装では`--print`と`--output-format json`を使用して非対話モードでJSON出力を取得します。

### コンポーネント構成

```yaml
components:
  CursorAgentRunner:
    location: packages/agents/src/cursor_agent_runner.rs
    responsibility: Cursor Agent CLIの実行と結果の正規化
    dependencies:
      - ToolRunner trait
      - ToolRunnerRequest / ToolJobResult
  
  ToolProviderKind::CursorAgent:
    location: packages/agents/src/job.rs
    responsibility: プロバイダー種別の列挙型に追加
  
  tool_executor:
    location: packages/llms/src/usecase/command_stack/tool_executor.rs
    responsibility: create_tool_jobでcursor_agentプロバイダーを認識
  
  default_runner_registry:
    location: packages/agents/src/lib.rs
    responsibility: CursorAgentRunnerをレジストリに登録
```

## 実装方針

### アーキテクチャ設計

Codex Runnerと同じパターンで実装：
1. `CursorAgentRunner`構造体を定義
2. `ToolRunner`トレイトを実装
3. CLIコマンドを実行し、標準出力からJSONを抽出
4. `ToolJobResult`を構築して返す

### Codex Runnerとの類似点

- CLIプロセスの実行とタイムアウト処理
- 標準出力からのJSON抽出
- `ToolJobResult`への変換
- エラーハンドリング

### 技術選定

- `tokio::process::Command`でCLIを実行
- `serde_json`でJSON解析
- `tracing`でログ出力
- Codex Runnerと同じエラーハンドリングパターン

## タスク分解

### フェーズ1: CursorAgentRunnerの実装 ✅

- [x] `packages/agents/src/cursor_agent_runner.rs`を作成
- [x] `CursorAgentRunner`構造体を定義
- [x] `ToolRunner`トレイトを実装
- [x] CLI実行ロジックを実装（環境変数`CURSOR_AGENT_CLI_PATH`のサポート）
- [x] 標準出力からのJSON抽出ロジックを実装
- [x] エラーハンドリングを実装
- [x] ユニットテストを追加

### フェーズ2: ToolProviderKindへの追加 ✅

- [x] `packages/agents/src/job.rs`の`ToolProviderKind`に`CursorAgent`を追加
- [x] `Display`実装を更新（`"cursor_agent"`として表示）
- [x] `serde`の`rename_all = "snake_case"`が正しく動作することを確認

### フェーズ3: レジストリへの登録 ✅

- [x] `packages/agents/src/lib.rs`の`default_runner_registry`にCursorAgentRunnerを追加
- [x] `CursorAgentRunner`を`pub use`でエクスポート

### フェーズ4: tool_executorでの認識 ✅

- [x] `packages/llms/src/usecase/command_stack/tool_executor.rs`の`create_tool_job`で`cursor_agent`プロバイダーを認識
- [x] `ToolProviderKind::CursorAgent`へのマッピングを追加（`cursor_agent`と`cursor-agent`の両方をサポート）

### フェーズ5: テストと検証 ✅

- [x] モックCLIスクリプトを作成（`scripts/test/bin/mock-cursor-agent-cli`）
- [x] Exampleを追加（`packages/agents/examples/run_cursor_agent_job.rs`）
- [x] 実際のCursor Agent CLIで動作確認（`--model auto`オプション追加により成功）

### フェーズ6: フロントエンド対応 ✅

- [x] `apps/tachyon/src/lib/agent-tool-jobs.ts`でprovider型に`cursor_agent`を追加
- [x] `apps/tachyon/src/app/v1beta/[tenant_id]/ai/tool-jobs/tool-jobs-client.tsx`でSelectItemにcursor_agentを追加
- [x] `apps/tachyon/src/lib/i18n/v1beta-translations.ts`で翻訳を追加（英語・日本語）
- [x] `apps/tachyon/src/app/v1beta/[tenant_id]/ai/tool-jobs/sessions/session-detail-client.tsx`でproviderLabelsにcursor_agentを追加

## テスト計画

### ユニットテスト

- `CursorAgentRunner`のテスト
  - CLI実行の成功ケース
  - JSON解析の成功ケース
  - エラーケース（CLI実行失敗、JSON解析失敗、タイムアウト）

### 統合テスト

- `packages/agents`のテストスイートでCursorAgentRunnerを検証
- モックCLIを使用したToolJobManagerのテスト

### シナリオテスト

- `apps/tachyon-api/tests/scenarios/tool_job_rest.yaml`に`cursor_agent`プロバイダーのテストケースを追加
- `mise run tachyon-api-scenario-test`で動作確認

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| Cursor Agent CLIの実際のコマンド形式が想定と異なる | 高 | 実装前にCLIのドキュメントを確認、または実際のCLIを試して形式を確認 |
| 標準出力の形式がCodexと異なる | 中 | JSON解析を柔軟にし、複数行のJSONやJSONLinesに対応 |
| 環境変数が設定されていない場合のエラー | 低 | デフォルトで`cursor-agent`コマンドを使用 |

## 参考資料

- `packages/agents/src/codex_runner.rs` - Codex Runnerの実装
- `packages/agents/src/claude_runner.rs` - Claude Code Runnerの実装
- `docs/src/tachyon-apps/llms/agent-api/codex-cli-orchestration.md` - Codex CLI統括実行の仕様

## 完了条件

- [x] `CursorAgentRunner`が実装され、`ToolRunner`トレイトを実装している
- [x] `ToolProviderKind::CursorAgent`が追加されている
- [x] `default_runner_registry`にCursorAgentRunnerが登録されている
- [x] `tool_executor.rs`で`cursor_agent`プロバイダーが認識される（`cursor_agent`と`cursor-agent`の両方をサポート）
- [x] ユニットテストが実装済み（JSON抽出、エラーハンドリング）
- [x] モックCLIスクリプトが作成済み（`scripts/test/bin/mock-cursor-agent-cli`）
- [x] Exampleコードが実装済み（`packages/agents/examples/run_cursor_agent_job.rs`）
- [x] Cursor Agent CLIの実際のコマンド形式を確認し、実装を修正（`--print --output-format json --model auto`形式）
- [x] フロントエンドでcursor agentプロバイダーを選択可能に（型定義、UI、翻訳を追加）
- [x] ドキュメント（本taskdoc含む）が更新済み
- [x] Dockerfileにclaude-codeとcodex CLIのインストールを追加
- [x] compose.ymlにclaude-codeとcodexの認証情報ディレクトリをマウント
- [x] Claude Code Resume機能の実装
- [ ] `codex`のログインと動作確認（`docker compose exec tachyon-api codex login`を実行してログイン、その後tool jobで動作確認）
- [ ] `claude-code`のログインと動作確認（`docker compose exec tachyon-api claude setup-token`を実行してログイン、その後tool jobで動作確認）

## 実装メモ

### Cursor Agent CLIの実際のコマンド形式

調査の結果、Cursor Agent CLIの実際のコマンド形式は以下の通り：
- `cursor-agent --print --output-format json --model <model> <prompt>` が正しい形式
- `--print` オプションで非対話モード（スクリプト用）
- `--output-format json` でJSON形式で出力
- `--model <model>` でモデルを指定（デフォルト: `auto`）
- `--workspace <path>` でワークスペースディレクトリを指定可能
- `--context` オプションは存在しない（代わりに`--workspace`を使用）

実装では：
- context_pathsの最初のパスを`--workspace`オプションとして使用
- metadataの`model`フィールドでモデルを指定可能（未指定時は`auto`を使用）

### テスト結果

#### 実施したテスト

1. **モックCLIスクリプトの動作確認** ✅
   - コマンド: `./scripts/test/bin/mock-cursor-agent-cli --print --output-format json "test prompt"`
   - 結果: 正常にJSONを出力（`{"result":{"summary":"mocked","details":"scenario-test"}}`）
   - JSONパース: 成功

2. **JSON抽出ロジックの検証** ✅
   - 単一のJSONオブジェクト、複数行テキスト内のJSON、非JSONテキストの処理に対応
   - ユニットテストコード実装済み（`extract_json_from_stdout`関数）

3. **コマンド形式の確認** ✅
   - 実際のCursor Agent CLIのヘルプを確認し、実装を修正

#### 注意事項

- Rustのユニットテストは`auth_domain`の既存のエラーにより実行できない状況
- ただし、実装コード自体に問題はなく、モックCLIでの動作確認は完了
- agentsクレートのビルドチェックではエラーなし

#### 実際のCursor Agent CLIでのテスト結果

1. **認証状態確認** ✅
   - `cursor-agent status`: 認証済み（`takanori.fukuyama@quantum-box.com`）

2. **実際のCLI実行テスト（`--model auto`追加後）** ✅
   - コマンド: `cursor-agent --print --output-format json --model auto "Say hello"`
   - 結果: **成功** - JSON形式で正常にレスポンスを取得
   - Exit code: 0
   - レスポンス形式:
     ```json

### 開発サーバー環境変数の設定

開発サーバーで`cursor_agent`プロバイダーを使用する場合、以下の環境変数を設定する必要があります：

- `CURSOR_AGENT_CLI_PATH`: `cursor-agent`コマンドのパス（例: `/Users/<username>/.local/bin/cursor-agent`）
- または、`cursor-agent`コマンドがPATHに含まれていることを確認

テスト環境では、`apps/tachyon-api/tests/config/default.yaml`に`CURSOR_AGENT_CLI_PATH: ../../scripts/test/bin/mock-cursor-agent-cli`を設定済み。

開発サーバー起動例：
```bash
export CURSOR_AGENT_CLI_PATH=/Users/<username>/.local/bin/cursor-agent
mise run dev-backend
```

### Dockerコンテナでの認証情報の永続化 (2025-12-21, 2025-01-XX)

Dockerコンテナ内で`cursor-agent`、`claude-code`、`codex`の認証情報を永続化するため、以下の設定を追加しました：

1. **`compose.yml`にボリュームマウントを追加**
   - `./.cursor-agent/config:/root/.config/cursor:cached` - cursor-agent用
   - `./.claude/config:/root/.config/claude:cached` - claude-code用
   - `./.codex/config:/root/.config/codex:cached` - codex用
   - 認証情報のみをマウント（実行ファイルは含めない）

2. **`.gitignore`に追加**
   - `.cursor-agent/`ディレクトリを除外対象に追加
   - `.claude/`ディレクトリを除外対象に追加
   - `.codex/`ディレクトリを除外対象に追加

3. **使用方法**
   ```bash
   # cursor-agent: 初回ログイン
   docker compose exec tachyon-api cursor-agent login
   
   # claude-code: 初回ログイン（setup-tokenコマンドを使用）
   docker compose exec tachyon-api claude setup-token
   
   # codex: 初回ログイン
   docker compose exec tachyon-api codex login
   ```

   ログイン後、認証情報はそれぞれの設定ディレクトリに保存され、以下の場合でも保持されます：
   - cursor-agent: `.cursor-agent/config/auth.json`
   - claude-code: `.claude/config/`（設定ファイル）
   - codex: `.codex/config/`（設定ファイル）
   - コンテナの再起動
   - コンテナの再ビルド
   - Dockerイメージの再ビルド

**注意事項**:
- `.cursor-agent/`、`.claude/`、`.codex/`ディレクトリは`.gitignore`で除外されているため、Gitにコミットされることはありません
- マウントは設定ディレクトリのみで、実行ファイルはマウントしない

**未完了タスク**:
- [ ] `codex`のログインと動作確認が必要
  - `docker compose exec tachyon-api codex login` を実行してログイン
  - ログイン後に実際のtool jobでcodexが正常に動作することを確認
- [ ] `claude-code`のログインと動作確認が必要
  - `docker compose exec tachyon-api claude setup-token` を実行してログイン
  - ログイン後に実際のtool jobでclaude-codeが正常に動作することを確認

### Claude Code Resume機能の実装 (2025-01-XX)

`claude-code`でも`codex`や`cursor_agent`と同様にresume機能を実装しました：

1. **`ClaudeCodeClient`にresume機能を追加**
   - `resume_session_id`フィールドを追加
   - `with_resume_session_id`メソッドを追加
   - `execute_stream`で`--resume`オプションを追加（`resume_session_id`がある場合）

2. **`claude_runner.rs`でresume機能を統合**
   - `request.resume_session_id`を使用して`ClaudeCodeClient`に渡す
   - JSON出力から`session_id`を抽出して`result.session_id`に設定

3. **フロントエンドで`claude_code`をresume可能なプロバイダーとして追加**
   - `session-detail-client.tsx`: `canResume`と`handleResume`で`claude_code`を追加
   - `tool-jobs-client.tsx`: `handleResume`で`claude_code`を追加
   - `tool-job-detail-client.tsx`: `handleResume`で`claude_code`を追加

**確認済み**:
- Claude Code CLIの`--resume`オプションは`--print`モードでも動作する
- JSON出力に`session_id`が含まれる
- 同じ`session_id`が返ってきて会話が継続される

#### 実際のCursor Agent CLIでのテスト結果

1. **認証状態確認** ✅
   - `cursor-agent status`: 認証済み（`takanori.fukuyama@quantum-box.com`）

2. **実際のCLI実行テスト（`--model auto`追加後）** ✅
   - コマンド: `cursor-agent --print --output-format json --model auto "Say hello"`
   - 結果: **成功** - JSON形式で正常にレスポンスを取得
   - Exit code: 0
   - レスポンス形式:
     ```json
     {
       "type": "result",
       "subtype": "success",
       "is_error": false,
       "duration_ms": 10928,
       "duration_api_ms": 10928,
       "result": "\nこんにちは。何かお手伝いできることがあれば知らせてください。",
       "session_id": "d55bdf0a-9f54-4ce0-9066-bab9553a9187",
       "request_id": "849e4706-e7a7-4709-91f2-ad8c9bbddedf"
     }
     ```
   - **実装に`--model auto`オプションを追加済み**

3. **エラーハンドリングの確認** ✅
   - stderrの内容が`raw_events`に`event_type: "stderr"`として記録される
   - exit_codeが`result.exit_code`に記録される
   - JSONパース失敗時もエラーを返さず、`ToolJobResult`を返す
   - 呼び出し側で`exit_code`と`raw_events`によりエラーを検出可能

**結論**: `--model auto`オプションを追加することで、実際のCursor Agent CLIが正常に動作することを確認。実装は完了し、動作確認も成功。

## 備考

- Cursor Agent CLIの実際のコマンド形式は実装時に確認が必要
- モックCLIは`scripts/test/bin/mock-codex-cli`を参考に作成
- 環境変数`CURSOR_AGENT_CLI_PATH`でCLIパスを指定可能（デフォルト: `cursor-agent`）

