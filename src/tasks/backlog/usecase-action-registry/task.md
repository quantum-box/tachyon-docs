---
title: "Usecase Action Registryの自動登録強化"
type: "refactor"
emoji: "🗂️"
topics: ["inventory", "usecase", "rust", "macro"]
published: false
targetFiles: [
  "packages/usecase_actions/",
  "packages/*/src/usecase/",
  "packages/*/src/lib.rs",
  "tools/action-catalog/"
]
github: "https://github.com/quantum-box/tachyon-apps"
---

## タスク概要
- **目的**: 各コンテキストのユースケースからアクション文字列を漏れなく抽出し、`inventory` と `action-catalog` へ確実に反映できるようにする。また、各ユースケースで求められる policy チェックが網羅的に実行される仕組みを整備し、リンク最適化やヒューマンエラーによる欠落を防ぐ。
- **スコープ**: `usecase_actions` マクロ、各パッケージの `init_action_registry()`、`tools/action-catalog` CLI。影響範囲は IAC / Feature Flag / LLMs / Library API / Payment / Procurement / CRM。
- **完了条件**:
  1. すべてのユースケースが属性マクロ経由でアクション定義＆登録されていること。
  2. `action-catalog` が全コンテキスト分のアクションを一覧でき、回帰テストで担保されていること。
  3. 新規ユースケース追加時の手順（マクロ適用・`init_action_registry` 呼び出し）がドキュメント化され、開発ガイドに反映されていること。

## 背景・目的
- 🔄 既存の `declare_usecase_action!` + 手動 `inventory::submit!` は各ユースケースで重複記述が多く、リンク最適化 (LTO) による登録漏れが散発。
- 🔄 `action-catalog` CLI が IAC・Procurement など一部コンテキストのアクションを拾えておらず棚卸しに支障。
- ✅ プロジェクト全体で policy チェックがユースケース単位で行われるため、アクション文字列の一貫性と自動集計が必須。

## 詳細仕様
- `#[usecase_actions(...)]` 属性で以下を自動生成する。
  - `ACTION_*` 定数（`context:ActionName` 形式）
  - いずれ `#[usecase_actions(context = "payment", action = "GetProvider")]` のようなキーバリュースタイルへ移行予定（親しみやすい記法とするため）
  - `inventory` への登録コード
  - `__register_usecase_actions()` 関数（リンク保持のために `black_box` を内包）
  - 単一アクション時の `pub fn policy(&self) -> &'static str`（複数アクションの場合は `policy_fn = method(ACTION_CONST);` で明示指定）
- 各パッケージの `init_action_registry()` では、対象ユースケースの `__register_usecase_actions()` を必ず呼び出し、定数と TypeId を `black_box` で参照。
- `tools/action-catalog` は対象パッケージをリンクし、`init_action_registry()` を呼ぶだけで全アクションを列挙できる設計とする。
- タスク完了時点で `cargo run -p action-catalog -- --format table` が 54 アクションを列挙することを最低限の動作確認とする。

## 実装方針
- マクロによるコード生成を中心とし、既存ユースケースの挙動を壊さず移行する。
- `init_action_registry()` では `std::hint::black_box` を活用してリンク保持。必要最小限のコードで表現し DCE を回避。
- `action-catalog` は CLI で単純な `ensure_linked()` → `init_action_registry()` 呼び出しに留め、ビルド時の依存解決を活かす。
- 旧マクロ `declare_usecase_action!` は互換維持のため残置するが、新規開発では利用禁止とする。

## タスク分解

### フェーズ1: マクロ拡張と IAC 適用 ✅
- [ ] `usecase_actions` クレートを更新し `__register_usecase_actions()` を実装
- [ ] IAC コンテキストのユースケースを属性マクロへ移行
- [ ] `packages/iac/src/lib.rs` の `init_action_registry()` を新形式へ更新
- 実装メモ: IAC では手動で `inventory::submit!` を記載していたため、差分が多いが挙動は維持。

### フェーズ2: 他コンテキストへの適用 ✅
- [ ] Feature Flag / LLMs / Library API / Payment / Procurement / CRM に属性マクロを適用
- [ ] 各 `init_action_registry()` で `__register_usecase_actions()` を呼ぶよう統一
- [ ] `action-catalog` CLI から全アクションを列挙できることを確認
- 実装メモ: Payment の `FindAllProvidersByEntityId` など構造体名と ACTION 名が異なる箇所は呼び出し側名称に合わせて修正。

