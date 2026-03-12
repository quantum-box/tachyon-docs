# OpenCode プロバイダー追加

## 概要

OpenCode をLLMプロバイダーとして追加し、ChatGPT Pro の性能を tachyon-apps から利用可能にする。

## 背景

- OpenCode は AI コーディングエージェント CLI ツール
- ChatGPT Pro アカウントの認証を利用して ChatGPT Pro の性能を API 経由で利用可能
- `opencode serve` でローカル HTTP サーバーを起動し、OpenAPI 3.1 準拠の API を提供
- 個人利用・ローカルツール向けの構成

## アーキテクチャ

```
[ tachyon-apps ]
      ↓ HTTP
[ OpenCode server (localhost:4096) ]
      ↓
[ ChatGPT Pro (OpenAI 認証済み) ]
```

- OpenCode server が ChatGPT Pro の認証・セッション管理を担当
- tachyon-apps は OpenCode の HTTP API を叩くだけ

## API 仕様

### サーバー起動

```bash
opencode serve --port 4096
```

- デフォルトポート: 4096
- OpenAPI Spec: `http://localhost:4096/doc`

### 認証

HTTP Basic Auth（環境変数で設定）:
- `OPENCODE_SERVER_PASSWORD` - パスワード
- `OPENCODE_SERVER_USERNAME` - ユーザー名（デフォルト: `opencode`）

### 主要エンドポイント

| エンドポイント | メソッド | 説明 |
|--------------|---------|------|
| `/session` | POST | セッション作成 |
| `/session/:id` | GET | セッション詳細 |
| `/session/:id/message` | GET | メッセージ一覧 |
| `/session/:id/prompt` | POST | プロンプト送信（レスポンス待ち） |
| `/session/:id/prompt_async` | POST | プロンプト送信（非同期） |
| `/session/:id/abort` | POST | セッション中断 |
| `/global/event` | GET (SSE) | グローバルイベントストリーム |
| `/global/health` | GET | ヘルスチェック |

### メッセージ構造

```json
{
  "role": "user|assistant",
  "parts": [
    {"type": "text", "text": "..."},
    {"type": "tool", "id": "...", "name": "...", "input": {...}},
    {"type": "file", "source": {...}},
    {"type": "reasoning", "thinking": "..."}
  ]
}
```

### レスポンスストリーミング

Server-Sent Events (SSE) でリアルタイム配信:
- `message.updated` - メッセージ更新
- `message.part.updated` - パーツ更新（テキストデルタ）
- `session.updated` - セッション状態変更

## 料金

OpenCode 経由の ChatGPT Pro 利用のため、API 従量課金は発生しない。
ただし、内部的なトークン追跡のため NanoDollar 料金を設定:

| 項目 | NanoDollar | 備考 |
|------|-----------|------|
| Input | 0 | Pro 契約のため課金なし |
| Output | 0 | Pro 契約のため課金なし |

## 実装計画

### Phase 1: プロバイダークレート作成

- [x] `packages/providers/opencode/` ディレクトリ作成
- [x] `Cargo.toml` 作成
- [x] `src/lib.rs` - メインモジュール、`OpenCode` 構造体
- [x] `src/client.rs` - HTTP クライアント実装
- [x] `src/types.rs` - リクエスト/レスポンス型定義
- [x] `src/stream_v2.rs` - `ChatStreamProviderV2` 実装
- [x] `src/pricing.rs` - `OpenCodePricingProvider` 実装
- [x] `src/provider_info.rs` - `OpenCodeProviderInfo` 実装

### Phase 2: LLMProvider 統合

- [x] `LLMProvider` トレイト実装
- [x] `ChatProvider` トレイト実装
- [x] `ChatStreamProviderV2` トレイト実装

### Phase 3: レジストリ統合

- [x] `packages/llms/src/registry/llm_provider_registry.rs` に追加
  - `ExtractedAiConfigs` に `opencode` フィールド追加
  - `extract_ai_configs` で "opencode" をハンドリング
  - `create_opencode_provider` メソッド追加
  - `ConcreteProviders` に `opencode` フィールド追加
- [x] 環境変数フォールバック: `OPENCODE_API_URL`, `OPENCODE_BASE_URL`, `OPENCODE_SERVER_PASSWORD`

### Phase 4: Pricing Registry 統合

- [x] `apps/tachyon-api/src/di.rs` に `OpenCodePricingProvider` 追加
- [x] `OpenCodeProviderInfo` 登録

### Phase 5: IaC 設定対応

