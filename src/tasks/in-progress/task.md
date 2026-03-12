# Tachyon Ops: シナリオテスト マネージドサービス

## 概要
muon（旧test_runner）をベースに、シナリオテスト結果をTachyon Opsダッシュボードで管理・可視化するマネージドサービスを実装。

## 実装内容

### Phase 0: muon CLI の独立化・配布準備 ✅

#### Step 0-1: test_runner → muon リネーム ✅
- `packages/test_runner/` → `packages/muon/` にリネーム
- バイナリ名を `runner` → `muon` に変更
- 全ワークスペース依存を更新

#### Step 0-2: model.rs に Serialize/Deserialize 追加 ✅
- `TestResult`, `StepResult`, `RequestInfo`, `ResponseInfo` に `#[derive(Serialize, Deserialize)]` 追加
- `TestRunReport` 構造体を新規追加（API送信用ペイロード）
- `CiMetadata` 構造体を新規追加（CI環境情報）

#### Step 0-3: API クライアントモジュール追加 ✅
- `packages/muon/src/api_client.rs` 新規作成
- `TachyonOpsClient` 構造体（api_url, api_key, operator_id, reqwest::Client）
- `submit_report()` メソッド（3回リトライ、exponential backoff）
- `x-operator-id` ヘッダーサポート

#### Step 0-4: CLI clap化 + API送信機能 ✅
- 手動CLIパーサー → `clap::Parser` derive に置換
- `--api-url`, `--api-key`, `--operator-id`, `--base-url` オプション追加
- 環境変数対応（`TACHYON_OPS_API_URL` 等）
- CI環境変数の自動検出

#### Step 0-5: リリースワークフロー ✅
- `.github/workflows/release-muon.yml` 作成
- x86_64-linux, aarch64-linux, aarch64-darwin の3ターゲット

#### Step 0-6: GitHub Actions カスタムアクション ✅
- `.github/actions/scenario-test/action.yml` 作成
- バイナリダウンロード → テスト実行 → レポートアップロード

### Phase 1: サーバーサイド（結果受信API + DB + ダッシュボード） ✅

#### Step 1-1: scenario_report ドメインクレート ✅
- `packages/scenario_report/domain/` 作成
- `TestRun` エンティティ（`sr_` + ULID）
- `ScenarioResult` エンティティ（`scr_` + ULID）
- `TestRunRepository` trait

#### Step 1-2: DBマイグレーション ✅
- `scenario_test_runs` テーブル（集計値、CI metadata、GitHub check run ID）
- `scenario_results` テーブル（ステップ結果JSON）
- TiDB互換DDL（別マイグレーションファイルに分離）

#### Step 1-3: Repository SQLx 実装 ✅
- `SqlxTestRunRepository` 実装
- DB名: `tachyon_apps_scenario_report`

#### Step 1-4: Usecase 実装 ✅
- `SubmitTestRun` - レポート受信 → TestRun保存 → ScenarioResult保存
- `GetTestRun` - ID指定で詳細取得
- `ListTestRuns` - operator別一覧（ページネーション）

#### Step 1-5: REST handler + router ✅
- `POST /v1/ops/scenario-reports` - テスト結果受信（201 Created）
- `GET /v1/ops/scenario-reports/:run_id` - 詳細取得
- `GET /v1/ops/scenario-reports` - 一覧取得

#### Step 1-6: tachyon-api 統合 ✅
- `apps/tachyon-api/src/di.rs` に `scenario_report_app` 追加
- `apps/tachyon-api/src/router.rs` にルーター統合
- `scripts/seeds/n1-seed/008-auth-policies.yaml` にポリシー追加
- `scripts/init/init.sql` にDB作成追加

#### Step 1-7: シナリオテスト ✅
- `apps/tachyon-api/tests/scenarios/scenario_report_rest.yaml` 作成
- submit → get → list の一連フロー検証

#### Step 1-8: ダッシュボード UI ✅
- `apps/tachyon/src/app/v1beta/[tenant_id]/ops/scenario-tests/` 作成
- テスト結果一覧ページ
- テスト結果詳細ページ（シナリオ展開、ステップごとの結果表示）
- サイドバーに「Ops > Scenario Tests」メニュー追加

### Phase 2: run_tests.rs からの自動レポート送信 ✅

#### テスト結果収集 ✅
- `execute_scenarios()` が `Vec<TestResult>` を返すように変更
- テスト成功・失敗に関わらず結果を収集

#### レポート送信 ✅
- `submit_report()` 関数追加
- `ReportConfig` 構造体（enabled, api_key, api_url, operator_id）
- `detect_ci_metadata()` でGitHub Actions / ローカルgit環境を自動検出
- テスト設定ファイル（default.yaml, docker.yaml, ci.yaml）に `report` セクション追加

## 主要な変更ファイル

### 新規パッケージ
- `packages/muon/` - シナリオテストランナー（旧test_runner）
- `packages/scenario_report/` - シナリオレポート受信・管理
- `packages/scenario_report/domain/` - ドメインモデル

### 新規ファイル（主要）
| ファイル | 内容 |
|---------|------|
| `packages/muon/src/api_client.rs` | Ops API クライアント |
| `packages/scenario_report/domain/src/test_run.rs` | TestRun エンティティ |
| `packages/scenario_report/domain/src/scenario_result.rs` | ScenarioResult エンティティ |
| `packages/scenario_report/domain/src/repository.rs` | Repository trait |
| `packages/scenario_report/src/usecase/submit_test_run.rs` | レポート受信 Usecase |
| `packages/scenario_report/src/usecase/get_test_run.rs` | 詳細取得 Usecase |
| `packages/scenario_report/src/usecase/list_test_runs.rs` | 一覧取得 Usecase |
| `packages/scenario_report/src/adapter/axum/` | REST ハンドラー |
| `packages/scenario_report/src/adapter/gateway/` | SQLx Repository |
| `apps/tachyon-api/tests/scenarios/scenario_report_rest.yaml` | シナリオテスト |
| `.github/actions/scenario-test/action.yml` | GitHub Actions |
| `.github/workflows/release-muon.yml` | リリースWF |
| `apps/tachyon/src/app/v1beta/[tenant_id]/ops/` | ダッシュボードUI |

### 変更ファイル（主要）
| ファイル | 変更内容 |
|---------|---------|
| `apps/tachyon-api/tests/run_tests.rs` | テスト結果収集・レポート送信 |
| `apps/tachyon-api/src/di.rs` | scenario_report_app DI追加 |
| `apps/tachyon-api/src/router.rs` | ルーター統合 |
| `apps/tachyon-api/src/main.rs` | DB初期化追加 |
| `scripts/init/init.sql` | scenario_report DB作成 |
| `scripts/seeds/n1-seed/008-auth-policies.yaml` | ポリシー追加 |

## 検証結果
- ✅ `mise run tachyon-api-scenario-test` で全40シナリオ成功
- ✅ テスト結果がOps API に自動送信される
- ✅ `scenario_report_rest.yaml` シナリオテストが正常動作
- ✅ ダッシュボードUIでテスト結果を確認可能
