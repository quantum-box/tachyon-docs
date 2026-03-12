---
title: 多言語化（国際化）の実装
type: feature
emoji: "🌐"
topics:
  - Internationalization
  - i18n
  - Frontend
  - React
  - Next.js
published: true
targetFiles:
  - apps/tachyon
  - packages/ui
  - packages/auth
github: https://github.com/quantum-box/tachyon-apps/blob/main/docs/src/tasks/feature/implement-internationalization/task.md
---

# 多言語化（国際化）の実装

## 概要

Tachyon Appsフロントエンドアプリケーションの多言語化を実装します。バックエンドのAPIレスポンスやエラーメッセージは英語を維持し、フロントエンドのUIテキストのみを多言語対応します。まずは`apps/tachyon`から着手し、順次他のアプリケーションにも展開していきます。

## 背景・目的

- **グローバル展開**: 日本語以外のユーザーにもサービスを提供するため
- **ユーザビリティ向上**: ユーザーの母国語でUIを提供し、使いやすさを向上
- **市場拡大**: 多言語対応により新たな市場への参入が可能
- **保守性向上**: 適切なi18nシステムによりテキスト管理が一元化される

## 詳細仕様

### 機能要件

1. **対応言語**
   - 日本語 (ja)
   - 英語 (en)
   - 将来的な拡張性を考慮した設計

2. **言語切り替え機能**
   - ユーザーが任意に言語を切り替え可能
   - 選択した言語の保存（localStorage/Cookie）
   - ブラウザのデフォルト言語検出

3. **翻訳対象**
   - UIテキスト（ボタン、ラベル、メッセージ）
   - エラーメッセージ（フロントエンド起因のもの）
   - 日付・時刻のフォーマット
   - 数値のフォーマット（通貨、パーセンテージ等）

4. **翻訳対象外**
   - バックエンドAPIのレスポンス
   - バックエンドのエラーメッセージ
   - ログメッセージ
   - 技術的な識別子

### 非機能要件

- **パフォーマンス**: 言語切り替えが即座に反映される
- **SEO対応**: 検索エンジンが多言語コンテンツを適切に認識
- **アクセシビリティ**: スクリーンリーダーでの適切な読み上げ
- **保守性**: 翻訳ファイルの管理が容易

### 技術仕様

```yaml
# i18n設定
i18n_config:
  framework: next-i18next  # Next.js公式推奨
  
  supported_locales:
    - code: ja
      name: 日本語
      default: true
    - code: en
      name: English
      
  file_structure:
    location: public/locales/{locale}/{namespace}.json
    namespaces:
      - common      # 共通UI要素
      - auth        # 認証関連
      - billing     # 課金関連
      - ai          # AI機能関連
      - errors      # エラーメッセージ
      
  routing:
    strategy: path_prefix  # /ja/*, /en/*
    default_redirect: true
    
  detection:
    order:
      - cookie
      - header
      - path
      
# 日付・数値フォーマット
formatting:
  date_time:
    ja:
      date: YYYY年MM月DD日
      time: HH:mm
      datetime: YYYY年MM月DD日 HH:mm
    en:
      date: MM/DD/YYYY
      time: HH:mm
      datetime: MM/DD/YYYY HH:mm
      
  numbers:
    ja:
      currency: ¥{value}
      percentage: {value}%
    en:
      currency: ${value}
      percentage: {value}%
```

## 実装方針

### アーキテクチャ設計

1. **Next.js App Routerとの統合**
   - middleware.tsでlocale検出とリダイレクト
   - app/[locale]/layout.tsxで言語設定の提供
   - Server ComponentsとClient Componentsの両方で対応

2. **コンポーネント構成**
   ```
   apps/tachyon/
   ├── app/
   │   ├── [locale]/
   │   │   ├── layout.tsx
   │   │   ├── page.tsx
   │   │   └── (routes)/
   │   └── i18n/
   │       ├── settings.ts
   │       └── client.ts
   ├── public/
   │   └── locales/
   │       ├── ja/
   │       │   ├── common.json
   │       │   └── ...
   │       └── en/
   │           ├── common.json
   │           └── ...
   └── middleware.ts
   ```

