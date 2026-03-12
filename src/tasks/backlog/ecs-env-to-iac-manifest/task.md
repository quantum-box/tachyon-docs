# ECS タスク定義の API Key 環境変数を IaC マニフェスト/Secrets に移行

## 概要

ECS (quic_streaming.tf) および Lambda (lambda.tf) の tachyon-api タスク定義で、LLM プロバイダーの API Key を環境変数として直接渡している。これを IaC マニフェスト + AWS Secrets Manager 経由に統一する。

## 現状

### ECS (quic_streaming.tf) — ✅ 削除済み
```hcl
# LLM Provider API Keys — now managed via IaC manifests + AWS Secrets Manager
```

### Lambda (lambda.tf - lambda_tachyon_api) — ✅ 削除済み
```hcl
# LLM Provider API Keys — now managed via IaC manifests + AWS Secrets Manager
```

### LlmProviderRegistry — ✅ デフォルト変更済み
- `fallback_to_env` のデフォルトを `true` → `false` に変更
- `with_env_fallback()` メソッドを追加（ローカル開発用に明示的有効化）
- 環境変数フォールバックコード自体は残存（`with_env_fallback()` で有効化可能）

### 問題点
- ~~API Key が Terraform の `var` 経由で平文のまま環境変数に入っている~~
- ~~IaC マニフェスト + Secrets Context で管理する設計が既にあるのに二重管理~~
- ~~ECS タスク定義に追加するたびに terraform apply が必要~~

## あるべき姿

- LLM プロバイダーの認証情報は `IaC マニフェスト` の `$secret_ref` 経由で取得
- AWS Secrets Manager にシークレットを登録
- 環境変数からは API Key を削除
- `LlmProviderRegistry` が IaC → Secrets 経由で自動解決

## 関連ファイル

| ファイル | 説明 |
|---------|------|
| `cluster/n1-aws/quic_streaming.tf` | ECS タスク定義 |
| `cluster/n1-aws/lambda.tf` | Lambda 関数定義 |
| `packages/llms/src/registry/llm_provider_registry.rs` | プロバイダー解決ロジック |
| `apps/tachyon-api/src/di.rs` | プロバイダー初期化 |
| `scripts/seeds/n1-seed/003-iac-manifests.yaml` | IaC マニフェスト定義 |

## タスク

- [x] ECS/Lambda から API Key 環境変数を削除
- [x] IaC マニフェスト (system-config テナント) に全プロバイダーの `$secret_ref` を設定
- [x] AWS Secrets Manager に対応するシークレットを登録
- [x] `LlmProviderRegistry` の環境変数フォールバックをデフォルト無効化
- [x] `sensitive_fields.rs` に xai, zai を追加
- [ ] terraform apply で環境変数なしで起動確認
- [ ] tachyon prod-config のプレーンテキスト → `$secret_ref` の seed を本番 DB に投入

## 進捗

### 2026-01-31: terraform 環境変数削除 + コード側フォールバック無効化

**terraform 変更** (Claude Code Tool Job で実行):
- `quic_streaming.tf`: ECS タスク定義から 4 つの API Key 環境変数を削除
- `lambda.tf`: Lambda `lambda_tachyon_api` から 4 つの API Key 環境変数を削除
- 両ファイルとも `# LLM Provider API Keys — now managed via IaC manifests + AWS Secrets Manager` コメントに置換

**コード変更**:
- `llm_provider_registry.rs`: `fallback_to_env` のデフォルトを `false` に変更
- `with_env_fallback()` メソッドを追加（ローカル開発時に明示的有効化可能）
- `di.rs` は変更不要（`LlmProviderRegistry::new()` のデフォルトに従う）

**注意**: terraform 変数定義（`var.openai_api_key` 等）は GitHub Actions secrets や Amplify でまだ使われているため残存。

### 2026-01-31: IaC マニフェスト + Secrets Manager 設定

**IaC マニフェスト変更** (`003-iac-manifests.yaml`):
- system-config に `xai` プロバイダーの `$secret_ref` を追加
- tachyon prod-config のプレーンテキスト（hubspot, payment）を `$secret_ref` に変更

**sensitive_fields.rs**:
- `xai` と `zai` を AI providers に追加

**AWS Secrets Manager 登録**:
- `tn_01jcjtqxah6mhyw4e5mahg02nd/providers/xai` — xAI API Key
- `tn_01jcjtqxah6mhyw4e5mahg02nd/providers/zai` — Z.AI API Key
- `tn_01hjjn348rn3t49zz6hvmfq67p/providers/hubspot` — HubSpot Private App Token
- `tn_01hjjn348rn3t49zz6hvmfq67p/providers/payment` — Stripe API Key + Publishable Key

### 2026-01-31: ローカル動作確認 ✅

`mise run up-tachyon` で `fallback_to_env=false` の状態での起動を確認:
- IaC マニフェスト + `.secrets.json` 経由で全プロバイダーの `$secret_ref` が正常解決
- tachyon-api が正常起動（Health/GraphQL/REST すべて応答）
- LLM API Key 環境変数なしで問題なく動作

**残作業**:
- terraform apply で ECS 環境変数なしのデプロイ確認（次回 apply 時に反映）
- seed を本番 DB に投入して IaC マニフェストの `$secret_ref` を有効化
