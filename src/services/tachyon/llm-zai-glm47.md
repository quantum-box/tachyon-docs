---
title: Z.AI GLM-4.7 プロバイダ統合
description: Tachyon Apps における Z.AI (Zhipu AI) GLM-4.7 ファミリー統合の仕様と運用手順
published: true
---

# Z.AI GLM-4.7 プロバイダ統合

## 概要

Z.AI（Zhipu AI）の GLM-4.7 ファミリー（GLM-4.7 / GLM-4.7-FlashX / GLM-4.7-Flash）を Tachyon LLM プラットフォームへ追加し、バックエンドの推論ルーティング・調達／価格計算を一貫して利用できるようにした。Rust 製プロバイダ `packages/providers/zai` を新設し、`LLMProviders`・`ChatStreamProviders`・`PricingRegistry` をそれぞれ更新している。

## 対象範囲

- LLM コンテキスト（Rust）: `packages/providers/zai`, `packages/llms`
- Tachyon API DI: `apps/tachyon-api/src/di.rs`
- IaC シード: `scripts/seeds/n1-seed/003-iac-manifests.yaml`
- シークレットサンプル: `.secrets.json.sample`

## バックエンド構成

### プロバイダクレート

- `packages/providers/zai`
  - `chat.rs`: `/api/paas/v4/chat/completions` へ JSON リクエストを送信し、`LLMProvider`・`ChatProvider`・`ChatStreamProviderV2` を実装。
  - `ai_models.rs`: GLM-4.7 系の代表モデル ID を列挙し、`LLMModel` の配列 `ZAI_MODELS` を提供。
  - `pricing.rs`: `ZaiPricingProvider` が NanoDollar 換算済みのトークン単価を `ModelPricing` として返却。Context Caching 対応の `cached_input_token_cost` を含む。
  - `provider_info.rs`: `ProviderInfoProvider` を実装し、モデル説明・レートリミット・ユースケース等のメタデータを catalog コンテキストへ供給。
- API ベース URL: `https://api.z.ai/api/paas/v4`
- 認証: `Authorization: Bearer <ZAI_API_KEY>`
- OpenAI 互換 API フォーマットを採用しているため、リクエスト/レスポンス構造は xAI と類似。

### DI / Registry

- `packages/llms` の `LlmProviderRegistry` で `zai` プロバイダを検出し、IaC マニフェストまたは環境変数 `ZAI_API_KEY` から認証情報を取得。
- `LLMProviders`・`ChatStreamProviders`・`ProviderInfo` へ登録。
- `apps/tachyon-api/src/di.rs` 内で `ZaiPricingProvider` を `PricingRegistry::register_provider("zai", ...)` へ追加。

## モデル一覧

| モデル | コンテキスト | 最大出力 | 特徴 |
|--------|-------------|----------|------|
| glm-4.7 | 200K | 128K | フラッグシップ、MoE（355B/32B）、推論モード対応 |
| glm-4.7-flashx | 200K | 128K | 高速バリアント |
| glm-4.7-flash | 200K | 128K | 無料モデル |

## 料金テーブル（NanoDollar）

| モデル | Input ND/token | Cached ND/token | Output ND/token |
|--------|----------------|-----------------|-----------------|
| glm-4.7 | 600 | 110 | 2,200 |
| glm-4.7-flashx | 70 | 10 | 400 |
| glm-4.7-flash | 0 | 0 | 0 |

> 1 USD = 1,000,000,000 NanoDollar 換算。公式料金: glm-4.7 は $0.60/$0.11/$2.20 per 1M tokens（Input/Cached/Output）。

## 運用と設定

### IaC マニフェスト

`scripts/seeds/n1-seed/003-iac-manifests.yaml` に以下の形式で追加:

```yaml
- config:
    api_key:
      $secret_ref: zai/api_key
  name: zai
  provider_type: ai
```

### 環境変数フォールバック

IaC マニフェストに設定がない場合、`ZAI_API_KEY` 環境変数にフォールバック。

### シークレット

`.secrets.json.sample` に `zai` セクションを追加済み。ローカル開発では `.secrets.json` に API キーを記入。

## テストと検証

- `packages/providers/zai/tests/models.rs`: モデル定義の整合性テスト
- `packages/providers/zai/tests/connectivity.rs`: 接続テスト（`#[ignore]` 付き、手動実行用）
- `mise run check`: ワークスペース全体のコンパイルチェック通過済み

## 技術的考慮事項

### Thinking モード

GLM-4.7 は `thinking` パラメータで推論モードを制御可能だが、初期実装では無効としている。既存の Options との互換性を保つため、将来的に Options 拡張を検討。

### Context Caching

Z.AI は Context Caching をサポート。キャッシュされた入力トークンは大幅に安価（glm-4.7: $0.11 vs $0.60 per 1M tokens）。`ZaiPricingProvider` で `cached_input_token_cost` を設定済み。

## 参考資料

- Z.AI Developer Documentation: <https://docs.z.ai/guides/llm/glm-4.7>
- Z.AI Pricing: <https://docs.z.ai/guides/overview/pricing>
- タスクドキュメント: `docs/src/tasks/completed/v0.39.0/add-zai-glm47-provider/task.md`
