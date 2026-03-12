---
title: "Docker イメージ最適化 - 開発ツール事前ビルド"
type: "tech"
emoji: "🐳"
topics:
  - Docker
  - CI/CD
  - GHCR
  - Rust
published: true
targetFiles:
  - docker/Dockerfile.dev-tools
  - apps/tachyon-api/Dockerfile
  - Dockerfile
  - .github/workflows/dev-tools-image-build.yml
github: https://github.com/quantum-box/tachyon-apps
---

# Docker イメージ最適化 - 開発ツール事前ビルド

## 概要

開発用Dockerイメージで毎回ビルドされているRust CLI ツール（bacon, sqlx-cli, cargo-nextest, yaml-seeder）を事前ビルドしてGHCRにプッシュし、共通ベースイメージとして利用することでビルド時間を短縮する。また、マルチステージビルドを活用してビルド時の依存crateを最終イメージから除外し、イメージサイズを削減する。

## 背景・目的

### なぜこのタスクが必要なのか

1. **ビルド時間の無駄**
   - `apps/tachyon-api/Dockerfile` の `dev` ステージで以下をビルド:
     - `bacon@3.18.0`
     - `sqlx-cli@0.8.6`
     - `cargo-nextest@0.9.100`
     - `yaml-seeder`（ソースからビルド）
   - ルートの `Dockerfile` の `dev` ステージでも `bacon` をビルド
   - 毎回のイメージビルドで数分〜十数分のオーバーヘッド

2. **イメージサイズの肥大化**
   - ビルド時の中間生成物（`target/` ディレクトリ）がイメージに残る
   - 開発ツールのビルドに使った依存crateがそのまま残留

3. **重複するビルド処理**
   - 複数のDockerfileで同じツールをビルド
   - CI/CDでも同じビルドが繰り返される

### 期待される成果・メリット

| 項目 | 現状 | 改善後 |
|------|------|--------|
| devイメージビルド時間 | 10-15分 | 2-3分 |
| cargo installの回数 | 毎回3-4回 | 0回 |
| イメージサイズ (dev) | ~3GB | ~1.5GB（見込み） |

## 詳細仕様

### 機能要件

1. **開発ツール用ベースイメージの作成**
   - GHCRに `ghcr.io/quantum-box/tachyon-dev-tools:latest` を用意
   - 含めるツール:
     - `bacon@3.18.0`
     - `sqlx-cli@0.8.6`
     - `cargo-nextest@0.9.100`
     - `ulid-cli@0.1.12`
     - Rust nightly toolchain (nightly-2025-06-01)
   - **注**: `yaml-seeder` は最小構成のWorkspaceを生成してベースイメージ内でビルドし、バイナリを同梱する

2. **既存Dockerfileの更新**
   - ベースイメージを直接継承（`FROM ghcr.io/quantum-box/tachyon-dev-tools:latest AS dev`）
   - Rust toolchain セットアップも不要に
   - cargo install ステップを削除

3. **CI/CD統合**
   - main ブランチへのプッシュ時 + docker/Dockerfile.dev-tools 変更時にトリガー
   - GitHub Actions キャッシュ（gha）を活用

### 非機能要件

- ベースイメージのバージョン管理（タグにツールバージョンを含める）
- GHCR rate limit対策（organization内でのキャッシュ活用）
- ビルドの再現性（`--locked` フラグで確保）

### 対象Dockerfile

| ファイル | ステージ | ビルドするツール |
|----------|----------|------------------|
| `apps/tachyon-api/Dockerfile` | `dev` | bacon, sqlx-cli, cargo-nextest, yaml-seeder, Node.js CLIs |
| `Dockerfile` (root) | `dev` | bacon |
| `.devcontainer/Dockerfile` | - | Claude Code |

## 実装方針

### アーキテクチャ設計

```dockerfile
# ベースイメージを直接継承（Rust toolchain + 全ツールが含まれている）
FROM ghcr.io/quantum-box/tachyon-dev-tools:latest AS dev

# 追加のセットアップのみ（Node.js CLIs など）
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs
# ... 残りの設定
```

**メリット:**
- Rust toolchain のセットアップが不要
- 個別のバイナリコピーが不要
- Dockerfileがシンプルに

### ベースイメージのDockerfile設計

```dockerfile
# docker/Dockerfile.dev-tools
# ================================
# Stage 1: ツールビルダー
# ================================
FROM rust:latest AS builder

RUN apt-get update && apt-get install -y \
    build-essential pkg-config libssl-dev \
    protobuf-compiler libprotobuf-dev \
    && rm -rf /var/lib/apt/lists/*

# nightly toolchain
RUN rustup default nightly-2025-06-01
RUN rustup component add rustfmt clippy

# Install tools from crates.io
RUN cargo install bacon@3.18.0 --locked
RUN cargo install sqlx-cli@0.8.6 --locked --no-default-features --features mysql,rustls
RUN cargo install cargo-nextest@0.9.100 --locked
RUN cargo install ulid-cli@0.1.12 --locked

# Build yaml-seeder from source
WORKDIR /build
COPY . .
ENV SQLX_OFFLINE=true
RUN cargo build --release --bin yaml-seeder --locked

# ================================
# Stage 2: 最終イメージ（これがGHCRにプッシュされる）
# ================================
FROM rust:latest

RUN apt-get update && apt-get install -y \
    build-essential pkg-config libssl-dev \
    protobuf-compiler libprotobuf-dev curl git \
    && rm -rf /var/lib/apt/lists/*

# nightly toolchain
RUN rustup default nightly-2025-06-01
RUN rustup component add rustfmt clippy

# Copy only binaries (ビルド時の依存crateは含まない)
COPY --from=builder /usr/local/cargo/bin/bacon /usr/local/cargo/bin/
COPY --from=builder /usr/local/cargo/bin/sqlx /usr/local/cargo/bin/
COPY --from=builder /usr/local/cargo/bin/cargo-nextest /usr/local/cargo/bin/
COPY --from=builder /usr/local/cargo/bin/ulid /usr/local/cargo/bin/
COPY --from=builder /build/target/release/yaml-seeder /usr/local/bin/

WORKDIR /app
```

