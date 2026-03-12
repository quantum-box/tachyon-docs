---
title: "Frontend balance terminology refresh"
type: "improvement"
emoji: "💱"
topics:
  - Billing
  - Frontend
  - Localization
published: true
targetFiles:
  - apps/tachyon/src/app
  - apps/tachyon/src/lib/i18n
  - docs/src/tasks/completed/v0.15.0/remove-credit-labels/task.md
github: ""
---

# Frontend balance terminology refresh

## 概要

クレジット制からUSD残高制へ移行した後も、フロントエンドに「クレジット」という表記が残っている箇所を修正し、利用者にUSDベースの課金モデルが明確に伝わるようにする。

### バージョン

- リリースバージョン: v0.15.0

## 背景・目的

- UIテキストと翻訳に旧来の「クレジット」表記が残り、課金モデルの混乱を招いている。
- 料金カードやダイアログ、オンボーディング文言などが最新のUSD課金仕様と齟齬を起こしている。
- 残高チャージ機能を案内する際に「クレジット購入」という表現が残っており、ユーザーサポートに影響が出ている。

## 詳細仕様

### 機能要件

1. フロントエンドでユーザーが目にする文言から「クレジット」を撤廃し、USDや残高チャージといった最新用語に置き換える。
2. 料金表示はUSD換算で示し、既存の翻訳 (en/ja) も同様に更新する。
3. 旧来のクレジット換算メモやヒントは、NanoDollar→USDの説明またはチャージ要件へ差し替える。

### 非機能要件

- 既存のGraphQLスキーマ名や型名は変更しない。
- Storybook/サンプルデータに含まれる表記も一貫性を保つ。
- 変更後の文言は英語・日本語とも自然な読みやすさを確保する。

## 実装方針

- i18n辞書(`apps/tachyon/src/lib/i18n/*-translations.ts`)を中心に英語/日本語双方の文言を更新。
- Billing関連のReactコンポーネントを見直し、購入/チャージダイアログやカードの表示をUSDベースへ調整。
- Agent API や LLM料金ページなど、料金を提示する画面で数値をUSD表示へ再計算。
- Storybookのモックデータも残高用語へ揃え、回帰差分を防止。

## 実装結果 (2025-10-11 完了)

- Billing/Agent API/LLM料金ページなどのUI表示をUSD残高ベースに統一し、チャージ導線とラベルを刷新。
- `apps/tachyon/src/lib/i18n/` 配下を中心に英語・日本語の翻訳を更新し、残高チャージ/利用枠の表現へ置換。
- Self Service カタログやプラン設定、Storybookモックの文言を最新用語に合わせて更新。
- Agent Chatの使用量カードは引き続き表示しつつ、説明文をUSD課金の記載へ修正。

## タスク分解

- [x] 表示文言の棚卸しと影響範囲の整理
- [x] i18n辞書の英日両対応更新
- [x] Billing/チャージ関連コンポーネントの文言とロジック調整
- [x] Agent API/LLM料金ページの表示調整とUSD換算の導入
- [x] Storybook・サンプルデータの整合性確認
- [x] Lint/型チェック、必要なテストの実行

## テスト計画

- `yarn ts --filter=tachyon` で型エラーを確認
- `yarn lint --filter=tachyon` で静的解析
- 主要画面 (Billingダッシュボード、Agent APIページ、Self Service) を目視検証

### 実施状況

- `yarn ts --filter=tachyon`
- `yarn lint --filter=tachyon`
- `mise run check`
- Billing / Agent API / Self Service 画面の目視確認

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 用語置換漏れ | 中 | 網羅的な `rg "credit"` / `rg "クレジット"` 探索で確認 |
| USD換算の誤表示 | 中 | 既存仕様の補足資料（NanoDollarドキュメント）を参照して値確認 |
| 翻訳の不自然さ | 低 | プロダクト用語集の表記ゆれと比較し、レビュー時に確認 |

## スケジュール

- 文言棚卸し: 1日
- 実装・翻訳更新: 1日
- テスト/レビュー: 0.5日

## 完了条件

- フロントエンド上で「クレジット」の表記が残らず、USD/残高ベースの表現に置き換わっている。
- lint/tsチェックが成功し、主要画面の目視確認で文言差異がない。
- 本タスクドキュメントが実装内容を反映している。

## 参考資料

- docs/src/architecture/nanodollar-system.md
- docs/src/tasks/bugfix/fix-tachyon-token-refresh/task.md
