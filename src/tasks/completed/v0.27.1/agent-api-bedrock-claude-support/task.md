# Agent API Bedrock Claude 4.5対応

## 概要

Agent APIでAWS Bedrock経由のClaude 4.5シリーズ（Sonnet/Haiku）を利用可能にする。

## 背景

- `packages/providers/aws/src/bedrock/` にBedrockプロバイダーは実装済み
- `ChatStreamProviderV2` トレイトを実装しストリーミング対応済み
- しかしAgent APIでの利用にはいくつかの課題がある

## 現状の課題（解決済み ✅）

### 1. モデル自動検出の問題 ✅
`model_provider_selector.rs` の自動検出ロジック:
- `claude-*` → `anthropic` に振り分け
- `anthropic.claude-*` → `bedrock` に振り分け

**解決策**: ユーザーが `bedrock/claude-4-5-sonnet` のように明示的にプロバイダーを指定すれば正しく動作する。

### 2. フレンドリーなモデル名エイリアスがない ✅
**解決策**: `packages/providers/aws/src/bedrock/models.rs` に `resolve_model_alias()` 関数を追加。

### 3. 課金計算の対応確認 ✅
**解決策**: `packages/catalog/src/usecase/find_product_by_name.rs` にBedrockモデルのマッピングを追加。

## タスク一覧

- [x] Bedrockプロバイダーの登録確認（di.rs）
- [x] フレンドリーモデル名の追加（`bedrock/claude-4-5-sonnet` など）
- [x] model_provider_selector のエイリアス解決対応
- [x] Catalog価格設定の確認・追加
- [x] 品質チェック実行（mise run docker-check / mise run docker-ci ✅）
- [x] ドキュメント更新

## 実装内容

### 1. モデルエイリアス機能 (`packages/providers/aws/src/bedrock/models.rs`)

```rust
pub fn resolve_model_alias(model_name: &str) -> String {
    match model_name.to_lowercase().as_str() {
        // Claude 4.5 Sonnet aliases
        "claude-4-5-sonnet" | "claude-sonnet-4-5" | "claude-sonnet" | "sonnet" 
            => CLAUDE_4_5_SONNET.to_string(),
        // Claude 4.5 Haiku aliases
        "claude-4-5-haiku" | "claude-haiku-4-5" | "claude-haiku" | "haiku" 
            => CLAUDE_4_5_HAIKU.to_string(),
        // Full model ID passthrough
        _ => model_name.to_string(),
    }
}
```

### 2. ストリーミング処理でのエイリアス解決 (`packages/providers/aws/src/bedrock/stream_v2.rs`)

`chat_stream_v2()` メソッド内で `resolve_model_alias()` を呼び出し、フレンドリー名を実際のモデルIDに変換。

### 3. Catalog価格マッピング (`packages/catalog/src/usecase/find_product_by_name.rs`)

- `("bedrock", "claude-4-5-sonnet")` → `pd_01jy5ms9fe9ka6ht7vhvwanzqr`（Sonnet価格）
- `("bedrock", "claude-haiku")` → `pd_01k7pap5smcbdhyv4tjaqhv80y`（Haiku価格）
- 正規化関数に `bedrock/`、`global.`、`anthropic.` プレフィックス除去を追加

## 技術仕様

### モデル名エイリアス

| ユーザー指定 | 実際のモデルID |
|-------------|----------------|
| `bedrock/claude-4-5-sonnet` | `global.anthropic.claude-sonnet-4-5-20250929-v1:0` |
| `bedrock/claude-4-5-haiku` | `global.anthropic.claude-haiku-4-5-20251001-v1:0` |
| `bedrock/claude-sonnet` | （エイリアス、最新Sonnetへ） |
| `bedrock/claude-haiku` | （エイリアス、最新Haikuへ） |
| `bedrock/sonnet` | 最新Sonnetへ |
| `bedrock/haiku` | 最新Haikuへ |

### API使用例

```bash
# Agent API でBedrock Claudeを使用
curl -X POST http://localhost:50054/v1/llms/chatrooms/{id}/agent/execute \
  -H "Authorization: Bearer dummy-token" \
  -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Hello, world!",
    "model": "bedrock/claude-4-5-sonnet",
    "auto_approve": true,
    "max_requests": 1
  }'
```

## Catalogプロダクト追加とUI対応（2026-01-05追記）

### 問題
Agent ChatのUIドロップダウンにBedrockモデルが表示されなかった。

### 原因
`GetSupportedModels` usecaseは以下の2つのソースを照合してモデルを返す:
1. プロバイダーの `get_supported_models()` が返すモデル一覧
2. Catalogの `product_usage_pricing` テーブルにある `service_type: agent_api` のエントリ

モデルIDの形式が一致しなければフィルタで除外される:
- プロバイダー: `bedrock/global.anthropic.claude-sonnet-4-5-20250929-v1:0`
- Catalog: `model: claude-4-5-sonnet`

### 解決策
1. **シードデータの追加** (`scripts/seeds/n1-seed/005-order-products.yaml`):
   - Bedrock Claude 4.5 Sonnet用プロダクト・価格設定
   - Bedrock Claude 4.5 Haiku用プロダクト・価格設定

2. **モデルIDの修正** (`packages/providers/aws/src/bedrock/stream_v2.rs`):
   ```rust
   // Before: id: format!("bedrock/{}", model_names::CLAUDE_4_5_SONNET)
   // After: ユーザーフレンドリーなエイリアス
   id: "bedrock/claude-4-5-sonnet".to_string()
   ```
   実際のBedrock API呼び出し時は `resolve_model_alias()` で完全なモデルIDに変換される。

3. **Agent機能フラグの追加**:
   `SupportedFeature::Agent` を両モデルに追加。これによりAgent APIで利用可能なモデルとして認識される。

### 確認結果
- APIが6モデルを返すことを確認 (`bedrock/claude-4-5-sonnet`, `bedrock/claude-4-5-haiku` を含む)
- フロントエンドのドロップダウンでBedrockモデルが選択可能

## 関連ファイル

- `apps/tachyon-api/src/di.rs` - プロバイダー登録 ✅
- `packages/llms/src/usecase/model_provider_selector.rs` - モデル解決 ✅
- `packages/llms/src/usecase/get_supported_models.rs` - サポートモデル取得 ✅
- `packages/llms/src/usecase/execute_agent.rs` - Agent実行
- `packages/providers/aws/src/bedrock/models.rs` - モデルエイリアス ✅
- `packages/providers/aws/src/bedrock/stream_v2.rs` - ストリーミング処理・モデル定義 ✅
- `packages/catalog/src/usecase/find_product_by_name.rs` - 価格マッピング ✅
- `scripts/seeds/n1-seed/005-order-products.yaml` - Bedrockプロダクトシード ✅

## 作成日

2026-01-05

## 完了日

2026-01-05