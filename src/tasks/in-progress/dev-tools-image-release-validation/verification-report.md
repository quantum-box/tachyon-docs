# 開発ツールベースイメージ公開/検証レポート

- 進捗: ✅
- 実施日: 2026-03-03
- 実施環境: GitHub Actions (blacksmith-4vcpu-ubuntu-2404) / GHCR

## 検証結果サマリー

| 項目 | 結果 | 備考 |
|------|------|------|
| GHCR push | ✅ 成功 | `latest` / `sha` / `date` タグで自動push済み |
| ビルド時間改善 | ✅ 効果あり | 開発コンテナ起動時のツールビルド時間を大幅削減（定性評価） |
| Devcontainer適用判断 | ⚠️ 非推奨（現時点） | 既存Devcontainerは独自Dockerfileを使用しており、dev-toolsイメージ未適用 |

---

## 1. GHCRへのPush状況

### イメージ情報

- **レジストリ**: `ghcr.io/quantum-box/tachyon-dev-tools`
- **`docker manifest inspect` 結果**: 成功（amd64 linux イメージが存在）
- **ダイジェスト**: `sha256:8e1142717c49e5985e4df86ccfebf2fc81b38df90c8d0c7262ef91329a15d1c1`

### タグ戦略（`.github/workflows/build-dev-tools-image.yml`）

| タグ種別 | 形式 | 用途 |
|----------|------|------|
| `latest` | 固定 | 開発用Dockerfileのデフォルト参照 |
| SHA | コミットハッシュ短縮形 | 特定バージョンのピン留め |
| 日付 | `YYYYMMDD` | 日次ビルドの識別 |

### ワークフロー実行履歴（直近成功分）