### GitHub Actions ワークフロー

```yaml
# .github/workflows/build-dev-tools-image.yml
name: Build Dev Tools Image

on:
  push:
    branches:
      - main
    paths:
      - 'docker/Dockerfile.dev-tools'
      - 'packages/yaml-seeder/**'
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/Dockerfile.dev-tools
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/tachyon-dev-tools:latest
            ghcr.io/${{ github.repository_owner }}/tachyon-dev-tools:${{ github.sha }}
```

## タスク分解

### Phase 1: ベースイメージの作成 ✅
- [x] `docker/Dockerfile.dev-tools` を作成
- [x] GitHub Actions ワークフロー `.github/workflows/build-dev-tools-image.yml` を作成
- [x] バージョンタグ管理（latest, sha, date タグ）

### Phase 2: 既存Dockerfileの更新 ✅
- [x] `apps/tachyon-api/Dockerfile` を更新 - ベースイメージを直接継承
- [x] `Dockerfile` (root) を更新 - ベースイメージを直接継承
- [ ] `.devcontainer/Dockerfile` を更新（必要に応じて）- 今回はスキップ

### Phase 3: CI/CD統合 ✅
- [x] GitHub Actions でベースイメージの自動ビルド設定
- [x] main ブランチへのプッシュ時 + docker/Dockerfile.dev-tools 変更時にトリガー
- [x] GitHub Actions キャッシュ（gha）を活用
- [x] `workflow_dispatch` で手動トリガーも可能

### Phase 4: 動作確認 ✅
- [x] ベースイメージのローカルビルド・動作確認
- [x] `mise run docker-up` で開発環境起動確認（シード投入成功）
- [x] 各ツールの動作確認:
  - bacon 3.18.0 ✅
  - sqlx-cli 0.8.6 ✅
  - cargo-nextest 0.9.100 ✅
  - ulid-cli 0.1.12 ✅
  - yaml-seeder 0.1.0 ✅

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| ベースイメージの更新忘れ | 中 | mise.toml変更時にCIで自動ビルド |
| GHCRの rate limit | 低 | organization内でのキャッシュ活用 |
| バージョン不整合 | 中 | タグにツールバージョンを含める |

## 参考資料

- [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
- [GHCR documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- 現在のmise.toml でのツールバージョン管理

## 完了条件

- [ ] ベースイメージがGHCRにプッシュされている（mainマージ後にワークフロー実行）
- [x] 既存Dockerfileがベースイメージを利用するよう更新されている
- [x] `mise run docker-up` で開発環境が正常に起動する
- [ ] ビルド時間が短縮されていることを確認（mainマージ後）
- [x] 正式な仕様ドキュメントを作成済み
- [x] タスクディレクトリを completed/[新バージョン]/ に移動済み

### バージョン番号の決定基準

このタスクが完了した際のバージョン番号の上げ方：

**パッチバージョン（x.x.X）を上げる:**
- [x] パフォーマンス改善（ビルド時間短縮）
- [x] インフラ・設定の改善

## 備考

- yaml-seeder はミニマルWorkspaceでビルドし、ベースイメージに含める。

## 実装ログ

### 2026-01-07: 初期実装完了

**作成したファイル:**
1. `docker/Dockerfile.dev-tools` - ベースイメージ用Dockerfile（マルチステージビルド）
2. `.github/workflows/build-dev-tools-image.yml` - GHCR自動プッシュ用ワークフロー

**更新したファイル:**
1. `apps/tachyon-api/Dockerfile` - devステージをベースイメージから継承するよう変更
2. `Dockerfile` (root) - devステージをベースイメージから継承するよう変更
3. `mise.toml` - `build-dev-tools-image` タスク追加

**yaml-seederについて:**
- ワークスペース依存を最小化するため、`docker/Dockerfile.dev-tools` 内でミニマルWorkspaceを生成してビルド
- 生成したバイナリをベースイメージへ同梱
- `apps/tachyon-api/Dockerfile` 側は事前ビルド済みバイナリを利用

**ローカル動作確認結果:**
- ベースイメージサイズ: 約3GB
- 含まれるツール: bacon, sqlx-cli, cargo-nextest, ulid-cli, yaml-seeder
- yaml-seeder: ベースイメージに同梱（`/usr/local/cargo/bin/yaml-seeder`）

**次のステップ:**
1. PRを作成してmainにマージ
2. GitHub Actionsでベースイメージを自動ビルド・GHCRにプッシュ
3. ビルド時間短縮を確認

## 未完了項目の移管

以下はフォローアップタスクとして [開発ツールベースイメージの公開と効果検証](../../../todo/dev-tools-image-release-validation/task.md) に移管。

- GHCRへのpush確認
- ビルド時間短縮の計測・記録
- `.devcontainer/Dockerfile` への適用可否判断
