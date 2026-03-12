# Tachyond

## 概要

Tachyondは、ローカルデーモンとして動作するツールで、Tool Jobsの処理、リソース管理、コンテナオーケストレーションを担います。CLI/TUIインターフェースも備えており、`execute_agent` usecaseを使用してLLMと対話できます。

## 特徴

- **Workerモード**: Tool Jobsを処理するバックグラウンドデーモン
  - Redis Streams / SQS からジョブを取得
  - OpenCode / Claude Code / Codex CLIを実行
  - QUICストリーミングでイベントを配信
- **CLIモード**: シンプルなコマンドラインインターフェース
- **TUIモード**: ratatuiを使用したターミナルユーザーインターフェース（Vim風キーバインディング）
- **2つの実行モード**:
  - API Mode: tachyon-api経由でエージェントを実行
  - Builtin Mode: execute_agent usecaseを直接実行
- リアルタイムストリーミング応答
- トークン使用量とクレジットコストの追跡
- ツール実行の可視化

## アーキテクチャ

### ディレクトリ構造

```
apps/tachyond/
├── src/
│   ├── main.rs        # エントリポイント
│   ├── worker.rs      # Workerモード実装
│   ├── app.rs         # TUIアプリケーション状態管理
│   ├── ui.rs          # TUI描画ロジック
│   ├── cli.rs         # CLIモード実装
│   ├── agent.rs       # API経由のエージェントクライアント
│   ├── agent_builtin.rs # ビルトインエージェント実装
│   ├── config.rs      # 設定管理
│   └── services.rs    # 依存サービス（リポジトリ、プロバイダー）
├── Cargo.toml
├── README.md
└── .tachyond.toml     # 設定ファイル
```

### 主要コンポーネント

#### 1. Workerモード（`worker.rs`）
- Redis Streams / SQS からTool Jobを取得して処理
- OpenCode、Claude Code、Codex CLIを非同期実行
- QUICストリーミングでプラットフォームにイベント配信
- Dockerコンテナ内で動作

#### 2. CLIモード（`cli.rs`）
- シンプルな対話型インターフェース
- `>` プロンプトでユーザー入力を待機
- `exit`または`quit`で終了
- TTYを必要としないため、パイプやリダイレクトでも使用可能

#### 3. TUIモード（`app.rs`, `ui.rs`）
- ratatuiベースのフルスクリーンターミナルUI
- Normalモード/Insertモードの切り替え
- スクロール機能
- リアルタイムメッセージ更新

#### 4. エージェント実装
- **agent.rs**: HTTP/SSE経由でtachyon-apiと通信
- **agent_builtin.rs**: execute_agent usecaseを直接使用

#### 5. サービス層（`services.rs`）
- ChatStreamProviders: LLMプロバイダー管理（Anthropic, OpenAI）
- MockChatMessageRepository: 開発用のメッセージリポジトリ
- MockCatalogAppService: 開発用のカタログサービス

## 使用方法

### Workerモード（Docker）

```bash
# Docker Composeで起動
docker compose up -d tachyond

# ログを確認
docker compose logs tachyond -f

# 環境変数で設定
docker compose up -d tachyond \
  -e USE_QUIC_STREAMING=true \
  -e QUIC_GATEWAY_ADDR=tachyon-api:4433
```

### Workerモード（ローカル開発）

```bash
# miseタスクで起動
mise run tachyond

# 直接起動
cargo run -p tachyond --no-default-features --features worker -- worker

# QUIC有効化
cargo run -p tachyond --no-default-features --features worker,quic -- worker \
  --quic-gateway-addr localhost:4433
```

### CLIモード