3. **共通コンポーネントの対応**
   - packages/uiの共通コンポーネントもi18n対応
   - PropsでtranslationKeyを受け取る設計

### 技術選定

- **i18nフレームワーク**: next-i18next
  - Next.js公式推奨
  - SSR/SSG対応
  - 実績豊富
  
- **翻訳管理**: JSONファイル
  - シンプルで管理しやすい
  - 将来的にCMS連携も可能
  
- **日付処理**: date-fns
  - 既に使用中
  - i18n対応済み

### 移行戦略

1. **段階的移行**
   - Phase 1: 基盤構築とcommon namespace
   - Phase 2: 各機能ごとに順次移行
   - Phase 3: packages/uiの対応
   
2. **既存コードへの影響最小化**
   - ハードコードされたテキストを段階的に置換
   - 型安全性を保証するTypeScript定義

## タスク分解

### Phase 1: 基盤構築と基本実装 📝

- [x] App Routerベースのi18nインフラ
  - [x] `detectLocale()`でcookie/Accept-Languageからロケール判定
  - [x] Server Component (`layout.tsx`) で辞書提供 & `<html lang>`設定
  - [x] クライアント側 `useTranslation` をContext経由で再実装
  
- [x] 言語切り替えUX
  - [x] `LanguageSwitcher`でcookie更新＋`router.refresh()`による再描画
  - [x] `translations.ts`へ辞書型エクスポートを追加し型安全に
  
- [x] 最初の翻訳セット整備
  - [x] `common` / `contact` / `pricing` / `agentApi` / `auth` セクション追加
  - [x] LP全体（`/`, `/agent-api`）・公開向けナビ/フッターの文字列抽出

### Phase 2: 主要機能の多言語化 📝

- [ ] 認証関連
  - [ ] ログイン/ログアウト画面
  - [ ] エラーメッセージ
  
- [ ] ダッシュボード
  - [ ] ナビゲーション
  - [ ] 統計情報の表示
  
- [ ] AI機能
  - [ ] AI Studio
  - [ ] Agent Chat
  
- [ ] 課金機能
  - [ ] 料金プラン表示
  - [ ] 使用量表示

### Phase 3: 共通コンポーネントと最適化 📝

- [ ] packages/uiの対応
  - [ ] 共通コンポーネントのi18n対応
  - [ ] Storybookでの動作確認
  
- [ ] 最適化とテスト
  - [ ] パフォーマンステスト
  - [ ] E2Eテストの更新
  - [ ] SEO最適化

### 進捗メモ (2025-10-07) - 大幅進捗

#### 新規完了セクション
- **エラーページ完全翻訳対応**: 全エラーページを翻訳キー化
  - `/403`（アクセス拒否ページ）
  - `/error.tsx`（500サーバーエラーページ）- セッション期限切れメッセージ含む
  - `/not-found.tsx`（404ページ）
  - `v1beta.errors` namespaceを新設し、英語・日本語の辞書を整備

- **Feature Flags完全翻訳対応**: Feature Flags全ページを翻訳キー化
  - メインページ（`/v1beta/[tenant_id]/feature-flags`）
  - Playground（`feature-flags/playground`）
  - A/Bテストレポート（`feature-flags/reports`）
  - `v1beta.featureFlags` namespaceでパンくず、ページタイトル、説明文を統一管理

- **Settings完全翻訳対応**: Settings全主要ページを翻訳キー化
  - メイン設定ページ（`/v1beta/[tenant_id]/settings`）
  - Operator設定（`settings/operator`）
  - Platform設定（`settings/platform/providers`）
  - Host設定（`settings/host/system`）- 管理者警告メッセージ含む
  - `v1beta.settings` namespaceで階層的な設定構造を表現

- **IaC完全翻訳対応**: IaC全ページを翻訳キー化
  - メインページ（`/v1beta/[tenant_id]/iac`）
  - Provider設定（`iac/provider`）
  - Platform Manifest Template（`iac/platform_manifest_template`）- エラートースト含む
  - `v1beta.iac` namespaceでマニフェスト関連の翻訳を管理

- **MCP設定完全翻訳対応**: MCP設定画面を翻訳キー化
  - メインページ（`/v1beta/[tenant_id]/mcp-config`）
  - チャットへの戻るボタン、タイトル、説明文を翻訳
  - `v1beta.mcp` namespaceを新設

