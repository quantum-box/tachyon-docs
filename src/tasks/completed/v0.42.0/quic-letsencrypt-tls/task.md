# QUIC Gateway Let's Encrypt TLS 対応

## 概要

QUIC Gateway (`quic.n1.tachy.one:4433`) で使用している自己署名証明書を、PEMファイルまたはAWS Secrets Managerから読み込んだ正式な証明書に置き換える。開発環境では従来どおり自己署名証明書にフォールバックする。

## 背景

- QUIC は UDP 上で動作し、NLB は UDP パススルー（TLS 終端なし）
- 現在は `packages/streaming/src/tls.rs` の `generate_self_signed_cert()` で毎回起動時にエフェメラル証明書を生成
- tachyond クライアント側で `--quic-insecure` を指定しないと `UnknownIssuer` エラーになる
- 本番環境では正式な証明書が必要

## 完了条件

- [x] `QuicConfig` に TLS 証明書パス / Secrets Manager 参照フィールドを追加
- [x] PEM ファイルから証明書を読み込む `load_certs_from_pem()` を実装
- [x] AWS Secrets Manager から証明書を読み込む `load_certs_from_secrets_manager()` を実装
- [x] `QuicGateway::new()` で環境変数に応じて証明書ソースを切り替え
- [ ] Terraform で `QUIC_TLS_CERT_SECRET` 環境変数を追加
- [ ] Let's Encrypt 証明書の取得・更新スクリプト作成
- [ ] 本番デプロイ・動作確認

## 設計

### 証明書ソースの優先順位

1. `QUIC_TLS_CERT_SECRET` 環境変数 → AWS Secrets Manager から取得
2. `QUIC_TLS_CERT_FILE` + `QUIC_TLS_KEY_FILE` 環境変数 → PEM ファイルから読み込み
3. どちらも未設定 → 自己署名証明書を生成（開発環境向け）

### AWS Secrets Manager のデータ形式

```json
{
  "cert_pem": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
  "key_pem": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
}
```

### 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `packages/streaming/src/config.rs` | `QuicConfig` に `tls_cert_secret`, `tls_cert_file`, `tls_key_file` を追加 |
| `packages/streaming/src/tls.rs` | `load_certs_from_pem()`, `load_certs_from_secrets_manager()` を追加 |
| `packages/streaming/src/gateway.rs` | 証明書ソース切り替えロジック |
| `packages/streaming/Cargo.toml` | `aws-sdk-secretsmanager`, `rustls-pemfile` を追加 |
| `apps/tachyon-api/src/main.rs` | 環境変数読み取り → QuicConfig に設定 |
| `cluster/n1-aws/quic_streaming.tf` | `QUIC_TLS_CERT_SECRET` 環境変数を追加 |

## 進捗

### Phase 1: streaming crate の TLS ロード機能追加 (2026-02-13)

- `QuicConfig` に `TlsCertSource` enum を追加（`SelfSigned` / `PemFile` / `SecretsManager`）
- `QuicConfigBuilder` に `tls_cert_source()` メソッドを追加
- `load_certs_from_pem()` を実装（rustls-pemfile 利用）
- `load_certs_from_secrets_manager()` を実装（aws-sdk-secretsmanager, feature gated）
- `load_tls_certs()` ラッパーで証明書ソースに応じた読み込みを統一
- `QuicGateway::new()` を `load_tls_certs()` 経由に変更
- `tachyon-api/main.rs` で `QUIC_TLS_CERT_SECRET` / `QUIC_TLS_CERT_FILE` + `QUIC_TLS_KEY_FILE` 環境変数を読み取り
- Terraform に `QUIC_TLS_CERT_SECRET` 環境変数を追加
- `mise run check` でコンパイル成功を確認

### Phase 2: 本番デプロイ（未実施）

1. Let's Encrypt で `quic.n1.tachy.one` の証明書を DNS-01 チャレンジで取得
2. AWS Secrets Manager に `n1/quic-tls` として cert_pem + key_pem を格納
3. ECS 再デプロイで証明書を自動読み込み
4. tachyond から `--quic-insecure` なしで接続確認
