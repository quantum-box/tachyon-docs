---
title: "CI費用削減: 即効施策（concurrency・ドラフトスキップ・yarn.lockフィルタ・Chromatic調査）"
type: tech
emoji: "💰"
topics:
  - GitHub Actions
  - CI/CD
  - Cost Optimization
published: true
targetFiles:
  - .github/workflows/tachyon_ci.yaml
  - .github/workflows/library_ci.yaml
  - .github/workflows/bakuure_ui_ci.yaml
  - .github/workflows/bakuure_admin_ui_ci.yaml
  - .github/workflows/cms_ci.yaml
  - .github/workflows/agent_app_ci.yaml
  - .github/workflows/aichat_ci.yaml
  - .github/workflows/chromatic-tachyon.yml
  - .github/workflows/chromatic-library.yml
  - .github/workflows/chromatic-aichat.yml
  - .github/workflows/chromatic-cms.yml
  - .github/workflows/claude-code-review.yml
---

# CI費用削減: 即効施策

## 概要

GitHub Actions の CI 費用を削減するための即効性のある施策をまとめて実施する。各施策は数行〜数十行の変更で完了し、CIの検証内容を破壊しないため、リスクが極めて低い。

## 背景・目的

### CI全体像（実データ）

| カテゴリ | ワークフロー数 | concurrency設定 |
|---------|-------------|----------------|
| Rust CI | 1（15ジョブ並列） | あり |
| フロントCI | 7 | **なし** |
| Chromatic | 4 | **なし** |
| Claude Code Review | 1 | **なし** |
| Claude Code | 1 | -（メンション駆動、ほぼskipped） |
| TiDB Migration | 1 | あり |
| デプロイ系 | 8+ | あり（一部） |

### 連続push問題の実例

**feature/library-collaborative-editing ブランチ**:
- 8回のpush × 11ワークフロー = **88回のワークフロー実行**
- push間隔: 約15-20分（エージェントの連続push）
- concurrencyなし → 全て最後まで実行
- Rust CI 8回分だけで約1,488ジョブ分（8 × 186分/回）

### Rust CI のコスト（最大コスト要因）

- ランナー: `ubuntu-latest`（GitHub Hosted無料枠を使うため一時的にBlacksmithから切り替え中）
- 15ジョブ並列、全ジョブがMySQL起動 + rust_action フルセットアップ
- **PR実行**: wall clock 約26分、合計ジョブ時間 約186分
- **main push**: 合計ジョブ時間 約215分

## 詳細仕様

### 施策A: 全フロントCI + Chromatic + Claude Code Review に concurrency 追加

**現状の問題**:
- フロント7 + Chromatic4 + Claude Code Review1 = 12ワークフローにconcurrency設定がない
- 同じPRに連続pushすると、古いランと新しいランが並列で走り、古い方は完全な無駄
- Rust CI / TiDB Migration は既に設定済み

**対象ワークフロー（12ファイル）**:

| ワークフロー | 現在のconcurrency |
|-------------|-------------------|
| `tachyon_ci.yaml` | なし |
| `library_ci.yaml` | なし |
| `bakuure_ui_ci.yaml` | なし |
| `bakuure_admin_ui_ci.yaml` | なし |
| `cms_ci.yaml` | なし |
| `agent_app_ci.yaml` | なし |
| `aichat_ci.yaml` | なし |
| `chromatic-tachyon.yml` | なし |
| `chromatic-library.yml` | なし |
| `chromatic-aichat.yml` | なし |
| `chromatic-cms.yml` | なし |
| `claude-code-review.yml` | なし |

**変更内容**: 各ワークフローのトップレベルに以下を追加:
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

**見込み効果**: feature/library-collaborative-editing の実例では、concurrencyがあれば88実行→最大11実行に削減可能だった。エージェントPRでの連続pushにより70-80%のジョブ実行を削減。

### 施策B: ドラフトPRでのCI実行スキップ

**現状の問題**:
- 全ワークフローにドラフトPRフィルタがない
- WIPのPRでもフルCIが実行される

**変更内容**: 各ワークフローの主要ジョブ（check-changes以降）に条件を追加:
```yaml
if: github.event.pull_request.draft == false || github.event_name != 'pull_request'
```

**注意点**:
- `push` イベント（mainブランチへのpush）では引き続き実行する
- `check-changes` ジョブ自体は軽量（ubuntu-latest）なので条件追加は不要
- ドラフトPRから `ready_for_review` に変更した際にCIが走るよう、トリガーに `ready_for_review` typeを追加する必要がある

