---
title: "PR プレビュー環境の構築（VPS + Caddy + Cloudflare Tunnel）"
type: "infrastructure"
emoji: "🌐"
topics:
  - DevOps
  - Cloudflare Tunnel
  - Caddy
  - Cognito
  - Worktree
  - Docker Compose
published: true
targetFiles:
  - compose.yml
  - cluster/n1-aws/cognito.tf
  - scripts/preview/
  - .mise/tasks/
github: ""
---

# PR プレビュー環境の構築（VPS + Caddy + Cloudflare Tunnel）

## 概要

PRごとにチームメンバーがブラウザから動作確認できるプレビュー環境を、VPS上の Docker Compose + Caddy リバースプロキシ + Cloudflare Named Tunnel で実現する。固定スロット方式で最大3環境を同時運用する。

```
https://preview1.preview.n3.tachy.one     → Caddy → localhost:16100 (Next.js)
https://preview1-api.preview.n3.tachy.one → Caddy → localhost:50154 (tachyon-api)
```

## 背景・目的

- VPS上で開発しているため、手元のブラウザからの動作確認が困難
- `localhost` にしかアクセスできず、チームメンバーやスマホからの確認ができない
- Worktree + Docker Compose の並行起動（ポートオフセット）は PR #1070 で実証済み
- Cloudflare quick tunnel は URL が一時的でCognito認証に登録できない
- **フロントエンド + バックエンドAPI の統合プレビュー**が必要（Amplifyのフロントのみプレビューでは不十分）

## 現状の確認事項

### 利用可能なインフラ

| リソース | 状態 | 備考 |
|---------|------|------|
| cloudflared v2026.2.0 | インストール済み | `cert.pem` 未設定（ログイン必要） |
| Cloudflare API Token | `.env` に設定済み | DNS操作可能 |
| Cognito User Pool | `ap-northeast-1_8Ga4bK5M4` | `local_user_pool_client` がworktreeポートを登録済み |
| ドメイン | `n3.tachy.one` | Cloudflare管理 |
| Worktree (wt) | v0.23.1 インストール済み | ポートオフセット運用実績あり |

### Cognito コールバックURL の現状

`local_user_pool_client` に以下が登録済み:
- worktree1: `http://localhost:16000/api/auth/callback/cognito`
- worktree2: `http://localhost:16100/api/auth/callback/cognito`
- worktree3: `http://localhost:16300/api/auth/callback/cognito`

**プレビュー環境用のHTTPS URLは未登録。**

## 詳細仕様

### アーキテクチャ

```
┌──────────────────────────────────┐
│         Cloudflare DNS           │
│  *.preview.n3.tachy.one CNAME    │
│    → <tunnel-uuid>.cfargotunnel.com │
└───────────────┬──────────────────┘
                │
┌───────────────▼──────────────────┐
│      cloudflared (Named)         │
│    tunnel run preview-env        │
│    ingress:                      │
│      *.preview.n3.tachy.one      │
│        → http://localhost:80     │
└───────────────┬──────────────────┘
                │
┌───────────────▼──────────────────┐
│            Caddy                 │
│    :80 (Tunnel からの HTTP)       │
│                                  │
│  preview1.preview.n3.tachy.one   │
│    → localhost:16100             │
│  preview1-api.preview.n3.tachy.one│
│    → localhost:50154             │
│  preview2.preview.n3.tachy.one   │
│    → localhost:16200             │
│  ...                             │
└───────────────┬──────────────────┘
         ┌──────┼──────┐
         ▼      ▼      ▼
      slot1   slot2   slot3
      (Docker Compose per worktree)
```

### 固定スロット方式

PR番号ではなくスロット番号（preview1/preview2/preview3）を固定サブドメインとして使用する。これにより Cognito に登録するコールバックURLが3セットで済む。

| スロット | フロントエンド URL | API URL |
|---------|-------------------|---------|
| slot1 | `https://preview1.preview.n3.tachy.one` | `https://preview1-api.preview.n3.tachy.one` |
| slot2 | `https://preview2.preview.n3.tachy.one` | `https://preview2-api.preview.n3.tachy.one` |
| slot3 | `https://preview3.preview.n3.tachy.one` | `https://preview3-api.preview.n3.tachy.one` |

### ポートオフセットマッピング

| スロット | オフセット | Tachyon | API | Redis | COMPOSE_PROJECT_NAME |
|---------|-----------|---------|-----|-------|---------------------|
| slot1 | +100 | 16100 | 50154 | 6479 | tachyon-apps-preview-1 |
| slot2 | +200 | 16200 | 50254 | 6579 | tachyon-apps-preview-2 |
| slot3 | +300 | 16300 | 50354 | 6679 | tachyon-apps-preview-3 |

### Cognito 認証対応

Cognito はワイルドカードコールバックURLを**サポートしない**。固定スロット方式により、事前に3スロット分のURLを登録すれば追加登録は不要。

```hcl
# cognito.tf に追加
resource "aws_cognito_user_pool_client" "preview_client" {
  name         = "preview-env-client"
  user_pool_id = aws_cognito_user_pool.user_pool.id
  generate_secret = true
  callback_urls = [
    "https://preview1.preview.n3.tachy.one/api/auth/callback/cognito",
    "https://preview2.preview.n3.tachy.one/api/auth/callback/cognito",
    "https://preview3.preview.n3.tachy.one/api/auth/callback/cognito",
  ]
  allowed_oauth_flows = ["code"]
  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
  ]
  supported_identity_providers         = ["COGNITO"]
  allowed_oauth_scopes                 = ["openid", "email", "profile", "aws.cognito.signin.user.admin"]
  allowed_oauth_flows_user_pool_client = true
}
```