### フェーズ3: 品質保証とドキュメント 🔄
- [ ] `mise run check` でビルド検証
- [ ] `CLAUDE.ja.md` へ運用メモを追記
- [ ] 本タスクドキュメントを作成
- [ ] `policy()` 自動生成ロジックを追加
- [ ] 回帰テスト・CLI テストを追加
- [ ] 開発ガイドラインに手順を統合

## テスト計画
- ✅ `cargo run -p action-catalog -- --format table`（手動）
- ✅ `cargo run -p action-catalog -- --format json`（spot check）
- ✅ `mise run check`（= `cargo check --examples --tests`）
- 🔄 今後追加予定: `usecase_actions` ユニットテスト、`action-catalog` CLI スナップショットテスト

## リスクと対策
- **既存ユースケースが `policy()` を独自実装している** → 属性マクロで自動生成する際に重複しないよう、オプションで制御する（TODO）。
- **`inventory` 仕様変更時の影響** → マクロ側に回帰テストを追加し、ライブラリアップデート時に検知できる仕組みを整備。
- **action-catalog のビルド時間増加** → `ensure_linked()` 内を最小限にし、将来的に CI でキャッシュ活用を検討。

## スケジュール
- 2025-10-05: 初期実装・IAC 適用 ✅
- 2025-10-06: 全コンテキスト適用＆検証 ✅
- 2025-10-10 目標: `policy()` 自動生成と回帰テスト整備 🔄
- 2025-10-15 目標: ドキュメント更新・開発ガイド反映 📝

## 完了条件
- [ ] `policy()` 自動生成が導入され、対象ユースケースで手書きメソッドが不要になっている
- [ ] `usecase_actions` / `action-catalog` それぞれに回帰テストが追加済み
- [ ] 開発者ガイドラインに新しい運用手順が記載され、確認済み
- [ ] `action-catalog` CLI テストが CI に組み込まれている

## 現在の状況（2025-10-06）

### 実施内容
1. `usecase_actions` 属性マクロを拡張し、構造体ごとに `__register_usecase_actions()` を自動生成。
   - `init_action_registry()` で関数を呼ぶだけで `inventory` のリンク最適化落ちを防げることを確認。
2. IAC / Feature Flag / LLMs / Library API / Payment / Procurement / CRM 各パッケージのユースケースを新マクロへ移行し、旧 `declare_usecase_action!` や直接 `inventory::submit!` を撤去。
3. 各パッケージの `init_action_registry()` を統一フォーマット（`__register_usecase_actions()` → 定数配列 `black_box` → TypeId タッチ）にリファクタリング。
4. `cargo run -p action-catalog -- --format table` で 54 件のアクション（IAC 6 件、Procurement 1 件を含む）が列挙されることを確認。
5. `mise run check`（`cargo check --examples --tests`）を実行し、ビルドが安定していることを検証。
6. IAC / LLMs の InputPort トレイトから手書き `policy()` を排除し、自動生成メソッドへ移行。

## 次にやること
1. **回帰テストの追加**
   - `packages/usecase_actions/tests` を新設し、ダミークレートを用いて `inventory` 登録がリンク最適化でも落ちないことを検証。
   - `action-catalog` についても CLI テスト（例: `cargo run -- --format json` のスナップショット）を追加し、件数の差分を検知。
2. **ドキュメント整備**
   - 新しい手順（マクロ適用と `__register_usecase_actions` 呼び出し）を `CLAUDE.ja.md と 開発ガイド` に明記し、オンボーディング用のチェックリストも更新。
3. **技術的負債の洗い出し**
   - 旧 `declare_usecase_action!` マクロを段階的に廃止する計画を策定（非推奨アノテーションなど）。
   - 影響範囲が広い場合は別タスク化して進行管理する。

## メモ
- 旧 `declare_usecase_action!` マクロは `value_object::action_catalog` に残置しているが、互換目的のみ。新規コードは `usecase_actions` 属性を必須とする方針。
- `init_action_registry()` は「対象ユースケースの `__register_usecase_actions()` を呼ぶ → 定数配列で black_box → TypeId を触る」構成に統一済み。新しいパッケージを追加する場合も同形式で揃える。
