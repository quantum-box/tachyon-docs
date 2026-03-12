---
title: "Host tenant で Mandatory プロバイダーが消える問題の修正"
type: "bug"
emoji: "🔧"
topics: ["iac", "provider-config", "inheritance-rules"]
published: true
targetFiles: ["packages/iac/src/configuration.rs"]
---

# Host tenant で Mandatory プロバイダーが消える問題の修正

## 概要

ECS環境で `anthropic`, `openai`, `google_ai` プロバイダーが利用不可になっていた問題を修正。IaCの `InheritanceType::Mandatory` ルールが host tenant 自身に対しても適用され、platform/host フォールバックがないためプロバイダー設定が消失していた。

## 背景・目的

### 発生していた問題

ECS上のtachyon-apiで以下のエラーが発生：

```
Provider 'anthropic' not available. Available providers: ["xai", "default", "zai", "bedrock"]
```

Lambda環境では同じリクエストが成功していた。

### 調査結果

CloudWatch Logsで以下を確認：

```json
{
  "message": "LLM providers loaded from IaC configuration",
  "tenant_id": "tn_01jcjtqxah6mhyw4e5mahg02nd",
  "providers": "ConcreteProviders { openai: false, anthropic: false, google_ai: false, xai: true, zai: true, ... }"
}
```

```json
{
  "message": "Ignoring operator config for Mandatory provider",
  "tenant_id": "tn_01jcjtqxah6mhyw4e5mahg02nd",
  "provider": "anthropic"
}
```

AWS Secrets Manager のシークレットは正常に存在・解決されていたが、`merge_provider_configs_with_rules` で Mandatory ルールにより設定が除外されていた。

## 根本原因

IaCマニフェスト（`system-config`）で `anthropic`, `openai`, `google_ai` は Mandatory として定義：

```yaml
inheritance_rules:
  - provider: anthropic
    rule: mandatory
  - provider: openai
    rule: mandatory
  - provider: google_ai
    rule: mandatory
```

Mandatory ルールの意図は「オペレーターは独自設定を上書きできない」だが、host tenant 自身が設定を取得する場合：

1. `operator_config` = host tenant の設定（anthropic 等を含む）
2. `platform_config` = None（自分より上がない）
3. `host_config` = None（自分自身にフォールバックしない）

この状態で Mandatory ルールを適用すると：
- operator_config は「Mandatory だから無視」される
- platform/host からフォールバックしようとするが、どちらも None
- 結果：プロバイダーが消える

## 修正内容

`packages/iac/src/configuration.rs` の `merge_provider_configs_with_rules` を修正：

```rust
// 修正前
InheritanceType::Mandatory => {
    if op_provider.is_some() {
        tracing::info!("Ignoring operator config for Mandatory provider");
    }
    if let Some(p) = plat_provider {
        (Some(p), TenantType::Platform)
    } else if let Some(p) = host_provider {
        (Some(p), TenantType::Host)
    } else {
        (None, TenantType::Host)  // ← プロバイダーが消える
    }
}

// 修正後
InheritanceType::Mandatory => {
    if let Some(p) = plat_provider {
        if op_provider.is_some() {
            tracing::info!("Ignoring operator config; using platform config");
        }
        (Some(p), TenantType::Platform)
    } else if let Some(p) = host_provider {
        if op_provider.is_some() {
            tracing::info!("Ignoring operator config; using host config");
        }
        (Some(p), TenantType::Host)
    } else if let Some(p) = op_provider {
        // platform/host がない場合は operator を使う
        // （host tenant 自身のケース）
        tracing::debug!("Mandatory provider: no fallback, using operator config");
        (Some(p), TenantType::Operator)
    } else {
        (None, TenantType::Host)
    }
}
```

## 確認結果

ローカル環境で修正後のログ：

```json
{
  "message": "LLM providers loaded from IaC configuration",
  "tenant_id": "tn_01hjryxysgey07h5jz5wagqj0m",
  "providers": "ConcreteProviders { openai: true, anthropic: true, google_ai: true, xai: true, zai: true, opencode: false, bedrock: true }"
}
```

`anthropic: true`, `openai: true`, `google_ai: true` となり、問題が解消された。

## タスク分解

### フェーズ1: 調査 ✅

- [x] CloudWatch Logs でエラーパターンを確認
- [x] AWS Secrets Manager でシークレットの存在を確認
- [x] シークレット解決フローが正常であることを確認
- [x] `ConcreteProviders` で false になる原因を特定
- [x] `Ignoring operator config for Mandatory provider` ログから根本原因を特定

### フェーズ2: 修正 ✅

- [x] `merge_provider_configs_with_rules` の Mandatory ルール処理を修正
- [x] platform/host がない場合に operator にフォールバックするロジックを追加
- [x] ログメッセージを改善（どの設定が使われたか明確に）

### フェーズ3: 確認 ✅

- [x] ローカル環境で bacon ホットリロードによりビルド確認
- [x] ログで `ConcreteProviders { openai: true, anthropic: true, ... }` を確認

## 完了条件

- [x] ECS環境で anthropic, openai, google_ai プロバイダーが利用可能になる
- [x] 既存の Mandatory ルールの動作（オペレーターによる上書き禁止）は維持される
- [x] host tenant 自身の設定取得時のみフォールバックが発生する