### 環境変数（プレビュー用 .env）

```env
# worktree の .env に設定
COMPOSE_PROJECT_NAME=tachyon-apps-preview-1
TACHYON_HOST_PORT=16100
TACHYON_API_HOST_PORT=50154
REDIS_HOST_PORT=6479

# Next.js (apps/tachyon/.env.local を上書き)
NEXTAUTH_URL=https://preview1.preview.n3.tachy.one
NEXT_PUBLIC_BACKEND_API_URL=https://preview1-api.preview.n3.tachy.one
COGNITO_CLIENT_ID=<preview_client_id>
COGNITO_CLIENT_SECRET=<preview_client_secret>
```

## 実装方針

### Phase 1: 基盤セットアップ 📝

手動で最小構成を動作確認する。

- [ ] Cloudflare にログイン (`cloudflared tunnel login`)
- [ ] Named Tunnel 作成 (`cloudflared tunnel create preview-env`)
- [ ] Cloudflare DNS にワイルドカード CNAME 登録 (`*.preview.n3.tachy.one` → tunnel UUID)
- [ ] Caddy をインストールし設定ファイル作成
- [ ] Cognito にプレビュー用クライアント作成（Terraform or AWS Console）
- [ ] worktree を1つ作成し手動で起動 → ブラウザからアクセス確認
- [ ] Cognito ログインフローの動作確認

### Phase 2: スクリプト化 📝

`mise run preview-up` / `mise run preview-down` で操作を自動化する。

- [ ] `scripts/preview/` ディレクトリ作成
- [ ] `scripts/preview/setup.sh` — worktree作成 + .env生成 + Docker Compose起動
- [ ] `scripts/preview/teardown.sh` — Docker Compose停止 + worktree削除
- [ ] `scripts/preview/Caddyfile.template` — Caddyfile テンプレート
- [ ] `scripts/preview/cloudflared-config.yml.template` — tunnel設定テンプレート
- [ ] mise タスク追加: `preview-up`, `preview-down`, `preview-list`
- [ ] スロット管理ファイル（どのスロットにどのPRがデプロイされているか）

## タスク分解

### 主要タスク

- [ ] Phase 1: 手動で1環境を動作確認
- [ ] Phase 2: mise タスクで操作をスクリプト化

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| VPS のリソース不足（Docker Compose × 3 + Caddy + cloudflared） | 高 | メモリ/CPU監視、同時スロット数を2に制限する選択肢 |
| Cognito ワイルドカード非対応 | 中 | 固定スロット方式（preview1/2/3）で回避済み |
| cloudflared tunnel の接続断 | 中 | systemd サービス化で自動再起動 |
| Docker イメージの初回ビルドが遅い（10分+） | 低 | キャッシュ済みイメージを事前ビルド |
| SSE/WebSocket のプロキシ | 中 | Caddy の reverse_proxy はデフォルトで対応。flush_interval 設定で調整 |

## 技術メモ

### Caddyfile

```caddyfile
# Cloudflare Tunnel 経由で HTTP を受けるため TLS は不要
{
    auto_https off
}

# slot1
preview1.preview.n3.tachy.one:80 {
    reverse_proxy localhost:16100
}
preview1-api.preview.n3.tachy.one:80 {
    reverse_proxy localhost:50154
}

# slot2
preview2.preview.n3.tachy.one:80 {
    reverse_proxy localhost:16200
}
preview2-api.preview.n3.tachy.one:80 {
    reverse_proxy localhost:50254
}

# slot3
preview3.preview.n3.tachy.one:80 {
    reverse_proxy localhost:16300
}
preview3-api.preview.n3.tachy.one:80 {
    reverse_proxy localhost:50354
}
```

### cloudflared config.yml

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /home/ubuntu/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: "*.preview.n3.tachy.one"
    service: http://localhost:80
  - service: http_status:404
```

### cloudflared の systemd 化

```ini
# /etc/systemd/system/cloudflared-preview.service
[Unit]
Description=Cloudflare Tunnel for Preview Environments
After=network.target

[Service]
Type=simple
User=ubuntu
ExecStart=/usr/local/bin/cloudflared tunnel --config /home/ubuntu/.cloudflared/preview-config.yml run preview-env
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### mise タスク設計

```bash
# mise run preview-up -- SLOT=1 BRANCH=feat/xxx
# → worktree作成 + .env生成 + Docker Compose起動

# mise run preview-down -- SLOT=1
# → Docker Compose停止 + worktree削除

# mise run preview-list
# → 現在のプレビュー環境一覧を表示
```

## 完了条件

- [ ] `https://preview1.preview.n3.tachy.one` でフロントエンドにアクセスできる
- [ ] `https://preview1-api.preview.n3.tachy.one` でAPIにアクセスできる
- [ ] Cognito ログインフローが正常に完了する
- [ ] `mise run preview-up` でワンコマンド起動できる
- [ ] `mise run preview-down` でクリーンアップできる

## 参考資料

- 既存taskdoc: `fix/ci-amd64-dev-tools-and-format` ブランチの `pr-preview-cloudflare-tunnel/task.md`
- Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
- Caddy reverse_proxy: https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- Cognito コールバックURL制限: 最大100個（ワイルドカード非対応）
- Worktree ポート設定: `CLAUDE.md` の「Docker Composeポート設定（Worktree対応）」セクション