- **Procurement完全翻訳対応**: Procurement主要ページを翻訳キー化
  - メインページ（`/v1beta/[tenant_id]/procurement`）- ナビゲーションカード全4項目
  - プロダクト一覧（`procurement/products`）
  - 価格一覧（`procurement/prices`）
  - `v1beta.procurement` namespaceでパンくず、ページ説明、ナビゲーション項目を管理

- **Pricing残りページ完全翻訳対応**: Pricing残りページを翻訳キー化
  - プラン管理（`pricing/plans`）
  - セグメント管理（`pricing/segments`）
  - 価格分析（`pricing/analysis`）
  - 既存の`v1beta.pricing` namespaceに`plans`/`segments`/`analysis`サブキーを追加

- **IAM残りページ完全翻訳対応**: IAM主要ページを翻訳キー化
  - サービスアカウント一覧（`iam/service_account`）
  - ポリシー管理（`iam/policies`）- パンくず、タイトル、説明文
  - アクションリファレンス（`iam/actions`）- パンくず、タイトル、説明文
  - オペレーター管理（`iam/operator`）- パンくず、タイトル、削除ダイアログ、エラートースト
  - 既存の`v1beta.iam` namespaceに各種サブキーを追加

- **AI Suite基本翻訳対応**: AI関連主要ページを翻訳キー化
  - プレイグラウンド（`/ai`）- モード選択、プレースホルダー、ボタン
  - Agent チャット（`ai/agent/chat`）- ローディング表示
  - メモリー管理（`ai/memory`）- ページタイトル
  - 既存の`v1beta.ai` namespaceに`agent`/`memory`/`playground`サブキーを追加
  - AI Studio/Chat系の詳細翻訳は以前完了済み

- **AI Chat系完全翻訳対応**: AI Chat関連ページを翻訳キー化
  - Chat layout（`ai/chat/layout.tsx`）- メタデータ
  - Chat Temporary（`ai/chat-temporary`）- Mermaid図表示切替、エラーメッセージ、プレースホルダー
  - `v1beta.ai.chat` namespaceに`layout`/`temporary`サブキーを追加

- **Settings残りページ完全翻訳対応**: Settings配下の残りページを翻訳キー化
  - Host設定: database/security/monitoring/pricing（パンくずリスト翻訳）
  - Platform設定: operators/limits/pricing（パンくずリスト翻訳）
  - 既存の`v1beta.settings.host`/`platform`に各サブキーを追加

- **共通コンポーネント完全翻訳対応**: 共通エラー・UI要素の翻訳キー化
  - GraphQLエラーハンドリング（`mutationError.ts`）を`common.errors.graphql`で翻訳対応
  - DataTableの共通UI要素（フィルター、ページネーション）を`common.dataTable`で翻訳対応
  - 共通エラーメッセージ: parseError/unexpectedError/duplicateKey/validation/permission/dataTooLong/networkError/serverError
  - 既存の`common.actions.toggleSidebar`など、共通レイアウトは以前から対応済み

#### 既存完了（前回まで）
- **Billing完全翻訳対応完了**: `/v1beta/[tenant_id]/billing` 配下の全コンポーネントを翻訳キー化。
  - クレジット残高表示（`creditBalanceSection`, `creditBalanceClient`）
  - 支払い方法管理（`paymentMethods`, `paymentMethodsSection`, `paymentMethodsToasts`）
  - クレジット購入ダイアログ（`purchaseDialog`）- タブ、金額選択、支払い方法選択、エラーメッセージなど全UI
  - 支払い方法追加ダイアログ（`addPaymentMethodDialog`）
  - 取引履歴（`transactionHistory`）- テーブルカラム、取引種別、ページネーション
  - 購入成功ページ（`successPage`）
- **IAM基本翻訳対応完了**: `/v1beta/[tenant_id]/iam` のダッシュボードとユーザー管理を翻訳。
  - IAMダッシュボード（`iam.dashboard`）- クイックアクション、統計カード、管理カード、セキュリティ通知
  - ユーザーリストと招待ダイアログ（`iam.userList`）

