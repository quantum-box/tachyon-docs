---
title: "DBマイグレーション互換性CIの導入"
type: "infrastructure"
emoji: "🛡️"
topics:
  - CI
  - Database
  - Migration
published: true
targetFiles:
  - .github/workflows/tidb-migration-check.yaml
  - .github/workflows/tachyon-api-release.yml
  - docs/SUMMARY.md
github: ""
---

# DBマイグレーション互換性CIの導入

## 概要

本番デプロイ時のDB変更リスクを下げるため、GitHub Actionsに「後方互換性の検証」と「デプロイ後マイグレーション」の実行フローを追加する。

## 背景・目的

- マイグレーションを安全に本番へ適用する運用を確立したい
- Blue/Greenがない前提でも、expand/contract運用で事故率を下げたい
- 互換性違反（破壊的DDL）をPR時点で検知したい

## 詳細仕様

### 機能要件

1. `tidb-migration-check` に以下を追加する
- 破壊的DDLガード（DROP/RENAMEなど）
- `old app x new db` 互換性チェック
- `new app x old db` 互換性チェック

2. `tachyon-api-release` に以下を追加する
- ECSデプロイ成功後のみ `prod-migrate` を実行
- マイグレーションは `mise run migrate prod` で実行する

3. 失敗時はジョブを即時failし、後続処理を停止する

### 非機能要件

- 既存ワークフローの責務を極力維持する
- 変更はCI workflowに限定し、アプリコードには手を入れない

## 実装方針

- 既存workflow (`tidb-migration-check.yaml`, `tachyon-api-release.yml`) を拡張
- 互換性チェックはPR時のみ実施
- 破壊的DDLは簡易パターン検知でガード

## タスク分解

### 主要タスク
- [x] 要件定義の明確化
- [x] 技術調査・検証
- [x] 実装
- [x] テスト・品質確認
- [x] ドキュメント更新

## テスト計画

- `act` 相当のローカル検証は行わず、`yamllint` で構文整合性を確認
- 変更差分をレビューし、ジョブ依存関係・トリガー条件を確認

## リスクと対策

- リスク: 互換性チェックが重くCI時間が増える
- 対策: migration関連変更時のみトリガーする

- リスク: 破壊的DDLの検知が誤検知/漏れする
- 対策: 初期は保守的パターンで導入し、運用で調整する

## スケジュール

- フェーズ1（本PR）: workflow追加
- フェーズ2（運用）: false positiveの調整、除外ルール整備

## 完了条件

- 互換性2ジョブ・DDLガード・prod-migrateジョブがworkflowに反映されている
- taskdocとverification-reportが更新されている
