# Web Search / URL Fetch Tool Access Control

## Overview

Agent APIに外部リソースアクセス用のツール（Web検索、URLスクレイピング）とそのアクセス制御機能を追加。`tool_access`設定で個別に有効/無効を切り替え可能。

## Features

### 1. Web Search Tool (`search_with_llm`)

Google Custom Search APIを使用してWeb検索を実行するツール。

**機能:**
- 任意のキーワードでWeb検索
- 検索結果（タイトル、スニペット、URL）を構造化して返却
- LLMが検索結果を解釈して回答生成に活用

**API設定:**
- プロバイダー設定: IaCマニフェストの`providers[].provider_type: search`
- 必要なconfig: `api_key`, `cx`（Search Engine ID）

### 2. URL Fetch Tool (`url_fetch`)

Firecrawl APIを使用してURLからコンテンツを取得するツール。

**機能:**
- 指定URLのコンテンツをスクレイピング
- Markdown形式でコンテンツを返却
- ページのメタデータ（タイトル、description等）も取得

**API設定:**
- プロバイダー設定: IaCマニフェストの`providers[].provider_type: web_scraper`
- 必要なconfig: `api_key`

## Tool Access Configuration

### REST API

```yaml
POST /v1/llms/chatrooms/:id/agent/execute
{
  "task": "最新のRust 1.80の変更点を調べてください",
  "tool_access": {
    "filesystem": true,
    "command": false,
    "coding_agent_job": false,
    "agent_protocol": true,
    "web_search": true,    # Web検索ツールを有効化
    "url_fetch": true       # URLフェッチツールを有効化
  }
}
```

### Default Values

| フィールド | デフォルト | 説明 |
|-----------|-----------|------|
| `web_search` | `false` | セキュアデフォルト（明示的に有効化が必要） |
| `url_fetch` | `false` | セキュアデフォルト（明示的に有効化が必要） |

### ToolAccessConfig (Rust)

```rust
pub struct ToolAccessConfig {
    pub filesystem: bool,
    pub command: bool,
    pub coding_agent_job: bool,
    pub agent_protocol: bool,
    pub web_search: bool,
    pub url_fetch: bool,
}

impl ToolAccessConfig {
    pub fn web_search_disabled(&self) -> bool {
        !self.web_search
    }

    pub fn url_fetch_disabled(&self) -> bool {
        !self.url_fetch
    }
}
```

## Provider Configuration

### IaC Manifest Setup

プロバイダー設定はIaCマニフェスト（`tachyon_apps_iac.manifests`）で管理：

```yaml
# テナント固有の設定
apiVersion: v1
kind: ProjectConfig
metadata:
  name: my-tenant-config
  tenant_id: tn_xxxxxxxxxxxxxxxxxxxx
spec:
  providers:
    # Google Custom Search
    - name: google_custom_search
      provider_type: search
      config:
        api_key: "your-google-api-key"
        cx: "your-search-engine-id"

    # Firecrawl
    - name: firecrawl
      provider_type: web_scraper
      config:
        api_key: "your-firecrawl-api-key"
```

### System Tenant Fallback

テナント固有の設定がない場合、システムテナント（`tn_system`）の設定にフォールバック：

1. **優先順位**:
   1. 現在のOperator/Platformテナントの設定
   2. システムテナント（`tn_system`）の設定
   3. 環境変数（レガシー互換）

2. **システムテナント設定例**:
```yaml
apiVersion: v1
kind: ProjectConfig
metadata:
  name: system-default-config
  tenant_id: tn_system
spec:
  providers:
    - name: google_custom_search
      provider_type: search
      config:
        api_key: "${GOOGLE_CUSTOM_SEARCH_API_KEY}"
        cx: "${GOOGLE_CUSTOM_SEARCH_CX}"
    - name: firecrawl
      provider_type: web_scraper
      config:
        api_key: "${FIRECRAWL_API_KEY}"
```

## Architecture

### Provider Packages

```
packages/providers/
├── google_cloud/           # Google Cloud サービス
│   └── src/
│       ├── custom_search/  # Google Custom Search API クライアント
│       │   ├── mod.rs
│       │   └── client.rs
│       └── lib.rs
└── firecrawl/              # Firecrawl API
    └── src/
        ├── client.rs       # Firecrawl クライアント実装
        └── lib.rs
```

### Tool Handler Flow

```
Agent Execute Request
        │
        ▼
┌──────────────────────┐
│  ToolAccessConfig    │
│  web_search: true    │
│  url_fetch: true     │
└──────────────────────┘
        │
        ▼
┌──────────────────────┐
│  System Prompt       │
│  (ツール定義を含む)   │
└──────────────────────┘
        │
        ▼
┌──────────────────────┐
│  LLM (Claude等)      │
│  Tool Call生成       │
└──────────────────────┘
        │
        ▼
┌──────────────────────┐     ┌─────────────────────┐
│  DefaultToolExecutor │ ──▶ │  ProviderRegistry   │
│  search_with_llm     │     │  (IaC/System/Env)   │
│  url_fetch           │     └─────────────────────┘
└──────────────────────┘              │
        │                             ▼
        │                    ┌─────────────────────┐
        │                    │  Google Custom      │
        │                    │  Search API         │
        │                    │  or Firecrawl API   │
        │                    └─────────────────────┘
        ▼
┌──────────────────────┐
│  Tool Result         │
│  (検索結果/ページ内容) │
└──────────────────────┘
```

## Frontend Integration

### Agent Chat Settings

AI Studioのエージェントチャット画面でツールアクセスを設定可能：

| 設定項目 | 説明 |
|---------|------|
| Web検索 | Google Custom Searchによるインターネット検索 |
| URLスクレイピング | 指定URLのコンテンツ取得（Firecrawl） |

### UI Location

`apps/tachyon/src/app/v1beta/[tenant_id]/ai/agent/chat/client.tsx`

設定パネルの「ツールアクセス」セクションにトグルUIを配置。

## Security Considerations

1. **デフォルト無効**: `web_search`/`url_fetch`はデフォルトで`false`
2. **APIキー管理**: IaCマニフェストで安全に管理
3. **レート制限**: プロバイダーAPIのレート制限に従う
4. **コスト管理**: 外部API呼び出しはコストが発生するため、明示的な有効化が必要

## Related Documentation

- Taskdoc: `docs/src/tasks/completed/v0.32.0/add-web-search-tool-access/`
- Tool Access Config: `packages/llms/src/agent/tool_access.rs`
- IaC Configuration: `packages/iac/src/`

## Version History

- v0.32.0 (2026-01-18): Web Search / URL Fetch ツールアクセス制御を追加