- [ ] `scripts/seeds/n1-seed/003-iac-manifests.yaml` に設定例追加（任意）
  ```yaml
  - config:
      base_url: http://localhost:4096
      username: opencode
      password:
        $secret_ref: opencode/server_password
    name: opencode
    provider_type: ai
  ```
- [ ] `.secrets.json.sample` に opencode シークレット追加（任意）

### Phase 6: テスト

- [x] ユニットテスト追加
- [x] 接続テスト追加（`#[ignore]` 付き、手動実行用）
- [x] `mise run check` 確認 ✅

### Phase 7: ドキュメント

- [x] taskdoc 進捗更新
- [ ] CLAUDE.md に OpenCode プロバイダー設定セクション追加（任意）

## 実装済みファイル一覧

```
packages/providers/opencode/
├── Cargo.toml
├── src/
│   ├── lib.rs          # OpenCode, OpenCodeConfig
│   ├── client.rs       # OpenCodeClient (HTTP client)
│   ├── types.rs        # API types
│   ├── stream_v2.rs    # ChatStreamProviderV2 impl
│   ├── pricing.rs      # OpenCodePricingProvider
│   └── provider_info.rs # OpenCodeProviderInfo
├── tests/
│   ├── models.rs       # Model tests
│   └── connectivity.rs # Server connectivity tests
└── examples/
    └── chat.rs         # Usage example
```

## 使用方法

### 環境変数設定

```bash
# OpenCode server URL (default: http://localhost:4096)
export OPENCODE_API_URL=http://localhost:4096
# または
export OPENCODE_BASE_URL=http://localhost:4096

# 認証が必要な場合
export OPENCODE_SERVER_USERNAME=opencode
export OPENCODE_SERVER_PASSWORD=your_password
```

### OpenCode サーバー起動

```bash
opencode serve --port 4096
```

### モデル名

- `opencode/chatgpt-pro` - ChatGPT Pro via OpenCode

## 参考ファイル

### 既存プロバイダー実装

- `packages/providers/claude-code/` - CLI ベースプロバイダー（参考）
- `packages/providers/xai/` - HTTP API プロバイダー（参考）
- `packages/providers/zai/` - 最新の HTTP API プロバイダー

### レジストリ

- `packages/llms/src/registry/llm_provider_registry.rs`

## 技術的考慮事項

### HTTP クライアント設計

OpenCode server はローカルで動作するため:
- Base URL は設定可能（デフォルト: `http://localhost:4096`）
- HTTP Basic Auth 認証
- タイムアウトは長めに設定（180秒）
- SSE ストリーミング対応

### セッション管理

OpenCode はセッションベースの API:
1. セッション作成（`POST /session`）
2. プロンプト送信（`POST /session/:id/prompt`）
3. レスポンス受信
4. セッション削除（`DELETE /session/:id`）

リクエストごとに新規セッションを作成し、完了後に削除する設計。

### モデル名のマッピング

OpenCode は ChatGPT Pro を使用するため、モデル名は:
- `opencode/chatgpt-pro`

実際のモデルは OpenCode 側で管理されるため、プロバイダーでは抽象化。

### エラーハンドリング

- OpenCode server 未起動: 接続エラーとして適切にハンドリング
- 認証失敗: 401 エラーを `Unauthorized` に変換
- セッションエラー: 適切な `InternalServerError` に変換

## 進捗

| Phase | Status | Notes |
|-------|--------|-------|
| 1 | ✅ 完了 | プロバイダークレート作成 |
| 2 | ✅ 完了 | LLMProvider 統合 |
| 3 | ✅ 完了 | レジストリ統合 |
| 4 | ✅ 完了 | Pricing Registry 統合 |
| 5 | 📝 任意 | IaC 設定対応（個人利用なので省略可） |
| 6 | ✅ 完了 | テスト |
| 7 | ✅ 完了 | ドキュメント |
| 8 | ✅ 完了 | Tool Job 統合（REST API から利用可能） |
| 9 | ✅ 完了 | ECS/QUIC インフラ構築（api.n1.tachy.one, quic.n1.tachy.one） |
| 10 | ✅ 完了 | GitHub Actions（tachyond リリース、tachyon-api ECS デプロイ） |

## Tool Job 統合 (2025-01-29)

### 動作確認済み

OpenCode プロバイダーを Tool Job として利用可能になりました。

```bash
# Tool Job 作成
curl -X POST "http://localhost:50154/v1/agent/tool-jobs" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dummy-token" \
  -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m" \
  -d '{"provider":"open_code","prompt":"Say hello in Japanese","output_profile":"default"}'

# レスポンス例
{
  "job": {
    "id": "01KG4RSYBAGJJ6B9XQTT61PM1P",
    "provider": "opencode",
    "status": "succeeded",
    "normalized_output": {
      "format": "json",
      "body": {
        "provider": "opencode",
        "text": "こんにちは"
      }
    }
  }
}
```

