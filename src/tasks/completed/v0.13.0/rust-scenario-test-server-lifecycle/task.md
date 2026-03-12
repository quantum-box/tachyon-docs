---
title: "Rustシナリオテストでtachyon-apiサーバーを自動起動する"
type: "tech"
emoji: "🧪"
topics: ["tachyon-api", "rust", "integration-test", "ci"]
published: true
targetFiles: [
  "apps/tachyon-api/tests/run_tests.rs",
  "apps/tachyon-api/tests/util.rs",
  "apps/tachyon-api/tests/scenarios/",
  "packages/test_runner/",
  "mise.dev.toml"
]
github: "https://github.com/quantum-box/tachyon-apps"
---

# Rustシナリオテストでtachyon-apiサーバーを自動起動する

## 概要

`apps/tachyon-api/tests/run_tests.rs` から YAML シナリオを実行するときに、Rust 側で `tachyon-api` バイナリを自動起動し、テスト完了後に安全に停止させる仕組みを整備する。CI/ローカルともに `cargo test -p tachyon-api --test run_tests` だけで API サーバーのライフサイクルを完結させ、手動で別プロセスを立ち上げる手間やポート衝突を解消する。

## 背景・目的

- 現状のシナリオテストは `mise run dev-backend` などで `tachyon-api` を手動起動した状態を前提としており、テストを実行するたびに手作業が必要。
- サーバーを手動で止め忘れるとポートやDB接続が残り、次回テストが失敗するケースが頻発する。
- CI でも同様の前提を置く必要があり、`mise run ci-node` からシナリオテストを呼び出すとサーバープロセスが存在せず失敗する。
- `apps/tachyon-api/tests/util.rs` にはアプリ内部を直接起動するユーティリティがあるが、依存解決が重く立ち上がりが不安定で、バイナリ起動型の方がシナリオに近い挙動を得られる。
- Rust 側でサーバープロセス管理まで面倒を見ることで、シナリオテストを簡潔なワンコマンドに統合し、再現性と開発体験を向上させる。

## 最新アップデート (2025-10-06)

- ✅ `mise run tachyon-api-scenario-test` を実行し、サーバー自動起動付きシナリオテストが 16 ケースすべて成功することを確認。
- ✅ 既存シナリオの `config.base_url` を `http://127.0.0.1:50050` に統一し、`tests/config/default.yaml` の `default_base_url` と整合。
- ✅ 重要領域向けに 3 本の新シナリオ（ユーザー・オペレーター・ポリシー CRUD）を追加し、シードデータに頼らず動作をカバー。
- ✅ `scripts/seeds/n1-seed/008-auth-policies.yaml` へ `AttachUserPolicy` / `DetachUserPolicy` アクションを追加し、`AdminPolicy` と `TenantAdminPolicy` に許可付与。
- ✅ Runner 側での `base_url` 自動注入に合わせ、シナリオ YAML から `base_url` ハードコードを削除し `http://127.0.0.1:50050` を `tests/config` で一元管理。

## 詳細仕様

### 機能要件

1. `run_tests.rs` 側にサーバープロセス管理レイヤーを追加し、テスト開始前に `cargo run --bin tachyon-api -- --addr 0.0.0.0:50050` を子プロセスとして起動する。
2. 起動後は `/health` エンドポイントへの HTTP チェックを最大30秒（リトライ間隔1秒）行い、200 が返ったらシナリオを開始する。タイムアウト時はテスト全体を失敗させる。
3. 実行する YAML シナリオ（`tests/scenarios/*.yaml`）の `config.base_url` および `vars.base_url` を `http://127.0.0.1:50050` に差し替えるオーバーライド機構を用意し、ポート固定の記述を排除する。
4. テスト終了時（成功・失敗を問わず）に `Child::kill()` → `wait()` でプロセスを確実に回収し、ログを `stdout` / `stderr` へストリームするオプションを追加する。
5. プロセス起動時に `apps/tachyon-api/tests/config/runtime.yaml`（ローカル）および `apps/tachyon-api/tests/config/ci.yaml`（CI）を読み込み、MySQL(TiDB) 接続や S3 モックなど必要な依存を設定できるようにする。環境ごとに YAML を選択し、未指定項目はデフォルト値（`mise run up` が起動するサービス）で補完する。
6. `packages/test_runner` に `base_url` オーバーライドやポート注入のユーティリティを追加し、今後のタスクで `config.base_url` が活用できるようにする（現状 Runner では未使用のため対応が必要）。
7. `mise.dev.toml` の `ci-node` / `test` タスクへ `cargo test -p tachyon-api --test run_tests` を追加し、CI でサーバー自動起動付きのシナリオテストを呼び出す導線を整える。
8. シナリオ実行中に `SIGINT` / `SIGTERM` を受けた場合でもプロセスをクリーンアップできるよう、`tokio::signal` を監視して後処理を呼び出す。

### 非機能要件

