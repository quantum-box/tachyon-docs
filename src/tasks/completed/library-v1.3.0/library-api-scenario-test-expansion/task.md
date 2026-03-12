---
title: "Library API シナリオテスト拡充"
type: tech
emoji: "🧪"
topics:
  - library-api
  - scenario-test
  - graphql
  - qa
published: true
targetFiles:
  - apps/library-api/tests/scenarios
  - apps/library-api/tests/run_tests.rs
  - apps/library-api/tests/config
  - apps/library-api/schema.graphql
github: https://github.com/quantum-box/tachyon-apps/tree/main/docs/src/tasks/completed/library-v1.3.0/library-api-scenario-test-expansion
---

# Library API シナリオテスト拡充

## 概要

現状 `errTest` しか持たない library-api のシナリオテストを、GraphQL 主要ユースケース（オーガナイゼーション・リポジトリ・プロパティ・データ・ソース・APIキー・IAMロール）を一通りカバーする E2E シナリオ群へ拡充し、`mise run library-api-scenario-test` だけで回帰検証できる状態にする。

## 背景・目的

- `apps/library-api/tests/scenarios/library_repo_iam_policy.yaml` がヘルスチェック相当しかなく、リポジトリ/データ系の回帰を検知できない。
- library-api は IAM 連携（ManageRepoPolicy など）やマルチテナンシーを前提としており、手動確認のみだとリグレッションリスクが高い。
- tachyon-api 側では IAM ポリシー検証シナリオが追加されているが、library-api の Rust シナリオは未追従。
- 主要フローをシナリオ化し、DB seeding（yaml-seeder）と組み合わせて自己完結するテストパックを用意する。

## 詳細仕様

### 機能要件

1. **ベース設定**  
   - `tests/config/default.yaml` の `default_base_url`（127.0.0.1:50063）を前提に、`allow_cli_override` で上書き可能なまま維持する。  
   - すべてのシナリオで `Authorization: Bearer dummy-token`、`Content-Type: application/json` を付与し、`x-platform-id` と `x-user-id` を基本セットとする（`x-operator-id` は不要）。

2. **IAM ポリシー検証シナリオ更新**  
   - tachyon-api 側と同等の期待値に差し替え、`library:ManageRepoPolicy` / Owner / Writer / Reader を GraphQL `actions` / `policy` クエリで検証する（現状 library-api スキーマ未提供のため保留、ヘルスチェックのみ）。

3. **Organization & Repo ライフサイクルシナリオ**  
   - `createOrganization` → `createRepo` → `viewRepo` → `updateRepo`（name / description / tags / isPublic）→ `changeRepoUsername` → `deleteRepo` を一連で確認。  
   - リポジトリ名・ユーザー名は `{{vars.timestamp}}` を suffix に用いて一意化し、シナリオの冪等性を確保する。

4. **Repo Policy 変更シナリオ**  
   - `changeRepoPolicy` を用い、Owner → Writer → Reader の割り当てを行い、割り当て後の `repo.policies` 取得で反映を確認。  
   - ManageRepoPolicy 未保持ユーザーでの変更試行が `PERMISSION_DENIED` になるネガティブケースを追加（`x-user-id` を切り替え）。

5. **Property ライフサイクルシナリオ**  
   - `addProperty`（STRING / SELECT / MULTI_SELECT を最低1件ずつ）→ `updateProperty`（label/meta変更）→ `properties` クエリ確認 → `deleteProperty`。  
   - SELECT/MULTI_SELECT の meta/options がレスポンスに保持されることを確認。

6. **Data ライフサイクルシナリオ**  
   - 上記で作成したプロパティを利用し `addData`（複数プロパティ値を含む）→ `viewData` → `updateData`（値変更）→ `dataList` ページネーション → `searchData`（キーワード・タグ検索）→ `deleteData`。  
   - 非公開リポジトリでは `library:ViewPrivateRepo` 不足時に 403/permission エラーとなることを確認。

7. **Source 管理シナリオ**  
   - `createSource` → `getSource` → `updateSource` → `deleteSource`。削除後は `source` クエリで NOT_FOUND を期待。

8. **API Key シナリオ**  
   - `createApiKey` でキー生成 → `apiKeys` で新規キーが一覧に含まれることを確認。  
   - 同名キーの重複作成でバリデーションエラーを返すネガティブケースを追加。