| 実行日 | ステータス | ビルド時間 | トリガー |
|--------|-----------|-----------|----------|
| 2026-03-02 01:44 UTC | ✅ success | 約3分43秒 | main push (v0.3.0 bump) |
| 2026-02-08 11:58 UTC | ✅ success | 約3分11秒 | main push (CI fix #1073) |

### トリガー条件

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'docker/Dockerfile.dev-tools'
      - 'packages/yaml-seeder/**'
      - '.github/workflows/build-dev-tools-image.yml'
  workflow_dispatch:  # 手動実行も可能
```

---

## 2. プリインストール済みツール一覧

`docker/Dockerfile.dev-tools` は3段階のマルチステージビルドで構成:

### Stage 1: crates-builder（crates.ioツール）

| ツール | バージョン | 用途 |
|--------|-----------|------|
| bacon | 3.18.0 | Rustホットリロード（ファイル監視＆自動リビルド） |
| sqlx-cli | 0.8.6 | DBマイグレーション管理（MySQL/rustls） |
| cargo-nextest | 0.9.100 | 高速テストランナー |
| ulid-cli | 0.1.12 | ULID生成 |

### Stage 2: yaml-seeder-builder（ワークスペースツール）

| ツール | ビルド元 | 用途 |
|--------|---------|------|
| yaml-seeder | packages/yaml-seeder (workspace) | YAMLシードファイルからDB投入 |

### Final Image: ランタイム

| コンポーネント | 内容 |
|---------------|------|
| ベースイメージ | `rust:latest` |
| Rustツールチェイン | `nightly-2025-06-01` |
| Rustコンポーネント | rustfmt, clippy, rust-analyzer, rust-src |
| クロスコンパイルターゲット | x86_64-unknown-linux-gnu |
| システムパッケージ | build-essential, pkg-config, libssl-dev, protobuf-compiler, libprotobuf-dev, curl, git, unzip |

---

## 3. Dockerfileでの利用状況

dev-toolsイメージは以下の **3箇所** で `FROM` ベースイメージとして使用:

### 3.1 `apps/tachyon-api/Dockerfile` → `dev` ステージ

```dockerfile
FROM ghcr.io/quantum-box/tachyon-dev-tools:latest AS dev
```
- tachyon-api の開発用コンテナ（baconによるホットリロード）
- Node.js / Claude Code CLI / Codex CLI も追加インストール
- tool-job-worker 用の非rootユーザー（worker）を作成

### 3.2 `Dockerfile`（ルート）→ `dev` ステージ

```dockerfile
FROM ghcr.io/quantum-box/tachyon-dev-tools:latest AS dev
```
- mise によるセットアップを追加実行
- 汎用的な開発環境エントリポイント

### 3.3 `Dockerfile`（ルート）→ `worker-dev` ステージ

```dockerfile
FROM ghcr.io/quantum-box/tachyon-dev-tools:latest AS worker-dev
```
- Tachyond 開発用ステージ
- Node.js / Claude Code CLI / OpenCode CLI を追加インストール
- 非rootユーザー（worker）で実行

### 3.4 `compose.yml` → `bakuure-api` サービス

```yaml
bakuure-api:
  image: ghcr.io/quantum-box/tachyon-dev-tools:latest
```
- bakuure-api はdev-toolsイメージを直接利用（独自Dockerfileなし）

### 3.5 `mise.toml` → ローカルビルドタスク

```toml
run = "docker build -f docker/Dockerfile.dev-tools -t ghcr.io/quantum-box/tachyon-dev-tools:latest ."
```
- ローカルでのイメージビルド/テスト用

---

## 4. Devcontainer適用判断

### 現状

`.devcontainer/` ディレクトリが存在し、以下の構成:

| ファイル | 内容 |
|---------|------|
| `Dockerfile` | `rust:latest` ベースの独自ビルド（dev-tools未使用） |
| `devcontainer.json` | VS Code設定、ポートフォワード、拡張機能定義 |
| `tool-job-worker/` | tool-job-worker専用のdevcontainer設定 |

### Devcontainer Dockerfileの問題点

現在の `.devcontainer/Dockerfile` は:
- `rust:latest` から個別にツールをインストール（bacon, sqlx-cli等なし）
- Node.js 18.x を使用（プロジェクト標準は20.x）
- dev-toolsイメージのプリインストールツールを活用していない

### 推奨: **将来的に適用を検討**（現時点では非推奨）

**理由:**
1. 現在のDevcontainerは主にVS Code向けの設定であり、チームの主な開発フローはDocker Compose（`mise run up-tachyon`）経由。Devcontainerの利用頻度が低い
2. dev-toolsイメージに切り替えるには `devcontainer.json` の `containerEnv` や `postCreateCommand` の調整が必要
3. 投資対効果が低い（頻繁に使われていないため）

**将来的に適用する場合の変更点:**
```dockerfile
# Before
FROM rust:latest

# After
FROM ghcr.io/quantum-box/tachyon-dev-tools:latest
```
- bacon, sqlx-cli, cargo-nextest, yaml-seeder が即座に利用可能になる
- Devcontainer起動時間が短縮される（ツールのコンパイル不要）

---

## 5. ビルド時間改善の定性的評価

### Before（dev-toolsイメージ導入前）

各Dockerfileの `dev` ステージで以下を毎回ビルド:
- `cargo install bacon` → 約2-3分
- `cargo install sqlx-cli` → 約2-3分
- `cargo install cargo-nextest` → 約1-2分
- `cargo install ulid-cli` → 約1分
- `cargo build -p yaml-seeder` → 約1-2分
- Rustツールチェインセットアップ → 約1分

**合計: 約8-12分**（ネットワーク速度・キャッシュ状況に依存）

### After（dev-toolsイメージ導入後）

- GHCR からイメージ pull → 約30秒-1分
- すべてのツールがプリインストール済み
- 追加のコンパイル不要

**合計: 約1分以下**

### 改善効果

- **開発コンテナ初回起動**: 約8-12分 → 約1分（**約80-90%短縮**）
- **CI ワークフロー（dev-toolsイメージ自体のビルド）**: 約3-4分で完了（Blacksmith 4vCPU環境）
- **Docker キャッシュヒット時**: 変化なし（どちらもキャッシュ利用時は高速）

### 副次的効果

- Dockerfileの可読性向上（ツールインストール手順が分離）
- ツールバージョンの一元管理（`docker/Dockerfile.dev-tools` で集中管理）
- CI/ローカル環境の一貫性確保（同一イメージを共有）

---

## ログ/証跡

- GHCR manifest inspect: `sha256:8e1142717c49e5985e4df86ccfebf2fc81b38df90c8d0c7262ef91329a15d1c1` (amd64/linux)
- GitHub Actions 最終成功実行: 2026-03-02T01:44:47Z (commit: `5e4c485`)
- 参照PR: #955（初期実装）, #1073（CI修正・amd64対応）
