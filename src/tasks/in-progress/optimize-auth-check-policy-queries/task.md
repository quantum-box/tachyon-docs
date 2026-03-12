---
title: "Auth check_policy の N+1 クエリ最適化 + シナリオテスト高速化"
type: refactor
emoji: "⚡"
topics: ["auth", "performance", "database", "check_policy", "muon"]
published: true
targetFiles:
  - packages/auth/domain/src/service/check_policy.rs
  - packages/auth/domain/src/service/policy_service.rs
  - packages/auth/domain/src/policy_repository.rs
  - packages/auth/src/interface_adapter/gateway/sqlx_policy_repository.rs
  - packages/muon/src/runner.rs
github: ""
---

# Auth check_policy の N+1 クエリ最適化 + シナリオテスト高速化

## 概要

Auth REST シナリオテストが 11 ステップで 3分超かかっていた問題を調査・修正。

**根本原因**: muon テストランナーの `expand_variables` が変数テーブル（1000+ エントリ）に対して個別に正規表現をコンパイルしており、debug ビルドで深刻なパフォーマンス劣化を引き起こしていた。

**修正結果**: Auth REST 11 ステップ: 201,860ms → 298ms（**677倍高速化**）

## 背景・目的

- **問題**: Auth REST エンドポイント（service-accounts, actions, policies 等）がシナリオテストで異常に遅い
- **計測結果** (Docker 内シナリオテスト、修正前):
  - Auth REST: 11ステップ = 201,860ms（~18,000ms/ステップ）
  - ステップ1-3: 180-812ms（高速）
  - ステップ4以降: 15,000-35,000ms（極端に遅い）

## 根本原因の発見

### 調査プロセス

1. **仮説1: check_policy の N+1 クエリ** → Phase A でバッチ化 → 改善なし
2. **仮説2: feature_flag_evaluations の INSERT ブロック** → INSERT を完全無効化 → 改善なし
3. **仮説3: 他シナリオとの干渉** → Auth REST を単独実行 → 改善なし（201,860ms）
4. **タイムスタンプ分析**で決定的証拠:
   - "Running step 4" ログ: 10:06:07.805
   - API がリクエスト受信: 10:06:21.068
   - **13.263秒の空白** → サーバー側は完全にアイドル

### 真の原因: muon `expand_variables`

`packages/muon/src/runner.rs` の `expand_variables` メソッド:

```rust
// 修正前: 変数ごとに正規表現をコンパイル (O(V) compilations)
for (key, value) in vars {
    let pattern = format!(r"\{{\{{\s*(?:vars\.)?{}\s*\}}\}}", regex::escape(key));
    let regex = Regex::new(&pattern).unwrap();  // 毎回コンパイル!
    result = regex.replace_all(&result, value_str.as_str()).into_owned();
}
```

- ステップ3 で "List all actions"（87アクション）を実行すると、`flatten_value` がレスポンス JSON を再帰的に展開し **vars に 1000+ エントリ** を追加
- 以降のステップで 1000+ 回の `Regex::new()` が発生
- debug ビルド（`[unoptimized + debuginfo]`）では正規表現コンパイルが **20-100 倍遅い**
- 1000 compilations × 5 calls/step × ~2ms/compilation(debug) = **10-15 秒/ステップ**

## 実装内容

### Fix 1: muon `expand_variables` の最適化 ✅

```rust
// 修正後: 単一の正規表現 + HashMap ルックアップ (O(1) compilation)
static PLACEHOLDER_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\{\{\s*(?:vars\.)?(.+?)\s*\}\}")
        .expect("failed to compile placeholder regex")
});

PLACEHOLDER_RE.replace_all(text, |caps: &regex::Captures| {
    let key = &caps[1];
    match vars.get(key) {
        Some(Value::String(s)) => s.clone(),
        Some(v) => v.to_string(),
        None => caps[0].to_string(),
    }
}).into_owned()
```

計算量: O(V×N) → O(M×N)（V=変数数1000+, M=マッチ数0-3, N=文字列長）

### Fix 2: check_policy バッチクエリ化 ✅ (Phase A)

2N クエリ → 2 クエリに削減（N = ポリシー数）。

1. **`PolicyRepository` トレイト** - `find_actions_by_policies`, `find_action_patterns_by_policies` 追加
2. **`SqlxPolicyRepository`** - IN 句バッチクエリ実装（`QueryBuilder` 使用）
3. **`PolicyService`** - バッチメソッド + HashMap グループ化
4. **`CheckPolicyImpl`** - `evaluate_policies_batch` ヘルパー（deny/allow 評価順序維持）
5. **テストモック** - 5ファイルのモック `PolicyRepository` にバッチメソッド追加

## パフォーマンス結果

| 指標 | 修正前 | 修正後 | 改善率 |
|---|---|---|---|
| Auth REST 11ステップ | 201,860ms | 298ms | **677x** |
| 全47シナリオ | N/A | 17.46s | - |

## タスク分解

- [x] Phase A: `check_policy` バッチクエリ化（28テスト全パス）
- [x] 根本原因調査（仮説1-3 を反証し、muon の `expand_variables` を特定）
- [x] muon `expand_variables` の最適化（LazyLock + HashMap ルックアップ）
- [x] タイミングログの除去
- [x] シナリオテスト全パス確認（47シナリオ、17.46秒）
- [ ] コードレビュー完了

## 完了条件

- [x] 既存のポリシーチェックテストがすべてパス
- [x] deny/allow の評価順序が変わっていないことを確認
- [x] Auth REST シナリオテストが 11 ステップ合計 30 秒以下で完了（298ms で達成）
- [x] 全シナリオテストがパス
- [ ] コードレビュー完了