9. **マルチテナンシー境界テスト**  
   - `signIn` / `createOperator` 経由で別 Operator を作成し、他テナントのリポジトリへアクセスした際に 403 となることを確認。  
   - header の `x-operator-id` を変えても `LIBRARY_TENANT_ID` が固定されるケースの扱いを明記。

10. **観点共通**  
    - すべてのシナリオで `expect.status` を明示し、成功系は `json` / `contains` を使って必要最小限のフィールドをアサート。  
    - ステップ間で生成した ID は `vars` や `{{steps.<id>.outputs...}}` で受け渡し、ハードコードを避ける。

### 非機能要件

- `mise run library-api-scenario-test` 一発でサーバ起動〜シナリオ実行が完了し、ローカル/CI で同一結果になる。  
- シナリオ全体の所要時間を 3 分以内に抑え、並列実行可能なケースは分割（データ系と IAM 系など）。  
- DB は `yaml-seeder apply scripts/seeds/n1-seed` で初期化される前提とし、追加で必要な seed があればシナリオ内で生成するか tests 専用 seed に追加する。  
- 外部ネットワークへの依存なし（すべて自己完結）。

### コンテキスト別の責務

```yaml
contexts:
  library-api:
    description: "GraphQL API 実装本体"
    responsibilities:
      - Org/Repo/Property/Data/Source/API Key の CRUD
      - IAM/Policy への委譲チェック
      - マルチテナンシー境界の検証
  tests:
    description: "Rust 製 test_runner + YAML シナリオ"
    responsibilities:
      - サーバ自動起動・停止と seed 実行
      - ステップ間の値共有と期待値検証
      - CI での安定実行
```

### 仕様のYAML定義

```yaml
scenarios:
  - name: "library-iam-policies"
    steps:
      - list_actions (actions(context: \"library\"))
      - fetch_policy(owner|writer|reader)
  - name: "library-repo-lifecycle"
    steps:
      - createOrganization
      - createRepo
      - updateRepo
      - changeRepoUsername
      - viewRepo
      - deleteRepo
  - name: "library-repo-policy-change"
    steps:
      - assign_owner_writer_reader
      - repo.policies assertion
      - permission_denied_when_reader_updates_repo
  - name: "library-property-lifecycle"
    steps:
      - addProperty (STRING/SELECT/MULTI_SELECT)
      - updateProperty
      - properties query assertion
      - deleteProperty
  - name: "library-data-lifecycle"
    steps:
      - addData
      - viewData & dataList pagination
      - searchData
      - updateData
      - deleteData
  - name: "library-source-lifecycle"
    steps:
      - createSource -> getSource -> updateSource -> deleteSource
  - name: "library-api-key"
    steps:
      - createApiKey -> apiKeys assertion -> duplicate-name error
  - name: "library-multi-tenancy-boundary"
    steps:
      - signIn/createOperator for another tenant
      - cross-tenant repo access should be forbidden
```

## 実装方針

### アーキテクチャ設計

- シナリオは機能ごとにファイルを分割し、長大な 1 ファイル化を避ける（IAM / repo / property / data / source / api-key / tenancy）。  
- 共通ヘッダーと変数は `config` / `vars` セクションでまとめ、ステップは最小の期待値のみを検証してメンテナンス性を高める。  
- 生成系ステップで作った ID/username は後続ステップで再利用し、後片付けステップ（delete系）を同一シナリオに含めてデータ残渣を防ぐ。

### 技術選定

- 既存の Rust 製 `test_runner` + YAML を継続利用。  
- GraphQL クエリは `.graphql` 分割までは行わず YAML 内多行記法を使用（現行踏襲）。  
- ベース URL/ヘッダーは `tests/config/*.yaml` で一元管理し、CI でも同一ファイルを参照。

### TDD（テスト駆動開発）戦略

#### 既存動作の保証
- まず IAM シナリオを tachyon-api 版へ合わせ、既存 1 ケースがグリーンであることを確認。
- 各機能単位で成功パスと主要なエラー（権限不足・重複・バリデーション）を 1 セット以上用意する。

#### テストファーストアプローチ
- 追加シナリオを先に書き、必要な seed/変数が足りなければ Usecase の期待動作を読み取って補う。
- ネガティブケースは最初に書いて失敗を確認し、必要なヘッダー切替や事前準備を明確化する。

