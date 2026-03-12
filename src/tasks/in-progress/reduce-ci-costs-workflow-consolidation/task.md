---
title: "CI費用削減: ワークフロー統合（Rust CI DB分離・テスト統合・フロントlint統合）"
type: tech
emoji: "🔧"
topics:
  - GitHub Actions
  - CI/CD
  - Cost Optimization
  - Rust
  - TypeScript
published: true
targetFiles:
  - .github/workflows/rust.yaml
  - .github/workflows/library_ci.yaml
  - .github/actions/rust_action/action.yml
---

# CI費用削減: ワークフロー統合

## 概要

GitHub ActionsのCIジョブを統合・分離し、セットアップの重複を排除することで費用を削減する。最大のコスト要因であるRust CI（15ジョブ、合計186分/PR）を中心に最適化する。

## 背景・目的

### Rust CI の現状（実データ）

- ランナー: `ubuntu-latest`（GitHub Hosted無料枠を使うため一時的にBlacksmithから切り替え中）
- **15ジョブ並列**、全ジョブがMySQL起動 + rust_action フルセットアップ
- PR実行: wall clock 約26分、合計ジョブ時間 約186分
- **fmtやclippyにもMySQL起動が含まれている**（本来不要）

### rust_action の内容（全ジョブで重複実行）

1. ディスクスペース解放（dotnet, android, CodeQL削除）
2. mold + clang インストール
3. protoc インストール
4. Rust nightly ツールチェーンセットアップ
5. rust-cache 復元
6. mise + sqlx-cli インストール
7. 環境変数設定 + **MySQLマイグレーション実行 + シーディング**

→ fmt, clippy は 7 の DB操作が不要だが、rust_action が一体型のため全ジョブで実行されている。

### フロントCI の現状

- `tachyon_ci`: ts + codegen（2ジョブ、lint/formatジョブ**なし**）→ 対象外
- `library_ci`: ts + lint + format + build（4ジョブ）→ lint/format統合可能
- 他: `aichat_ci`, `bakuure_ui_ci`, `bakuure_admin_ui_ci`, `agent_app_ci`, `cms_ci` → 個別確認必要
- 個別ジョブは2-5分と軽量

## 詳細仕様

### 施策A: Rust CI のDB不要ジョブ分離

**現状の問題**:
- `fmt`（約6分）と `clippy`（約19分）は MySQL 不要
- しかし `rust_action` が DB起動・マイグレーション・シーディングを含む一体型のため、全ジョブで MySQL を起動している

**変更方針**:
- `rust_action` を2種類に分離:
  - **lint用（DB無し）**: ディスク解放 + mold + protoc + Rust toolchain + rust-cache + mise
  - **test用（DB有り）**: 上記 + sqlx-cli + MySQL マイグレーション + シーディング
- `fmt` と `clippy` ジョブは lint用アクションを使用し、MySQL services セクションを除外

**見込み効果**: fmt(6分) + clippy(19分) のジョブでMySQL起動・マイグレーション・シーディング分（推定2-3分/ジョブ）を削減。直接的な時間削減は小さいが、リソース効率が向上し、GitHub Hosted無料枠の消費を抑える。

### 施策B: Rust CI テストジョブの統合検討

**現状の15ジョブ（実データ）**:

```yaml
# 静的解析系（DB不要にできる）
- fmt:              ~6分
- clippy:           ~19分
- check:            ~13分  # DB必要（sqlxマクロの検証に使用）

# テスト系（DB必要）
- test-value-object:      ~9分   # cargo test -p value_object
- test-llms:              ~17分  # cargo test -p llms_domain && cargo test -p llms --lib
- test-library:           ~16分  # cargo test -p library-api (シナリオ除く)
- test-test-helper:       ~6分   # cargo test -p test_helper --examples --lib
- test-database-manager:  ~10分  # cargo test -p database-manager
- test-database-domain:   ~10分  # cargo test -p database_domain
- test-procurement:       ~8分   # cargo test -p procurement_domain
- test-procurement-lib:   ~9分   # cargo test -p procurement --lib

# シナリオテスト系（DB必要）
- scenario-test:          ~21分  # cargo test -p tachyon-api (シナリオ)
- scenario-test-library:  ~19分  # cargo test -p library-api (シナリオ)
- scenario-test-bakuure:  ~17分  # cargo test -p bakuure-api (シナリオ)
```

