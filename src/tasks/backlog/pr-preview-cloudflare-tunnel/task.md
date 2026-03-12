---
title: "PR プレビュー環境の構築（Cloudflare Tunnel + Cognito対応）"
type: "infra"
emoji: "🌐"
topics:
  - DevOps
  - Cloudflare Tunnel
  - Cognito
  - Worktree
published: true
targetFiles: []
github: ""
---

# PR プレビュー環境の構築（Cloudflare Tunnel + Cognito対応）

## 概要

PRごとにチームメンバーがブラウザから動作確認できるプレビュー環境を、Cloudflare Tunnel + git worktree で実現する。現状はローカルの localhost でしかアクセスできず、スマホやチームメンバーからの確認ができない。

## 背景

- PR #1070 の動作確認で worktree + Docker Compose によるポートオフセット並行起動は成功した
- Cloudflare quick tunnel でフロント/APIを公開することは可能だが、以下が未対応:
  - **Cognito認証**: コールバックURLにtunnel URLが登録されていないためログインできない
  - **URL固定**: quick tunnel は起動のたびにURLが変わるため、Cognitoに登録できない

## 解決策

### Named Tunnel + サブドメインルーティング

Cloudflare Zero Trust Dashboard から named tunnel を設定し、PRごとにサブドメインを割り当てる。

```
pr1070.dev.example.com     → localhost:16100 (フロント)
pr1070-api.dev.example.com → localhost:50154 (API)
```

### 必要な設定変更

#### 1. Cloudflare Tunnel（Zero Trust Dashboard）

既存 tunnel `e6c28efb-0459-4f5a-857a-535776763b66` に Public Hostname を追加:

| Subdomain | Service | 用途 |
|-----------|---------|------|
| `pr{number}` | `http://localhost:{TACHYON_HOST_PORT}` | Next.js フロントエンド |
| `pr{number}-api` | `http://localhost:{TACHYON_API_HOST_PORT}` | tachyon-api |

#### 2. Cognito コールバックURL

AWS Console → Cognito → User Pool `ap-northeast-1_8Ga4bK5M4` → App client:

- Callback URL 追加: `https://pr{number}.dev.example.com/api/auth/callback/cognito`
- Sign-out URL 追加: `https://pr{number}.dev.example.com`

**検討事項**: ワイルドカード `https://*.dev.example.com` が使えれば毎回の追加が不要になる。Cognitoがワイルドカードをサポートするか要調査。

#### 3. Next.js 環境変数

```env
AUTH_URL=https://pr{number}.dev.example.com
NEXTAUTH_URL=https://pr{number}.dev.example.com
NEXT_PUBLIC_BACKEND_API_URL=https://pr{number}-api.dev.example.com
NEXT_PUBLIC_LLMS_API_URL=https://pr{number}-api.dev.example.com
```

## 自動化の方向性

### Phase 1: 手動セットアップ（最小構成）

1. Cloudflare Dashboardで tunnel のPublic Hostnameを手動追加
2. CognitoにコールバックURL手動追加
3. worktree の `.env` に環境変数を手動設定
4. `mise run up-tachyon` で起動

### Phase 2: スクリプト化

`mise run preview-env -- PR=1070` のようなタスクで以下を自動化:

```bash
# 1. worktree作成（Worktrunk使用）
wt switch --create feat/branch-name

# 2. .env にポートオフセット + tunnel URL設定
# 3. Docker Compose起動
# 4. Cloudflare API でPublic Hostname追加
# 5. Cognito API でコールバックURL追加（AWS CLI）
```

### Phase 3: Worktrunk hook統合

```toml
# .worktrunk.toml
[hooks.post-create]
run = "mise run setup-preview-env"

[hooks.post-remove]
run = "mise run teardown-preview-env"
```

## 技術メモ

### 2026-02-08: PR #1070 動作確認で判明した事項

- **worktree + Docker Compose並行起動**: `COMPOSE_PROJECT_NAME` でコンテナ名を分離し、`*_HOST_PORT` でポートオフセットすれば問題なく並行稼働する
- **Cloudflare quick tunnel**: `cloudflared tunnel --url http://localhost:PORT` で即座にHTTPS公開可能。ただしURLは一時的
- **Next.js プロキシ**: `/api/proxy/[...path]` ルートが存在するが、`await response.text()` で全体を読み込むためSSEストリーミングは中継できない。SSEは直接APIへ接続する必要がある
- **認証の壁**: CognitoのコールバックURLにtunnel URLがないとOAuthフローが失敗する。これが最大のブロッカー
- **`REDIS_HOST_PORT`**: Redis のポートもオフセットしないとホスト側で競合する
- **`mise trust`**: 新しいworktreeでは `.mise.dev.toml` の信頼設定が必要
- **初回Dockerイメージビルド**: yarn install (6GB+) のレイヤーエクスポートに10分以上かかる。2回目以降はキャッシュで高速

### ポートオフセット表

| Worktree | Tachyon | API | Redis | COMPOSE_PROJECT_NAME |
|----------|---------|-----|-------|---------------------|
| main | 16000 | 50054 | 6379 | tachyon-apps |
| +100 | 16100 | 50154 | 6479 | tachyon-apps-pr{N} |
| +200 | 16200 | 50254 | 6579 | tachyon-apps-pr{N} |
| +300 | 16300 | 50354 | 6679 | tachyon-apps-pr{N} |

### Worktrunk (wt) インストール済み

```bash
# v0.23.1 インストール済み
wt --version  # wt v0.23.1
# バイナリ: /home/ubuntu/.local/bin/wt
```

## 関連

- PR #1070 動作確認結果: `docs/src/tasks/completed/stream-attempt-completion/task.md`
- Worktreeポート設定: `CLAUDE.md` の「Docker Composeポート設定（Worktree対応）」セクション
