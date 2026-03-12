---
title: "LLMSモデル一覧とカタログ整合性の検証"
type: bug
emoji: "🧪"
topics:
  - LLMS
  - Catalog
published: false
targetFiles:
  - packages/llms/src/usecase/get_supported_models.rs
github: https://github.com/quantum-box/tachyon-apps
---

# 検証レポート

## 実施日時

- 2025-10-18: 未着手

## チェックリスト

- [ ] `/v1/llms/models` のレスポンスから未登録モデルが除外されていることを確認
- [ ] Agent UI のモデル選択にカタログ未登録モデルが表示されないことを確認
- [ ] 未登録モデルで Agent API 実行時に `not_found` エラーとなることを確認
- [ ] `mise run check` および関連テストが成功することを確認

## メモ

- 動作確認結果を追記予定
