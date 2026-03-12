# 開発ツールベースイメージ（tachyon-dev-tools）

開発用Dockerイメージのビルド時間を短縮するため、Rust CLIツールを事前ビルドしたベースイメージを用意する。

## 目的

- `bacon` / `sqlx-cli` / `cargo-nextest` / `ulid-cli` を毎回ビルドしない
- Docker buildの時間とサイズを削減する
- 複数Dockerfileでの重複ビルドを排除する

## 収録ツール

| ツール | バージョン | 用途 |
|---|---|---|
| bacon | 3.18.0 | Rust hot reload |
| sqlx-cli | 0.8.6 | マイグレーション/準備 |
| cargo-nextest | 0.9.100 | テストランナー |
| ulid-cli | 0.1.12 | ULID生成 |
| yaml-seeder | workspace build | シード投入 |

## イメージ構成

- Dockerfile: `docker/Dockerfile.dev-tools`
- マルチステージビルドでツールをビルドし、最終イメージにはバイナリのみをコピー
- Rust nightly toolchainを含む
- `yaml-seeder` は最小構成のWorkspaceを生成してビルドし、ベースイメージに含める

## 利用箇所

### Root `Dockerfile`

```dockerfile
FROM ghcr.io/quantum-box/tachyon-dev-tools:latest AS dev
```

### `apps/tachyon-api/Dockerfile`

```dockerfile
FROM ghcr.io/quantum-box/tachyon-dev-tools:latest AS dev
```

## CI/CD（GHCR公開）

- Workflow: `.github/workflows/build-dev-tools-image.yml`
- トリガー:
  - `docker/Dockerfile.dev-tools` 変更
  - `packages/yaml-seeder/**` 変更
  - 手動実行（workflow_dispatch）
- 付与タグ:
  - `latest`
  - `sha`
  - `YYYYMMDD`

## 更新手順

1. `docker/Dockerfile.dev-tools` のツールバージョンを更新
2. mainへマージ
3. GitHub ActionsのWorkflowが自動でGHCRへpush
4. `Dockerfile`/`apps/tachyon-api/Dockerfile` 側は `latest` を参照

## 既知の制約

- `yaml-seeder` 用のミニマルWorkspace定義を `docker/Dockerfile.dev-tools` 側で管理しているため、依存追加時は追従更新が必要
- Devcontainerは現状このベースイメージを利用していない

## 関連ドキュメント

- [Docker イメージ最適化 - 開発ツール事前ビルド（タスク）](../tasks/completed/v0.29.0/optimize-docker-image/task.md)
