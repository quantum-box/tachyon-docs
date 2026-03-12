# muon パブリックリポジトリ切り出し & サブモジュール化

## 概要
`packages/muon/` を別のパブリックリポジトリ（`quantum-box/muon`）に切り出し、tachyon-apps からはサブモジュールとして参照する。
GitHub Actions カスタムアクション（`.github/actions/scenario-test/`）も同リポに含め、各リポジトリから再利用可能にする。

## 背景
- muon は内部依存ゼロで、切り出しに最適な状態
- SDKと同様のサブモジュールパターンで運用したい
- カスタムアクション（scenario-test）も公開して各リポで使いたい

## 実装完了

### Phase 1: パブリックリポジトリ作成 ✅
- [x] GitHub に `quantum-box/muon` リポジトリを作成
- [x] README.md 作成（英語、使用例・GitHub Action利用方法含む）
- [x] LICENSE: MIT

### Phase 2: muon ソースコード移行 ✅
- [x] `packages/muon/` の全ファイルをリポジトリルートに配置
- [x] `Cargo.toml` のワークスペース依存をバージョン指定に変更
- [x] CI ワークフロー作成（`.github/workflows/ci.yml`）
- [x] リリースワークフロー作成（`.github/workflows/release.yml`）— 3プラットフォーム
- [x] 初回タグ `muon-v0.1.0` をpush（リリースワークフローがトリガー済み）

### Phase 3: カスタムアクション移行 ✅
- [x] `action.yml` をリポジトリルートに配置
- [x] ダウンロード先を `quantum-box/muon` に変更
- [x] 利用方法: `quantum-box/muon@muon-v0.1.0`

### Phase 4: tachyon-apps 側の更新 ✅
- [x] `packages/muon/` を削除
- [x] サブモジュール追加: `git submodule add https://github.com/quantum-box/muon.git muon`
- [x] ワークスペースメンバーを `"muon"` に変更（`Cargo.toml`）
- [x] 各 API の dev-dependencies パスを `../../muon` に更新
  - `apps/tachyon-api/Cargo.toml`
  - `apps/library-api/Cargo.toml`
  - `apps/bakuure-api/Cargo.toml`
- [x] `.github/actions/scenario-test/action.yml` のダウンロード元を `quantum-box/muon` に変更
- [x] `.github/workflows/release-muon.yml` を削除（muon リポに移行済み）
- [x] `.github/workflows/rust.yaml` のパスフィルターを `muon/**` に更新
- [x] `compose.yml` に `./muon:/app/muon:cached` マウントを追加（4サービス）
- [x] `mise.toml` の `-p muon` はパッケージ名参照のため変更不要

### Phase 5: 動作確認 ✅
- [x] `mise run check` でDocker内ビルドが通ること（`muon v0.1.0 (/app/muon)` 確認）

## 変更ファイルまとめ

### 新規リポジトリ: `quantum-box/muon`
- `src/` — 全ソースコード（lib.rs, model.rs, runner.rs, config.rs, etc.）
- `tests/` — integration.rs + fixtures/
- `Cargo.toml` — 自己完結した依存定義
- `action.yml` — GitHub Action（ルート配置）
- `.github/workflows/ci.yml` — CI（fmt, clippy, test）
- `.github/workflows/release.yml` — リリース（3プラットフォーム）
- `README.md`, `LICENSE` (MIT), `.gitignore`

### tachyon-apps 側の変更
| ファイル | 変更内容 |
|---------|---------|
| `Cargo.toml` | `packages/muon` → `muon` |
| `apps/tachyon-api/Cargo.toml` | パス `../../packages/muon` → `../../muon` |
| `apps/library-api/Cargo.toml` | 同上 |
| `apps/bakuure-api/Cargo.toml` | 同上 |
| `compose.yml` | 4サービスに `./muon:/app/muon:cached` 追加 |
| `.github/actions/scenario-test/action.yml` | ダウンロード元を `quantum-box/muon` に |
| `.github/workflows/rust.yaml` | パスフィルター `packages/muon/**` → `muon/**` |
| `.github/workflows/release-muon.yml` | 削除 |
| `.gitmodules` | muon サブモジュール追加 |

## 注意点
- `packages/scenario_report/` は muon とは独立しているため、tachyon-apps に残す
- muon の `TachyonOpsClient` は Tachyon Ops API への HTTP 通信のみで、内部依存なし
- SDKサブモジュール（`sdk/`）と同様の運用パターン
- tachyon-apps側の `.github/actions/scenario-test/` はローカル参照用に残し、ダウンロード元のみ変更
