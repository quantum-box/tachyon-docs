# Library実装サマリー

最終更新: 2025-11-19 / 対象リポジトリ: `apps/library`

本ドキュメントは、Libraryサービスのフロントエンド実装で現在提供されている機能を可視化し、関連するコード参照・GraphQL呼び出しをまとめたものです。Next.js App Router配下の画面（`/v1beta` 系、マーケティングLP、認証フロー）を網羅し、ダミー状態の領域も併記します。

## 1. 全体構成

| 要素 | 内容 |
| --- | --- |
| ランタイム | Next.js App Router + React Server Components。`layout.tsx` で `SessionProvider` と `ThemeProvider` を包み、`fetchCache = 'force-no-store'` で常に最新データを取得しています。`apps/library/src/app/layout.tsx:1`, `apps/library/src/app/providers.tsx:1` |
| API クライアント | GraphQL/REST クライアントは `getSdkPlatform`/`getSdkOperator` を経由し、`x-platform-id`/`x-operator-id` を自動付与します。`apps/library/src/lib/apiClient.ts:1` |
| 共通サーバーアクション | `createSdkPlatform`/`createSdkOperator` は NextAuth で取得したアクセストークンを GraphQL クライアントに渡します。`apps/library/src/lib/api-action.ts:1` |
| 認証状態付きSDK呼び出し | `platformAction` が GraphQL errors を `PlatformActionError` に正規化し、NotFound/Unauthorized に応じたハンドリングを実装。`apps/library/src/app/v1beta/_lib/platform-action.ts:1` |
| サインアップOTPフロー | SignUp成功時に `sessionStorage` へ `librarySignupData` を保存し、Verify Email( `/verify-email/otp` )で 6 桁コード入力→Cognito `ConfirmSignUp` 実行。コード再送は 60 秒クールダウン、完了後は自動サインイン（失敗時は `/sign_in` へ誘導）。`apps/library/src/app/(auth)/sign_up/form.tsx:1`, `.../sign_up/cognito-actions.ts:1`, `.../verify-email/otp/page.tsx:1`, `.../sign_up/constants.ts:1` |
| 画像/OG | `/open-graph` 配下でOG画像を提供（詳細割愛）。 |
| Storybook用UI | `/apps/library/src/app/v1beta/_components/**` で `.stories.tsx` を併設し、UIの単体プレビューを用意。 |

## 2. 認証・セッション管理

- NextAuth 設定 (`auth.ts`) が Cognito OAuth + Credentials 両対応。JWT に `accessToken`/`refreshToken` を保持し、失効時は `cognitoRefreshAccessToken` で再取得します。`apps/library/src/app/(auth)/auth.ts:1`, `apps/library/src/app/(auth)/cognito.ts:1`
- `SignUp`/`SignIn`/`SignOut`/`Verify Email` の各ページは独立したフォームを持ち、`SignUp` は Cognito `SignUpCommand` を直接叩きます。`apps/library/src/app/(auth)/sign_up/page.tsx:1`, `apps/library/src/app/(auth)/sign_up/form.tsx:1`, `apps/library/src/app/(auth)/sign_up/action.ts:1`, `apps/library/src/app/(auth)/sign_in/page.tsx:1`, `apps/library/src/app/(auth)/sign_in/form.tsx:1`, `apps/library/src/app/(auth)/sign_out/page.tsx:1`, `apps/library/src/app/(auth)/verify-email/page.tsx:1`
- 認証済みユーザーには `/` で Dashboard、未ログインには多言語LPを返すゲーティングを `app/page.tsx` で実装。`apps/library/src/app/page.tsx:1`

## 3. エントリーフロー & ランディング

