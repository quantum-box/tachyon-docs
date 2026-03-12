---
title: ECS Deploy高速化（tachyon-api）
type: improvement
emoji: "⚡"
topics:
  - GitHub Actions
  - ECS
  - Docker
  - Rust
published: true
targetFiles:
  - .github/workflows/tachyon-api-release.yml
  - apps/tachyon-api/Dockerfile
github: https://github.com/quantum-box/tachyon-apps/blob/main/.github/workflows/tachyon-api-release.yml
---

# ECS Deploy高速化（tachyon-api）

## 概要
`Deploy Tachyon API ECS` の実行時間を短縮し、main連続マージ時の待ち時間とデプロイコストを削減する。

## 背景・目的
- 直近実行で `Build and push image` が約30分かかっている。
- `Wait for service stability` は軽量処理であり、重いrunnerを使う必要がない。
- 連続push時に古いデプロイが生き残り、総待ち時間が増えている。

## 詳細仕様

### 機能要件
1. GitHub Actions の同時実行制御を改善し、最新コミット優先にする。
2. BuildKit キャッシュ書き戻し時間を短縮する。
3. `Wait for service stability` を別ジョブ化し、安価な runner へ分離する。
4. Dockerfile のビルド工程を改善し、`cargo` ビルドの再利用性を上げる。

### 非機能要件
- 既存デプロイ挙動（ECSへの強制再デプロイ）は維持。
- ワークフローの失敗検知能力は維持。
- 変更は最小限で、運用者負担を増やさない。

### 仕様のYAML定義
```yaml
deploy_optimization:
  workflow:
    concurrency:
      cancel_in_progress: true
    cache_export:
      mode: min
    workflow_dispatch:
      deploy_to_ecs:
        type: boolean
        default: true
    wait_job:
      split_from_build_job: true
      runner: ubuntu-latest
  docker_build:
    copy_strategy:
      goal: "依存解決のキャッシュ破壊を最小化"
    buildkit_cache_mount:
      cargo_registry: true
      cargo_git: true
```

## 実装方針

### アーキテクチャ設計
- CI workflow と Dockerfile のみを対象に、アプリコードは変更しない。
- ビルドジョブと安定化待機ジョブを分離して責務を明確化する。

### 技術選定
- GitHub Actions 標準機能（`concurrency`, job分割）。
- Docker BuildKit の `RUN --mount=type=cache` を利用。

## タスク分解

### 主要タスク
- [x] 要件定義の明確化
- [x] 技術調査・検証
- [x] 実装
- [ ] テスト・品質確認
- [ ] ドキュメント更新

### フェーズ1: Workflow改善 ✅
- [x] `cancel-in-progress: true` の適用
- [x] `cache-to mode=min` の適用
- [x] `wait` ステップの別ジョブ化
- [x] `workflow_dispatch` に `deploy_to_ecs` フラグを追加（build-only 実行対応）

実装メモ: wait処理はCPU非依存のため `ubuntu-latest` へ移動。

### フェーズ2: Dockerfile改善 ✅
- [x] コピー戦略の見直し（キャッシュ破壊範囲縮小）
- [x] `cargo` ビルド工程への cache mount 適用
- [x] 既存成果物コピーの整合性確認

実装メモ: `COPY . .` を Rust workspace の必要入力に分割し、`cargo chef cook` / `cargo build` に cargo registry/git cache mount を追加。

### フェーズ3: 検証 📝
- [ ] ワークフローYAMLの妥当性確認
- [ ] 差分レビュー
- [ ] 次回実行での時間比較方針を記録

## テスト計画
- 静的確認: `git diff` とYAML構文を確認。
- 実行確認: 次回 `Deploy Tachyon API ECS` 実行で以下を比較。
  - `Build and push image` 所要時間
  - `Wait for service stability` ジョブの実行成功

## リスクと対策
- リスク: `mode=min` により中長期のキャッシュヒット率が低下する可能性。
- 対策: 2〜3回の実行で所要時間推移を記録し、必要なら `mode=max` に戻す。

- リスク: Dockerfile変更によりビルド成果物パスがずれる可能性。
- 対策: `strip` と `COPY --from=builder` の参照パスを必ず確認する。

## スケジュール
- 2026-02-22: Workflow改善の実装、Dockerfile改善、差分確認

## 完了条件
- Workflow改善3点が反映済みである。
- Dockerfile改善（コピー戦略 + cache mount）が反映済みである。
- 変更内容・検証方針が taskdoc と verification-report に記録されている。
