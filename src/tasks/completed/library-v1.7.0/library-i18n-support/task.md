---
title: Library アプリ 多言語対応（i18n）
type: feature
emoji: 🌐
topics:
  - i18n
  - Library
  - Next.js
  - TypeScript
published: true
targetFiles:
  - apps/library/src/lib/i18n/
  - apps/library/src/app/i18n/
  - apps/library/src/app/(auth)/
  - apps/library/src/app/dashboard.tsx
  - apps/library/src/app/v1beta/
github: ""
---

# Library アプリ 多言語対応（i18n）

## 概要

Library アプリ全体を日本語/英語の2言語に対応させる。現在、LP（ランディングページ）は各コンポーネント内で `copy` オブジェクトを使って多言語対応されているが、認証画面・ダッシュボード・v1beta 配下のページはハードコードされた英語テキストのみとなっている。tachyon アプリの i18n 実装を参考に、統一された仕組みで多言語対応を行う。

## 背景・目的

- **日本語ユーザーへの対応**: 日本市場向けに日本語での利用体験を提供する
- **一貫性のある翻訳管理**: LP で使われているコンポーネントローカルな翻訳管理と、アプリ全体で使える Context ベースの翻訳管理を統合する
- **ユーザー体験の向上**: ブラウザの言語設定や Cookie による言語選択の保持で、シームレスな多言語体験を実現する

## 現状分析

### 現在の i18n 対応状況

| ページ/セクション | 多言語対応 | 方式 |
|---|---|---|
| LP（ランディングページ） | ✅ 対応済み | コンポーネントローカルの `copy` オブジェクト |
| 認証画面（sign_in, sign_up など） | ❌ 未対応 | ハードコード（英語のみ） |
| ダッシュボード | ❌ 未対応 | ハードコード（英語のみ） |
| v1beta 配下のアプリページ | ❌ 未対応 | ハードコード（英語のみ） |
| 共通コンポーネント（AppBar など） | ❌ 未対応 | ハードコード（英語のみ） |

### LP の翻訳対象ファイル（参考・既存）

```
apps/library/src/
├── app/
│   └── lp.tsx                    # LpLanguage 型定義、LP レンダリング
└── components/lp/
    ├── Header.tsx                # copy オブジェクトで ja/en 対応
    ├── Hero.tsx                  # copy オブジェクトで ja/en 対応
    ├── Features.tsx              # copy オブジェクトで ja/en 対応
    ├── Capabilities.tsx          # copy オブジェクトで ja/en 対応
    ├── Challenges.tsx            # copy オブジェクトで ja/en 対応
    ├── Pricing.tsx               # copy オブジェクトで ja/en 対応
    ├── Roadmap.tsx               # copy オブジェクトで ja/en 対応
    └── Footer.tsx                # copy オブジェクトで ja/en 対応
```

### 翻訳が必要なページ一覧

#### 認証画面

| ファイル | 翻訳が必要なテキスト例 |
|---|---|
| `(auth)/sign_in/page.tsx` | "Sign in", "Sign in to start using the service", "Library" など |
| `(auth)/sign_up/page.tsx` | "Sign up", "Sign up to start using the service" など |
| `(auth)/sign_out/page.tsx` | サインアウト関連テキスト |
| `(auth)/forgot-password/page.tsx` | パスワードリセット関連テキスト |
| `(auth)/reset-password/page.tsx` | パスワード設定関連テキスト |
| `(auth)/verify-email/page.tsx` | メール認証関連テキスト |

#### ダッシュボード・アプリ

| ファイル | 翻訳が必要なテキスト例 |
|---|---|
| `dashboard.tsx` | "Dashboard", "Organizations", "Home", "Create a new repository!" など |
| `v1beta/` 配下のページ | 各ページのUI テキスト |
| `features/LibraryAppBar/` | ナビゲーション、ボタンラベルなど |

## 詳細仕様

### 機能要件

1. **言語切り替え機能**
   - ユーザーが明示的に言語を選択できる UI を提供
   - 選択された言語を Cookie に保存し、次回以降も維持

2. **自動言語検出**
   - `Accept-Language` ヘッダーからブラウザの優先言語を検出
   - Cookie に保存された言語設定を優先

3. **翻訳辞書管理**
   - TypeScript で型安全な翻訳辞書を定義
   - セクションごとに分割可能な構造（認証、ダッシュボード、v1beta など）

4. **翻訳ヘルパー**
   - `useTranslation` フックで翻訳テキストを取得
   - ネストされたキーのドット記法サポート（例: `auth.signIn.title`）

### 非機能要件

- **パフォーマンス**: 翻訳辞書は静的に定義し、動的 import は使用しない
- **型安全性**: 翻訳キーの typo をコンパイル時に検出できる
- **拡張性**: 将来的に新しい言語を追加しやすい構造

### コンテキスト別の責務