| フロー | 実装状況 |
| --- | --- |
| LP (`/lp`) | `Hero/Features/Capabilities/Pricing/Roadmap` を多言語コンポーネントで構成。`apps/library/src/app/lp.tsx:1` |
| 新規オーガナイゼーション（プライベート） | `/v1beta/organization/new` で `NewOrgForm` を表示し、`createOperator` を叩いて Operator/Org を作成。`apps/library/src/app/v1beta/organization/new/page.tsx:1`, `apps/library/src/app/v1beta/new/page.tsx:1`, `apps/library/src/app/v1beta/new/form.tsx:1`
| 新規オーガナイゼーション（公開LP版） | `/new-org` (public) でも同様のフォームを用意。ただしユーザー作成API部分は TODO コメントのまま。`apps/library/src/app/(public)/new-org/component.tsx:1`
| 新規DB/Repo | `/v1beta/[org]/databases/new` が GraphQL `createRepoOnOrgNewDatabasePage` を呼び出し、同フォームから公開設定やPKの指定を行います。`apps/library/src/app/v1beta/[org]/databases/new/form.tsx:1`, `action.ts:1`

## 4. ダッシュボード & ナビゲーション

- `Dashboard` コンポーネントは `sdk.dashboard()` の結果（自分のオペレーター一覧等）を用い、左サイドバーで Organization リンクを表示。`apps/library/src/app/dashboard.tsx:1`
- グローバルヘッダー/サイドバーは `v1beta/_components/header` と `navigation.tsx` を中心に構成（Story有り）。
- 右サイドバー（latest changes, explore）はプレースホルダ文言のまま（実データ未接続）。

## 5. 組織管理（/v1beta/[org])

- `OrganizationPage` はタブUIを持ち、`Databases` タブで `organization.repos` をカード表示。`apps/library/src/app/v1beta/[org]/page.tsx:1`
- 設定フォームは `OrganizationForm` コンポーネントが `updateOrgAction`（GraphQL `updateOrgOnForm`）を呼び、名前/説明を更新します。`apps/library/src/app/v1beta/[org]/_components/organization-edit-form.tsx:1`, `action.ts:1`
- API Key 管理は `ApiKeyListServer` + `ApiKeyDialog` で構成。既存キー一覧取得 (`getApiKeys`) と、Dialog 内でキー発行→コピー→再描画のフローを持ちます。`apps/library/src/app/v1beta/[org]/_components/api-key-list-server.tsx:1`, `api-key-dialog.tsx:1`
- メンバー招待は `/v1beta/[org]/organizations/invite` が `inviteUser` サーバーアクションを呼び、Platform SDK→Operator SDK の二段階で招待を実行。`apps/library/src/app/v1beta/[org]/organizations/invite/page.tsx:1`, `action.ts:1`
- `/v1beta/[org]/organizations/new` は UI のみ存在し、API 連携は未実装（トーストのみ）。`apps/library/src/app/v1beta/[org]/organizations/new/page.tsx:1`

## 6. リポジトリ管理（/v1beta/[org]/[repo])

- `RepositoryPage` は `repositoryPageWithTags` → フォールバック `repositoryPage` の二段構えでタグ有無に対応します。`apps/library/src/app/v1beta/[org]/[repo]/page.tsx:1`
- `RepositoryUi` では以下を実装。
  - データ一覧（ページネーション、更新日の整形、`DataDetail` への遷移ボタン）。
  - ラベル/公開設定の編集ダイアログ、外部URL/Source/Contributor の表示、Primary Link コピー機能。`apps/library/src/app/v1beta/[org]/[repo]/components/repository-ui.tsx:1`
  - `onMetaUpdate` で `UpdateRepoSettings` を呼び出し、`revalidatePath` により再描画。
- `settings/` ページでは General Settings（名称/説明/公開設定）・Username変更・削除を個別フォームで提供。全て Server Action 経由で GraphQL mutation を実行します。`apps/library/src/app/v1beta/[org]/[repo]/settings/form.tsx:1`, `actions.ts:1`
- `data` セクション:
  - `/data/[dataId]` で既存データを取得し、編集可否はログイン状態で制御。`apps/library/src/app/v1beta/[org]/[repo]/data/[dataId]/page.tsx:1`, `action.ts:1`
  - `/data/new` で空の `PropertyData` を生成し、`createData` mutation を実行。`apps/library/src/app/v1beta/[org]/[repo]/data/new/page.tsx:1`, `action.ts:1`
- `reviews` 配下は Storybook のダミーデータを表示するのみ（GraphQL連携なし）。`apps/library/src/app/v1beta/[org]/[repo]/reviews/page.tsx:1`, `[reviewId]/page.tsx:1`

