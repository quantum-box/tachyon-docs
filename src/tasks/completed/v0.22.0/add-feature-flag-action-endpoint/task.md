---
title: "Feature Flagアクション権限REST APIを追加する"
type: feature
emoji: "🛡️"
topics:
  - FeatureFlag
  - Axum
  - OpenAPI
published: true
targetFiles:
  - packages/feature_flag/src/adapter/axum/
  - packages/feature_flag/Cargo.toml
  - apps/tachyon-api/src/router.rs
  - docs/src/tasks/feature/add-feature-flag-action-endpoint/
github: https://github.com/quantum-box/tachyon-apps
---

# Feature Flagアクション権限REST APIを追加する

## 概要

Feature Flagコンテキストが提供するアクション権限評価機能をREST化し、OpenAPI (utoipa) 定義付きのHTTPエンドポイントとして公開する。LLMSコンテキストのAxum実装と同様にSwagger UI/Redocを自動生成し、GraphQLへ依存せずにアクション権限を取得できるようにする。

## 背景・目的

- GraphQL経由の`featureFlagActionAccess`クエリに依存しているが、外部統合や自動テストでREST/OpenAPIの方が扱いやすいという要望がある。
- Tachyon APIの他領域（LLMS、Catalog、Payment）はAxum + utoipaベースのRESTドキュメントが揃っており、Feature Flagのみ欠けている。
- テナントごとのアクション権限を一括検査できるAPIを提供することで、UI以外のクライアントや監視ジョブが共通フォーマットで利用できる。

## 詳細仕様

### 機能要件

1. `POST /v1/feature-flags/actions/evaluate` エンドポイントを追加し、複数アクションの権限判定結果をJSONで返す。
2. リクエストは `actions: [{ action: string, resourcePattern?: string }]` を受け取り、空配列の場合は200 + 空リストで応答する。
3. レスポンスは各アクションごとに `feature_enabled`, `policy_allowed`, `context`, `feature_error`, `policy_error` を含める。
4. Multi-tenancyとExecutorのヘッダ・セッション解析は既存Axum extractor (`auth::Executor`, `auth::MultiTenancy`) を流用し、現在ログイン中テナントで評価する。
5. エンドポイントには`feature_flag:evaluate_actions`（仮称）ではなく既存GraphQLと同じアクション名群（例: `feature_flag:ListFeatureFlags`等）を受け取る。
6. LLMSのOpenAPI実装を参考にutoipaでOpenAPI v3仕様とSwagger UI/Redoc/RapiDocエンドポイントを自動提供する。
7. Tachyon APIのルーターにFeature Flag RESTルーターをmergeし、`/v1/feature-flags/api-docs/openapi.json`等から仕様を参照可能にする。
8. `cargo run -p feature_flag --bin feature_flag_codegen` でOpenAPI YAMLを生成できるようにし、`mise run codegen` に統合する。

受け入れ条件:
- 単一/複数アクションをPOSTした際にGraphQL版と同じフィールド構成で結果が取得できる。
- Multi-tenancyヘッダ (`x-operator-id`, `x-platform-id`, `x-user-id`) に応じて適切な権限結果が返る。
- Swagger UIでエンドポイントが表示され、Exampleリクエスト/レスポンスが確認できる。

### 非機能要件

- Axum handlerは`tracing`でエラーログを残しつつ、ビジネス例外はHTTP 400、想定外は500で返す。
- JSONシリアライズは`serde`のデフォルト設定を使用し、1リクエスト100アクション程度を想定したベンチマークで50ms以内(現行と同等)を目標。
- utoipaスキーマはLLMS同様に`ToSchema`/`IntoParams`導出で自動生成し、保守コストを抑える。
- GraphQLと共通ロジックを使い、重複実装を避ける。

### コンテキスト別の責務

```yaml
contexts:
  feature_flag:
    description: "アクション権限判定ロジックとREST公開"
    responsibilities:
      - EvaluateFeatureFlagActionsユースケース呼び出し
      - Axumハンドラ/リクエスト・レスポンスDTO
      - utoipaによるOpenAPI定義管理

  auth:
    description: "Executor/MultiTenancyの解決"
    responsibilities:
      - Axum用Extractorでテナント/ユーザーコンテキストを提供

  tachyon-api:
    description: "外部公開ルートの統合"
    responsibilities:
      - Router merge処理
      - APIドキュメント配信
      - CORS設定との整合性確認
```

### 仕様のYAML定義

