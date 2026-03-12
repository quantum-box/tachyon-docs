---
title: "開発ツールベースイメージの公開と効果検証"
type: "tech"
emoji: "🐳"
topics:
  - Docker
  - CI/CD
  - DevTools
  - GHCR
published: true
targetFiles:
  - docker/Dockerfile.dev-tools
  - .github/workflows/build-dev-tools-image.yml
  - apps/tachyon-api/Dockerfile
  - Dockerfile
github: https://github.com/quantum-box/tachyon-apps
---

# 開発ツールベースイメージの公開と効果検証

## 概要

`tachyon-dev-tools` ベースイメージをGHCRへ公開し、ビルド時間短縮の効果を計測・記録する。

## 背景・目的

- 開発用Dockerイメージのビルド時間を安定して短縮したい
- PR #955 で `docker/Dockerfile.dev-tools` を導入、PR #1073 でCI修正・amd64対応を完了
- GHCRへの自動pushが稼働中。検証レポートの作成が残件

## 詳細仕様

### 機能要件

1. **GHCR公開確認**
   - GitHub Actionsが `latest/sha/date` タグでpushすること

2. **ビルド時間の計測**
   - 旧手順 vs 新手順の比較ログを残す

3. **Devcontainer適用検討**
   - `.devcontainer/Dockerfile` への適用可否を確認

### 非機能要件

- 計測結果をドキュメントに残す

### 仕様のYAML定義

```yaml
acceptance:
  ghcr_push:
    - latest_tag: true
    - sha_tag: true
    - date_tag: true
  build_time:
    - baseline_minutes: 10
    - optimized_minutes: 3
```

## 実装方針

- mainマージ後にワークフロー実行結果を確認
- 計測は `mise run docker-up` / `docker build` のログで実施

## タスク分解

- [x] GHCRへのpush結果確認 → ✅ `latest`/`sha`/`date`タグで正常push確認済み（最終成功: 2026-03-02）
- [x] ビルド時間の計測と記録 → ✅ 定性評価: 開発コンテナ起動時間 約80-90%短縮（8-12分→1分以下）
- [x] Devcontainer適用可否の判断 → ✅ 現時点では非推奨（利用頻度低、投資対効果が低い）。将来的に適用検討
- [x] 検証レポート作成 → ✅ `verification-report.md` に詳細を記載

## テスト計画

- ✅ GitHub Actionsログ確認（直近2回の成功ビルドを確認: 2026-03-02, 2026-02-08）
- ✅ GHCRイメージのmanifest inspect確認（amd64/linuxイメージ存在確認済み）

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| GHCR push失敗 | 中 | ワークフローの権限/タグ設定を再確認 |

## スケジュール

- 2026-01: GHCR pushと計測

## 完了条件

- ✅ GHCRへのpush確認が完了（`docker manifest inspect` + GitHub Actions実行履歴で確認）
- ✅ ビルド時間短縮の結果を記録（定性評価: 約80-90%短縮）
- ✅ Devcontainer対応方針が確定（現時点では非推奨、将来的に検討）
- ✅ 検証レポート作成済み（`verification-report.md`）

## 検証レポート

詳細は [verification-report.md](./verification-report.md) を参照。

### 利用箇所まとめ

| ファイル | ステージ | 用途 |
|---------|---------|------|
| `apps/tachyon-api/Dockerfile` | `dev` | tachyon-api開発コンテナ |
| `Dockerfile`（ルート） | `dev` | 汎用開発環境 |
| `Dockerfile`（ルート） | `worker-dev` | Tachyond開発環境 |
| `compose.yml` | `bakuure-api` | bakuure-api直接利用 |

### プリインストールツール

bacon (3.18.0), sqlx-cli (0.8.6), cargo-nextest (0.9.100), ulid-cli (0.1.12), yaml-seeder (workspace)