## 7. データ表示・編集 UI

- `DataDetailUi` がデータ詳細/編集を担い、以下の責務を持ちます。`apps/library/src/app/v1beta/_components/data-detail-ui/index.tsx:1`
  - リッチテキスト（Markdown/HTML）の自動判別 → `HtmlSection` + `HtmlViewAndEditor` (dynamic import) でWYSIWYG編集。`html-section.tsx:1`, `html/index.tsx:1`
  - Secondary properties テーブルは `PropertyValue` コンポーネントが型ごとに入力UIを切り替え（単一/複数セレクト, Relation ID, Integer 等）。`property-value/index.tsx:1`
  - 編集/プレビュー切り替え、ドラフト保存後のトースト、`useTransition` を用いた非同期保存処理。
- `convertPropertyData` が PropertyType を基に GraphQL `PropertyDataInput` へ変換。`apps/library/src/app/v1beta/_lib/property-data-converter.ts:1`
- `DataListCard` (同ディレクトリ) は関連データをサマリ表示し、Detail ページに併用。

## 8. プロパティ管理

- `/v1beta/[org]/[repo]/properties` は Property 一覧をテーブル表示し、Add/Edit/Delete ダイアログを内包。`apps/library/src/app/v1beta/[org]/[repo]/properties/page.tsx:1`, `_components/properties-ui/index.tsx:1`
- Select/MultiSelect はオプション編集 UI、Relation は関連DB IDを表示。Essential property (`id`, `name`, `createdAt`, `updatedAt`, `content`) は削除不可に制御。
- GraphQL 側では `addProperty`/`updateProperty`/`deleteProperty` を各ボタンから呼び出し。`getPropertyMeta` が PropertyType に応じた `PropertyMetaInput` を算出。

## 9. APIキー・権限・招待

- API キー: `createApiKeyAction` が GraphQL `createAPIKey` を実行し、Dialogに即時表示→コピー→再描画、`revalidatePath` でリスト更新。`apps/library/src/app/v1beta/[org]/_components/action.ts:1`
- 権限チェック: `useWritePermissionHooks` は `policies` フラグメントから OWNER/WRITER を検出し、編集可否をUIで制御できるよう hook を提供。`apps/library/src/features/WritePermissionHooks/index.tsx:1`
- 組織メンバー招待: `inviteUser` は Platform 側で `orgInvitePage` → Operator SDK `inviteUser` を実行し、通知送信フラグをサポート。`apps/library/src/app/v1beta/[org]/organizations/invite/action.ts:1`

## 10. GraphQL / REST 呼び出し一覧

| 領域 | 呼び出し | 用途 |
| --- | --- | --- |
| ダッシュボード | `dashboard`, `newRepoPage` | 自分のオペレーター一覧、新規Repo作成画面初期値 |
| 組織 | `orgPage`, `updateOrgOnForm`, `getApiKeys`, `createAPIKey`, `orgInvitePage` | 組織情報/Repo一覧/設定/APIキー/招待 |
| Repository | `repositoryPageWithTags` (fallback `repositoryPage`), `GetOrgSettings`, `UpdateRepoSettings`, `DeleteRepo`, `ChangeRepoUsername` | Repo詳細、設定更新/削除/リネーム |
| データ | `dataDetailPage`, `newData`, `addData`, `updateData` | データ表示・作成・更新 |
| プロパティ | `properties`, `addProperty`, `updateProperty`, `deleteProperty` | スキーマ編集 |
| オンボーディング | `createOperator`, `createRepoOnOrgNewDatabasePage`, `createRepo` (Org new DB), `signInOrSignUp` | Org/Repo作成とCognito連携 |
| メンバー | `inviteUser` | 組織招待 |

> `.graphql` ファイルは `apps/library/src/app/**/**.graphql` にあり、`yarn codegen` で `@/gen/graphql` の型へ出力されています。

## 11. 未実装/プレースホルダ

