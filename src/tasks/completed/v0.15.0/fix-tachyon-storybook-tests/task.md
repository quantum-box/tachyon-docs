---
title: "tachyon Storybookテストの失敗修正"
type: bug
emoji: "🛠️"
topics:
  - Storybook
  - Tachyon App
published: true
targetFiles:
  - apps/tachyon
  - apps/tachyon/.storybook
github: ""
---

# tachyon Storybookテストの失敗修正

## 概要

`yarn test-storybook --filter=tachyon` を実行した際に発生している失敗を調査し、テストをすべて成功させる。

## 背景・目的

- Storybook の自動テストが失敗しており、CI 品質ゲートを通らない状態である。
- 失敗の原因を特定して修正し、将来的な回帰を防ぐ。
- フロントエンド品質基準として Storybook テストの安定化が求められている。

## 詳細仕様

### 機能要件

1. `yarn test-storybook --filter=tachyon` 実行時にすべてのテストが成功すること。
2. 修正内容は既存の UI/UX を意図せず変化させないこと。
3. 失敗を再発させないテストを必要に応じて整備すること。

### 非機能要件

- Storybook テスト実行時間を著しく悪化させない。
- テストコードの可読性と保守性を確保する。
- 既存コードスタイル（Biome / ESLint ルール）を遵守する。

### コンテキスト別の責務

```yaml
contexts:
  frontend:
    description: "apps/tachyon 配下の Storybook 用コード"
    responsibilities:
      - コンポーネント振る舞いの修正
      - Storybook テストの更新
  testing:
    description: "Storybook テスト環境"
    responsibilities:
      - テストユーティリティの調整
      - 安定性向上のための設定見直し
```

### 仕様のYAML定義

```yaml
storybook_tests:
  command: "yarn test-storybook --filter=tachyon"
  expected:
    status: "pass"
    flaky: false
```

## 実装方針

1. 現状の失敗内容を再現し、失敗ケースと影響範囲を把握する。
2. 原因となるコンポーネントやテストコードを特定し、必要な修正を最小限で行う。
3. Storybook テストを再実行して回帰がないことを確認する。
4. 必要に応じて関連ドキュメントやコメントを更新する。

## タスク分解

### フェーズ1: 失敗の再現と調査 🔄
- [x] `yarn test-storybook --filter=tachyon` を実行しログを収集（82件の MissingStory エラーを確認）
- [x] 失敗ケースの共通点を整理（Storybookサーバー非同期化とGraphQLモック不足を特定）

### フェーズ2: 修正方針の決定と実装 🔄
- [x] 問題箇所の原因分析（Storybookローカルビルド不足とMock環境欠如）
- [x] 必要なコード修正の実装（Storybookテスト起動スクリプト整備、ModelSelector/PriceAnalysisストーリー修正）
- [x] 関連テストコードの更新（GraphQL/SWRモック整備）

### フェーズ3: 動作確認とドキュメント更新 ✅
- [x] Storybook テストの再実行
- [x] `verification-report.md` の更新
- [x] タスクドキュメントの完了ステータス更新

## テスト計画

- `yarn test-storybook --filter=tachyon`
- 必要に応じて該当 Storybook のローカル動作確認（視覚的確認は既存サーバーで実施）

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| テストがローカル環境依存で失敗し続ける | 中 | 環境変数・モック依存を確認し、安定化する |
| 修正による UI への副作用 | 中 | Storybook 上で主要なシナリオを確認する |

## 参考資料

- なし

## 完了条件

- [ ] 失敗していた Storybook テストがすべて成功する
- [ ] 修正内容がリファクタリングを含めてレビュー可能な状態になっている
- [ ] 動作確認レポートを更新済み
- [ ] タスクドキュメント内の進捗が最新化されている
