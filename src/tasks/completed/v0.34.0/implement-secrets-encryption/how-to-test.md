# secrets コンテキスト動作確認手順

## 前提条件

- Docker環境が起動していること (`mise run docker-up`)
- 開発用データベースにシードが投入されていること

## 1. ローカル環境セットアップ

```bash
# .secrets.json.sample をコピー
cp .secrets.json.sample .secrets.json

# .secrets.json を編集して開発用APIキーを設定
# 例:
# {
#   "tn_01hjryxysgey07h5jz5wagqj0m/providers/stripe": {
#     "secret_key": "sk_test_xxx",
#     "webhook_secret": "whsec_xxx"
#   },
#   "global/openai": {
#     "api_key": "sk-xxx"
#   }
# }
```

## 2. バックエンド起動確認

```bash
mise run dev-backend
```

**確認ポイント**:
- SecretsApp が初期化されること（ログに `.secrets.json` 読み込みが出る、または警告が出る）
- HubSpot/Stripe クライアント初期化が成功すること（エラーで終了しないこと）

## 3. シークレット取得の動作確認

### 3.1 LLMプロバイダーのAPIキー取得

`apps/tachyon-api/src/di.rs` の `get_api_key_with_fallback()` が以下の順序で動作することを確認:

1. SecretsApp から `global/{provider}` パスで取得を試行
2. 失敗時は環境変数にフォールバック

**確認方法**:
- `.secrets.json` に `global/openai` を設定 → OpenAI APIキーがシークレットから取得される
- `.secrets.json` から削除 → 環境変数 `OPENAI_API_KEY` から取得される

### 3.2 テナント別プロバイダーシークレット

```bash
# HubSpotクライアントがシークレットからAPIキーを取得するか確認
# IacConfigurationProvider経由でStripe設定が解決されるか確認
```

## 4. IAC マニフェスト連携確認

### 4.1 保存時の $secret_ref 置換

**シナリオ**: マニフェスト保存時に平文シークレットが `$secret_ref` に置換される

1. GraphQL または REST API でマニフェストを保存
2. DBに保存されたマニフェストを確認
3. 機密フィールドが `{"$secret_ref": "stripe/api_key"}` 形式になっていること

### 4.2 読込時のシークレット解決

**シナリオ**: `IacConfigurationProvider.get_config()` が `$secret_ref` を実際の値に解決する

1. DB上のマニフェストに `$secret_ref` が含まれている状態で
2. `IacConfigurationProvider.get_config()` を呼び出す
3. 返却される `ProviderConfiguration` に実際のAPIキーが含まれていること

### 4.3 平文シークレット拒否

**シナリオ**: `SecretExtractor` が `None` の状態で平文シークレットを保存しようとするとエラー

```
Error: "Plaintext secrets are not allowed. Found in: {provider/field}.
Use $secret_ref format or configure secrets extraction."
```

## 5. 移行ツールの動作確認

```bash
# ドライラン（変更なし、移行対象のスキャンのみ）
cargo run -p iac --example secret_migration -- --dry-run tn_01hjryxysgey07h5jz5wagqj0m

# 出力例:
# Scanning manifests for tenant: tn_01hjryxysgey07h5jz5wagqj0m
# Found 2 manifests with plaintext secrets
# - default (ProjectConfig): stripe/api_key, stripe/webhook_secret
# - hubspot-config (ProjectConfig): hubspot/api_key
```

## 6. 確認チェックリスト

- [ ] `.secrets.json` セットアップ後に `mise run dev-backend` が起動する
- [ ] HubSpot/Stripe クライアント初期化が成功する
- [ ] LLMプロバイダーのAPIキーがシークレット→環境変数の順で取得される
- [ ] マニフェスト保存時に平文シークレットが `$secret_ref` に置換される
- [ ] マニフェスト読込時に `$secret_ref` が実際の値に解決される
- [ ] 移行ツールのドライランが正常に動作する

## トラブルシューティング

### `.secrets.json not found` 警告が出る

開発環境では警告のみで処理続行。シークレットが必要な場合は環境変数にフォールバックする。

### `SecretNotFound` エラー

1. `.secrets.json` のパス形式を確認（`{tenant_id}/providers/{provider}` または `global/{name}`）
2. JSON構造を確認（`{"api_key": "xxx"}` 形式）

### AWS Secrets Manager 接続エラー（本番/Staging）

1. AWS認証情報の確認（`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`）
2. IAMポリシーの確認（`secretsmanager:GetSecretValue` 権限）
3. リージョン設定の確認（`AWS_REGION`）