#### 品質状況
- **TypeScriptエラー: 0件** - 全ての翻訳キーが型安全に実装済み
- **リンターエラー: 0件** - コード品質を完全に維持
- **翻訳ファイルサイズ**: `v1beta-translations.ts` 2,074行（充実した翻訳辞書）

### 進捗メモ (2025-09-29)
- v1beta Pricingトップ (`/v1beta/[tenant_id]/pricing`) を辞書駆動に変更し、パンくず・ヘッダー・Suspenseフォールバックを`v1beta.pricing.page`で管理できるようにした。
- PricingPolicyList / PricingPolicyDialog の全UIテキストとトースト文言を翻訳キー化し、`Intl.NumberFormat` / `Intl.DateTimeFormat` でロケールごとのフォーマットを統一。
- `v1beta.pricing` namespace を `v1beta-translations.ts` に追加し、英語・日本語の辞書値を定義。今後のプラン/サービス/分析ページでも再利用可能なキー構造を整備。
- `/v1beta/[tenant_id]/pricing/services` 一式を多言語化。統計カード、フィルター、テーブル、ページネーション、詳細ページ（`[id]`）の価格マッピング／シミュレーター／履歴ビューを辞書経由に切り替え、金額・率表示を `Intl.NumberFormat` でロケール別に整形するよう調整。

### 進捗メモ (2025-09-24)
- v1betaダッシュボードトップ (`/v1beta/[tenant_id]/page.tsx`) を翻訳辞書から描画するよう実装し、共通テーブルの空表示も辞書化。
- 翻訳構成を整理し、`v1beta`・`pricingLlm` 向けの専用辞書を追加して `get-dictionary.ts` からマージできるようにした。
- Self Service カタログで辞書の `features` を可変配列に変換する処理を追加し、型安全に購入ダイアログへ渡せるようにした。


## 対象ページ・コンポーネント一覧（2025-09-23時点）

実装漏れをなくすため、画面単位で対応状況を管理する。`✅`は実装済み、`📝`は着手中またはこれから対応する項目。

### 公開/マーケティング系
- ✅ `/` （ランディング一式: Hero / Feature / UseCase / Pricing / Contact / Header / Footer）
- ✅ `/agent-api`
- ✅ `/pricing/llm`
- ✅ `/pricing/llm/models/[provider]/[model]`
- ✅ `/sign_in`
- ✅ `/sign_out`
- ✅ `/new-org`（フォームコンポーネント含む）
- ✅ `/new-org/success`
- ✅ `/signin`（リダイレクトのみ）
- 📝 `/(public)/pricing` 以下の将来追加予定ページ

### サインアップ/認証フロー
- ✅ `/signup`（LPスタイル）
- ✅ `/signup/create-account`
- ✅ `/signup/verify-email`
- ✅ `/signup/confirm`
- ✅ `/signup/welcome`
- ✅ `/signup/workspace-setup`
- ✅ `/signup/onboarding`
- ✅ `/signup/confirm` 経由のサーバーアクション応答メッセージ
- ✅ `/sign_in` / `/sign_out`（上記）

### Self Service / New Operator
- ✅ `/v1beta/[tenant_id]/self-service` 一式
- ✅ `/v1beta/[tenant_id]/self-service/orders` / `orders/[order_id]`
- ✅ GraphQLエラー通知・トースト文言の抽出

### v1beta ダッシュボード共通
- ✅ `/v1beta/[tenant_id]/page.tsx`（トップダッシュボード概要）
- ✅ 共通レイアウト・ナビゲーション・パンくず（`V1BetaSidebarHeader` など）
- ✅ 共有テーブル/フィルタ/ボタン等のコンポーネント翻訳キー化

### v1beta サブモジュール（機能別）
- **AI Suite** ✅
  - ✅ `/v1beta/[tenant_id]/ai`（プレイグラウンド翻訳完了）
  - ✅ `/ai/studio`、`/ai/studio/editor`、`/ai/studio/history`（AI Studio dashboard基本翻訳完了）
  - ✅ `/ai/agent/chat`（Agent チャット翻訳完了）
  - ✅ `/ai/memory`（メモリー管理翻訳完了）
  - ✅ `/ai/chat`（Chat layout翻訳完了）
  - ✅ `/ai/chat-temporary`（Chat Temporary翻訳完了）
  - 📝 `/ai/chat/[chatroom_id]`、`/ai/chat-stream`、`/ai/history`（一部Chat詳細ページは未対応）
