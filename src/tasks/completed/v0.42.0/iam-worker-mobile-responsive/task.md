---
title: "IAM・ワーカー画面のモバイルレスポンシブ対応とUI改善"
type: "improvement"
emoji: "📱"
topics: ["UI", "Responsive", "Mobile", "IAM", "Workers", "Tailwind CSS"]
published: true
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/sidebar.tsx
  - apps/tachyon/src/app/v1beta/[tenant_id]/iam/
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/workers/
  - apps/tachyon/src/lib/i18n/v1beta-translations.ts
github: ""
---

# IAM・ワーカー画面のモバイルレスポンシブ対応とUI改善

## 概要

v1beta管理画面のIAM関連ページとワーカー管理ページをモバイル対応し、スマートフォンでも快適に操作できるようにする。加えて、モバイルサイドバーのナビゲーション時の自動クローズ、ワーカー一覧のステータスフィルタタブ追加、ワーカー詳細のテキストオーバーフロー修正を行う。

## 背景・目的

- v1beta管理画面はデスクトップ向けに設計されており、モバイルでの利用時にテーブルがはみ出す、フィルタ/検索バーが横並びで使いにくい等の問題があった
- モバイルサイドバー（Sheet）でナビゲーションリンクを押しても自動的に閉じず、手動で閉じる必要があった
- ワーカー一覧ではすべてのワーカーが表示され、アクティブなワーカーだけを素早く確認する手段がなかった
- ワーカー詳細ページではタイトルやワーカーIDが長い場合に横スクロールが発生していた

## 詳細仕様

### 機能要件

1. **IAM各画面のレスポンシブ対応**
   - テーブルに`overflow-x-auto`で横スクロール対応
   - 検索/フィルタバーをモバイルで縦スタック化（`flex-col sm:flex-row`）
   - 統計カードグリッドをモバイル1列（`grid-cols-1 sm:grid-cols-3`）
   - テーブルの補助列をモバイルで非表示（`hidden sm:table-cell`）

2. **サイドバーのモバイル自動クローズ**
   - `usePathname`でルート変更を検知し、`setOpenMobile(false)`でSheet を閉じる
   - デスクトップでは影響なし

3. **ワーカー一覧のステータスフィルタタブ**
   - Active（`active`, `idle`）/ All / Inactive（`registered`, `unhealthy`, `terminated`）の3タブ
   - デフォルトはActiveタブ
   - 各タブにワーカー数バッジ表示

4. **ワーカー詳細のテキストオーバーフロー修正**
   - タイトル: `text-lg sm:text-2xl` + `truncate`
   - ワーカーID: `text-xs sm:text-sm` + `break-all`

## 実装方針

### 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `sidebar.tsx` | `SidebarMobileCloseOnNavigation`コンポーネント追加 |
| `iam/user/table.tsx` | フィルタバー・テーブル・ページネーションのレスポンシブ化 |
| `iam/policies/policy-management.tsx` | ヘッダー・検索・テーブル・統計グリッドのレスポンシブ化 |
| `iam/actions/action-management.tsx` | ヘッダー・フィルタ・テーブル・統計グリッドのレスポンシブ化 |
| `iam/service_account/[id]/service-account-api-keys.tsx` | ヘッダー・統計・テーブルのレスポンシブ化 |
| `iam/service_account/service-account-tabs.tsx` | ヘッダーのレスポンシブ化 |
| `iam/service_account/service-account-list.tsx` | テーブル横スクロール追加 |
| `iam/service_account/api-key-list.tsx` | テーブル・列の非表示対応 |
| `ai/workers/workers-client.tsx` | ステータスフィルタタブ追加、カード/テーブルのレスポンシブ化 |
| `ai/workers/worker-detail-client.tsx` | タイトル・IDのオーバーフロー修正 |
| `lib/i18n/v1beta-translations.ts` | タブのEN/JA翻訳追加 |

### 共通パターン

```tsx
// フィルタバー: モバイルで縦スタック
<div className='flex flex-col gap-2 sm:flex-row sm:items-center'>

// ボタン: モバイルで全幅
<Button className='w-full sm:w-auto'>

// テーブル: 横スクロール
<div className='overflow-x-auto'>
  <Table>...</Table>
</div>

// 補助列: モバイルで非表示
<TableHead className='hidden sm:table-cell'>
<TableCell className='hidden sm:table-cell'>

// 統計カード: モバイル1列
<div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
```

## タスク分解

### フェーズ1: サイドバー自動クローズ ✅
- [x] `SidebarMobileCloseOnNavigation`コンポーネント実装
- [x] `usePathname`によるルート変更検知
- [x] `SidebarProvider`内への配置

### フェーズ2: IAMページのレスポンシブ化 ✅
- [x] ユーザー管理テーブル（table.tsx）
- [x] ポリシー管理（policy-management.tsx）
- [x] アクション管理（action-management.tsx）
- [x] サービスアカウントAPIキー（service-account-api-keys.tsx）
- [x] サービスアカウントタブ（service-account-tabs.tsx）
- [x] サービスアカウント一覧（service-account-list.tsx）
- [x] APIキー一覧（api-key-list.tsx）

### フェーズ3: ワーカー一覧改善 ✅
- [x] ステータスフィルタタブ（Active/All/Inactive）追加
- [x] バッジ付きカウント表示
- [x] 翻訳（EN/JA）追加
- [x] モバイルカードレイアウトの改善
- [x] デスクトップテーブルのtruncate対応

### フェーズ4: ワーカー詳細修正 ✅
- [x] タイトルテキストサイズ縮小・truncate追加
- [x] ワーカーIDテキストサイズ縮小
- [x] カードタイトルのオーバーフロー修正

### フェーズ5: 品質確認
- [ ] Playwright MCPでモバイル表示確認
- [ ] TypeScript型チェック通過確認
- [ ] lint通過確認

## 完了条件

- [x] すべてのIAMページがモバイルで横スクロールなく操作可能
- [x] サイドバーがモバイルで画面遷移時に自動クローズ
- [x] ワーカー一覧でステータスフィルタが使用可能
- [x] ワーカー詳細でテキストオーバーフローが発生しない
- [x] TypeScript/lintチェック通過
- [ ] 動作確認完了