```yaml
contexts:
  i18n_infrastructure:
    description: "i18n の基盤（翻訳辞書、Provider、検出ロジック）"
    responsibilities:
      - Locale 型と対応言語の定義
      - Cookie 管理の定数定義
      - 翻訳辞書の型定義
      - I18nProvider によるコンテキスト提供
      - Accept-Language からの言語検出
      - useTranslation フックの提供
    files:
      - apps/library/src/lib/i18n/constants.ts
      - apps/library/src/lib/i18n/translations.ts
      - apps/library/src/lib/i18n/auth-translations.ts
      - apps/library/src/lib/i18n/dashboard-translations.ts
      - apps/library/src/lib/i18n/v1beta-translations.ts
      - apps/library/src/lib/i18n/useTranslation.ts
      - apps/library/src/app/i18n/i18n-provider.tsx
      - apps/library/src/app/i18n/detect-locale.ts
      - apps/library/src/app/i18n/get-dictionary.ts

  auth_pages:
    description: "認証画面の多言語対応"
    responsibilities:
      - サインイン/サインアップ画面の翻訳
      - パスワードリセットフローの翻訳
      - メール認証画面の翻訳
    files:
      - apps/library/src/app/(auth)/sign_in/page.tsx
      - apps/library/src/app/(auth)/sign_up/page.tsx
      - apps/library/src/app/(auth)/sign_out/page.tsx
      - apps/library/src/app/(auth)/forgot-password/page.tsx
      - apps/library/src/app/(auth)/reset-password/page.tsx
      - apps/library/src/app/(auth)/verify-email/page.tsx

  app_pages:
    description: "アプリケーション画面の多言語対応"
    responsibilities:
      - ダッシュボードの翻訳
      - AppBar/ナビゲーションの翻訳
      - v1beta 配下のページの翻訳
    files:
      - apps/library/src/app/dashboard.tsx
      - apps/library/src/features/LibraryAppBar/
      - apps/library/src/app/v1beta/
```

## 実装方針

### アーキテクチャ設計

tachyon アプリの i18n 実装を参考に、以下の構成を採用する。

```
apps/library/src/
├── lib/i18n/
│   ├── constants.ts              # Cookie 名、有効期限などの定数
│   ├── translations.ts           # 基本翻訳辞書（Locale 型、共通翻訳）
│   ├── auth-translations.ts      # 認証画面の翻訳
│   ├── dashboard-translations.ts # ダッシュボードの翻訳
│   ├── v1beta-translations.ts    # v1beta 配下の翻訳
│   └── useTranslation.ts         # 翻訳取得フック
│
├── app/i18n/
│   ├── i18n-provider.tsx         # React Context Provider
│   ├── detect-locale.ts          # 言語検出ロジック
│   └── get-dictionary.ts         # 辞書取得ユーティリティ
│
└── app/
    ├── layout.tsx                # I18nProvider でラップ
    ├── (auth)/
    │   └── layout.tsx            # 認証画面用レイアウト（I18nProvider 適用）
    └── v1beta/
        └── layout.tsx            # v1beta 用レイアウト（I18nProvider 適用）
```

### 技術選定

| 技術 | 選定理由 |
|---|---|
| React Context | tachyon と同様の実装で一貫性を保つ |
| Cookie ベースの言語保持 | SSR でも言語検出可能、URL パスを変えずに済む |
| TypeScript 辞書 | 型安全性、IDE 補完、コンパイル時検証 |

### 既存 LP との統合方針

現在 LP は各コンポーネント内の `copy` オブジェクトで翻訳を管理している。これを新しい i18n システムに統合するには2つのアプローチがある：

**アプローチ A: LP は現状維持（推奨）**
- LP のコンポーネントローカルな翻訳はそのまま維持
- 新しい i18n システムは認証・ダッシュボード・v1beta で使用
- LP へのアクセスはクエリパラメータ `?lang=en` で言語を指定（現状維持）

**アプローチ B: LP も統合**
- LP のコンポーネントから翻訳を抜き出し、`lp-translations.ts` に集約
- `I18nProvider` 配下で LP もレンダリング
- 実装コストが高いため、後続フェーズで検討

→ **フェーズ1ではアプローチ A を採用**し、LP 以外の部分を優先して対応する。

## タスク分解

### フェーズ1: i18n 基盤の構築 ✅

- [x] `lib/i18n/constants.ts` の作成（Cookie 定数）
- [x] `lib/i18n/translations.ts` の作成（Locale 型、共通翻訳）
- [x] `lib/i18n/useTranslation.ts` の作成
- [x] `app/i18n/i18n-provider.tsx` の作成
- [x] `app/i18n/detect-locale.ts` の作成
- [x] `app/i18n/get-dictionary.ts` の作成

### フェーズ2: 認証画面の多言語対応 ✅

- [x] `lib/i18n/auth-translations.ts` の作成
- [x] `(auth)/layout.tsx` で I18nProvider を適用
- [x] `sign_in/page.tsx` の多言語対応
- [x] `sign_up/page.tsx` の多言語対応
- [x] `sign_out/page.tsx` の多言語対応
- [x] `forgot-password/page.tsx` の多言語対応
- [x] `reset-password/page.tsx` の多言語対応
- [x] `verify-email/otp/page.tsx` の多言語対応

### フェーズ3: ダッシュボード・共通コンポーネントの多言語対応 ✅