- ✅ サイドバー（ナビゲーション／プラットフォーム切替／クイックリンク／ユーザードロップダウン）
- **Pricing** ✅
  - ✅ `/v1beta/[tenant_id]/pricing`
  - ✅ `pricing/services`、`pricing/services/[id]`
  - ✅ `pricing/plans`（プラン管理翻訳完了）
  - ✅ `pricing/segments`（セグメント管理翻訳完了）
  - ✅ `pricing/analysis`（価格分析翻訳完了）
  - 📝 `pricing/[policyId]`（詳細ページは未対応）
- **Billing** ✅
  - ✅ `/v1beta/[tenant_id]/billing`（全コンポーネント翻訳完了）
  - ✅ `billing/success`
  - ✅ クレジット残高、支払い方法、取引履歴、購入ダイアログ
- **Feature Flags** ✅
  - ✅ `/v1beta/[tenant_id]/feature-flags`（メインページ翻訳完了）
  - ✅ `feature-flags/playground`（プレイグラウンド翻訳完了）
  - ✅ `feature-flags/reports`（A/Bテストレポート翻訳完了）
- **MCP / Integrations** ✅
  - ✅ `/v1beta/[tenant_id]/mcp-config`（メインページ翻訳完了）
- **IAM** ✅
  - ✅ `/v1beta/[tenant_id]/iam`（ダッシュボード翻訳完了）
  - ✅ `iam/user`（ユーザーリスト・招待ダイアログ）
  - ✅ `iam/service_account`（サービスアカウント一覧翻訳完了）
  - ✅ `iam/policies`（ポリシー管理翻訳完了）
  - ✅ `iam/actions`（アクションリファレンス翻訳完了）
  - ✅ `iam/operator`（オペレーター管理翻訳完了）
  - 📝 `iam/user/[user_id]`、`iam/service_account/[service_account_id]`、`iam/policies/[id]`（詳細ページは未対応）
- **IAC** ✅
  - ✅ `/v1beta/[tenant_id]/iac`（メインページ翻訳完了）
  - ✅ `iac/provider`（プロバイダー設定翻訳完了）
  - ✅ `iac/platform_manifest_template`（プラットフォームテンプレート翻訳完了）
- **Procurement** ✅
  - ✅ `/v1beta/[tenant_id]/procurement`（メインページ翻訳完了）
  - ✅ `procurement/products`（プロダクト一覧翻訳完了）
  - ✅ `procurement/prices`（価格一覧翻訳完了）
  - 📝 `procurement/suppliers`、`procurement/contracts`（契約管理は準備中）
- **Settings** ✅
  - ✅ `/v1beta/[tenant_id]/settings`（メイン設定ページ翻訳完了）
  - ✅ `settings/host`＋配下（`system` / `database` / `security` / `monitoring` / `pricing` 全翻訳完了）
  - ✅ `settings/platform`＋配下（`providers` / `operators` / `limits` / `pricing` 全翻訳完了）
  - ✅ `settings/operator`（組織設定翻訳完了）

### 403 / エラーページ
- ✅ `/403`（アクセス拒否ページ翻訳完了）
- ✅ `error.tsx`（500エラーページ翻訳完了）
- ✅ `not-found.tsx`（404エラーページ翻訳完了）

### 共通/共有コンポーネント ✅
- ✅ GraphQLエラー通知・トースト文言の抽出と翻訳対応（`mutationError.ts`, `common.errors.graphql` namespace）
- ✅ 共通レイアウト・ナビゲーション・パンくず（`V1BetaSidebarHeader` は既に `common.actions.toggleSidebar` で対応済み）
- ✅ 共有テーブル/フィルタ/ボタン等の汎用UI（`common.dataTable.filter`, `common.dataTable.pagination` 追加）
- ℹ️ `packages/ui`は他アプリでも使用されるため、Tachyon固有の翻訳は不要（各アプリで個別対応）

## 残タスク詳細計画 (2025-09-29更新)

