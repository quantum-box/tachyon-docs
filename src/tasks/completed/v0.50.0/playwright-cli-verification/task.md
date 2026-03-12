---
title: "Playwright MCPからPlaywright CLIへの動作確認移行"
type: "improvement"
emoji: "🧪"
topics:
  - Playwright
  - Testing
  - Developer Experience
published: true
targetFiles:
  - apps/tachyon/playwright.config.ts
  - apps/tachyon/src/e2e-tests/auth.setup.ts
  - apps/tachyon/src/e2e-tests/smoke.spec.ts
  - mise.toml
  - .claude/skills/browser-test/SKILL.md
github: ""
---

# Playwright MCPからPlaywright CLIへの動作確認移行

## 概要

Playwright MCPで実施している動作確認を、Playwright CLIベースの手順へ移行するためのタスク。

## 背景・目的

- MCPツールではなくCLIベースで動作確認を行えるようにして、開発環境の再現性と自動化の幅を広げたい。
- Playwright CLIの導入/運用手順を整備し、チーム内で統一した検証フローを確立する。

## タスク分解

### フェーズ1: 環境構築 ✅

- [x] `@playwright/test` パッケージのインストール
- [x] `playwright.config.ts` の設定
  - Worktree対応（`TACHYON_HOST_PORT` 環境変数）
  - Auth setupプロジェクト（認証状態の共有）
  - `NO_WEB_SERVER` 環境変数（Docker環境対応）
- [x] `.gitignore` にPlaywright関連ディレクトリを追加

### フェーズ2: 認証セットアップ ✅

- [x] `auth.setup.ts` の作成
  - NextAuth CSRF トークンの事前取得（`/api/auth/csrf` に先にアクセス）
  - 認証状態を `.auth/user.json` に保存
  - 後続テストで `storageState` として再利用
- [x] CSRF トークン問題の解決
  - NextAuth は新しいブラウザコンテキストで CSRF Cookie が未設定だと認証失敗する
  - 対策: サインイン前に `/api/auth/csrf` を訪問して Cookie を取得

### フェーズ3: スモークテスト作成 ✅

- [x] `smoke.spec.ts` の作成（5テスト）
  - Dashboard ロード確認
  - AI Studio ナビゲーション（Agent Chat）
  - Platform Analytics ナビゲーション
  - サイドバーナビゲーション（デスクトップ/モバイル分岐）
  - レスポンシブ: モバイルビューポート
- [x] デスクトップ（Chromium）、モバイル（Mobile Chrome）両方でパス

### フェーズ4: mise タスク追加 ✅

- [x] `mise run e2e` — 全テスト実行
- [x] `mise run e2e-smoke` — スモークテストのみ
- [x] `mise run e2e-headed` — ブラウザ表示ありで実行
- [x] `package.json` にe2eスクリプト追加

### フェーズ5: ドキュメント更新 ✅

- [x] `browser-test` SKILL.md にPlaywright CLIセクション追加

## テスト結果

### スモークテスト (`mise run e2e-smoke`)
```
Running 11 tests using 4 workers
  ✓ [setup] › auth.setup.ts › authenticate (2.7s)
  ✓ [chromium] › smoke.spec.ts › dashboard loads after login (2.8s)
  ✓ [chromium] › smoke.spec.ts › navigate to AI Studio (1.7s)
  ✓ [chromium] › smoke.spec.ts › navigate to Platform Analytics (2.3s)
  ✓ [chromium] › smoke.spec.ts › sidebar navigation is visible (1.4s)
  ✓ [chromium] › smoke.spec.ts › responsive: mobile viewport (1.2s)
  ✓ [Mobile Chrome] › smoke.spec.ts (5 tests) all passed
  11 passed (13.5s)
```

### 既知の問題

- `agent-chat.spec.ts` は以前のモック版テストで、現在の認証セットアップと互換性がない。別途修正が必要。

## 技術的な学び

### NextAuth CSRF トークン問題
- Playwright CLI は完全にクリーンなブラウザコンテキストで起動する
- NextAuth の `signIn()` は内部的に CSRF トークンを必要とする
- 解決策: `auth.setup.ts` で `/api/auth/csrf` に先にアクセスして Cookie を取得

### モバイルビューポートの注意点
- サイドバーはモバイルでは折りたたまれるため、`isMobile` で分岐が必要
- heading の strict mode violation: 複数マッチする可能性のあるセレクタは具体的に指定

## 使い分けガイド

| 用途 | 方法 |
|------|------|
| 実装中の対話的動作確認 | Playwright MCP |
| 再現可能な回帰テスト | Playwright CLI (`mise run e2e`) |
| PR前のスモークテスト | `mise run e2e-smoke` |
| デバッグ | `mise run e2e-headed` でブラウザ表示 |

## 完了条件

- [x] Playwright CLIによる動作確認手順が整理されている
- [x] スモークテストが全パスしている（11/11）
- [x] mise タスクで実行できる
- [x] browser-test SKILL.md が更新されている
- [ ] タスクディレクトリがcompletedへ移動済み
