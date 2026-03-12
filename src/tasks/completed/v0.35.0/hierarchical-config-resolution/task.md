# 階層的設定解決とUI可視化

## ステータス: ✅ 完了

## 概要

プロバイダー設定を階層的に解決する機能を実装し、フロントエンドで設定の継承関係を可視化するUIを作成する。

## 背景

- 各テナントに同じプロバイダー設定（OpenAI, Anthropic, Tavily等）を繰り返し定義するのは非効率
- system-configをグローバルデフォルトとして、テナント固有の設定で上書きできる仕組みが必要
- 設定がどこから継承されているか可視化することで運用が容易になる

## 設計

### 設定解決の階層

```
1. Operator の ProjectConfig（テナント固有）
   ↓ なければ
2. System-config（グローバルデフォルト: tn_01jcjtqxah6mhyw4e5mahg02nd）
   ↓ なければ
3. エラー
```

### プロバイダーのマージルール

- Operator設定が優先
- Operatorに存在しないプロバイダーはsystem-configから継承
- `defined_at` フィールドで設定の出所を追跡（`Operator` or `Host`）

## 実装状況

### Phase 1: バックエンド実装 ✅

- [x] `SYSTEM_TENANT_ID` 定数追加
- [x] `IacConfigurationProvider` に `system_tenant_id` フィールド追加
- [x] `get_host_defaults()` 実装 - system-configを取得
- [x] `get_tenant_config_only()` 追加 - フォールバックなしでテナント設定を取得
- [x] `merge_provider_configs()` 追加 - 設定をマージ
- [x] `get_config()` を階層的解決に対応
- [x] AWS Secrets Manager に system-config 用 Tavily シークレット登録
- [x] コンパイル確認
- [x] 動作確認

### Phase 2: フロントエンドUI ✅

- [x] IAC設定ページに設定継承ツリーを表示（ConfigInheritanceTree コンポーネント）
- [x] 各プロバイダーの `defined_at` を視覚的に表示（Badge + Tooltip）
- [x] system-configから継承されているプロバイダーを区別して表示
- [x] GraphQL API `providerConfigHierarchy` 実装
- [x] i18n対応（EN/JA）

## 技術詳細

### 変更ファイル

**バックエンド:**
- `packages/iac/src/configuration.rs` - 階層的設定解決の実装

**フロントエンド（予定）:**
- `apps/tachyon/src/app/v1beta/[tenant_id]/settings/iac/` - IAC設定UI

### API変更

`ProviderItem` に `defined_at` フィールドを追加済み：

```rust
pub struct ProviderItem {
    pub name: String,
    pub provider_type: String,
    pub config: Value,
    pub encrypted: bool,
    pub defined_at: Option<TenantType>, // Operator | Host
}
```

## テスト

- [x] コンパイル確認（mise run check）
- [x] 起動確認（docker compose up）
- [x] ログでフォールバック動作確認
- [x] Agent APIでweb_searchが動作することを確認
- [x] フロントエンドUIの動作確認（Playwright MCP）

## 関連

- Tavily統合タスク
- Secrets管理機能
