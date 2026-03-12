# Z.AI GLM-4.7 プロバイダー追加

## 概要

Z.AI（Zhipu AI）の GLM-4.7 モデルをLLMプロバイダーとして追加する。

## 背景

- Z.AI は 2025年12月に GLM-4.7 をリリース
- Mixture-of-Experts（MoE）アーキテクチャ: 355B 総パラメータ、32B アクティブ
- 200K トークンコンテキスト、最大 128K 出力
- コーディングおよびエージェントワークフローに最適化
- OpenAI 互換 API フォーマット

## API 仕様

### エンドポイント

```
https://api.z.ai/api/paas/v4/chat/completions
```

### 認証

Bearer token 認証:
```
Authorization: Bearer YOUR_API_KEY
```

### リクエストフォーマット

```json
{
  "model": "glm-4.7",
  "messages": [{"role": "user", "content": "..."}],
  "thinking": {"type": "enabled"},
  "max_tokens": 4096,
  "temperature": 0.7,
  "stream": true
}
```

### モデル一覧

| モデル | コンテキスト | 最大出力 | 特徴 |
|--------|-------------|----------|------|
| glm-4.7 | 200K | 128K | フラッグシップ、推論モード対応 |
| glm-4.7-flashx | 200K | 128K | 高速バリアント |
| glm-4.7-flash | 200K | 128K | 無料モデル |

## 料金（per 1M tokens）

| モデル | Input | Cached | Output |
|--------|-------|--------|--------|
| glm-4.7 | $0.60 | $0.11 | $2.20 |
| glm-4.7-flashx | $0.07 | $0.01 | $0.40 |
| glm-4.7-flash | Free | Free | Free |

### NanoDollar 変換（per token）

| モデル | Input | Cached | Output |
|--------|-------|--------|--------|
| glm-4.7 | 600 | 110 | 2,200 |
| glm-4.7-flashx | 70 | 10 | 400 |
| glm-4.7-flash | 0 | 0 | 0 |

## 実装計画

### Phase 1: プロバイダークレート作成

- [x] `packages/providers/zai/` ディレクトリ作成
- [x] `Cargo.toml` 作成（xai を参考）
- [x] `src/lib.rs` - メインモジュール、`Zai` 構造体
- [x] `src/ai_models.rs` - モデル定義
- [x] `src/chat.rs` - チャット実装
- [x] `src/pricing.rs` - `ZaiPricingProvider` 実装
- [x] `src/provider_info.rs` - `ZaiProviderInfo` 実装

### Phase 2: LLMProvider 統合

- [x] `LLMProvider` トレイト実装
- [x] `ChatProvider` トレイト実装
- [x] `ChatStreamProviderV2` トレイト実装

### Phase 3: レジストリ統合

- [x] `packages/llms/src/registry/llm_provider_registry.rs` に追加
  - `ExtractedAiConfigs` に `zai` フィールド追加
  - `extract_ai_configs` で "zai" をハンドリング
  - `create_zai_provider` メソッド追加
  - `ConcreteProviders` に `zai` フィールド追加
- [x] 環境変数フォールバック: `ZAI_API_KEY`

### Phase 4: Pricing Registry 統合

- [x] `apps/tachyon-api/src/di.rs` に `ZaiPricingProvider` 追加

### Phase 5: IaC 設定対応

- [x] `scripts/seeds/n1-seed/003-iac-manifests.yaml` に設定例追加
  ```yaml
  - config:
      api_key:
        $secret_ref: zai/api_key
    name: zai
    provider_type: ai
  ```
- [x] `.secrets.json.sample` に zai シークレット追加

### Phase 6: テスト

- [x] ユニットテスト追加 (`tests/models.rs`, `tests/connectivity.rs`)
- [x] 接続テスト追加（`#[ignore]` 付き、手動実行用）
- [x] `mise run check` 確認 - 警告なしで通過
- [ ] シナリオテスト（任意）

### Phase 7: ドキュメント

- [x] taskdoc 進捗更新
- [ ] CLAUDE.md に LLMプロバイダー設定セクション更新（任意）
- [ ] NanoDollar 料金表に GLM-4.7 追加（任意）

## 参考ファイル

### 既存プロバイダー実装（xai を参考）

- `packages/providers/xai/src/lib.rs`
- `packages/providers/xai/src/ai_models.rs`
- `packages/providers/xai/src/chat.rs`
- `packages/providers/xai/src/pricing.rs`
- `packages/providers/xai/src/provider_info.rs`

### レジストリ

- `packages/llms/src/registry/llm_provider_registry.rs`
- `packages/llms/src/registry/model_registry.rs`

## 技術的考慮事項

### OpenAI 互換 API

Z.AI API は OpenAI 互換フォーマットを採用しているため、xAI と同様のリクエスト/レスポンス構造を使用できる。

### Thinking モード

GLM-4.7 は `thinking` パラメータで推論モードを制御可能:
- `{"type": "enabled"}` - 推論を有効化
- `{"type": "disabled"}` - 推論を無効化

初期実装では無効（既存の Options と互換性を保つため）とし、将来的に Options 拡張を検討。

### Context Caching

Z.AI は Context Caching をサポート。キャッシュされた入力トークンは大幅に安価（$0.11/1M vs $0.60/1M）。
PricingProvider で `cached_input_token_cost` を設定。

## 進捗

| Phase | Status | Notes |
|-------|--------|-------|
| 1 | ✅ 完了 | プロバイダークレート作成 |
| 2 | ✅ 完了 | LLMProvider/ChatProvider/ChatStreamProviderV2 実装 |
| 3 | ✅ 完了 | レジストリ統合（llm_provider_registry.rs） |
| 4 | ✅ 完了 | Pricing Registry 統合（di.rs） |
| 5 | ✅ 完了 | IaC 設定対応（シークレット参照） |
| 6 | ✅ 完了 | テスト（mise run check 通過） |
| 7 | ✅ 完了 | ドキュメント更新 |

## 実装ファイル一覧

### 新規作成

- `packages/providers/zai/Cargo.toml`
- `packages/providers/zai/src/lib.rs`
- `packages/providers/zai/src/ai_models.rs`
- `packages/providers/zai/src/chat.rs`
- `packages/providers/zai/src/pricing.rs`
- `packages/providers/zai/src/provider_info.rs`
- `packages/providers/zai/tests/models.rs`
- `packages/providers/zai/tests/connectivity.rs`

### 変更

- `packages/llms/Cargo.toml` - zai 依存追加
- `packages/llms/src/registry/llm_provider_registry.rs` - zai プロバイダー対応
- `apps/tachyon-api/Cargo.toml` - zai 依存追加
- `apps/tachyon-api/src/di.rs` - LLMProviders, ChatStreamProviders, ProviderInfo, Pricing 統合
- `scripts/seeds/n1-seed/003-iac-manifests.yaml` - zai 設定追加
- `.secrets.json.sample` - zai シークレットサンプル追加

## 参考リンク

- [Z.AI Developer Documentation](https://docs.z.ai/guides/llm/glm-4.7)
- [Z.AI Pricing](https://docs.z.ai/guides/overview/pricing)
- [GLM-4.7 Blog](https://z.ai/blog/glm-4.7)
- [HuggingFace Model](https://huggingface.co/zai-org/GLM-4.7)
- [OpenRouter GLM-4.7](https://openrouter.ai/z-ai/glm-4.7)