各モジュールでの残対応を以下に整理し、担当者が着手した際の手順と
完了条件を明確化する。翻訳キーは`<ドメイン>.<機能>.<要素>`形式で命名し、
共通辞書に寄せられる場合は`common`、機能固有の場合は専用namespaceを
追加する。React Server Componentでは`getDictionary()`を活用し、Client
Componentでは`useTranslation(namespace)`を基本とする。

### v1beta 共通レイアウト / ナビゲーション
- `V1BetaSidebarHeader`と`V1BetaLayout`配下で使用している固定文言を
  `v1beta.common` namespaceへ移行。
- サイドバー、パンくず、タブ切替など共通UI向けに`v1beta.navigation`を
  新設し、テナント名やオペレーター名など動的値はプレースホルダーで対応。
- レスポンシブメニューやモバイルヘッダーでも同じ辞書を参照するよう整理。

### AI Suite
- `AI Suite`配下は`v1beta.ai` namespaceを導入し、Studio / Chat / Memoryで
  サブキーを分割。履歴一覧や一時チャットのステータスラベルも辞書化。
- コード生成やツール呼び出し結果に付随する状況メッセージは英語を保持し、
  UIラベルのみ翻訳。`packages/ui`のエディタコンポーネントと連携し、
  プラグインツールバー文言も同namespaceで提供。
- Playwrightのテストではチャット送受信のメッセージ文言を辞書キー参照に
  書き換え、テストの安定性を確保。

### Pricing / Billing
- ✅ `/v1beta/[tenant_id]/pricing` は `v1beta.pricing` namespace で翻訳済み（2025-09-29）。残りの配下ページも同構造を適用する。
- `pricing`配下は`v1beta.pricing`、課金サマリーは`v1beta.billing` namespaceを
  利用し、プラン名・説明・ボタン文言をJSON化。料金表の数値フォーマットは
  `formatPrice()`にlocale引数を追加して切り替える。
- Stripe連携メッセージや利用状況グラフの凡例も辞書化し、通貨単位を
  `Intl.NumberFormat`で制御。
- 自動課金設定やクレジット購入モーダルでは、APIエラーをGraphQLコードと
  結び付けるマップを`packages/ui`に追加し、翻訳を参照する。

### Feature Flags / MCP / Integrations
- Feature Flagsは`v1beta.featureFlags` namespaceでトグル状態・ロールアウト
  戦略ラベル・シミュレーターの説明文を定義。グラフの凡例は共通コンポーネント
  と共有するため、`packages/ui`のチャート辞書を用意。
- MCP設定画面は`v1beta.mcp` namespace。連携ステータス、接続テスト結果、
  Webhook説明文などを翻訳キー化。

### IAM / IAC
- `iam`配下はロール・ポリシー一覧、ユーザー詳細のセクションタイトルを
  `v1beta.iam` namespaceで管理。操作ログや権限エラーメッセージは
  `packages/auth`側のユーティリティで翻訳キーに変換する。
- IACは`v1beta.iac` namespaceを新設し、マニフェスト説明・検証結果メッセージ
  を翻訳。YAMLサンプルのコメントは英語維持。

### Procurement
- `v1beta.procurement` namespaceでサプライヤー/商品/契約テーブルのヘッダー、
  フィルタ、モーダルを辞書化。HubSpot同期結果のトーストメッセージは
  既存の`packages/ui`トーストマネージャーに翻訳キーを渡す。

### Settings
- Host / Platform / Operator各セクションに対応するサブnamespace
  (`settings.host`, `settings.platform`, `settings.operator`)を定義。
- タブ・フォームラベル・バリデーションメッセージを辞書化し、
  Zodでの検証エラーを翻訳キー経由で表示できるよう`zod-i18n-map`を導入。
- システム設定の説明文が長文の場合はMarkdownに対応した翻訳を想定し、
  `react-markdown`で描画可能か検証。

### エラーページ / 共通エラーハンドリング
- `/403`、`error.tsx`、`not-found.tsx`は`common.errors` namespaceを利用し、
  ページタイトル・説明・戻るボタンを翻訳。NextAuthからのエラーパラメータを
  キーに変換するマッピングテーブルを用意。