```bash
# 対話型CLIモード（デフォルト）
cargo run -p tachyond

# ワンショットモード（直接メッセージ実行）
cargo run -p tachyond -- "自己紹介して"

# TUIモード
cargo run -p tachyond -- --ui tui

# APIモードで実行
cargo run -p tachyond -- --mode api

# カスタム設定ファイルを使用
cargo run -p tachyond -- --config path/to/config.toml

# オプションを組み合わせて使用
cargo run -p tachyond -- --model "anthropic/claude-3-5-haiku-20241022" "質問内容"

# コスト内訳を表示しながら実行
cargo run -p tachyond -- --breakdown --model "anthropic/claude-3-5-haiku-20241022" "計算して"
```

### ワンショットモード

CLIモードでは、コマンドライン引数としてメッセージを渡すことで、対話モードに入らずに直接実行できます：

```bash
# 基本的な使用例
cargo run -p tachyond -- "今日の天気は？"

# パイプラインでの使用
echo "コードレビューして" | cargo run -p tachyond

# スクリプトでの使用
result=$(cargo run -p tachyond -- "計算: 1234 * 5678")
echo "結果: $result"
```

このモードでは：
- 標準出力にアシスタントの応答のみ出力
- ツール実行情報とトークン使用量は標準エラー出力に出力
- 対話プロンプトは表示されない

### CLIモードの対話例

```
🤖 Tachyond CLI - Builtin Mode
Type your message and press Enter. Type 'exit' or 'quit' to quit.

> こんにちは

🔄 Processing...

こんにちは！お手伝いできることはありますか？

📊 Usage: 150 tokens (Cost: 3.50 credits)

> exit
👋 Goodbye!
```

### TUIモードのキーバインディング

#### Normalモード
- `i` - Insertモードに入る
- `q` - アプリケーションを終了
- `j`/`↓` - 下にスクロール
- `k`/`↑` - 上にスクロール
- `G` - 最下部へ移動
- `Ctrl+G` - 最上部へ移動
- `PageDown/PageUp` - ページ単位でスクロール

#### Insertモード
- `Esc` - Normalモードに戻る
- `Enter` - メッセージを送信
- 通常のタイピング - メッセージ入力
- `Backspace` - 文字削除

## 設定

### 設定ファイル（`.tachyond.toml`）

```toml
# Execution mode: "api" or "builtin"
mode = "builtin"

# UI mode: "cli" or "tui"
ui = "cli"

# API configuration (for api mode)
api_url = "http://localhost:50054"
api_token = "dummy-token"

# Authentication
tenant_id = "tn_01hjryxysgey07h5jz5wagqj0m"
user_id = "us_01hs2yepy5hw4rz8pdq2wywnwt"

# Agent configuration
model = "anthropic/claude-sonnet-4-5-20250929"
auto_approve = true
max_requests = 25
```

### 環境変数

Builtinモードでは以下の環境変数が必要です：

```bash
# Anthropicモデル用
export ANTHROPIC_API_KEY=your-api-key

# OpenAIモデル用
export OPENAI_API_KEY=your-api-key
```

Workerモードの環境変数：

```bash
# キュー設定
QUEUE_TYPE=redis                    # redis または sqs
REDIS_URL=redis://localhost:6379

# QUIC ストリーミング
USE_QUIC_STREAMING=true
QUIC_GATEWAY_ADDR=tachyon-api:4433
QUIC_SERVER_NAME=tachyon-api

# OpenCode サーバー
START_OPENCODE_SERVER=true
OPENCODE_SERVER_PORT=4096
```

## 実装の詳細

### LLMプロバイダー統合

実際のLLMプロバイダーを使用（モックなし）：

```rust
// services.rs
pub fn create_chat_stream_providers() -> Result<Arc<ChatStreamProviders>> {
    let anthropic_provider = Arc::new(anthropic::Anthropic::new_with_default());
    let openai_provider = Arc::new(openai::OpenAI::new_with_default());

    let providers = ChatStreamProvidersBuilder::new()
        .add_provider("anthropic", anthropic_provider)
        .add_provider("openai", openai_provider)
        .with_default_provider("anthropic")?
        .build();

    Ok(Arc::new(providers))
}
```

