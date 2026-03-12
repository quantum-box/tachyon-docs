---
title: "テナント切替ドロップダウン動作確認"
type: bugfix
emoji: "🔍"
topics: ["tachyon", "multi-tenancy", "ui"]
published: false
targetFiles:
  - docs/src/tasks/bugfix/hide-unowned-platforms-from-tenant-dropdown/verification-report.md
github: https://github.com/quantum-box/tachyon-apps
---

## 動作確認サマリ

着手前のため、確認結果は未記入です。

## 実施チェックリスト

- [ ] 新規登録完了後、テナントドロップダウンに不要なプラットフォームが表示されない
- [ ] 既存のプラットフォーム管理ユーザーは従来どおりプラットフォームにアクセスできる
- [ ] ログイン直後の自動リダイレクト先が変わらない

## メモ

- 実装完了後にPlaywright MCPでUI確認を行う。
