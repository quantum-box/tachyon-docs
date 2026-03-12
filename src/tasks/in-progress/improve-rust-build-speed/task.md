---
title: "Rust ビルド速度の改善"
type: tech
emoji: "⚡"
topics:
  - Rust
  - Build Performance
  - Docker
  - DX
published: true
targetFiles:
  - Cargo.toml
  - .cargo/config.toml
  - Dockerfile
  - compose.yml
  - mise.toml
github: https://github.com/quantum-box/tachyon-apps
---

# Rust ビルド速度の改善

## 概要

Rust のビルド（`mise run check`、`mise run docker-ci-rust` 等）が遅く、開発体験を大きく損ねている。リンカー最適化、プロファイル設定、Docker キャッシュ戦略、依存関係の精査など多面的にビルド時間を短縮する。

## 背景・目的

- **現状の課題**: ワークスペースに 60 クレート、依存 1,056 クレート（`Cargo.lock` 13,149 行）を抱え、フルビルドに時間がかかる。`mise run check` のような軽量チェックでもリンク時間がボトルネックになりやすい。
- **開発者への影響**: CI のフィードバックが遅い、ローカルでの反復開発が低速、`docker-clippy` が nightly ICE で無効化されている等。
- **期待される成果**: 体感で 30-60% のビルド時間短縮。開発ループの高速化と CI パイプラインの安定化。

## 現状分析

### ワークスペース構成
- **メンバー数**: 60 クレート（5 apps + 55 packages）
- **Cargo.lock 依存数**: 1,056 クレート
- **Rust ソースファイル数**: 約 2,200 .rs ファイル
- **ツールチェイン**: `nightly-2025-06-01`（mise.toml）、compose.yml では `nightly-2025-06-29`

### 現在のビルド設定の問題点

#### 1. リンカー設定の不足（影響度: 大）
**ファイル**: `.cargo/config.toml`

```toml
# 現状: x86_64-unknown-linux-gnu 向けのリンカー指定がない
[target.aarch64-unknown-linux-gnu]
linker = "aarch64-linux-gnu-gcc"

[target.aarch64-apple-darwin]
rustflags = ["-C", "link-arg=-mmacosx-version-min=15.4"]
```

- x86_64（Docker 内の主要ターゲット）でデフォルトの GNU ld が使用されている
- mold や lld などの高速リンカーが未設定
- 60 クレートのワークスペースではリンク時間が全体の 20-40% を占める可能性がある

#### 2. Cargo プロファイル設定の不足（影響度: 中）
**ファイル**: `Cargo.toml`

```toml
# 現状: release のみ設定、dev プロファイルが未設定
[profile.release]
strip = true
```

- `[profile.dev]` が未定義（デフォルト値のまま）
- `split-debuginfo` 未設定（デバッグ情報のリンクが重い）
- `codegen-units` の最適化なし

#### 3. Docker 内ビルドの並列度不足（影響度: 中）
**ファイル**: `mise.toml`

```shell
# build-jobs が 2 にハードコード
tachyon-api cargo nextest run --build-jobs 2
```

- テストビルドが 2 並列に制限されている
- Docker コンテナの CPU リソースを活用しきれていない

#### 4. async-graphql の feature 肥大化（影響度: 中）
**ファイル**: `Cargo.toml`

```toml
async-graphql = { version = "7.0.11", default-features = false, features = [
    "email-validator",
    "playground",    # <- 開発時のみ必要
    "graphiql",      # <- 開発時のみ必要
    "tracing",
    "opentelemetry",
    "chrono",
    "string_number",
    "dataloader",
    "smol_str",
    "url",
] }
```

- `playground` と `graphiql` はリリースビルドには不要だがデフォルトで含まれる
- proc-macro 系の重い依存が常にコンパイルされる

#### 5. Nightly ツールチェインの不整合（影響度: 低〜中）
- `mise.toml`: `nightly-2025-06-01`
- `compose.yml` devcontainer: `nightly-2025-06-29`
- Clippy が ICE（Internal Compiler Error）で無効化中
- ツールチェイン更新で解決する可能性がある

#### 6. Docker ビルドのキャッシュ戦略（影響度: 低）
**ファイル**: `Dockerfile`, `.dockerignore`, `compose.yml`

- `.dockerignore` は適切に設定済み（node_modules, target, .git を除外）
- `compose.yml` で named volume（`cargo-registry`, `cargo-git`, `cargo-target`）を使用してキャッシュ
- cargo-chef を production ビルドで使用済み
- 改善余地はあるが、日常の開発ビルドは volume マウントで十分カバー

## 改善案

### Phase 1: Quick Wins（即効性が高く低リスク） 📝

#### 1-1. mold リンカーの導入
**期待効果**: リンク時間 30-50% 短縮

`.cargo/config.toml` に x86_64 向けの mold リンカーを設定する。Docker イメージに mold をインストールする必要がある。

```toml
[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]
```

**対応箇所**:
- `.cargo/config.toml`: リンカー設定追加
- `apps/tachyon-api/Dockerfile` (dev ステージ): mold + clang のインストール
- `ghcr.io/quantum-box/tachyon-dev-tools`: ベースイメージに mold を含める（別途）

**注意**: macOS ローカル開発では mold は不要（target が異なる）。Docker 内ビルド専用の設定。