```yaml
# REST API仕様
openapi:
  basePath: /v1/feature-flags
  endpoints:
    - path: /actions/evaluate
      method: POST
      summary: "指定したアクション一覧の権限とFeature Flag有効状態を返す"
      requestBody:
        required: true
        schema:
          type: object
          properties:
            actions:
              type: array
              minItems: 0
              items:
                type: object
                required: ["action"]
                properties:
                  action:
                    type: string
                    description: "policy/feature flagで定義済みのアクションID"
                  resourcePattern:
                    type: string
                    description: "リソース識別子に使用するワイルドカードパターン (オプション)"
      responses:
        "200":
          description: "各アクションの評価結果"
          schema:
            type: object
            properties:
              results:
                type: array
                items:
                  type: object
                  required: ["action", "context", "featureEnabled", "policyAllowed"]
                  properties:
                    action:
                      type: string
                    context:
                      type: string
                    featureEnabled:
                      type: boolean
                    policyAllowed:
                      type: boolean
                    featureError:
                      type: string
                      nullable: true
                    policyError:
                      type: string
                      nullable: true
        "400":
          description: "入力値エラー（アクションが空文字など）"
        "401":
          description: "認証情報不足"
        "500":
          description: "内部エラー"
```

## 実装方針

### アーキテクチャ設計

- Feature FlagコンテキストのClean Architecture層において、Axumアダプター層を新設してUsecaseを呼び出す。
- DTO <-> Usecase入出力変換はアダプター層で実施し、既存GraphQL実装とロジックを共有する。
- utoipaの`OpenApiRouter`でサブRouterを構築し、Swagger UI/Redoc/RapiDocを提供。
- Tachyon APIのメインRouterに`merge(feature_flag::axum::create_router())`を追加して全体に統合。

### 技術選定

- Axum (既存採用): 既存APIと統一・Extractorが利用可能。
- utoipa: RustコードからOpenAPIドキュメントを生成し、LLMSコンテキストと統一する。
- serde/thiserror/tracing: 既存依存を活用し実装コストを抑える。

### TDD（テスト駆動開発）戦略
<!-- リファクタリングタスクの場合は必須セクション -->

#### 既存動作の保証
- GraphQL経由のアクセスと同じ結果を返すことをE2Eシナリオで再確認する。
- Usecaseレベルの単体テスト (既存) を流用し、REST固有のパース/レスポンスのみ追加で確認する。
- ベンチマークは必要に応じて`cargo bench`ではなく`mise run check`内で型/コンパイル検証に留める。

#### テストファーストアプローチ
- Axumハンドラ用のリクエスト/レスポンス変換テストを先に用意し、Usecaseモックを使ったハッピーパス/エラーパスを検証する。
- GraphQLとの整合性確認は最後に手動で実施する。

#### 継続的検証
- `mise run check` や `mise run ci` で全体チェックを通す。
- 必要に応じて`mise run tachyon-api-scenario-test`で既存シナリオが壊れていないことを確認する。

## タスク分解

### 主要タスク
- [x] 要件定義の明確化
- [x] 技術調査・検証（utoipa参照実装の調査）
- [x] 実装（Axumハンドラ/Router/OpenAPI）
- [x] テスト・品質確認（ハンドラ単体テスト + `mise run check`）
- [ ] ドキュメント更新（Swagger UI確認手順・taskdoc進捗）

## Playwright MCPによる動作確認

フロントエンドの変更を伴う場合は、Playwright MCPツールを使用して実際のブラウザ上での動作を確認します。
タスク作成時に、以下のテンプレートを参考に、実装する機能に応じた具体的なチェック項目を作成してください。

### 実施タイミング
- [ ] 実装完了後の初回動作確認
- [ ] PRレビュー前の最終確認
- [ ] バグ修正後の再確認

### 動作確認チェックリスト

#### REST APIドキュメント確認
- [ ] Swagger UIで`POST /v1/feature-flags/actions/evaluate`が表示される
- [ ] Exampleリクエストを送信し200レスポンスが返る
- [ ] Redoc/rapidocでも仕様が確認できる
- [ ] データが0件の場合の表示

#### 例：フォーム入力機能の場合
- [ ] フォームの初期表示
- [ ] 各入力フィールドへの入力
- [ ] バリデーションエラーの表示
- [ ] 送信成功時の動作
- [ ] 送信失敗時のエラーハンドリング

### 実施手順
1. **ローカル開発サーバーの確認**
   - まず `lsof -i :3000` などで該当ポートが使用中か確認
   - 起動していない場合のみ `yarn dev --filter=<app-name>` を実行
   
