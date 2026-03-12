---
title: Z.AI providerにGLM-5を追加してAgent APIから利用可能にする
type: feature
emoji: "🧠"
topics:
  - Z.AI
  - GLM-5
  - Agent API
  - Model Catalog
published: true
targetFiles:
  - packages/providers/zai/src/ai_models.rs
  - packages/providers/zai/src/chat.rs
  - packages/providers/zai/src/lib.rs
  - packages/providers/zai/src/pricing.rs
  - packages/providers/zai/src/provider_info.rs
  - scripts/seeds/n1-seed/005-order-products.yaml
github: https://github.com/quantum-box/tachyon-apps
---

# Z.AI providerにGLM-5を追加してAgent APIから利用可能にする

## 概要
Z.AIプロバイダーに `glm-5` モデル定義を追加し、Agent API経由でモデル選択・課金計算・モデル情報参照ができる状態にする。

## 背景・目的
- 現状 `zai` は GLM-4.7 系のみ定義されており、最新の `glm-5` を選択できない。
- ユーザー要望として Agent API から GLM-5 を使いたい。
- 価格・モデル情報・モデル一覧が揃っていないと、実運用時に課金計算や表示で不整合が起きる。

## 詳細仕様
### 機能要件
1. `packages/providers/zai/src/ai_models.rs` に `glm-5` を追加する。
2. `LLMProvider::models()` で `glm-5` が返るようにする。
3. `pricing.rs` に `glm-5` の単価を追加する。
4. `provider_info.rs` に `glm-5` の `ModelInfo` を追加し、`get_all_models_info()` に含める。

### 非機能要件
- 既存モデル（GLM-4.7系）の挙動・価格・テストを壊さない。
- 既存テストが通ること。

## 実装方針
- 既存のGLM-4.7追加方式を踏襲し、最小変更で `glm-5` を追加する。
- 価格は公式pricingに合わせる（Input $1/MTok, Output $3.2/MTok, Cached Input $0.2/MTok）。

## タスク分解
### 主要タスク
- [x] 要件定義の明確化
- [x] 技術調査・検証
- [x] 実装
- [x] テスト・品質確認（`mise run check` をDockerで実行し成功）
- [x] ドキュメント更新

## リスクと対策
| リスク | 影響度 | 対策 |
|--------|--------|------|
| 価格定義の単位ミス | 中 | NanoDollar換算値をコメントとテストで確認 |
| モデル情報の不整合 | 中 | ai_models / pricing / provider_info を同時更新 |

## 参考資料
- https://docs.z.ai/guides/overview/pricing
- packages/providers/zai/src/*

## 完了条件
- [x] `glm-5` が `zai` プロバイダーのモデル一覧に含まれる
- [x] `glm-5` の価格取得ができる
- [x] `glm-5` の model info 取得ができる
- [x] 関連テストが通る（`mise run check` 成功）