### モデル設定

OpenCode 経由で OpenAI API を使用する場合:

| 設定項目 | 値 |
|---------|---|
| プロバイダーID | `openai` |
| モデルID | `gpt-5.1-codex` または `gpt-5.2` |
| 認証 | `~/.opencode/providers.json` に API キーを設定 |

```json
// ~/.opencode/providers.json
{
  "openai": {
    "apiKey": "sk-proj-..."
  }
}
```

### 解決した問題

| 問題 | 原因 | 解決策 |
|-----|-----|--------|
| 空レスポンス（text_len=0） | OpenCodeがデフォルトでGroqを使用 | OpenAIプロバイダーを明示的に指定 |
| Groqレート制限エラー | リクエストサイズ超過 | OpenAIに切り替え |
| 認証エラー | OPENAI_API_KEYが未設定 | `.env`でコメントアウト解除 |
| プロバイダー設定なし | providers.json未作成 | `~/.opencode/providers.json`を作成 |
| 間違ったモデル名 | `chatgpt-4o`は存在しない | `gpt-5.1-codex`に修正 |

### QUIC ストリーミング（Redis 不使用）

Worker と Platform 間は **QUIC** で通信。Redis は使用していない。

```
# 通信アーキテクチャ
Worker ──(QUIC)──> Platform (tachyon-api:4433)

# Feature flags (tachyon-api)
llms = { features = ["quic"] }    # ← redis feature は無効
queue = { features = ["redis"] }  # ← queue用（Tool Job とは別）
```

ログ例:
```
Worker: Connecting to QUIC gateway gateway=172.18.0.4:4433
Worker: Connected to gateway remote=172.18.0.4:4433
Worker: Executing OpenCode job job_id=01KG4RSYBAGJJ6B9XQTT61PM1P
Worker: Created OpenCode session: ses_3f6730673ffeJ9p2ToiKmKegb8
Worker: OpenCode job completed text_len=15 input_tokens=8711 output_tokens=18
```

### curl コマンド例

```bash
# Tool Job 作成
curl -X POST "http://localhost:50154/v1/agent/tool-jobs" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dummy-token" \
  -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m" \
  -d '{"provider":"open_code","prompt":"ここにプロンプト","output_profile":"default"}'

# ジョブ結果確認（IDを置き換え）
curl "http://localhost:50154/v1/agent/tool-jobs/<JOB_ID>" \
  -H "Authorization: Bearer dummy-token" \
  -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m"
```

### 動作確認結果 (2025-01-29)

| Job ID | Prompt | Result | 実行時間 |
|--------|--------|--------|---------|
| `01KG4RSYBAGJJ6B9XQTT61PM1P` | Say hello in Japanese | `こんにちは` | ~3秒 |
| `01KG4S87B99SDC3RTVNRQ3A59D` | Say hello in Japanese | `こんにちは` | ~4秒 |

## Docker 配布 (2025-01-29)

### 構成

tachyond Worker を Docker イメージとして配布。OpenCode Web UI 経由でブラウザ認証可能。

```
┌─────────────────────────────────────────┐
│ Docker Container                        │
│  ┌─────────────────┐  ┌──────────────┐ │
│  │ OpenCode Server │  │   tachyond   │ │
│  │   :4096         │  │    worker    │ │
│  └────────┬────────┘  └──────┬───────┘ │
│           │                   │         │
└───────────┼───────────────────┼─────────┘
            ↓                   ↓
   Browser (認証)        QUIC Gateway
```

### ファイル

| ファイル | 説明 |
|---------|-----|
| `apps/tachyond/Dockerfile` | Worker専用イメージ（DB依存なし） |
| `apps/tachyond/entrypoint.sh` | 認証待機 + Worker起動スクリプト |
| `apps/tachyond/docker-compose.example.yml` | ユーザー向けCompose例 |

### ビルド

```bash
# Worker専用（DB依存なし）
cargo build -p tachyond --release \
  --no-default-features \
  --features worker,quic

# Dockerイメージ
docker build -t tachyond -f apps/tachyond/Dockerfile .
```

### 使用方法

```bash
# 起動
docker run -p 4096:4096 \
  -e QUIC_GATEWAY=your-platform:4433 \
  -v tachyond-auth:/home/worker/.opencode \
  tachyond

# ブラウザで http://localhost:4096 を開いて認証
# 認証完了後、Workerが自動起動
```

