---
title: "ナビゲーションメニューのクイックリンク削除"
type: improvement
emoji: "🧭"
topics:
  - tachyon
  - navigation
  - ui
published: false
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/sidebar.tsx
  - apps/tachyon/src/lib/i18n/v1beta-translations.ts
  - docs/src/tasks/improvement/remove-navmenu-quick-links/task.md
github: https://github.com/quantum-box/tachyon-apps
---

# ナビゲーションメニューのクイックリンク削除

## 概要

アプリケーションのテナントサイドバーからクイックリンクセクションを取り除き、主要メニューのみを表示する。

## 背景・目的

- プロダクトオーナーからクイックリンクを削除する指示があった。
- クイックリンクの宛先が古く、メンテナンス対象外となったため混乱を避けたい。
- サイドバー構造をシンプルにし、主要メニューへの導線を明確にする。

## 詳細仕様

### 機能要件

1. `apps/tachyon/src/app/v1beta/[tenant_id]/sidebar.tsx` に定義されているクイックリンク生成ロジックを削除する。
2. サイドバーUIから「クイックリンク」グループ見出しおよび各リンク項目を表示しない。
3. 翻訳辞書に含まれるクイックリンク関連キーが未使用となる場合は整理する（残存が問題となる場合のみ削除）。

### 非機能要件

- UIのレスポンスやアクセシビリティに影響を与えないこと。
- 他メニューのホバーや折り畳み動作へ影響を与えないこと。
- 変更箇所でTypeScriptエラー・Lintエラーを発生させないこと。

### コンテキスト別の責務

今回の変更はフロントエンドUIのみに限定され、バックエンドや他コンテキストへの影響はない。

### 仕様のYAML定義

該当なし。

## タスク分解

1. 現状のサイドバー実装を確認し、クイックリンク生成箇所を特定する。✅ (2025-10-14)
2. クイックリンク関連コード（生成・表示・翻訳）を削除または無効化する。✅ (2025-10-14)
3. UIが問題なく表示されるか動作確認を行う（Playwright MCPによる目視確認）。✅ (2025-10-19)
4. 必要に応じてタスクドキュメントと検証レポートを更新する。✅ (2025-10-19)

## 実装方針

- Sidebarコンポーネント内で`quickLinks`に関する`useMemo`および描画ブロックを削除する。
- `SidebarGroup`など既存のUIコンポーネントは他セクションで再利用されているため変更しない。
- 翻訳ファイルは未使用キーがlint対象となる場合のみ削除する。まずはUI側の参照を外す。

## テスト計画

- 手動テスト: Playwright MCPでサイドバーを開き、クイックリンクが表示されないことを確認する。
- 自動テスト: 既存のユニット/スナップショットテストが影響を受けないことを確認（追加テストは不要）。

## 実装メモ

- 2025-10-14: `mise run check` を実行し成功。
- 2025-10-14: `yarn ts --filter=tachyon` を実行したところ `FeatureFlag` Storybook 向けモックで `isOverride` と `tenantId` が不足している既知の型エラーを検出。今回の変更とは無関係なため未対応。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| クイックリンクが他ページで想定外に利用されていた | 中 | `sidebar.tsx`以外での利用がないか`rg`で確認する |
| 翻訳キー削除によるビルドエラー | 低 | 参照切れを検出するためLint/型チェックを実行 |

## 参考資料

- ソース: `apps/tachyon/src/app/v1beta/[tenant_id]/sidebar.tsx`
- 翻訳: `apps/tachyon/src/lib/i18n/v1beta-translations.ts`

## スケジュール

- 即日対応を想定。開発・確認を同日中に完了する。

## 2025-10-19
- ✅ Playwright MCP で `/v1beta/tn_01hjryxysgey07h5jz5wagqj0m` のサイドバーを確認し、クイックリンクが非表示であることをスクリーンショットとともに確認。
- ✅ `mise run check` / `yarn --cwd apps/tachyon lint` / `yarn --cwd apps/tachyon test --watch=false --selectProjects sidebar` を実行し、既存エラー以外はなし。
- ✅ verification-report.md を更新し、チェックリストを完了状態へ変更。

## 完了条件

- [x] サイドバーからクイックリンクセクションが表示されない
- [x] ビルド・Lint・型チェックでエラーがない
- [x] 動作確認レポートが更新済み

### バージョン番号の決定基準

- パッチバージョン（x.x.X）相当の小規模UI改善として扱う。

## 備考

- 変更後にメニュー構成の再検討が必要な場合、別タスクでナビゲーション情報アーキテクチャの整理を検討する。
