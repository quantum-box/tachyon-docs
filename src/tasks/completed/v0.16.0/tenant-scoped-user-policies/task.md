title: "ユーザーポリシーのテナントスコープ対応"
type: tech
emoji: "🛡️"
topics:
  - Authorization
  - Multi-tenancy
  - MySQL
published: true
targetFiles:
  - packages/auth/domain/src/policy.rs
  - packages/auth/src/interface_adapter/gateway/sqlx_user_policy_mapping_repository.rs
  - packages/auth/migrations
github: https://github.com/quantum-box/tachyon-apps
---

# ユーザーポリシーのテナントスコープ対応

## 概要

ユーザーとポリシーの紐付けをテナント（Operator/Platform）単位で管理できるようにし、システムポリシー以外が全テナントへ横展開されてしまう問題を解消する。

## 背景・目的

- 現在の `user_policies` は `(user_id, policy_id)` のみ保持し、ユーザーが所属する全テナントに対してポリシーが有効化されてしまう。
- マルチテナント前提の認可モデルとしては、テナントごとに付与ポリシーを切り替えられる必要がある。
- テナント別カスタムポリシーを導入済み（`policies.tenant_id`）なのに、ユーザーへの割当がテナント非依存のため、テナント固有の権限運用ができない。
- テナント単位での最小権限原則を徹底し、誤った権限昇格を防ぐ。

## 詳細仕様

### 機能要件

1. `user_policies` に `tenant_id`（OperatorId）を追加し、主キーを `(user_id, tenant_id, policy_id)` に拡張する。
2. システムポリシー（`tenant_id = NULL`）は従来通り全テナント向けに付与可能、カスタムポリシーは所属テナントでのみ有効にする。
3. 権限チェック（`CheckPolicyImpl`）は現在の `multi_tenancy.operator_id()` を用いて、そのテナントに紐付くポリシーのみ集計する。
4. 既存データに対するマイグレーションとシーディング更新を提供し、互換性を確保する。
5. GraphQL/API 層で新しいテナント指定パラメータを受け渡し、ユースケース入力モデルにも `tenant_id` を追加する。

### 非機能要件

- 認可チェック時の DB クエリ回数を増やさない（必要に応じて複合インデックスを付与）。
- 既存のシステムポリシー利用フロー（tenant_id = NULL）への影響を最小化する。
- マイグレーションはロールフォワード/バックが可能であること。

### コンテキスト別の責務

```yaml
contexts:
  auth:
    description: "認可モデルの中核"
    responsibilities:
      - user_policies スキーマ更新
      - PolicyService/Repository のテナント対応
      - 認可チェックロジックの改修
  tachyon-api:
    description: "API境界"
    responsibilities:
      - GraphQL/REST 入力に tenant_id を渡す
      - DI の更新（新しいユースケース引数対応）
  docs:
    description: "仕様ドキュメント更新"
    responsibilities:
      - policy management ドキュメントの改訂
```

### 仕様のYAML定義

```yaml
# user_policies テーブル仕様
user_policies:
  columns:
    - name: user_id
      type: varchar(255)
      nullable: false
      description: "権限を付与されるユーザー ID"
    - name: tenant_id
      type: varchar(29)
      nullable: true
      description: "権限が有効となるテナント（NULL = システムポリシー）"
    - name: policy_id
      type: varchar(32)
      nullable: false
      description: "付与するポリシー ID"
    - name: assigned_at
      type: timestamp
      nullable: false
      default: CURRENT_TIMESTAMP
  primary_key:
    - user_id
    - tenant_id
    - policy_id
  indexes:
    - name: idx_user_tenant
      columns: [user_id, tenant_id]
    - name: idx_tenant_policy
      columns: [tenant_id, policy_id]

実装上は MySQL の主キー制約で NULL を含む複合キーを扱えないため、`tenant_id` を正規化する生成カラム `tenant_scope` を追加し、システムポリシーは `"system"` 固定値として扱う。
```

## 実装方針

### アーキテクチャ設計

- Clean Architecture 構造を維持し、Domain → Usecase → Interface Adapter の責務境界を尊重する。
- Repository 層で `tenant_id` を受け取るインターフェースを追加し、テナントに依存しない既存メソッドを `tenant_id = NULL` 互換にリファクタリング。
- ユースケース入力に `MultiTenancy` を必須とし、`PolicyService` の取得メソッドをテナント対応に変更。

### 技術選定

- DB マイグレーションは既存の SQLx + MySQL/TiDB スキーマで実装。
- Repository は `sqlx::query!`/`query_as!` で更新し、`TenantId` 値オブジェクトを活用。
- テストは `cargo nextest` / `packages/auth/tests/policy_management_integration_test.rs` を拡張。

### TDD（テスト駆動開発）戦略
<!-- リファクタリングタスクの場合は必須セクション -->

#### 既存動作の保証
- 既存のポリシー割当テストをテナント指定付きに書き換え、システムポリシーとカスタムポリシー双方を網羅。
- 追加マイグレーションの回帰テストを `policy_management_integration_test` に組み込み、旧データが期待通りに変換されるか検証。

#### テストファーストアプローチ
- 先に `PolicyService` の新メソッドに対するテストを追加し、テナント外ポリシーが返らないことを証明した上で実装する。

#### 継続的検証
- `mise run check` と `mise run ci-node` をローカルで実行し、CI 互換の結果を確保する。

## タスク分解

### 主要タスク（2025-10-15 着手）
- ✅ 要件整理と既存認可フローの調査（2025-10-15 着手）
- ✅ スキーマ変更・マイグレーション作成（2025-10-16 完了）
- ✅ Repository / Service / Usecase / Resolver の改修（2025-10-16 完了）
- ✅ テスト（ユニット・統合）更新とデータシード調整（2025-10-16 完了）
- ✅ ドキュメント更新・リリースノート準備（2025-10-19 完了）

## 実装ログ

- 2025-10-15: 要件整理と現行 `user_policies` テーブル仕様の確認を開始。
- 2025-10-15: `user_policies` テーブルに `tenant_id` カラム追加マイグレーションを作成し、`tenant_scope` を導入して主キーを拡張。関連する YAML/SQL シードを暫定更新。
- 2025-10-15: Repository/Service/GraphQL 層をテナントフィルタ対応に改修し、`cargo test -p auth` でユースケース・統合テストを確認。
- 2025-10-16: `tenant_scope` 生成カラムを用いた複合主キー化と SQLx リポジトリ更新、GraphQL 入力に `tenantId` を追加。`scripts/seeds/n1-seed/008-auth-policies.yaml` にテナント付きシードを追加し、関連ドメインエンティティを `TenantId` 対応に刷新。
- 2025-10-16: `apps/tachyon-api/tests/scenarios/tenant_scoped_user_policy.yaml` を追加し、ユーザーに付与したテナント向けポリシーが他テナントでは効かないことをシナリオテストで検証。
- 2025-10-19: 仕様ドキュメント整備、タスクアーカイブ、バージョン/CHANGELOG 更新を実施。

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] 実装完了後の初回動作確認（必要に応じて）
- [ ] PRレビュー前の最終確認（必要に応じて）
- [ ] バグ修正後の再確認（必要に応じて）

### 動作確認チェックリスト

- [ ] GraphQL `userPolicies` クエリでテナントフィルタが適用されること（Playwright MCP で API 叩き確認も可）
- [ ] 管理 UI から別テナントへ切り替えた際、想定外のポリシーが表示されないこと
- [ ] ポリシー割当 UI でテナント選択が必須であること（UI 対応が必要な場合）
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