### 施策C: yarn.lock の paths フィルタ見直し

**現状の問題**:
- `yarn.lock` が全7フロントCIの `paths` フィルタに含まれている
- `yarn.lock` の変更だけで全7フロントCIワークフローが発火する
- `check-changes` の `paths-filter` にも `yarn.lock` が含まれ、2段階フィルタを素通りする

**変更方針（2案）**:

**案1（推奨）: check-changes で yarn.lock 単独変更時のみスキップする**
- `yarn.lock` のみの変更では `should_run` を `false` にする
- 各アプリのソースコードや依存する共有パッケージ（`apps/<app>/**`, `packages/react/**`, `packages/ui/**`, `packages/tsconfig/**` 等、既存の paths-filter に含まれるパス）の変更がある場合は従来通り実行
- `yarn.lock` + 上記いずれかのファイル変更の組み合わせでも従来通り実行
- **重要**: 共有パッケージの変更を見逃さないよう、既存の paths-filter のパス定義はそのまま維持すること

**案2: yarn.lock を paths フィルタから除外**
- `yarn.lock` 変更時に実行されなくなるリスクがある
- 依存関係変更による型エラー等を見逃す可能性

**見込み効果**: 依存関係の一括更新（Renovate等）で全7ワークフロー同時発火を防止。

### 施策D: Chromatic の main push 失敗の調査

**現状の問題**:
- `chromatic-tachyon` が main push で直近3回全て failure
- VRT baseline更新という本来の目的を果たせていない

**対応**: この計画書のスコープでは調査のみ。原因特定後に別途修正タスクを起票する。

## 実装方針

- 施策A〜Cは独立しており、個別にPRを作成しても一括でも可
- CIの検証内容は一切変更しない（実行タイミング・条件の変更のみ）
- 変更後は実際にPRを作成し、期待通りにスキップ/キャンセルされることを確認

## タスク分解

### フェーズ1: concurrency追加 📝
- [ ] 対象12ワークフローにconcurrency設定を追加
- [ ] `rust.yaml` と `tidb-migration-check.yaml` は既に設定済みであることを確認

### フェーズ2: ドラフトPRスキップ 📝
- [ ] 各ワークフローのトリガーに `ready_for_review` typeを追加
- [ ] 主要ジョブにドラフトPRスキップ条件を追加
- [ ] pushイベントでは引き続き実行されることを確認

### フェーズ3: yarn.lock paths フィルタ見直し 📝
- [ ] 各フロントCIの check-changes で yarn.lock 単独変更時のみスキップする条件を追加
- [ ] 既存の paths-filter（共有パッケージ `packages/react/**` 等を含む）はそのまま維持
- [ ] yarn.lock のみの変更で発火しないことを確認
- [ ] yarn.lock + アプリソース or 共有パッケージ変更では実行されることを確認

### フェーズ4: Chromatic main push 失敗の調査 📝
- [ ] `chromatic-tachyon` の失敗原因を調査
- [ ] 必要に応じて修正タスクを起票

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| concurrencyでmainブランチのpushもキャンセルされる | 中 | mainへのpushは通常1回なので問題なし。必要なら `cancel-in-progress: ${{ github.event_name == 'pull_request' }}` で条件分岐 |
| ドラフトPRからready変更時にCIが走らない | 中 | `ready_for_review` typeをトリガーに追加することで解決 |
| yarn.lock フィルタ変更で依存更新時のCIが走らない | 中 | 案1（yarn.lock単独変更のみスキップ）であれば、共有パッケージやアプリソース変更を伴う場合は走る |

## 見込み効果の概算

| 施策 | 月間削減分数（概算） | 前提 |
|------|-------------------|------|
| A: concurrency | 数千分 | エージェントPRの連続push頻度に依存 |
| B: ドラフトPRスキップ | 数百分 | ドラフトPR利用頻度に依存 |
| C: yarn.lock フィルタ | 数百分 | Renovateの更新頻度に依存 |

**施策Aが最大のインパクト**。連続push問題の解消だけで大幅な削減が見込める。

## 完了条件

- [ ] 全対象ワークフローにconcurrency設定が追加されている
- [ ] ドラフトPRでCIが実行されないことを確認
- [ ] yarn.lockのみの変更で全フロントCIが同時発火しないことを確認
- [ ] Chromatic main push失敗の原因が特定されている
