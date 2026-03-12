---
title: "プラットフォームダッシュボード統計の実値化"
type: "improvement"
emoji: "📊"
topics:
  - Tachyon Dashboard
  - GraphQL
  - Billing
published: false
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/page.tsx
  - apps/tachyon/src/app/v1beta/[tenant_id]/queries/dashboard-metrics.graphql
  - apps/tachyon/src/lib/i18n/v1beta-translations.ts
github: ""
---

# プラットフォームダッシュボード統計の実値化

<!-- 
注意: このテンプレートをコピーして新しいタスクを作成する際は、
以下のディレクトリ構造で作成してください：

docs/src/tasks/[カテゴリ]/[タスク名]/
├── task.md (このテンプレートをコピー)
├── verification-report.md (動作確認時に作成)
└── screenshots/ (スクリーンショット保存用)

例:
mkdir -p docs/src/tasks/feature/implement-chat-history/screenshots
cp docs/src/tasks/template.md docs/src/tasks/feature/implement-chat-history/task.md

タスク完了後:
1. 正式な仕様ドキュメントを適切な場所（services/、tachyon-apps/等）に作成
2. タスクの内容に応じてバージョンを上げる
   - バグ修正・小改善: パッチバージョン（v1.0.0 → v1.0.1）
   - 大きめの機能追加: マイナーバージョン（v1.0.0 → v1.1.0）
3. タスクディレクトリを docs/src/tasks/completed/[新バージョン]/ に移動
4. 仕様ドキュメントはタスクドキュメントとは独立して管理
-->

## 概要

プラットフォームトップ (`/v1beta/:tenant_id`) の統計カードで使用しているモック値を排除し、実データに基づくメトリクスを表示できるようにする。

## 背景・目的

- 現状のダッシュボードは固定値を表示しており、利用状況の把握や意思決定に役立たない。
- プロダクトレビューで「モックではなく実データを表示するべき」と指摘された。
- 実データ化により、AI実行回数や課金残高、価格ポリシーの状態を即時に把握できるようにする。

## 詳細仕様

### 機能要件

1. ダッシュボードのメトリクスカードを GraphQL 経由の実データに置き換える。
2. 取得対象のデータは以下とする。
   - AI実行数: `promptLogs(operatorId)` の `createdAt` を用いて直近24時間分を集計。
   - 課金残高: `creditBalance` の `available` を NanoDollar から USD へ換算し表示。
   - 価格ポリシー: `pricingPolicies(tenantId)` の `status` を判定し、`ACTIVE` 件数と `DRAFT` 件数を把握。
3. メトリクスの補足ヒントは実データ由来の文字列に更新する。
   - AI実行数: 前日比（直近24時間とその前の24時間の比較）。前日0件の場合は「No prior data」を表示。
   - 課金残高: `creditBalance.lastUpdated` からの経過時間を日数に換算して表示。
   - 価格ポリシー: `DRAFT` 件数を `{count}` として表示。
4. ネットワークエラー時は従来通りカード全体を非表示にせず、Fallback 表示で対応する。

### 非機能要件

- パフォーマンス: ダッシュボード初期表示で追加クエリ数を最小化する（単一の GraphQL クエリで取得）。
- セキュリティ: 既存の `authWithCheck` と `x-operator-id` ヘッダーを利用し、アクセス権を尊重する。
- 保守性: 集計ロジックはユーティリティ関数化し、テスト可能な構造にする。

### コンテキスト別の責務

```yaml
contexts:
  llms:
    description: "AI実行ログの取得"
    responsibilities:
      - promptLogs クエリを提供
      - createdAt 情報による日次集計の材料

  payment:
    description: "課金残高の取得"
    responsibilities:
      - creditBalance クエリを提供
      - NanoDollar→USD 変換の基礎データ

  catalog:
    description: "価格ポリシー管理"
    responsibilities:
      - pricingPolicies クエリの提供
      - ACTIVE / DRAFT 状態の識別
```

### 仕様のYAML定義

```yaml
dashboard_metrics:
  ai_usage:
    window_hours: 24
    compare_window_hours: 24
    source: promptLogs
  billing_balance:
    source: creditBalance
    unit: USD
    formatter: intl-currency
  policy_status:
    source: pricingPolicies
    active_status: ACTIVE
    draft_status: DRAFT
```
- 適切なコメントで意図を明確化
- 単位や通貨は明示的に記載
- バリデーションルールも含める（必要に応じて）