- GraphQLレスポンスの`extensions.code`を翻訳キーにマップするヘルパーを
  `apps/tachyon/src/lib/i18n/errors.ts`として追加。

### packages/ui / 共通部品
- Form、Table、Toast、Dialogなど汎用コンポーネントのデフォルト文言を
  `ui.common` namespaceに移す。プロパティで文言を上書き可能な設計を維持。
- Storybookでは`locale`切り替えコントロールを追加し、主要コンポーネントの
  スナップショットを各言語で確認。`yarn test-storybook -- --includeTags=i18n`
  を追加し、翻訳漏れを検出する。

### QA / ドキュメント整備
- `docs/src/tachyon-apps/authentication/multi-tenancy.md`など関連ドキュメントに
  i18nの更新点を追記し、ヘッダやナビゲーションの言語切り替え手順を記載。
- `CLAUDE.md`には辞書構成や翻訳キー命名規約の要点のみ追記し、詳細は本タスク
  ドキュメントで管理。

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] Phase 1完了後の基本動作確認
- [ ] Phase 2の各機能実装後
- [ ] 全体実装完了後の統合テスト

### 動作確認チェックリスト

#### 基本機能の確認
- [ ] デフォルト言語（日本語）での表示
- [ ] 言語切り替えボタンの表示と動作
- [ ] 英語への切り替え
- [ ] ページリロード後の言語設定保持
- [ ] ブラウザ言語設定による自動選択

#### 各画面での確認
- [ ] ログイン画面の多言語表示
- [ ] ダッシュボードの多言語表示
- [ ] AI Studioの多言語表示
- [ ] 課金ページの多言語表示
- [ ] エラーメッセージの適切な表示

#### 日付・数値フォーマット
- [ ] 日付の言語別フォーマット確認
- [ ] 通貨表示の確認（¥/$）
- [ ] パーセンテージ表示の確認

### 実施手順
1. **開発サーバーの起動**
   ```bash
   yarn dev --filter=tachyon
   ```

2. **動作確認レポートの作成**
   - `./verification-report.md`に結果を記録
   - 各言語でのスクリーンショットを保存

3. **レスポンシブ確認**
   - デスクトップ（1920x1080）
   - タブレット（768x1024）
   - モバイル（375x667）

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 翻訳の品質 | 高 | ネイティブスピーカーによるレビュー、将来的には翻訳サービス利用 |
| パフォーマンスへの影響 | 中 | 必要な翻訳のみロード、キャッシュ戦略の実装 |
| 保守コストの増加 | 中 | 翻訳キーの命名規則統一、自動化ツールの導入検討 |
| 文字列長による表示崩れ | 中 | レスポンシブデザインの徹底、文字数制限の設定 |

## 参考資料

- [Next.js Internationalization](https://nextjs.org/docs/app/building-your-application/routing/internationalization)
- [next-i18next Documentation](https://github.com/i18next/next-i18next)
- [Web Content Accessibility Guidelines (WCAG) - Language](https://www.w3.org/WAI/WCAG21/Understanding/language-of-page.html)

## 完了条件

- [ ] apps/tachyonの全画面が多言語対応されている
- [ ] 言語切り替えが全ページで正常に動作する
- [ ] パフォーマンスの劣化がない
- [ ] E2Eテストが全て通過する
- [ ] 動作確認レポートが完成している
- [ ] 正式な仕様ドキュメントを作成済み
- [ ] タスクディレクトリを completed/[新バージョン]/ に移動済み

### バージョン番号の決定基準

このタスクが完了した際のバージョン番号の上げ方：

**マイナーバージョン（x.X.x）を上げる場合:**
- [x] 新機能の追加（多言語対応は新機能）
- [ ] 新しい画面の追加
- [ ] 新しいAPIエンドポイントの追加
- [ ] 新しいコンポーネントの追加
- [x] 既存機能の大幅な改善（UXの大幅向上）
- [ ] 新しい統合やサービスの追加

推奨: **v0.4.0 → v0.5.0**

## 備考

- バックエンドのメッセージは英語を維持することで、ログ解析や開発者間のコミュニケーションを統一
- 将来的には中国語（簡体字/繁体字）、韓国語などの追加も検討
- 翻訳管理ツール（Crowdin、Phrase等）の導入も将来的に検討