**トレードオフの整理**:

| 観点 | ジョブ統合 | 現状維持（並列） |
|------|----------|----------------|
| 合計ジョブ時間 | セットアップ削減で減少 | セットアップ重複で増加 |
| wall clock | 直列実行で増加のリスク | 26分（並列最大値） |
| フィードバック速度 | 1テスト失敗で全体の結果待ち | 個別テストの結果を素早く確認 |
| 無料枠消費 | 合計分数が減り有利 | 合計分数が多い |
| path-filter | 統合すると変更範囲外のテストも実行される | 各ジョブが個別のpath条件で起動、無関係なテストをスキップできる |

**重要: 現行のpath-filterとの整合性**

現行の `rust.yaml` では `check-changes` が変更パスを分析し、各テストジョブに個別の起動条件を設定している:
- `test-value-object`: `global || foundation` の変更時のみ
- `test-llms`: `global || foundation || shared_infra || llms` の変更時のみ
- `test-library`: `global || foundation || shared_infra || library || muon` の変更時のみ
- 他のジョブも同様に個別条件あり

ジョブを統合すると、例えば `llms` のみの変更でも `value_object` や `database_domain` のテストまで実行される。変更範囲が限定的なPRでは、統合により実行分数が**増加**する可能性がある。

**推奨案: 軽量テスト群のみ統合**

```yaml
# 統合ジョブA: 静的解析（DB不要）— 施策Aで対応
lint:
  steps:
    - cargo fmt --check
    - cargo clippy

# 統合ジョブB: 軽量テスト群（統合して1ジョブに）
test-core:
  steps:
    - cargo test -p value_object              # 9分
    - cargo test -p test_helper --examples --lib  # 6分
    - cargo test -p database-manager          # 10分
    - cargo test -p database_domain           # 10分
    - cargo test -p procurement_domain        # 8分
    - cargo test -p procurement --lib         # 9分
  # 直列実行で推定35-40分だが、セットアップ5回分（15-25分）を削減
  # → 合計ジョブ時間: 52分→35-40分に削減

# 独立ジョブ: 重量テスト（統合しない）
test-llms:              # 17分（llms_domain + llms --lib）
test-library:           # 16分（library-api、シナリオ除く）
check:                  # 13分（DB必要: sqlxマクロ検証）

# シナリオテスト（統合しない）
scenario-test:          # 21分（tachyon-api）
scenario-test-library:  # 19分（library-api）
scenario-test-bakuure:  # 17分（bakuure-api）
```

**統合による効果概算**:
- 統合前: 15ジョブ × セットアップ約3-5分 = 45-75分のセットアップ時間
- 統合後: 9ジョブ × セットアップ約3-5分 = 27-45分のセットアップ時間
- **削減: 18-30分/PR**

**注意点**:
- 統合ジョブ内の1テストが失敗すると他テストの結果が見えなくなる → `cargo test` の `--no-fail-fast` オプションで全テスト実行を継続するか、`cargo-nextest` を別途導入してJUnitレポート + GitHub Actions annotations で個別結果を可視化
- wall clock は並列性低下で若干増加する可能性がある（26分→30分程度）
- `check` ジョブはsqlxマクロの検証にDB接続が必要なため、lint統合から除外
- **path-filter の喪失**: 統合すると現行の変更パスによるスキップが効かなくなる。統合ジョブにも条件式を設定するか（例: いずれかのpath条件がtrueなら実行）、path-filterを維持するために統合しない判断もあり得る。セットアップ削減 vs path-filter喪失のトレードオフを実測して判断すべき

### 施策C: フロントCI の lint/format 統合

**対象の正確な把握**:

| ワークフロー | lint ジョブ | format ジョブ | 統合対象 |
|-------------|-----------|-------------|---------|
| `tachyon_ci.yaml` | なし | なし | **対象外** |
| `library_ci.yaml` | あり（~2.6分） | あり（~2.6分） | ✅ |
| `aichat_ci.yaml` | 要確認 | 要確認 | 要調査 |
| `bakuure_ui_ci.yaml` | 要確認 | 要確認 | 要調査 |
| `bakuure_admin_ui_ci.yaml` | 要確認 | 要確認 | 要調査 |
| `agent_app_ci.yaml` | 要確認 | 要確認 | 要調査 |
| `cms_ci.yaml` | 要確認 | 要確認 | 要調査 |