- **起動時間**: 初回起動からヘルスチェック完了まで 15 秒以内を目標にし、最大 30 秒でタイムアウト。
- **リソース管理**: プロセスリークを防ぐため `Drop` 実装または `scopeguard` を活用し、テストが panic しても子プロセスが残らない設計にする。
- **安定性**: ヘルスチェック失敗時のログを収集し、CI 上でも原因追跡ができるよう `stderr` をそのまま出力する。
- **再現性**: 実行前に `mise run up` が成功している前提を明記し、DB/Redis などの外部依存が存在しなければテストをスキップするガードを用意する（例: YAML で接続情報が設定されていない場合はテストをスキップする）。
- **テスト用認証**: `ENVIRONMENT` が `development` または `test` の場合は `Bearer dummy-token` を自動的に許可するため、Cognito トークンを用意しなくてもシナリオを実行できる。
- **課金チェック無効化**: `PAYMENT_SKIP_BILLING=true` を設定して Stripe 残高参照をスキップし、課金情報未整備でもシナリオテストを継続できるようにする。
- **並列実行**: `cargo nextest` での並列テストを考慮し、サーバープロセスは 1 テストにつき 1 つ、`PORT` は固定にして並列実行を禁止する（`--ignored` フラグで明示的に実行する運用）。

### コンテキスト別の責務

```yaml
contexts:
  tachyon-api:
    description: "Rust製GraphQL/RESTバックエンド"
    responsibilities:
      - `--addr` オプションで任意ポートにバインド可能にする
      - `/health` エンドポイントの整備と依存サービス初期化
  integration-test:
    description: "YAMLシナリオを使ったAPI統合テスト"
    responsibilities:
      - シナリオの base_url や共通ヘッダーを環境依存なく管理
      - テスト結果を `DefaultTestRunner` に流して集計
  tooling:
    description: "テスト実行・CI連携のユーティリティ"
    responsibilities:
      - サーバープロセス起動/停止ラッパーの提供
      - `mise` タスクや CI ジョブからの呼び出し手順整備
```

### 仕様のYAML定義

```yaml
runtime_config:
  path_priority:
    - "apps/tachyon-api/tests/config/runtime.yaml"
    - "apps/tachyon-api/tests/config/ci.yaml"
    - "apps/tachyon-api/tests/config/default.yaml"
  schema:
    server:
      binary: "tachyon-api"
      address: "0.0.0.0:50050"
      health_check:
        path: "/health"
        timeout_seconds: 30
        interval_seconds: 1
    dependencies:
      database_url: "mysql://root:@127.0.0.1:15000/tachyon_apps_llms"
      database_root_url: "mysql://root:@127.0.0.1:15000"
      auth_database_url: "mysql://root:@127.0.0.1:15000/tachyon_apps_auth"
      redis_url: "redis://127.0.0.1:6379"
      sentry_dsn: null
      root_id: "tn_01hjryxysgey07h5jz5wagqj0m"
      allow_dummy_token: true
    logging:
      forward_stdout: false
      forward_stderr: false

scenario_overrides:
  base_url_key: "scenario.default_base_url"
  default_value: "http://127.0.0.1:50050"
  allow_cli_override: true
  include:
    - "エージェントAPI テストシナリオ"
```

### 実装方針

1. `apps/tachyon-api/tests/run_tests.rs` にプロセス管理用のヘルパー構造体 `TestServerGuard` を追加し、`Drop` 実装で `kill`/`wait` を保証する。
2. `tokio::task::spawn_blocking` で `Command` を起動し、`ChildStdout`/`ChildStderr` を別スレッドで読み取り標準出力へ流す。必要なら `indicatif` 等は使わず、`println!` で十分。
3. ヘルスチェックは `reqwest::Client` を用い、`Retry` は `tokio::time::sleep` で実装。起動失敗時は `child.kill()` で掃除し、`anyhow::Context` 付きでエラーメッセージを返す。
4. `tachyon-api/tests/config/*.yaml` を読み込むローダーを実装し、サーバー起動引数・依存接続情報・ログ設定を `serde_yaml` でマージする。
5. `packages/test_runner` に `TestScenario::with_base_url(&self, override_url: &str)` のユーティリティを実装し、`run_tests.rs` 側で読み込み直後に適用する。`config.base_url` と各ステップの絶対パスを `format!` で差し替える。
6. 既存シナリオ (`multi_tenancy_access.yaml` 等) の `base_url` ハードコードを削除し、`{{base_url}}` に統一。`config.base_url` が未設定の場合は `run_tests.rs` 側で設定した値を使用するよう runner を改修する。
7. `mise.dev.toml` / `mise.ci.toml` から呼び出すタスクに `cargo test -p tachyon-api --test run_tests -- --ignored` を追加し、CI での利用を文書化する。
8. `docs/src/tasks/.../verification-report.md` を後続タスクで作成し、実際の動作確認ログを収集する手順を残す。

### タスク分解

#### フェーズ1: 事前調査と環境整備 📝
- [ ] 既存シナリオテストの依存関係（DB、Redis、S3）を洗い出す
- [ ] `tachyon-api` バイナリの CLI オプション（`--addr` 等）を再確認
- [ ] `apps/tachyon-api/tests/config/*.yaml` に不足している設定キーを整理