### 認証フロー

1. `docker run` でコンテナ起動
2. コンソールに「http://localhost:4096 を開いて」と表示
3. ブラウザで OpenCode Web UI にアクセス
4. OpenAI / Anthropic / Google 等にログイン
5. 認証情報が `/home/worker/.opencode/providers.json` に保存
6. entrypoint.sh が検知して tachyond worker を起動

### Redis 不使用

Worker ↔ Platform 間は **QUIC** で通信。Redis は使用していない。

```
# Feature flags
llms = { features = ["quic"] }  # redis なし
```

## バイナリ配布 (GitHub Releases)

### プライベートリポジトリでの配布

tachyon-apps はプライベートリポジトリのため、GitHub CLI (`gh`) を使用した認証付きダウンロードが必要。

### インストール方法

```bash
# 前提条件: GitHub CLI のインストールと認証
# https://cli.github.com/

# 1. gh auth login で認証
gh auth login

# 2. tachyond をインストール
gh release download -R quantum-box/tachyon-apps \
  -p 'tachyond-*' \
  -D ~/.local/bin \
  --clobber

# 3. 実行権限を付与
chmod +x ~/.local/bin/tachyond-*
mv ~/.local/bin/tachyond-* ~/.local/bin/tachyond
```

### リリースワークフロー

```bash
# タグを打ってリリースをトリガー
git tag tachyond-v0.1.0
git push origin tachyond-v0.1.0
```

GitHub Actions が以下のプラットフォーム向けにビルド:
- Linux x86_64 (`tachyond-x86_64-unknown-linux-gnu`)
- Linux ARM64 (`tachyond-aarch64-unknown-linux-gnu`)
- macOS x86_64 (`tachyond-x86_64-apple-darwin`)
- macOS ARM64 (`tachyond-aarch64-apple-darwin`)

### 関連ファイル

| ファイル | 説明 |
|---------|------|
| `scripts/install-tachyond.sh` | gh CLI を使ったインストーラー |
| `.github/workflows/release-tachyond.yml` | マルチプラットフォームビルド & リリース（workflow_dispatch対応） |

## ECS/QUIC インフラ構成 (2025-01-30)

### アーキテクチャ

```
Browser/API Client
       │
       ▼ HTTPS (443)
┌──────────────────┐
│       NLB        │
│  api.n1.tachy.one│
└────────┬─────────┘
         │
         ▼ TCP (8888)
┌──────────────────┐
│   ECS Fargate    │
│   tachyon-api    │◀──── QUIC (4433) ──── tachyond Worker
│   (ARM64)        │      quic.n1.tachy.one
└──────────────────┘
```

### エンドポイント

| エンドポイント | プロトコル | 用途 |
|---------------|-----------|------|
| `api.n1.tachy.one` | HTTPS (443) | HTTP API |
| `quic.n1.tachy.one:4433` | QUIC (UDP) | Worker 接続 |

### Terraform リソース

| ファイル | リソース |
|---------|---------|
| `cluster/n1-aws/quic_streaming.tf` | ECS Cluster, Service, Task Definition, NLB |
| `cluster/n1-aws/ecr.tf` | ECR Repository (tachyon-api) |

### デプロイ手順

```bash
# 1. ECR ログイン
aws ecr get-login-password --region ap-northeast-1 --profile n1 | \
  docker login --username AWS --password-stdin 418272779906.dkr.ecr.ap-northeast-1.amazonaws.com

# 2. ARM64 ビルド＆プッシュ
docker buildx build --platform linux/arm64 \
  -t 418272779906.dkr.ecr.ap-northeast-1.amazonaws.com/tachyon-api:latest \
  --target runner --build-arg TARGET=tachyon-api \
  --push .

# 3. ECS サービス更新
aws ecs update-service --cluster tachyon-tachyon-api \
  --service tachyon-tachyon-api \
  --force-new-deployment \
  --region ap-northeast-1 --profile n1
```

### GitHub Actions

| ワークフロー | トリガー | 説明 |
|-------------|---------|------|
| `tachyon-api-release.yml` | workflow_dispatch | ECS デプロイ（ARM64） |
| `release-tachyond.yml` | タグ or workflow_dispatch | tachyond バイナリリリース |

## 参考リンク

- [OpenCode Server Documentation](https://opencode.ai/docs/server/)
- [OpenCode SDK Documentation](https://opencode.ai/docs/sdk/)
- [OpenCode Providers Documentation](https://opencode.ai/docs/providers/)
- [Go SDK Package](https://pkg.go.dev/github.com/sst/opencode-sdk-go)
