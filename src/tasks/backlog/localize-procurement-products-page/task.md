title: "調達プロダクト一覧の多言語化"
type: improvement
emoji: "🌐"
topics:
  - frontend
  - i18n
  - procurement
published: true
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/procurement/products/components/ProcurementProductList.tsx
  - apps/tachyon/src/lib/i18n/v1beta-translations.ts
  - apps/tachyon/src/app/v1beta/[tenant_id]/procurement/products/page.tsx
github: https://github.com/quantum-box/tachyon-apps
---

## 概要

調達コンテキストの「調達プロダクト」ページを日本語・英語の両言語で表示できるようにし、言語切り替え時もUIテキストとカタログ内容が整合する状態を実現する。

## 背景・目的

- ページ内の文言・データがハードコードされた日本語のままで、多言語利用時にUXが破綻している。
- 調達コンテキストでは英語ドキュメントや北米向け機能が多く、英語UIが必須。
- 共通辞書に集約することで文言管理と検索性を高め、将来的なメンテナンスコストを抑える。

## 詳細仕様

### 機能要件

1. 現在日本語ハードコードされているテキスト、バッジ表示、検索プレースホルダー等を翻訳辞書経由で出力する。
2. プロダクトカタログ（名称・説明・特徴・価格目安）が利用中のロケールに応じた文言で表示される。
3. ロケール変更後もフィルター・検索機能が翻訳済みデータを対象に動作し、検索語と一致する。
4. 多言語化後も「価格一覧を見る」ボタンで価格ページへ遷移できる。

### 非機能要件

- 翻訳テキストは既存の`v1betaTranslations`辞書に集約し、ロケール追加時に一本化された更新が可能な構造とする。
- 既存のクライアントコンポーネント構成・アイコンUIは維持し、不要な再レンダーや依存関係追加を避ける。
- 検索・フィルター操作の処理量やレスポンスに影響を与えない（O(n)ループを現状維持）。

### コンテキスト別の責務

本タスクはTachyonフロントエンド（Next.js App Router）内で完結し、他コンテキストとの境界変更は発生しない。

### 仕様のYAML定義

```yaml
# translations データ構造（抜粋）
procurement:
  products:
    header:
      title: string         # ページ見出し
      description: string   # サブコピー
      ctaToPrices: string   # 価格ページ遷移ボタン
    search:
      placeholder: string
    filters:
      title: string
      category:
        label: string
        placeholder: string
        options:
          all: string
          llm: string
          compute: string
          storage: string
          network: string
          security: string
      provider:
        label: string
        placeholder: string
        all: string
      status:
        label: string
        placeholder: string
        options:
          all: string
          available: string
          preview: string
          deprecated: string
      activeFilters:
        prefix: string
        category: string
        provider: string
        status: string
        search: string
      clear: string
    summary:
      resultCount: string    # {count} を含む
      emptyState: string
      noMatches: string
    table:
      columns:
        product: string
        category: string
        provider: string
        features: string
        pricingType: string
        startingFrom: string
        status: string
        actions: string
      viewPricing: string
    badges:
      status:
        available: string
        preview: string
        deprecated: string
      pricingType:
        usage: string
        subscription: string
        hybrid: string
        fallback: string
    catalog:
      claude-4-opus:
        name: string
        description: string
        features: [string, ...]
        startingFrom: string
      # ... その他プロダクト分
```

## 実装方針

### アーキテクチャ設計

- クライアントコンポーネントで`useTranslation`を利用し、辞書データから動的に文言を取得する。
- プロダクト定義はID・カテゴリ・提供元などロケール非依存情報をコードで保持し、名称・説明・機能リスト等の翻訳可能要素は辞書に委譲する。
- 辞書で不足があってもフェイルセーフにIDベースのフォールバックを返し、画面崩壊を防ぐ。

### 技術選定

- Next.js App Router + React（既存構成）
- `useTranslation` フック（既存 i18n 実装）
- 翻訳辞書（`apps/tachyon/src/lib/i18n/v1beta-translations.ts`）へのエントリ追加

### TDD（テスト駆動開発）戦略
<!-- リファクタリングタスクの場合は必須セクション -->

#### 既存動作の保証
- 既存の`ProcurementProductList`はテスト未整備のため、動作確認はPlaywright MCPによるE2Eチェックで代替。
- 主要UI要素（フィルター、検索、テーブル構造）が渾然一体のため、リグレッションはブラウザ操作で検証。

#### テストファーストアプローチ
- 文言・翻訳データが中心の変更のため、実装後に動作確認チェックリストを更新し、テスト駆動の代替とする。

#### 継続的検証
- `mise run ci-node` での差分検証を実施予定。

## タスク分解

### 主要タスク
- [x] 要件定義の明確化
- [x] 技術調査・検証（既存実装・i18n構造の把握）
- [x] 実装（翻訳辞書整備・コンポーネント改修）
- [ ] テスト・品質確認（Playwright MCPでの動作確認）
- [ ] ドキュメント更新（タスクドキュメント更新・確認レポート反映）

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] 実装完了後の初回動作確認
- [ ] PRレビュー前の最終確認

### 動作確認チェックリスト

- [ ] 日本語ロケールでのUI文言表示を確認（ヘッダー、フィルター、テーブル列）
- [ ] 英語ロケールへ切替後、UI文言とカタログ内容が英語化されること
- [ ] 英語ロケールでの検索（例: "vector"）が期待通りの結果を返すこと
- [ ] フィルター操作（カテゴリ・プロバイダー・ステータス）が多言語表示下でも動作すること
- [ ] 「View price catalog」ボタンから価格ページへ遷移できること
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
