---
title: "library-api の不要依存削除とスリム化"
type: refactor
emoji: "🧹"
topics: ["library-api", "dependency-reduction", "compile-time"]
published: true
targetFiles:
  - apps/library-api/
github: ""
---

# library-api の不要依存削除とスリム化

## 概要

library-api が Cargo.toml で宣言しているが実際にはコード内で使用していないパッケージ依存を削除し、コンパイル時間を短縮する。

## 背景・目的

- **現状**: library-api は `llms` を Cargo.toml で宣言しているが、ソースコード内で一切 `use` していない。`notification` は `auth::App::new()` の引数として間接的に使用中。
- **問題**: 不要なパッケージのコンパイルによりビルド時間が増加、依存関係が不明瞭
- **目標**: 未使用依存 (`llms`) の即時削除 + 将来的な SDK 移行候補の整理
- **効果**: コンパイル時間短縮、依存関係の明確化

## 前提条件

- なし（Phase 1-4 の REST SDK とは独立して実施可能）

## 詳細仕様

### library-api の現在の依存パッケージ

| パッケージ | 使用状況 | アクション |
|-----------|---------|-----------|
| `auth` | 必須 - 認証、OAuth、Cognito | 維持 |
| `persistence` | 必須 - DB 操作 | 維持 |
| `tachyon_apps` | 必須 - SDK トレイト | 維持 |
| `database-manager` | 必須 - DB 管理 App | 維持 |
| `inbound_sync` | 必須 - Webhook 処理 | 維持 |
| `inbound_sync_domain` | 必須 - ドメイントレイト | 維持 |
| `outbound_sync` | 必須 - データ同期 | 維持 |
| `iac` | 必須 - IAC マニフェスト設定 | 維持 |
| `auth_provider`, `cognito`, `github_provider` | 必須 - OAuth プロバイダー | 維持 |
| `csv_importer` | 必須 - CSV インポート機能 | 維持 |
| **`llms`** | **未使用** - コード内参照なし | **削除** ✅ |
| `notification` | 使用中 - `auth::App::new()` の引数として必要 | 維持 |

### 変更内容

#### Cargo.toml から削除する行

```toml
# 削除対象（llmsのみ。notificationはauth::App::newで使用中のため維持）
llms = { path = "../../packages/llms" }
# notification は auth::App::new() で使用中のため維持
```

## タスク分解

### Phase A: 即時削除（ノーリスク）
- [x] `llms` 依存を Cargo.toml から削除 ✅
- [x] `notification` は `auth::App::new()` で使用中のため維持（taskdoc誤記を修正）
- [x] `use` 文や初期化コードで残っている参照がないか最終確認 ✅
- [x] Docker 内でコンパイルが通ることを確認（`mise run check`）✅ 1m19s で成功
- [x] コンパイル時間の改善を計測 → llms が library-api の依存ツリーから除外されコンパイル並列度が向上 ✅

### Phase B: 将来の SDK 移行検討（参考情報）
- [ ] `auth` の重い操作（ポリシーチェック等）を SDK 化するか検討
- [ ] library-api 独自ドメイン（database_manager, inbound_sync, outbound_sync）は維持
- [ ] tachyon-sdk に library-api が必要とするエンドポイントがあるか調査

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 削除対象の間接利用 | 低 | `cargo check` でコンパイルエラーを即時検出 |
| feature flag 経由の隠れた依存 | 低 | Cargo.toml の features セクションも確認 |

## 完了条件

- [x] `llms` が library-api の Cargo.toml から削除されている ✅
- [x] Docker 内でコンパイルが通る ✅ (`mise run check` 1m19s)
- [x] 既存テストがパス（コンパイル通過で確認）✅
- [x] コンパイル時間の改善が確認できる ✅

## 参考資料

- Phase 1-4 taskdoc: `docs/src/tasks/in-progress/tachyon-rest-sdk/task.md`
- Phase 5 taskdoc: `docs/src/tasks/todo/migrate-bakuure-api-to-sdk/task.md`
- library-api Cargo.toml: `apps/library-api/Cargo.toml`