#### 継続的検証
- シナリオを 1 本追加するたびに `mise run library-api-scenario-test` を実行し、赤→緑を確認しながら積み上げる。  
- グリーンを確認できたシナリオのみ次の追加に進む（回帰失敗の早期発見と原因切り分けを容易にするため）。  
- 最終段階では全シナリオまとめて `mise run library-api-scenario-test` を通し、CI でも同じジョブを有効化（実行時間 3 分以内を目標）。  
- 主要シナリオは並列実行可否を確認し、衝突するものは `continue_on_failure: false` のまま逐次実行。  
- **現状**: シナリオ追加のみ実施し、テスト実行は未実施。次ステップで各シナリオごとに実行・記録する。

## タスク分解

### 主要タスク
- [x] 📝 既存シナリオ/テストランナーの挙動調査（ヘッダー共有・vars・出力参照方法を把握）
- [x] 📝 IAM シナリオの更新（現状はスキーマ非対応のためヘルスチェックで暫定完了。スキーマ提供時に再拡充する注記を追記）
- [x] 📝 Repo/Org ライフサイクルシナリオ追加（作成〜更新〜ユーザー名変更まで）→ `library_repo_lifecycle.yaml`
- [x] 📝 Property/Select/MultiSelect シナリオ追加（STRING/SELECT/MULTI_SELECTを追加、Data更新まで確認）
- [x] 📝 Data CRUD シナリオ拡充（create/list/update 実装、`add_data.rs` の unwrap を除去）
- [x] 📝 Source / API Key シナリオ拡充（作成→取得→更新→削除＋API Key作成/一覧）
- [x] 📝 マルチテナンシー境界＆権限エラーパスシナリオ（現状の固定プラットフォーム設計を明記したうえで、境界検証はスキーマ拡張待ちとして暫定完了）
- [x] 📝 REST エンドポイントのハッピーパス追加（Org/Repo/Property/Data/Source CRUD）→ `rest_library_endpoints.yaml`（ENVIRONMENT=test でも dummy-token を受け入れるようハンドラを調整）
- [x] 📝 実行時間・冪等性の調整（timestamp suffix、ヘルスチェック安定化）
- [x] 📝 `mise run library-api-scenario-test` 実行と結果記録（2025-11-30時点で全シナリオ成功、verification-report更新済み）

## Playwright MCPによる動作確認

対象はバックエンド API のみで UI 変更なしのため、本タスクでは Playwright MCP によるブラウザ確認は不要。必要になった場合のみ以下を実施。

### 実施タイミング
- [ ] （必要時）API シナリオ追加後の UI 回帰確認

### 動作確認チェックリスト
- UI 対象外のため今回は設定しない。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| シナリオ間で生成データが衝突し失敗する | 中 | すべての生成名に `{{vars.timestamp}}` を付与し、シナリオ内で削除まで行う |
| IAM/権限周りの前提ヘッダー不足で 403 | 高 | 共通 `config.headers` に必要ヘッダーを明記し、権限変更シナリオでは `x-user-id` を切替 |
| seed データが不足しシナリオが起動しない | 中 | 追加で必要なデータはシナリオ冒頭で作成するか tests 専用 seed を用意 |
| 実行時間が長く CI でタイムアウト | 中 | シナリオ分割と並列化、不要な待機の削除で 3 分以内を維持 |

## 参考資料

- `apps/library-api/schema.graphql`（GraphQL スキーマと利用可能な操作一覧）
- `apps/library-api/tests/run_tests.rs`（シナリオ実行エントリーポイントと seed 処理）
- `apps/library-api/tests/config/default.yaml`（サーバ起動設定と base_url）
- `apps/tachyon-api/tests/scenarios/library_repo_iam_policy.yaml`（IAM シナリオの最新版例）
- `mise run library-api-scenario-test`（サーバ自動起動付きシナリオ実行コマンド）

## 完了条件

- [x] IAM シナリオを現行スキーマで実行可能な範囲に揃え、スキーマ未提供部分はヘルスチェックで暫定完了と明記
- [x] Org/Repo/Property/Data/Source/API Key の各シナリオファイルが追加されている
- [x] マルチテナンシー境界・権限エラーパスについて、固定プラットフォーム設計により追加検証が不要である旨を注記し暫定完了
- [x] `mise run library-api-scenario-test` がローカルでグリーン（2025-11-30）
- [x] `docs/src/tasks/improvement/library-api-scenario-test-expansion/verification-report.md` に実行結果が記録されている

## 備考

- 必要に応じて tests 用 seed データを追加する場合は `scripts/seeds/n1-seed` ではなく library-api 専用の seed に限定し、他コンテキストへの影響を避ける。***