**変更方針**:
- `lint` と `format` を1つの `lint-and-format` ジョブに統合
- yarn install + Biome セットアップの重複を排除

**見込み効果**: 対象ワークフロー数 × 1ジョブ削減。各ジョブ2-3分のため、効果は小さい（PR毎に数分〜十数分の削減）。

## 実装方針

### 優先順位

1. **施策A（Rust CI DB不要ジョブ分離）** — 最も確実で副作用が少ない
2. **施策B（テストジョブ統合）** — トレードオフがあるため慎重に進める
3. **施策C（フロントlint/format統合）** — 効果は小さいが作業も小さい

### 施策Aの実装手順
1. `rust_action` を `rust_action_lint`（DB無し）と `rust_action_test`（DB有り）に分離
2. `fmt` と `clippy` ジョブで `rust_action_lint` を使用し、MySQL services を除外
3. 他のジョブは `rust_action_test` を使用（既存動作を維持）

### 施策Bの実装手順
1. 軽量テスト群（test-value-object, test-test-helper, test-procurement等）を `test-core` に統合
2. `cargo test` で複数パッケージをまとめて実行（`cargo-nextest` 導入は任意。導入する場合はrust_actionにインストール手順を追加）
3. JUnitレポート出力を設定し、個別テスト結果の可視性を確保
4. wall clock の変化を測定

### 施策Cの実装手順
1. 各フロントCIのジョブ構成を確認
2. lint/formatが分離されているワークフローで統合
3. `biomejs_lint` + `biomejs_format` アクションを統合した `biomejs_check` を作成（または2コマンドをインライン実行）

## タスク分解

### フェーズ1: Rust CI DB不要ジョブ分離 ✅
- [x] `rust_action_lint` アクション作成（DB関連ステップ除外）
- [x] `fmt` ジョブで `rust_action_lint` を使用、MySQL services除外
- [x] `clippy` ジョブで `rust_action_lint` を使用、MySQL services除外
- [ ] CI実行で正常動作を確認

### フェーズ2: Rust CI テストジョブ統合 ✅
- [x] 6つの軽量テスト群を `test-core` ジョブに統合（`--no-fail-fast` 付き）
- [ ] 統合前後のwall clock / 合計ジョブ時間を比較（CI実行で確認）

### フェーズ3: フロントCI lint/format統合 ✅
- [x] `biomejs_check` アクション作成（lint + format統合）
- [x] `library_ci.yaml` の lint/format → `lint-and-format` に統合
- [x] `aichat_ci.yaml` の lint/format → `lint-and-format` に統合
- [x] `bakuure_ui_ci.yaml` の lint/format → `lint-and-format` に統合
- [x] `bakuure_admin_ui_ci.yaml` の lint/format → `lint-and-format` に統合
- [x] `agent_app_ci.yaml` の lint/format → `lint-and-format` に統合
- [x] `cms_ci.yaml` の cms-lint/cms-format → `cms-lint-and-format` に統合

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| rust_action分離でlintジョブが動かない | 中 | PR上で動作確認。失敗時は元に戻す |
| テスト統合で1失敗→全体ブロック | 中 | `cargo test --no-fail-fast` で全テスト実行を継続。より詳細なレポートが必要なら `cargo-nextest` を導入 |
| テスト統合でwall clock増加 | 中 | 軽量テスト群のみ統合し、重量テストは独立維持 |
| フロントlint/format統合の効果が小さい | 低 | 作業量も小さいため、ROIは維持される |

## 完了条件

- [ ] fmt, clippy ジョブが MySQL無しで実行されている
- [ ] 軽量テスト群が `test-core` ジョブに統合されている
- [ ] 統合後の合計ジョブ時間が統合前より削減されている
- [ ] wall clockが大幅に増加していない（+5分以内を目安）
- [ ] 全てのテストがパスしている
- [ ] フロントCIのlint/formatが統合されている（対象ワークフロー）
