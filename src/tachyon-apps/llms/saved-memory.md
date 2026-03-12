---
title: "Saved Memory"
emoji: "🧠"
type: "tech"
topics: ["llms", "agent-chat", "memory"]
published: true
targetFiles:
  - packages/llms/domain/src/saved_memory.rs
  - packages/llms/src/usecase/saved_memory*.rs
  - packages/llms/src/adapter/axum/saved_memory_handler.rs
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/memory/*
github: "https://github.com/quantum-box/tachyon-apps"
---

# Saved Memory

## Overview

Saved Memory は、ユーザーが「覚えて」「remember」などのコマンドで明示的に保存を依頼した情報を永続化し、以降のすべての会話で自動的にシステムプロンプトに注入する機能です。

通常の Memory 機能（会話からの自動抽出・ベクトル検索）とは異なり、ユーザー主導で保存される点が特徴です。

## Use Cases

- ユーザーの好みや設定を記憶する（例: 「私はダークモードが好きなことを覚えて」）
- 重要な事実を保存する（例: 「私はネットワークエンジニアであることを覚えて」）
- プロジェクト固有の用語やルールを記憶する

## Architecture

### Data Flow

```
User Input ("覚えて...")
    ↓
Intent Detector (LLM判定)
    ↓ should_save = true
Saved Memory Bio Tool (LLM抽出)
    ↓ clauses & facts
SavedMemory Entity
    ↓
Database (tachyon_apps_llms.saved_memories)
    ↓
System Prompt Injection (新規リクエスト時)
```

### Key Components

| コンポーネント | 責務 |
|---------------|------|
| `SavedMemory` Entity | ドメインモデル（clause, facts, status, source） |
| `SavedMemoryIntentDetector` | LLMでユーザーの「覚えて」意図を判定 |
| `SavedMemoryBioTool` | LLMで保存すべき情報を抽出（clause/facts形式） |
| `CreateSavedMemory` Usecase | メモリの作成・重複チェック |
| `ListSavedMemories` Usecase | Active/Archivedメモリの一覧取得 |
| `UpdateSavedMemoryStatus` Usecase | ステータス変更（Active↔Archived） |
| `DeleteSavedMemory` Usecase | メモリの完全削除 |

### Domain Model

```rust
pub struct SavedMemory {
    pub id: SavedMemoryId,
    pub tenant_id: TenantId,
    pub user_id: UserId,
    pub clause: String,           // 保存された事実（最大160文字）
    pub clause_hash: String,      // SHA256ハッシュ（重複防止）
    pub raw_facts: Vec<String>,   // 補足情報
    pub status: SavedMemoryStatus,
    pub source: SavedMemorySource,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub enum SavedMemoryStatus {
    Active,    // システムプロンプトに注入される
    Archived,  // 保存されているが注入されない
}

pub enum SavedMemorySource {
    Chat,    // Agent Chat経由で保存
    Manual,  // 管理画面から手動保存
}
```

## API Reference

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/agent/memory` | Active メモリ一覧取得 |
| GET | `/v1/agent/memory?status=archived` | Archived メモリ一覧取得 |
| POST | `/v1/agent/memory` | メモリ作成 |
| POST | `/v1/agent/memory/{id}/archive` | メモリをアーカイブ |
| POST | `/v1/agent/memory/{id}/activate` | メモリをアクティブ化 |
| DELETE | `/v1/agent/memory/{id}` | メモリ削除 |

### Request Headers

```
Authorization: Bearer <token>
x-operator-id: tn_xxxxx (必須)
x-user-id: us_xxxxx (省略可)
```

### Request/Response Examples

**Create Memory:**
```json
POST /v1/agent/memory
{
  "clause": "Prefers TypeScript for all projects",
  "raw_facts": ["Uses strict mode", "Prefers functional patterns"],
  "source": "MANUAL"
}
```

**Response:**
```json
{
  "id": "sm_01xxxxx",
  "clause": "Prefers TypeScript for all projects",
  "raw_facts": ["Uses strict mode", "Prefers functional patterns"],
  "status": "active",
  "source": "manual",
  "created_at": "2026-01-26T10:00:00Z"
}
```

## System Prompt Injection

Active な Saved Memory は、Agent Chat の新規リクエスト時にシステムプロンプトへ自動注入されます。

### 注入フォーマット

```
## USER SAVED MEMORIES

The following information has been explicitly saved by the user. Use these memories to personalize your responses:

• Prefers TypeScript for all projects
• Likes curry dishes
• Prefers dark mode

Important: These are user-confirmed facts. Reference them when relevant to provide personalized assistance.
```

### 制限

- 最大8件まで注入（重要度順）
- 各メモリは160文字以内

## Intent Detection

ユーザーの入力から「覚えて」意図を検出する仕組み。

### LLM判定

```rust
pub struct SavedMemoryIntent {
    pub should_save: bool,      // 保存すべきか
    pub sensitive: bool,        // センシティブ情報か
    pub short_term: bool,       // 短期的な情報か
    pub clauses: Vec<SavedMemoryClause>,
}
```

### フォールバックキーワード

LLM判定に失敗した場合、以下のキーワードでフォールバック：

- "remember that", "remember i am", "save to memory"
- "覚えて", "記憶して"

## UI

### Saved Memory 管理ページ

**URL:** `/v1beta/[tenant_id]/ai/memory`

機能:
- Active/Archived タブ切り替え
- メモリ一覧表示（テーブル形式）
- 手動メモリ作成フォーム
- アーカイブ/アクティブ化/削除アクション

### Agent Chat 統合

**URL:** `/v1beta/[tenant_id]/ai/agent/chat`

- Saved Memory セクションに Active メモリ数を表示
- 「覚えて」コマンドで自動保存
- 保存完了時にトースト通知

## Database

### Table: `tachyon_apps_llms.saved_memories`

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(31) | Primary Key (sm_xxxxx) |
| tenant_id | VARCHAR(31) | テナントID |
| user_id | VARCHAR(31) | ユーザーID |
| clause | VARCHAR(160) | 保存された事実 |
| clause_hash | VARCHAR(64) | SHA256ハッシュ |
| raw_facts | JSON | 補足情報の配列 |
| status | ENUM | active / archived |
| source | ENUM | chat / manual |
| created_at | TIMESTAMP | 作成日時 |
| updated_at | TIMESTAMP | 更新日時 |

### Indexes

- `idx_saved_memories_tenant_user_status` - 一覧取得用
- `uk_saved_memories_tenant_user_hash` - 重複防止

## Auth Actions

| Action | Description |
|--------|-------------|
| `ai_memory:ManageSavedMemory` | Saved Memory の CRUD 操作 |

## Related Documentation

- [Memory (自動抽出・ベクトル検索)](memory.md)
- [Agent API](agent.md)
- Taskdoc: `docs/src/tasks/completed/v0.37.0/agent-chat-saved-memory/`

## Version History

- v0.37.0 (2026-01-26): Initial implementation
  - Agent Chat での「覚えて」コマンド対応
  - LLM ベースの Intent Detection
  - REST API 実装
  - 管理画面 UI 実装
  - システムプロンプト注入