### ストリーミング処理

AgentChunkタイプに応じたイベント処理：

```rust
match chunk {
    AgentChunk::Say(text) => {
        // テキストレスポンス
    }
    AgentChunk::ToolCall(tool_call) => {
        // ツール呼び出し
    }
    AgentChunk::Usage(usage) => {
        // 使用量統計
    }
    // ...
}
```

### エラーハンドリング

- PaymentRequired: クレジット不足時のエラー
- NotFound: モデルマッピングエラー
- ネットワークエラー: API接続失敗

## 開発時の注意点

### ChatRoomIdの生成
- `ChatRoomId::default()`を使用
- 自動的に`ch_`プレフィックス付きのULIDが生成される

### コード品質
- `cargo check -p tachyond`でwarningなし
- 未使用コードには`#[allow(dead_code)]`を適用

### CLAUDE.mdルール準拠
- examplesディレクトリではモックを使用しない
- 実際のLLMプロバイダーを使用
- 環境変数での設定方法を明示

## トラブルシューティング

### "Device not configured"エラー
TUIモードで発生する場合：
1. 適切なターミナルで実行しているか確認
2. SSH接続の場合は`ssh -t`でTTYを割り当て
3. Dockerの場合は`docker run -it`で対話モードを使用

### "Unknown model for product mapping"エラー
- 設定ファイルのモデル名が正しいか確認
- サポートされているモデル：
  - anthropic/claude-sonnet-4-5-20250929
  - anthropic/claude-3-5-haiku-20241022
  - anthropic/claude-opus-4-1-20250805
  - anthropic/claude-sonnet-4-5-20250929

### APIキーエラー
- 環境変数`ANTHROPIC_API_KEY`または`OPENAI_API_KEY`が設定されているか確認
- Builtinモードでは必須

### QUIC接続エラー
- `QUIC_GATEWAY_ADDR`がホスト名:ポート形式で正しいか確認
- DNSが解決できるか確認
- ファイアウォールでUDP 4433が許可されているか確認

## コスト計算の内訳表示

`--breakdown` (または `-b`) オプションを使用することで、Agent APIのコスト計算の内訳を表示できます：

```bash
# 対話モードで内訳を表示
cargo run -p tachyond -- --breakdown

# ワンショットモードで内訳を表示
cargo run -p tachyond -- --breakdown "計算して: 1234 * 5678"

# 短縮形
cargo run -p tachyond -- -b "自己紹介して"
```

内訳表示の例：
```
📊 Usage: 1500 tokens (Cost: 35.00 credits)

💰 コスト内訳:
  基本料金: 10.00 credits
  プロンプト: 1000 tokens × 0.01 = 10.00 credits
  生成: 500 tokens × 0.02 = 10.00 credits
  合計: 30.00 credits
  (実際の課金額: 35.00 credits)
```

### 料金体系（推定値）
- **基本料金**: 10クレジット/実行
- **プロンプトトークン**: 0.01クレジット/トークン
- **完了トークン**: 0.02クレジット/トークン

注意：実際の課金額は、使用するモデルや設定により異なる場合があります。

## VPS運用ガイド

tachyondをVPS上でsystemdサービスとして常駐運用する手順。

### 初回セットアップ

```bash
# 1. バイナリをインストール（GitHub CLI必須）
gh release download tachyond-v0.1.1 \
  -R quantum-box/tachyon-apps \
  -p 'tachyond-x86_64-unknown-linux-gnu' \
  -D ~/.local/bin --clobber
chmod +x ~/.local/bin/tachyond-*
mv ~/.local/bin/tachyond-* ~/.local/bin/tachyond

# 2. systemdサービスをセットアップ
sudo bash scripts/systemd/setup-tachyond-service.sh

# 3. 環境変数を編集
sudo vim /etc/tachyond/tachyond.env
```

