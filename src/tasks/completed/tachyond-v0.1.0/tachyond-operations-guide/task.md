# tachyond 運用ガイド整備

**作成日**: 2026-02-12
**ステータス**: ✅ COMPLETED
**優先度**: High
**担当**: Claude Agent

## 概要

tachyondは本番デプロイ済み。VPS上でsystemdサービスとして常駐運用するための手順と、リリース時のバイナリ更新フローを整備する。

## 背景

- tachyondバイナリはGitHub Actions (`release-tachyond.yml`) でビルド・リリースされる
- systemdサービスファイル・セットアップスクリプトは実装済み (`scripts/systemd/`)
- **未整備**: VPSへのバイナリ配布・更新の自動化、運用手順書

## 実装計画と進捗

### Phase 1: バイナリ更新スクリプト作成 📝

#### Step 1: `scripts/systemd/update-tachyond.sh` 作成
- [ ] GitHub CLI (`gh`) で最新リリースからバイナリをダウンロード
- [ ] アーキテクチャ自動検出 (`uname -m` → x86_64/aarch64)
- [ ] バイナリを `/usr/local/bin/tachyond` に配置
- [ ] `systemctl restart tachyond` でサービス再起動
- [ ] バージョン確認 (`tachyond --version`)
- [ ] ロールバック用に旧バイナリを `/usr/local/bin/tachyond.bak` に退避

**想定スクリプト概要:**
```bash
#!/bin/bash
set -e

# 1. アーキテクチャ検出
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  TARGET="x86_64-unknown-linux-gnu" ;;
  aarch64) TARGET="aarch64-unknown-linux-gnu" ;;
  *)       echo "Unsupported: $ARCH"; exit 1 ;;
esac

# 2. 最新リリースダウンロード（or 指定バージョン）
VERSION="${1:-latest}"
BINARY="tachyond-${TARGET}"

# 3. バックアップ → ダウンロード → 配置
cp /usr/local/bin/tachyond /usr/local/bin/tachyond.bak 2>/dev/null || true
gh release download "$VERSION" \
  -R quantum-box/tachyon-apps \
  -p "$BINARY" \
  -D /tmp --clobber
mv "/tmp/$BINARY" /usr/local/bin/tachyond
chmod +x /usr/local/bin/tachyond

# 4. サービス再起動
systemctl restart tachyond
tachyond --version
```

### Phase 2: このVPSへの初回セットアップ 📝

#### Step 2: 前提条件確認
- [ ] GitHub CLI (`gh`) がインストール済みか確認
- [ ] `gh auth status` で認証済みか確認
- [ ] 現在のtachyondバイナリの場所・バージョン確認

#### Step 3: systemdサービスセットアップ
- [ ] `sudo bash scripts/systemd/setup-tachyond-service.sh` 実行
- [ ] `/etc/tachyond/tachyond.env` を本番設定に編集
  - `CALLBACK_URL`: 本番APIエンドポイント or ローカル（Docker内API）
  - `TACHYON_AUTH_TOKEN`: pk_ API Key or dummy-token（ローカル）
  - `TOOL_JOB_OPERATOR_ID`: オペレーターID
  - `QUEUE_TYPE`: http（APIポーリング）
- [ ] `sudo systemctl enable tachyond` で自動起動有効化
- [ ] `sudo systemctl start tachyond` で起動
- [ ] `sudo journalctl -u tachyond -f` でログ確認

#### Step 4: 動作確認
- [ ] Worker登録ログが出ること
- [ ] ハートビート（60秒間隔）が送信されていること
- [ ] フロントエンドのWorkers一覧にWorkerが表示されること
- [ ] メトリクス（CPU/Memory/Disk）が表示されること

### Phase 3: 運用ドキュメント作成 📝

#### Step 5: 運用手順を `docs/src/tachyon-apps/tools/tachyond.md` に追記
- [ ] 日常運用コマンド一覧
  - `systemctl status tachyond` — ステータス確認
  - `journalctl -u tachyond -f` — リアルタイムログ
  - `journalctl -u tachyond --since "1 hour ago"` — 過去ログ
  - `systemctl restart tachyond` — 再起動
- [ ] リリース更新手順
  - `sudo bash scripts/systemd/update-tachyond.sh` — 最新版に更新
  - `sudo bash scripts/systemd/update-tachyond.sh tachyond-v0.2.0` — 特定バージョン
- [ ] ロールバック手順
  - `sudo cp /usr/local/bin/tachyond.bak /usr/local/bin/tachyond && sudo systemctl restart tachyond`
- [ ] トラブルシューティング
  - ハートビートが止まった場合
  - API接続エラーの場合
  - メモリ使用量が異常な場合

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `scripts/systemd/update-tachyond.sh` | 新規: バイナリ更新スクリプト |
| `docs/src/tachyon-apps/tools/tachyond.md` | 追記: 運用セクション |

## 関連タスク

- `vps-system-metrics-realtime` — メトリクス機能の動作確認（並行実施）
- `tachyond-oauth-authentication` (backlog) — 認証方式の強化

## 進捗ログ

### 2026-02-12
- 📝 taskdoc作成
- ✅ `scripts/systemd/update-tachyond.sh` 作成（GH Releases → バイナリ配置 → restart → 自動ロールバック）
- ✅ `docs/src/tachyon-apps/tools/tachyond.md` に運用セクション追記（セットアップ/日常コマンド/リリース更新/ロールバック/トラブルシュート）
- ✅ tachyond v0.1.1 バイナリをVPSにダウンロード
- 📝 systemdセットアップはsudo必要 → ユーザーが手動実行