- [x] `lib/i18n/dashboard-translations.ts` の作成
- [x] `dashboard.tsx` の多言語対応
- [x] 共通 UI コンポーネントの多言語対応

### フェーズ4: v1beta 配下の多言語対応 ✅

#### 4-1: 基盤・組織ページ ✅
- [x] `lib/i18n/v1beta-translations.ts` の作成
- [x] `v1beta/layout.tsx` で I18nProvider を適用
- [x] ヘッダーの多言語対応（client-header.tsx）
- [x] `[org]/_components/organization-page-ui.tsx` の多言語対応
- [x] `organization/new/form.tsx` の多言語対応
- [x] `new/page.tsx` の多言語対応
- [x] `[org]/databases/new/form.tsx` の多言語対応
- [x] `[org]/organizations/invite/page.tsx` の多言語対応

#### 4-2: リポジトリページ ✅
- [x] `[org]/[repo]/components/repository-ui.tsx` の多言語対応
- [x] `[org]/[repo]/settings/form.tsx` の多言語対応
- [x] `[org]/[repo]/data/new/page.tsx` の多言語対応（DataDetailUi で処理）

#### 4-3: 組織設定・GitHub連携 ✅
- [x] `[org]/_components/organization-edit-form.tsx` の多言語対応
- [x] `[org]/_components/github-import-dialog.tsx` の多言語対応
- [x] `[org]/_components/github-settings.tsx` の多言語対応
- [x] `[org]/_components/api-key-dialog.tsx` の多言語対応
- [x] `[org]/_components/api-key-list-server.tsx` の多言語対応

#### 4-4: 共通コンポーネント ✅
- [x] `_components/navigation.tsx` の多言語対応
- [x] `_components/review-ui.tsx` の多言語対応
- [x] `_components/reviews-list-ui.tsx` の多言語対応
- [x] `_components/data-detail-ui/index.tsx` の多言語対応
- [x] `_components/data-detail-ui/data-list-card.tsx` の多言語対応
- [x] `_components/properties-ui/index.tsx` の多言語対応
- [x] `_components/properties-ui/property-dialog.tsx` の多言語対応

### フェーズ5: 言語切り替え UI の実装 ✅

- [x] `components/language-switcher.tsx` の作成
- [x] 認証画面での言語切り替え UI（AuthLayout に追加）
- [x] v1beta ヘッダーでの言語切り替え UI
- [x] Cookie への保存ロジック（useTranslation.changeLocale で実装）

## Playwright MCP による動作確認

### 実施タイミング

- [x] フェーズ2完了後（認証画面）の動作確認
- [x] フェーズ3完了後（ダッシュボード）の動作確認
- [x] 全フェーズ完了後の最終確認

### 動作確認チェックリスト

#### 言語検出の確認
- [x] Accept-Language が `ja` の場合、日本語で表示される
- [x] Accept-Language が `en` の場合、英語で表示される
- [x] Cookie に言語設定がある場合、Cookie の値が優先される

#### 認証画面の確認
- [x] サインイン画面が日本語/英語で正しく表示される
- [x] サインアップ画面が日本語/英語で正しく表示される
- [x] エラーメッセージが適切に翻訳される

#### ダッシュボードの確認
- [x] ダッシュボードが日本語/英語で正しく表示される
- [x] サイドバーのラベルが適切に翻訳される
- [x] ボタン、リンクのテキストが適切に翻訳される

#### 言語切り替えの確認
- [x] 言語切り替え UI が正しく動作する
- [x] 切り替え後にページがリフレッシュされ、新しい言語で表示される
- [x] 切り替えた言語が Cookie に保存される

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 翻訳漏れ | 中 | TypeScript の型定義で必須キーを強制 |
| LP との整合性 | 低 | フェーズ1では LP は現状維持、後続で統合検討 |
| SSR での言語検出失敗 | 中 | Cookie 優先、fallback としてデフォルト言語を使用 |
| 翻訳テキストの品質 | 中 | レビュー時に翻訳内容を確認、後から修正可能 |

## 参考資料

- tachyon アプリ i18n 実装: `apps/tachyon/src/lib/i18n/`, `apps/tachyon/src/app/i18n/`
- Next.js Internationalization: https://nextjs.org/docs/app/building-your-application/routing/internationalization

## 完了条件

- [x] 認証画面（sign_in, sign_up, forgot-password, reset-password, verify-email, sign_out）が日英両対応
- [x] ダッシュボードが日英両対応
- [x] v1beta 配下の主要ページが日英両対応
- [x] 言語切り替え UI が実装され、Cookie に保存される
- [x] Accept-Language による自動言語検出が動作する
- [x] Playwright MCP での動作確認完了
- [ ] コードレビュー完了

### バージョン番号の決定基準

**マイナーバージョン（x.X.x）を上げる場合:**
- [x] 新機能の追加（多言語対応）
- [x] 既存機能の大幅な改善

→ **library v1.7.0** としてリリース予定

## 備考

- LP の翻訳統合は後続タスクとして検討
- 3言語目以降（中国語など）の追加は、本タスク完了後に別タスクとして対応