`/etc/tachyond/tachyond.env` の主要設定:

```bash
# 本番APIエンドポイント
CALLBACK_URL=https://api.n1.tachy.one

# オペレーターID
TOOL_JOB_OPERATOR_ID=tn_01hjryxysgey07h5jz5wagqj0m

# 認証トークン（pk_ APIキー推奨）
TACHYON_AUTH_TOKEN=pk_eXhUuUShsel6h3ylt1d7GnmRv/p8JhqxN5yahyFfgOg=

# Worker ID（デバイス固定。再起動しても同じWorkerとして認識）
WORKER_ID=worker-vps-ik1

# キュータイプ（HTTP推奨）
QUEUE_TYPE=http

# ハートビート間隔（秒）
HEARTBEAT_INTERVAL_SECONDS=60

# 同時実行ジョブ数
MAX_CONCURRENT_JOBS=5

# ログレベル
RUST_LOG=info,tachyond=info,llms=info
```

```bash
# 4. サービスを有効化・起動
sudo systemctl enable tachyond
sudo systemctl start tachyond

# 5. ログで動作確認
sudo journalctl -u tachyond -f
```

### 日常運用コマンド

```bash
# ステータス確認
sudo systemctl status tachyond

# リアルタイムログ
sudo journalctl -u tachyond -f

# 過去ログ検索
sudo journalctl -u tachyond --since "1 hour ago"
sudo journalctl -u tachyond --since "2026-02-12" --until "2026-02-13"

# 再起動
sudo systemctl restart tachyond

# 停止
sudo systemctl stop tachyond
```

### リリース更新

新しいtachyondがリリースされたらバイナリを更新:

```bash
# 最新バージョンに更新（自動ロールバック付き）
sudo bash scripts/systemd/update-tachyond.sh

# 特定バージョンに更新
sudo bash scripts/systemd/update-tachyond.sh tachyond-v0.2.0
```

更新スクリプトの動作:
1. GitHub Releasesから指定バージョンをダウンロード
2. 旧バイナリを `/usr/local/bin/tachyond.bak` にバックアップ
3. 新バイナリを配置
4. サービスが実行中なら自動で `systemctl restart`
5. 起動失敗時は旧バイナリに自動ロールバック

### ロールバック

```bash
# 手動ロールバック
sudo cp /usr/local/bin/tachyond.bak /usr/local/bin/tachyond
sudo systemctl restart tachyond
```

### システムメトリクス

tachyondはハートビート（60秒間隔）でVPSのシステムメトリクスを自動送信:

- **CPU使用率** — 全コア平均
- **メモリ使用量** — 使用量/総量/使用率
- **ディスク使用量** — 使用量/総量/使用率
- **ロードアベレージ** — 1分/5分/15分
- **アップタイム** — システム稼働時間

フロントエンドの **AI Studio > Workers** ページでリアルタイム確認可能。

### トラブルシューティング（運用）

#### ハートビートが止まった
```bash
# サービスが動いているか確認
sudo systemctl status tachyond

# ログを確認（ハートビート送信エラー）
sudo journalctl -u tachyond --since "10 minutes ago" | grep -i heartbeat

# API到達確認
curl -s -H "Authorization: Bearer $TACHYON_AUTH_TOKEN" \
  -H "x-operator-id: $TOOL_JOB_OPERATOR_ID" \
  https://api.n1.tachy.one/v1/agent/workers
```

#### Workerがunhealthyになった
ハートビートが一定時間途切れるとAPIがWorkerを `unhealthy` にマーク。
サービスを再起動すれば自動的に `active` に復帰:
```bash
sudo systemctl restart tachyond
```

#### ゴーストWorkerが蓄積した
`WORKER_ID` 環境変数を設定せずに再起動を繰り返すと、毎回新しいWorkerが登録される。
`/etc/tachyond/tachyond.env` に `WORKER_ID=worker-vps-<hostname>` を設定すること。