#### 1-2. dev プロファイルの最適化
**期待効果**: インクリメンタルビルド 10-20% 短縮

```toml
[profile.dev]
split-debuginfo = "unpacked"  # macOS: "unpacked", Linux: デフォルトでOK
incremental = true             # 明示的に有効化

[profile.dev.package."*"]
opt-level = 0                  # 依存クレートも最適化なしで高速コンパイル
```

#### 1-3. build-jobs のハードコード解消
**期待効果**: テストビルド 10-30% 短縮（CPU コア数に依存）

`mise.toml` の `--build-jobs 2` を削除し、デフォルト（CPU コア数）に任せる。

```diff
- tachyon-api cargo nextest run --build-jobs 2
+ tachyon-api cargo nextest run
```

### Phase 2: 中程度の効果・やや手間がかかる改善 📝

#### 2-1. async-graphql の feature 分離
**期待効果**: コンパイル時間 5-10% 短縮

`playground` と `graphiql` を feature flag で制御し、リリースビルドから除外する。

```toml
[workspace.dependencies]
async-graphql = { version = "7.0.11", default-features = false, features = [
    "email-validator",
    "tracing",
    "opentelemetry",
    "chrono",
    "string_number",
    "dataloader",
    "smol_str",
    "url",
] }

# 開発時のみの追加 feature
[workspace.dependencies.async-graphql-dev]
# 各パッケージ側で cfg(debug_assertions) or feature で制御
```

**注意**: この変更は各パッケージの Cargo.toml とソースコードの `#[cfg]` 属性の調整が必要。

#### 2-2. Nightly ツールチェインの更新
**期待効果**: Clippy の再有効化、潜在的なコンパイラ最適化

- `nightly-2025-06-01` → 新しい nightly（ICE が修正されたバージョン）へ更新
- `mise.toml` と `compose.yml` のバージョンを統一

#### 2-3. workspace-hack クレートの導入検討
**期待効果**: 依存クレートの重複コンパイル削減

[cargo-hakari](https://github.com/guppy-rs/guppy/tree/main/tools/hakari) を使い、workspace-hack クレートを生成して依存の統一ビルドを実現する。

```shell
cargo install cargo-hakari
cargo hakari generate
cargo hakari manage-deps
```

### Phase 3: 長期的な改善 📝

#### 3-1. sccache の導入（CI 向け）
**期待効果**: CI の再ビルド時間を大幅短縮

GitHub Actions で sccache を導入し、ビルド成果物を S3 や GHA cache にキャッシュする。

#### 3-2. tachyon_apps パッケージの feature 整理
**期待効果**: 不要な依存のコンパイル回避

`packages/tachyon_apps` の default features（22 個）を見直し、必要なものだけを有効化するように各アプリの Cargo.toml を調整する。

#### 3-3. ビルド時間のベンチマーク・可視化
**期待効果**: 改善効果の定量的な追跡

`cargo build --timings` を CI に組み込み、ビルド時間のトレンドを可視化する。

## タスク分解

### 主要タスク
- [x] Phase 1-1: mold リンカーの導入
- [x] Phase 1-2: dev プロファイルの最適化
- [x] Phase 1-3: build-jobs のハードコード解消
- [ ] Phase 2-1: async-graphql の feature 分離（影響範囲が広いため要検討）
- [ ] Phase 2-2: Nightly ツールチェインの更新
- [ ] Phase 2-3: workspace-hack クレートの導入検討
- [ ] ビルド時間のベースライン計測（改善前）
- [ ] 改善後のビルド時間計測・比較

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| mold リンカーがビルドを壊す | 中 | Docker 内のみで適用。x86_64 target 限定で macOS には影響なし |
| async-graphql feature 分離でコンパイルエラー | 中 | `#[cfg]` 属性の慎重な適用。段階的に進める |
| Nightly 更新で新たな ICE や非互換 | 高 | 更新前に CI 全体を通す。問題があればロールバック |
| workspace-hack が依存グラフを複雑化 | 低 | cargo-hakari は自動生成・自動管理。不要になったら削除可能 |
| profile 変更でデバッグ体験が劣化 | 低 | `split-debuginfo` はデバッグ情報を保持したまま高速化するので問題なし |

## 完了条件

- [ ] `mise run check` のビルド時間がベースラインから 20% 以上短縮
- [ ] `mise run docker-ci-rust` の全体時間がベースラインから改善
- [ ] 既存のテストがすべてパス
- [ ] ローカル開発（bacon ウォッチャー）の体感速度が改善
- [ ] 改善前後のビルド時間を記録・ドキュメント化

## 参考資料

- [The Rust Performance Book - Compile Times](https://nnethercote.github.io/perf-book/compile-times.html)
- [mold linker](https://github.com/rui314/mold)
- [cargo-hakari (workspace-hack)](https://github.com/guppy-rs/guppy/tree/main/tools/hakari)
- [cargo build --timings](https://doc.rust-lang.org/cargo/reference/timings.html)
- [sccache](https://github.com/mozilla/sccache)

## 備考

- Docker 内ビルドが前提のため、ホスト側の変更は `.cargo/config.toml` と `Cargo.toml` に限定される
- macOS ローカル開発者への影響を最小限に抑えるため、target 指定でリンカー設定を分離する
- ベースイメージ `ghcr.io/quantum-box/tachyon-dev-tools` の更新が必要な場合は別タスクとして管理する