2. **動作確認レポートの作成**
   - `./verification-report.md` を作成（タスクドキュメントと同じディレクトリ内）
   - 以下のテンプレートを使用：
   ```markdown
   # [機能名] 動作確認レポート
   
   実施日: YYYY-MM-DD
   実施者: @<username>
   
   ## 環境情報
   - ブラウザ: Chrome/Firefox/Safari
   - 画面サイズ: 1920x1080
   - テストユーザー: test-user@example.com
   
   ## 動作確認結果
   
   ### ✅ 基本動作
   - [x] ページの読み込み完了
     ![ページ読み込み](./screenshots/page-load.png)
   
   ### ❌ エラーケース
   - [ ] 認証エラー時の表示
     - 問題: エラーメッセージが表示されない
     - ![エラー画面](./screenshots/auth-error.png)
   
   ## 発見した問題
   1. 認証エラー時にメッセージが表示されない
   2. モバイル表示でレイアウトが崩れる
   
   ## 改善提案
   - エラーハンドリングの追加が必要
   ```

3. **Playwright MCPでの確認実施**
   - ブラウザを開く（`mcp__playwright__browser_navigate`）
   - 必要に応じてテストユーザーでログイン
   - 対象ページに遷移
   - チェックリストに従って動作確認を実施

4. **スクリーンショットの取得と保存**
   - 重要な画面や問題のある箇所をスクリーンショット（`mcp__playwright__browser_take_screenshot`）
   - `./screenshots/` ディレクトリに保存（タスクドキュメントと同じ階層）
   - レポートにスクリーンショットの相対パスを記載

5. **レポートの完成と共有**
   - 全ての確認項目の結果をレポートに記載
   - 発見した問題と改善提案を追記
   - PRのコメントにレポートへのリンクを追加

### 確認時の注意事項
- [ ] ネットワークエラーやタイムアウトなどの異常系も確認
- [ ] 異なる画面サイズでの表示確認（`mcp__playwright__browser_resize`）
- [ ] コンソールエラーの有無を確認（`mcp__playwright__browser_console_messages`）
- [ ] パフォーマンスに問題がないか確認（極端に遅い処理がないか）
- [ ] 動作確認レポートにすべての結果を記録

### ユーザビリティ・UI品質チェック

UIを含む機能の場合は、以下の観点からもユーザビリティと品質をチェックしてください：

#### レスポンシブデザイン
- [ ] モバイル（375x667）での表示確認
- [ ] タブレット（768x1024）での表示確認
- [ ] デスクトップ（1440x900以上）での表示確認
- [ ] サイドバーやナビゲーションの適切な動作

#### キーボード操作・アクセシビリティ
- [ ] Tabキーでの適切なフォーカス移動
- [ ] Escapeキーでのダイアログ・メニュー閉じる操作
- [ ] role属性（button, textbox, combobox等）の適切な設定
- [ ] aria-label属性の適切な設定
- [ ] 表形式データの適切な構造

#### 操作性・UX
- [ ] ダブルクリック防止（useTransition/disabled状態）
- [ ] ローディング状態の適切な表示（アイコン、メッセージ）
- [ ] エラー状態の分かりやすい表示（Toast、ダイアログ）
- [ ] 確認ダイアログの適切なUX（キャンセル・実行ボタン配置）
- [ ] フォームのタブ順序の論理性

#### デザイン統一性
- [ ] shadcn/uiコンポーネントの適切な使用
- [ ] 色彩・フォント・スペーシングの一貫性
- [ ] アイコンの統一性（Lucide React）
- [ ] 破壊的操作の適切な視覚的警告

#### 検索・フィルタリング（該当する場合）
- [ ] 検索機能の即座のフィードバック
- [ ] 部分一致検索の動作
- [ ] フィルタリング結果の適切な表示
- [ ] 検索結果が0件の場合の表示


## スケジュール

AI Codingを活用する場合、週単位や日単位のスケジュールは意味を持ちません。実装は数時間〜1日で完了することが多いため、スケジュールセクション自体を省略するか、分単位の詳細なタイムラインが必要な場合のみ記載してください。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 例：外部API依存 | 高 | モックの準備、タイムアウト設定 |


## 参考資料

- 関連ドキュメント
- 参考実装
- 技術記事

## 完了条件

- [ ] すべての機能要件を満たしている
- [ ] コードレビューが完了
- [ ] 動作確認レポートが完成している
- [ ] 正式な仕様ドキュメントを作成済み
- [ ] タスクディレクトリを completed/[新バージョン]/ に移動済み

### バージョン番号の決定基準

このタスクが完了した際のバージョン番号の上げ方：

**パッチバージョン（x.x.X）を上げる場合:**
- [ ] バグ修正
- [ ] 小さな改善（UIの微調整、メッセージの変更など）
- [ ] ドキュメント更新
- [ ] パフォーマンス改善
- [ ] 既存機能の微調整

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

その他、特記事項があれば記載。
