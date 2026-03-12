# tachyond v0.2.0 本番E2Eテスト

## 概要

tachyond v0.2.0 をリリースし、本番 ECS 環境 (api.n1.tachy.one) に対してワーカー登録・メトリクス収集・Tool Job 実行の E2E テストを実施する。

## 完了条件

- [x] tachyond v0.2.0 リリース（hostname, system_info, system_metrics 対応）
- [x] ECS tachyon-api 再デプロイ（PR #1081 の変更を含む）
- [x] Worker 登録成功（`Data too long` エラー修正含む）
- [x] system_info（静的メトリクス）の収集確認
- [x] system_metrics（動的メトリクス）のハートビート送信確認
- [x] ワーカー画面レスポンシブ対応
- [ ] QUIC TLS 証明書の正式対応（自己署名→公開CA or Secrets Manager）

## 進捗

### v0.2.0 リリース (2026-02-12)

- `apps/tachyond/Cargo.toml` のバージョンを 0.1.0 → 0.2.0 にバンプ
- GitHub Actions `release-tachyond.yml` で 3 ターゲットビルド:
  - x86_64-unknown-linux-gnu
  - aarch64-unknown-linux-gnu
  - aarch64-apple-darwin

### ECS デプロイ (2026-02-12)

- **問題**: `Cargo.lock needs to be updated but --locked was passed`
- **原因**: バージョンバンプ後に Cargo.lock が更新されていなかった
- **解決**: `cargo generate-lockfile` が rustc 1.89+ 要求のクレートを引き込んだため、最後の成功デプロイ (6225a9c47) から復元し `cargo update -p tachyond -p tachyon-api` で最小限の更新
- デプロイ成功

### Worker 登録エラー修正 (2026-02-13)

- **問題**: `Data too long for column 'id' at row 1`
- **原因**: tachyond v0.2.0 が生成する worker ID は `worker-{ULID}` 形式（33文字）だが、DB カラム `agent_workers.id` は `VARCHAR(32)`
- **修正**: マイグレーション `20260213011347_expand_agent_workers_id.up.sql` で VARCHAR(64) に拡張
- **注意**: `sqlx::migrate!` はコンパイル時マクロのため、新しいマイグレーションファイル追加後は `touch migrate.rs` でリビルドを強制する必要がある
- TiDB Cloud prod に適用済み

### メトリクス収集確認 (2026-02-13)

Worker 登録成功後、API レスポンスで以下を確認:

**system_info（静的）:**
- hostname: `ik1-447-55878`（さくらVPS）
- OS: Ubuntu 24.04, kernel 6.8.0-100-generic
- CPU: Intel Xeon SapphireRapids x 8 cores
- Memory: 16.8 GB, Disk: 845 GB

**system_metrics（動的、ハートビート経由）:**
- CPU: 3.5%, Memory: 30% (5GB/16GB), Disk: 81.1%
- Load average: 0.3/0.27/0.3
- Uptime: ~1.8 days

### レスポンシブ修正 (2026-02-13)

- `overflow-hidden` + `min-w-0` で横スクロール防止
- ヘッダーのモバイル対応（`flex-col` → `sm:flex-row`）
- viewport `width=device-width` 追加（根本原因）
- 長いテキストに `truncate` / `break-all` 追加

## QUIC TLS 証明書の課題

### 現状

- QUIC gateway (`quic.n1.tachy.one:4433`) は **自己署名証明書** を使用
- `packages/streaming/src/tls.rs` で毎回起動時に `rcgen` で生成（エフェメラル）
- NLB は UDP パススルー（TLS 終端なし）
- クライアントの rustls がシステムルートストアで検証 → `UnknownIssuer` エラー
- `--quic-insecure` で全検証スキップ（開発用）

### 推奨対応

1. **短期**: AWS Secrets Manager に永続的な自己署名証明書を保存し、起動時にロード
2. **中期**: Let's Encrypt / 公開 CA 証明書の導入
3. **長期**: AWS が QUIC TLS 終端をサポートしたら移行

### 確認用 URL

- ワーカー一覧: https://app.n1.tachy.one/v1beta/tn_01hjjn348rn3t49zz6hvmfq67p/ai/workers
- API: `GET https://api.n1.tachy.one/v1/agent/workers`（要 Authorization ヘッダー）