#### フェーズ2: サーバープロセス管理の実装 📝
- [ ] `TestServerGuard` の実装・単体テストを作成
- [ ] ヘルスチェックとログフォワーディング処理を追加
- [ ] 異常系（起動失敗・タイムアウト・シグナル）のハンドリングを実装

#### フェーズ3: シナリオテスト統合 📝
- [x] `TestConfigManager` から読み込んだシナリオへ base_url を注入
- [x] YAML シナリオから `base_url` ハードコードを除去し、runner 側の注入に一本化
- [x] `cargo test -p tachyon-api --test run_tests` で成功することを確認

#### フェーズ4: CI/タスク整備 📝
- [ ] `mise` タスクへ統合し、CI から実行できるようにする
- [ ] `CLAUDE.md` と本タスクドキュメントに手順を追記
- [ ] 動作確認レポートのひな形 (`verification-report.md`) を追加

## テスト計画

- `cargo test -p tachyon-api --test run_tests -- --ignored` でシナリオテストがグリーンになることを確認。
- `RUST_LOG=debug` で実行し、ヘルスチェックのログが適切に表示されることを確認。
- プロセス起動失敗（例: `--addr` が既に使用中）を再現し、テストが即座に失敗するかつ子プロセスが残らないことを検証。
- CI（`mise run ci-node`）でテストがタイムアウトせず完走することを確認。
- Windows/Mac/Linux それぞれで `Command::new("cargo")` の動作を確認（GitHub Actions で最低 Linux / macOS を検証）。
- MySQL/TiDB が起動していない状態でテストを実行し、明確なエラーメッセージで失敗することを確認。

## スケジュール

- フェーズ1: 0.5日
- フェーズ2: 0.5日
- フェーズ3: 0.5日
- フェーズ4: 0.5日

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| ポート衝突による起動失敗 | 中 | `TestServerGuard` でランダムポート取得やリトライ戦略を検討。デフォルトは固定、必要に応じて `TEST_TACHYON_PORT` を受け付ける |
| DB マイグレーション不足で起動に失敗 | 高 | テスト前に `mise run prepare` を実施する手順をドキュメント化し、CI で自動実行 |
| 子プロセスがゾンビ化 | 高 | `Drop` 実装で `kill`/`wait` を保証し、ヘルスチェック失敗時も確実に終了させる |
| CI の実行時間増大 | 中 | サーバー起動とテストを同一ジョブ内で連続実行し、余計な `sleep` を避ける |
| ログがノイズになる | 低 | `RUST_LOG` を `info` に抑え、詳細が欲しい場合のみ環境変数で切り替える |
| 並列テストによる競合 | 中 | `#[ignore]` 属性でシングル実行を強制し、`nextest` 設定で排他制御を追加 |

## 参考資料

- `apps/tachyon-api/tests/run_tests.rs`
- `apps/tachyon-api/tests/util.rs`
- `packages/test_runner/`
- [Rust std::process::Command ドキュメント](https://doc.rust-lang.org/std/process/struct.Command.html)
- [reqwest クレートのタイムアウト設定](https://docs.rs/reqwest)

## 完了条件

- [ ] `cargo test -p tachyon-api --test run_tests -- --ignored` でサーバー自動起動付きのシナリオテストが成功する
- [x] `tests/scenarios/*.yaml` から固定ポート記述を排除し、`base_url` オーバーライドが機能する
- [ ] `TestServerGuard`（仮称）の単体テストまたは統合テストが追加されている
- [ ] `mise run ci-node` にシナリオテストが組み込まれている
- [ ] タスクドキュメントと `CLAUDE.md` に運用手順が追記されている
- [ ] 動作確認レポートの雛形 (`verification-report.md`) が配置されている

### バージョン番号の決定基準

**パッチバージョン（x.x.X）を上げる場合:**
- [x] バグ修正
- [x] 小さな改善（テスト自動化）
- [x] ドキュメント更新
- [ ] パフォーマンス改善
- [x] 既存機能の微調整

**マイナーバージョン（x.X.x）を上げる場合:**
- [ ] 新機能の追加
- [ ] 新しい画面の追加
- [ ] 新しいAPIエンドポイントの追加
- [ ] 新しいコンポーネントの追加
- [ ] 既存機能の大幅な改善
- [ ] 新しい統合やサービスの追加

**メジャーバージョン（X.x.x）を上げる場合:**
- [ ] 破壊的変更（既存APIの変更）
- [ ] データ構造の大幅な変更
- [ ] アーキテクチャの変更
- [ ] 下位互換性のない変更

## 備考

- MySQL/TiDB を使うテストであるため、`mise run up` を実行して依存サービスを起動してからテストを流す必要がある。`taskdoc.md` とあわせて `CLAUDE.md` に YAML 設定ファイルの参照方法を明記する。
- 後続で Playwright MCP を用いたE2E確認が必要になった場合、同じサーバー起動ユーティリティを再利用できるように共通化を検討する。