| 領域 | 状態 |
| --- | --- |
| `/v1beta/[org]/organizations/new` | バックエンド未連携。ローカル state + トーストのみ。`apps/library/src/app/v1beta/[org]/organizations/new/page.tsx:1` |
| `/v1beta/[org]/[repo]/reviews` | Storybook ダミー表示。詳細画面も静的テキスト。`apps/library/src/app/v1beta/[org]/[repo]/reviews/page.tsx:1`, `[reviewId]/page.tsx:1` |
| `/new-org` (public) | GraphQL 呼び出し部分がコメントアウト/TODO。`apps/library/src/app/(public)/new-org/component.tsx:1`
| `/v1beta/new` のフォーム | UI 2カラムの一部がダミーSelect。メール/Usernameの実際の選択肢は未取得。`apps/library/src/app/v1beta/new/form.tsx:1`
| Dashboard 右サイドバー | “coming soon…” 表記のみ。`apps/library/src/app/dashboard.tsx:1`
| Property Editor (`_components/property-editor`) | ファイルは空、現在は `PropertiesSection` 側で直接対応。`apps/library/src/app/v1beta/_components/property-editor/editor.tsx:1`

## 12. Usecase一覧

Libraryフロントエンドで実装済み（またはUIレベルで提供）している主要ユースケースを、ペルソナ/アクセスレベルと連携先コードで整理しました。

| 分類 | ユースケース | 役割 / 権限 | 主要UI / サーバーアクション |
| --- | --- | --- | --- |
| オンボーディング | サインアップ / メール検証 / サインイン / サインアウト | 匿名 / 全ユーザー | `apps/library/src/app/(auth)/**` のフォーム + Cognito呼び出し (`signUp`, NextAuth `signIn`, `signOut`) |
| オーガナイゼーション作成 | 既存ユーザーが Operator/Org を新規作成 | ログイン済みユーザー (Inherit) | `/v1beta/organization/new`・`/v1beta/new` の `NewOrgForm` が `createOperator` を実行 |
| オーガナイゼーション設定更新 | 名前/説明更新、APIキー管理 | Org Owner/Writer | `OrganizationForm` + `updateOrgAction`、`ApiKeyDialog` + `createApiKeyAction` |
| メンバー招待 | メールでメンバーを招待し通知オプションを選択 | Org Owner | `/v1beta/[org]/organizations/invite` → `inviteUser` |
| リポジトリ一覧/詳細閲覧 | Orgに紐づくRepoとデータメトリクスの閲覧 | サインインユーザー（Publicは匿名） | `OrganizationPage`, `RepositoryPage` (`repositoryPageWithTags`) |
| リポジトリメタ編集 | 名前/説明/公開設定/タグ/URL更新、ユーザーネーム変更、削除 | Repo Owner/Writer (一部Owner限定) | `RepositoryUi` 編集ダイアログ, `SettingsForm` (`updateRepoSettingsAction`, `changeRepoUsernameAction`, `deleteRepoAction`) |
| データ作成・更新 | Propertyスキーマに基づきリッチテキストや数値を入力 | Repo Owner/Writer | `DataDetailUi` + `createData` / `updateData`, `convertPropertyData` |
| データ閲覧 | Markdown/HTML本文・プロパティ値の閲覧（ログアウト時はView only） | Public/Member | `DataDetailUi` view only モード |
| プロパティ管理 | Select/Relation等のスキーマを追加・更新・削除 | Repo Owner/Writer | `/v1beta/[org]/[repo]/properties` (`onAddProperty`, `onUpdateProperty`, `onRemoveProperty`) |
| データベース（Repo）作成 | Organization配下に新Repoを追加し公開設定やPKを指定 | Org Owner/Writer | `/v1beta/[org]/databases/new` (`createDatabaseAction`) |
| APIアクセス | APIキー発行・コピー・一覧取得 | Org Owner | `ApiKeyListServer`, `ApiKeyDialog` |
| ダッシュボード閲覧 | 自分が所属するOrg一覧、ショートカット表示 | ログイン済みユーザー | `/app/page.tsx` → `Dashboard` (`sdk.dashboard()`) |

> 既存の仕様ドキュメント（`docs/src/services/library/overview.md` の Usecase節）はドメイン観点の網羅リスト、本節は実装済みフローの観点で対応を示しています。新たなユースケースが追加された際は両方を更新してください。

---

このサマリーを出発点として、追加実装や仕様変更が発生した際は本ドキュメントに反映してください。