## 実装方針

### アーキテクチャ設計

- 採用するパターン（Clean Architecture, DDD等）
- コンポーネント構成
- データフロー

### 技術選定

- 使用する技術スタック
- ライブラリ・フレームワーク
- 選定理由

### TDD（テスト駆動開発）戦略
<!-- リファクタリングタスクの場合は必須セクション -->

#### 既存動作の保証
- 現在の動作を完全にカバーするテストスイートの作成
- エッジケースとエラーハンドリングのテスト
- パフォーマンスベンチマークの記録

#### テストファーストアプローチ
- 新機能は先にテストを書いてから実装（Red → Green → Refactor）
- 各ステップでテストがグリーンであることを確認
- カバレッジが低下しないことを保証

#### 継続的検証
- 各コミットでのテスト実行
- CIでの自動テスト
- パフォーマンスの劣化がないことの確認

## タスク分解

AI Codingを活用する場合、詳細な実装計画は不要です。代わりに、主要なマイルストーンとチェックポイントのみを記載してください。

### 主要タスク
- [ ] 要件定義の明確化
- [ ] 技術調査・検証
- [ ] 実装
- [ ] テスト・品質確認
- [ ] ドキュメント更新

## Playwright MCPによる動作確認

フロントエンドの変更を伴う場合は、Playwright MCPツールを使用して実際のブラウザ上での動作を確認します。
タスク作成時に、以下のテンプレートを参考に、実装する機能に応じた具体的なチェック項目を作成してください。

### 実施タイミング
- [ ] 実装完了後の初回動作確認
- [ ] PRレビュー前の最終確認
- [ ] バグ修正後の再確認

### 動作確認チェックリスト

<!-- タスク作成時に、実装する機能に応じて具体的なチェック項目を記載してください -->
#### 例：ユーザー認証機能の場合
- [ ] ログイン画面の表示確認
- [ ] 正しい認証情報でのログイン成功
- [ ] 誤った認証情報でのエラー表示
- [ ] ログアウト機能の動作
- [ ] セッションタイムアウトの挙動

#### 例：データ一覧表示機能の場合
- [ ] 一覧画面の初期表示
- [ ] ページネーションの動作
- [ ] 検索・フィルタリング機能
- [ ] ソート機能の動作
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

| フェーズ | 予定 | 備考 |
| --- | --- | --- |
| 📝 調査・設計 ✅ | 2025-10-12 | GraphQL スキーマ確認・数値仕様策定（完了） |
| 🔧 実装 ✅ | 2025-10-12 | API 呼び出し実装・UI 更新（完了） |
| 🔄 テスト | 2025-10-12 | `mise run check` 済 / `yarn --cwd apps/tachyon lint` 済 / `yarn --cwd apps/tachyon ts` は既知の CRM 翻訳未定義で失敗（要共有） |
| 📝 ドキュメント更新 🔄 | 2025-10-12 | 翻訳更新・検証レポート記載 |

## リスクと対策

| リスク | 影響度 | 対策 |
| --- | --- | --- |
| promptLogs の件数が多く描画遅延 | 中 | 期間フィルタリングと件数制限（必要ならバックエンドにクエリ追加を検討） |
| 前日データが存在しない場合の表示揺れ | 低 | 「No prior data」など文言でフォールバック |
| 多言語翻訳との不整合 | 低 | `v1beta-translations.ts` を日英同時更新しレビュー |

## 参考資料

- `apps/tachyon/src/app/v1beta/[tenant_id]/page.tsx`
- `apps/tachyon/src/lib/tachyon-api.ts`
- `apps/tachyon-api/schema.graphql`
- `packages/llms/src/adapter/graphql/resolver.rs`

## 完了条件

- [ ] ダッシュボードの3枚のメトリクスカードが実データを表示する
- [ ] 取得ロジックに対するエラーハンドリングが実装されている
- [ ] 翻訳文字列が新しいメッセージと整合している
- [ ] `mise run check` および `yarn lint --filter=apps/tachyon` が成功する
- [ ] 動作確認レポートに結果を記載済み
