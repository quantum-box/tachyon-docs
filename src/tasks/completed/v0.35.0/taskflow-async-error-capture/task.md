---
title: "Taskflowで非同期エラーを記録"
type: "improvement"
emoji: "🛠️"
topics:
  - "taskflow"
  - "agent"
  - "frontend"
published: true
targetFiles:
  - "packages/llms/src"
  - "packages/taskflow/src"
  - "apps/tachyon-api/src"
  - "apps/tachyon/src"
github: ""
---

# Taskflowで非同期エラーを記録

## 概要

tokio::spawn 内で発生するエラーを Taskflow に保存し、フロントエンドで全ページ共通で検知できる状態を整備する。

## 背景・目的

- 非同期タスク内で発生したエラーがログに埋もれやすく、運用時に見逃しやすい。
- Taskflow は非同期タスクの状態・失敗内容を保持できるため、エラーの集約先として使いたい。
- フロントエンドは SWR で定期的に Taskflow を参照し、失敗を即時に把握できるようにする。

## 詳細仕様

### 機能要件

1. tokio::spawn で発生したエラーを Taskflow に保存する。
2. Taskflow の API から失敗タスクを取得できるようにする。
3. フロントエンドで Taskflow の失敗情報を取得し、全ページで注意表示する。

### 非機能要件

- エラー保存が失敗しても元の処理は継続する。
- Taskflow が利用できない場合は従来どおりログ出力にフォールバックする。

### コンテキスト別の責務

- llms: tokio::spawn 内のエラーを Taskflow に報告する。
- taskflow: 失敗タスクの取得フィルタを追加する。
- tachyon-api: Taskflow API を公開する。
- tachyon(front): SWR で失敗タスクを監視しバナー表示する。

## 実装方針

### アーキテクチャ設計

- Taskflow への保存は共通ヘルパーで実装し、spawn 内でエラーを捕捉して呼び出す。
- Taskflow API は status フィルタ対応を追加し、/v1/taskflow 経由で公開する。
- フロントは v1beta layout 配下で監視し、Alert UI を表示する。

### 技術選定

- Taskflow: `taskflow::Taskflow` を利用し、失敗時に Taskflow タスクを生成する。
- フロント: `useSWR` で定期ポーリングし、`Alert` UI で通知する。

## タスク分解

### 主要タスク 🔄 (2026-01-12 開始)
- [x] 要件定義の明確化
- [x] 技術調査・検証
- [x] 実装
- [ ] テスト・品質確認
- [x] ドキュメント更新

### 実装メモ

- llms に Taskflow エラーレポート用ヘルパーを追加
- Taskflow API に status フィルタを追加し `/v1/taskflow` で公開
- v1beta サイドバーで SWR 監視バナーを表示

## テスト計画

- llms の非同期エラー報告ユニットテストを追加する。
- Taskflow API の status フィルタのテストを追加する。
- フロントは SWR のレスポンスでエラー表示が出ることを確認する。

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] 実装完了後の初回動作確認

### 動作確認チェックリスト
- [ ] 失敗タスクがある状態でエラーバナーが表示される
- [ ] 失敗タスクが無い状態でバナーが表示されない

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| Taskflow DB 未設定で保存に失敗する | 中 | Taskflow 利用不可時はログのみ継続 |
| 失敗タスクの一覧取得が重い | 中 | limit/offset を使い軽量化する |

## スケジュール

- 🔄 2026-01-12: 実装・検証

## 完了条件

- [x] tokio::spawn のエラーが Taskflow に保存される
- [x] Taskflow API から失敗タスクを取得できる
- [x] フロント全ページで失敗タスクの通知が表示される
- [ ] テストまたは検証手順が整備される
- [ ] 動作確認レポートが完成している
- [ ] タスクディレクトリを completed/[新バージョン]/ に移動済み
