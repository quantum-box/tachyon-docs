---
title: "Claude Sonnet 4.6 モデル料金定義の追加"
type: "feature"
emoji: "🤖"
topics: ["LLM", "Anthropic", "Pricing", "NanoDollar"]
published: true
targetFiles:
  - packages/providers/anthropic/src/lib.rs
  - packages/providers/anthropic/src/pricing.rs
  - packages/providers/anthropic/src/provider_info.rs
  - CLAUDE.md
github: ""
---

# Claude Sonnet 4.6 モデル料金定義の追加

## 概要

2026-02-17にリリースされた Claude Sonnet 4.6 のモデル定義・料金情報をプロバイダーパッケージに追加する。

## 背景・目的

- Anthropicが Claude Sonnet 4.6 をリリース（2026-02-17）
- Opus級のコーディング・推論能力をSonnet価格帯で提供する新モデル
- 1Mトークンのコンテキストウィンドウに対応
- 既存のプロバイダー料金定義に追加し、API利用時の正確な課金計算を可能にする

## 詳細仕様

### 料金（NanoDollar単位）

```yaml
claude-sonnet-4-6:
  input: $3.00/1M tokens = 3,000 nanodollars/token
  output: $15.00/1M tokens = 15,000 nanodollars/token
  cache_read: $0.30/1M tokens = 300 nanodollars/token  # 10% of input
  cache_write_5min: $3.75/1M tokens = 3,750 nanodollars/token  # 125% of input
```

### モデルID

- `claude-sonnet-4-6` (エイリアス)
- `claude-sonnet-4-6-20260217` (日付付きスナップショット)
- `claude-sonnet-4.6` (ドット表記エイリアス)

## タスク分解

### 主要タスク ✅

- [x] `model_names` 定数追加（`CLAUDE_SONNET_4_6`, `CLAUDE_SONNET_4_6_LATEST`）
- [x] `CLAUDE_SONNET_4_6_MODEL` 定義追加
- [x] `ANTHROPIC_DEFAULT_MODELS` にSonnet 4.6を追加
- [x] `default_model_for(Small)` のデフォルトをSonnet 4.6に更新
- [x] fallback chain にSonnet 4.6を追加（4.6 → 4.6-latest → 4.5）
- [x] `pricing.rs` にNanoDollar料金定義を追加（3エントリ）
- [x] `provider_info.rs` にモデル情報追加（display name, 説明, ベンチマーク, features, use_cases）
- [x] `CLAUDE.md` の料金テーブルにSonnet 4.6を追記

## 備考

### 他モデルの料金変更（未対応）

公式料金ページで以下の価格変更を確認。本タスクでは対応せず、別タスクで対応予定：

- **Opus 4.5**: $20/$100 → $5/$25 (値下げ)
- **Haiku 4.5**: $0.15/$0.80 → $1/$5 (値上げ)

### 参考資料

- [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Claude Sonnet 4.6 Launch](https://thenewstack.io/claude-sonnet-46-launch/)

## 完了条件

- [x] すべてのモデル定数・料金・情報が追加されている
- [x] 既存のモデル定義と整合性が取れている
- [ ] コードレビューが完了
