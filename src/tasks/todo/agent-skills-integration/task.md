---
title: "Agent Skills 統合機能の実装"
type: feature
emoji: "🎯"
topics:
  - Agent Skills
  - Tachyon Agent
  - LLM
  - Sub Agent
  - System Prompt
published: true
targetFiles:
  - packages/llms/src/usecase/execute_agent.rs
  - packages/llms/src/usecase/command_stack/system_prompt.rs
  - packages/llms/src/agent/tool/sub_agent.rs
  - packages/llms/src/agent/system_prompt.rs
  - packages/llms/src/agent/tool_access.rs
github: https://github.com/quantum-box/tachyon-apps
---

# Agent Skills 統合機能の実装

## 概要

Tachyon Agent に Agent Skills 標準を導入し、エージェントがタスクに応じて適切なスキルを自動的に発見・適用できるようにする。**実装済みの `execute_sub_agent` ツールを活用し、スキルごとに専門化された子エージェントをスポーンすることで、スキルの実行を実現する。**

Agent Skills は Anthropic が開発したオープンスタンダードで、エージェントに新しい能力や専門知識を提供するためのモジュール形式の拡張機能。

## 背景・目的

### 現状の課題

- Tachyon Agent は現在、システムプロンプトと `user_custom_instructions` で指示を提供しているが、再利用可能な知識パッケージの仕組みがない
- ドメイン固有の知識やワークフローを各エージェント実行ごとに手動で指定する必要がある
- 組織やチーム固有の手順やベストプラクティスをエージェントに伝える標準的な方法がない
- スキルをファイルシステムに保存する従来の方法では、バージョン管理や共有が困難

### 実装済みの基盤: Sub Agent機能

`feat/agent-sub-agent` ブランチで以下が実装済み:

- **`execute_sub_agent` ツール**: 親エージェントから子エージェントをスポーンし、結果を受け取る同期実行ツール
- **`ToolAccessConfig.sub_agent`**: sub-agent有効化フラグ
- **再帰深度制限**: 子エージェントは更にsub-agentを呼べない（1段制限）
- **Billing統合**: 子エージェントのコストは親のexecutionに加算
- **OnceLockベースの自己参照DI**: `ExecuteAgent` が自身をsub-agent実行器として登録

### 期待される成果・メリット

- **再利用性**: 一度作成したスキルを複数のエージェント実行で再利用可能
- **専門化された実行**: スキルごとに最適なモデル・ツール設定・プロンプトで子エージェントが動作
- **標準化**: Agent Skills 標準に準拠することで、コミュニティのスキルを利用可能
- **組織知識の蓄積**: チームや企業固有の手順をバージョン管理可能な形式で保存
- **動的拡張**: エージェント実行時に利用可能なスキルを自動検出し、タスクに応じて適用
- **Library 統合**: Library の CMS 機能を活用し、スキルをデータベースで管理・検索・共有可能に

## 詳細仕様

### Agent Skills 仕様

Agent Skills は以下の構造を持つディレクトリ形式の拡張機能：

```yaml
skill_directory_structure:
  SKILL.md: "必須。YAML frontmatter + Markdown 形式のスキル定義"
  scripts/: "オプション。実行可能なスクリプト"
  references/: "オプション。追加ドキュメント"
  assets/: "オプション。テンプレートやリソース"
```

#### SKILL.md フォーマット

```yaml
---
name: pdf-processing
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF documents.
license: Apache-2.0
compatibility: Requires poppler-utils and access to the internet
allowed-tools: Bash(git:*) Bash(jq:*) Read
metadata:
  author: example-org
  version: "1.0"
---
# Markdown body with skill instructions...
```

#### Agent Skills 標準フィールド

[agentskills.io/specification](https://agentskills.io/specification) で定義されたフィールド:

| フィールド | 必須 | 制約 |
|-----------|------|------|
| `name` | Yes | 最大64文字。小文字英数字とハイフンのみ。先頭・末尾のハイフン不可、連続ハイフン不可。**親ディレクトリ名と一致必須** |
| `description` | Yes | 最大1024文字。スキルの機能と使用タイミングを記述。キーワードを含めてエージェントが関連タスクを識別しやすくする |
| `license` | No | ライセンス名またはバンドルされたライセンスファイルへの参照 |
| `compatibility` | No | 最大500文字。環境要件（対象プロダクト、必要なシステムパッケージ、ネットワークアクセス等） |
| `metadata` | No | 任意のキー・バリューマッピング（string → string） |
| `allowed-tools` | No | スペース区切りの事前承認ツールリスト（実験的機能）。例: `Bash(git:*) Read` |

#### Claude Code 拡張フィールド

Claude Code は Agent Skills 標準を拡張し、以下の独自フィールドを追加している。Tachyon Agent でも同等の機能を実装する:

```yaml
---
name: deep-research
description: Research a topic thoroughly
context: fork           # fork: sub-agent（隔離コンテキスト）で実行
agent: Explore          # sub-agent のタイプ（Explore, Plan, general-purpose, またはカスタム）
model: claude-sonnet-4-5  # スキル実行時に使用するモデル
allowed-tools: Read, Grep, Glob
disable-model-invocation: true  # LLM による自動呼び出しを禁止（手動 /name のみ）
user-invocable: false           # ユーザーの / メニューから非表示
argument-hint: "[topic]"        # 引数のヒント表示
hooks:                          # スキルライフサイクルフック
  pre-tool-call: ...
---
```

| フィールド | 説明 | Tachyon での対応 |
|-----------|------|-----------------|
| `context` | `fork` を指定するとsub-agentで隔離実行。会話履歴にアクセスしない | **`execute_sub_agent` ツールで実現** |
| `agent` | `context: fork` 時のsub-agentタイプ。`Explore`, `Plan`, `general-purpose`, カスタムエージェント | sub-agentの `tool_access` や `user_custom_instructions` で再現 |
| `model` | スキル実行時に使用するモデル | `execute_sub_agent` の `model` パラメータ |
| `disable-model-invocation` | `true` でLLMによる自動呼び出しを禁止 | システムプロンプトでスキル一覧から除外 |
| `user-invocable` | `false` でユーザーメニューから非表示（LLMのみ使用） | API/UIでのスキル呼び出し制御 |
| `argument-hint` | `/skill-name` のオートコンプリート時のヒント | UIのスキル一覧表示 |
| `hooks` | スキルライフサイクルフック | 将来拡張 |

#### `context: fork` と Tachyon Sub Agent の対応

Claude Code の `context: fork` は、スキルを**隔離されたsub-agentコンテキスト**で実行する機能。これは Tachyon の `execute_sub_agent` と直接対応する:

| Claude Code (`context: fork`) | Tachyon Agent (`execute_sub_agent`) |
|-------------------------------|-------------------------------------|
| SKILL.md body がsub-agentのプロンプトになる | `user_custom_instructions` にスキルの body を渡す |
| 会話履歴にアクセスしない（隔離） | 子agentは独自の ChatRoom を生成（隔離） |
| `agent` フィールドで実行環境を指定 | `tool_access` / `model` で実行環境を指定 |
| 結果がメイン会話に要約されて返る | 結果が親agentに JSON で返却される |
| CLAUDE.md はロードされる | 親の `executor` / `multi_tenancy` を継承 |

#### スキルの種類と実行方式

Claude Code のドキュメントに基づき、スキルは2種類に分類:

| 種類 | 内容 | 実行方式 | `context` |
|------|------|---------|-----------|
| **Reference（参照型）** | 規約・パターン・スタイルガイド等の知識 | インラインで会話に注入 | 省略（デフォルト） |
| **Task（タスク型）** | デプロイ・コミット・コード生成等のアクション | sub-agentで隔離実行 | `fork` |

Tachyon での対応:
- **Reference**: システムプロンプトにスキルの body を直接注入
- **Task**: `execute_sub_agent` で子エージェントとして実行

#### Progressive Disclosure（段階的読み込み）

Agent Skills 仕様はコンテキスト効率のため段階的な読み込みを推奨：

1. **メタデータ（~100トークン）**: `name` と `description` → 全スキルについて起動時に読み込み（バジェット上限あり、Claude Code はデフォルト15,000文字）
2. **指示（<5000トークン推奨）**: `SKILL.md` の body → スキル選択/呼び出し時に読み込み
3. **リソース（必要時のみ）**: `scripts/`, `references/`, `assets/` → 実行時に読み込み

`SKILL.md` は500行以下に抑え、詳細な参照資料は `references/` に分離する。

### スキル実行アーキテクチャ

```
親 Agent（RecursiveAgent）
  │
  ├── スキルディスカバリー（起動時に1回）
  │     ├── Library API 経由でスキル取得
  │     └── Filesystem からスキル取得（後方互換）
  │
  ├── システムプロンプトに注入（Progressive Disclosure）
  │     └── 各スキルの name / description を一覧表示（バジェット上限あり）
  │
  └── タスク処理中（LLM がスキルを選択）
        │
        ├── 【Reference型】context 未指定のスキル
        │     └── スキルの body をインラインでシステムプロンプトに注入
        │         （規約・パターン・ガイドライン等の知識として利用）
        │
        └── 【Task型】context: fork のスキル
              ├── execute_sub_agent ツールで子エージェントをスポーン
              │     ├── task: ユーザーのサブタスク（+ $ARGUMENTS）
              │     ├── user_custom_instructions: スキルの body（Markdown 指示）
              │     ├── model: スキルの model フィールド（なければ親のモデル）
              │     └── tool_access: スキルの allowed-tools から変換
              │
              └── 子 Agent（スキル専門化・隔離コンテキスト）
                    ├── 親の会話履歴にアクセスしない（隔離）
                    ├── スキルの body がプロンプトとして駆動
                    ├── 独自の ChatRoom / ExecutionState
                    ├── 結果を親に返却（AttemptCompletion テキスト）
                    └── Billing は親の execution に統合
```

### 機能要件

1. **スキルディスカバリー**
   - 指定されたパスから再帰的に `SKILL.md` を検索
   - YAML frontmatter をパースしてメタデータを抽出
   - Library API 経由でスキルを検索・取得
   - スキルの一覧を取得・管理

2. **スキル一覧のシステムプロンプト統合**
   - `disable-model-invocation: true` でないスキルの name / description をシステムプロンプトに追加
   - スキル description のバジェット上限を設定（Claude Code のデフォルトは15,000文字）
   - Task型スキル（`context: fork`）は `execute_sub_agent` で実行する旨をガイド
   - Reference型スキルはインラインで body を注入する旨をガイド

3. **Reference型スキル実行（インライン注入）**
   - `context` 未指定のスキル → 規約・パターン・ガイドラインとして利用
   - スキルの Markdown body をシステムプロンプトに直接注入
   - 親エージェントの会話コンテキスト内で知識として活用

4. **Task型スキル実行（`context: fork` → `execute_sub_agent`）**
   - `context: fork` のスキル → 隔離されたsub-agentで実行
   - `execute_sub_agent` ツールで子エージェントをスポーン
     - `user_custom_instructions` にスキルの Markdown body を渡す
     - `model` にスキルの `model` フィールドを渡す（未指定なら親と同じ）
     - `tool_access` をスキルの `allowed-tools` から変換して渡す
   - 子エージェントの結果を親が受け取り、タスク処理を継続

5. **呼び出し制御**
   - `disable-model-invocation: true` → LLMによる自動呼び出しを禁止（API/UIからの明示的呼び出しのみ）
   - `user-invocable: false` → ユーザーメニューから非表示（LLMのみ使用可能な背景知識）

4. **スクリプト実行サポート**（将来拡張）
   - `scripts/` ディレクトリ内のスクリプトを実行可能にする
   - セキュリティ制約の下でスクリプトを実行

### スキル実行例

#### Task型スキル（`context: fork`）

SKILL.md:
```yaml
---
name: security-audit
description: Review code for security vulnerabilities including OWASP Top 10. Use when security review or audit is requested.
context: fork
model: anthropic/claude-sonnet-4-5
compatibility: Designed for code analysis tasks with filesystem access
allowed-tools: Read Grep Glob
metadata:
  author: tachyon-team
  version: "1.0"
---
# Security Audit Instructions

You are a security expert. Follow these steps:
1. Identify all authentication endpoints
2. Check for OWASP Top 10 vulnerabilities
3. Review input validation and sanitization
4. Check for proper error handling
5. Provide a prioritized list of findings

See [detailed checklist](references/owasp-checklist.md) for comprehensive review criteria.
```

Tachyon Agent が `execute_sub_agent` で実行:
```xml
<execute_sub_agent>
<task>Review the authentication module for security vulnerabilities</task>
<user_custom_instructions>
# Security Audit Instructions

You are a security expert. Follow these steps:
1. Identify all authentication endpoints
2. Check for OWASP Top 10 vulnerabilities
3. Review input validation and sanitization
4. Check for proper error handling
5. Provide a prioritized list of findings
</user_custom_instructions>
<model>anthropic/claude-sonnet-4-5</model>
</execute_sub_agent>
```

#### Reference型スキル（インライン注入）

SKILL.md:
```yaml
---
name: api-conventions
description: API design patterns for this codebase. Use when writing or reviewing API endpoints.
---

When writing API endpoints:
- Use RESTful naming conventions
- Return consistent error formats using errors::Error
- Include request validation with guard clauses
- Follow Clean Architecture layering (handler → usecase → domain)
```

→ 親エージェントが呼び出すと、body がシステムプロンプトにインラインで注入され、会話コンテキスト内で知識として利用される。`execute_sub_agent` は使わない。

### 非機能要件

- **パフォーマンス**: スキル検索は起動時に1回のみ実行し、結果をキャッシュ
- **セキュリティ**: スキルファイルの読み取り権限を検証、悪意のあるコンテンツをフィルタリング
- **保守性**: スキル管理用のユーティリティ関数を提供し、テスト容易性を確保
- **拡張性**: 新しいスキルを追加する際に既存コードへの影響を最小化
- **再帰深度制限**: 子エージェント（スキル実行）は更にsub-agentを呼べない（既存制限を活用）

### コンテキスト別の責務

```yaml
contexts:
  llms:
    description: "エージェント実行とスキル管理"
    responsibilities:
      - Library API 経由でのスキル取得
      - Filesystem からのスキル読み込み（後方互換性）
      - スキルメタデータの管理
      - システムプロンプトへのスキル一覧統合
      - execute_sub_agent 経由でのスキル実行（既存機能を活用）

  library:
    description: "スキルの永続化と管理"
    responsibilities:
      - スキルを Library データとして保存
      - スキルの検索・取得 API 提供
      - GitHub Markdown Import によるスキルインポート
      - スキルのバージョン管理と差分管理

  domain:
    description: "スキルエンティティとドメインモデル"
    responsibilities:
      - Skill エンティティの定義
      - スキルメタデータのバリデーション
```

### 仕様のYAML定義

```yaml
# Agent Skills 統合設定
agent_skills:
  # スキル取得方法（優先順位順）
  sources:
    # Library API 経由での取得（推奨）
    library:
      enabled: true
      default_repos:
        - "tachyon/agent-skills"
      search:
        name_property: "skill_name"
        description_property: "skill_description"
        content_property: "skill_content"
        metadata_property: "skill_metadata"

    # ファイルシステムからの取得（後方互換性）
    filesystem:
      enabled: true
      search_paths:
        - ".github/skills/"
        - ".claude/skills/"
        - "~/.codex/skills/"
        - "~/.claude/skills/"
        - "/etc/codex/skills/"

  # システムプロンプト統合設定
  prompt_integration:
    # 利用可能スキル一覧を表示するか
    show_available_skills: true
    # スキル説明の最大文字数
    max_description_length: 500

  # Sub Agent 実行設定
  sub_agent_execution:
    # スキル実行時のデフォルト max_requests
    default_max_requests: 10
    # スキル実行時のデフォルトタイムアウト
    default_timeout_seconds: 300

# スキルメタデータ構造（Library データ形式）
# Agent Skills 仕様の frontmatter フィールドを Library プロパティにマッピング
skill_metadata:
  properties:
    skill_name: "string (required, PropertyType::String)"           # frontmatter.name
    skill_description: "string (required, PropertyType::String)"    # frontmatter.description
    skill_content: "string (required, PropertyType::Markdown)"      # SKILL.md の Markdown body
    skill_license: "string (optional, PropertyType::String)"        # frontmatter.license
    skill_compatibility: "string (optional, PropertyType::String)"  # frontmatter.compatibility
    skill_allowed_tools: "string (optional, PropertyType::String)"  # frontmatter.allowed-tools（スペース区切り文字列）
    skill_context: "string (optional, PropertyType::String)"       # frontmatter.context（"fork" or null）
    skill_agent: "string (optional, PropertyType::String)"         # frontmatter.agent（sub-agentタイプ）
    skill_model: "string (optional, PropertyType::String)"         # frontmatter.model
    skill_disable_model_invocation: "boolean (optional)"           # frontmatter.disable-model-invocation
    skill_user_invocable: "boolean (optional)"                     # frontmatter.user-invocable
    skill_argument_hint: "string (optional, PropertyType::String)" # frontmatter.argument-hint
    skill_metadata: "object (optional, PropertyType::Json)"         # frontmatter.metadata（string→string map）
    skill_source: "string (optional, PropertyType::String)"         # "library" or "filesystem"
    skill_file_path: "string (optional, PropertyType::String)"      # filesystem の場合のみ
  library_data:
    ext_github: "object (optional)"  # GitHub Sync 用
    tags: "array<string> (optional)" # スキルカテゴリ
```

## 実装方針

### Sub Agent機能との統合ポイント

既存の `execute_sub_agent` ツール（`packages/llms/src/agent/tool/sub_agent.rs`）をそのまま活用する。スキル統合で必要な変更は以下に限定:

1. **スキルローダー**: スキルの発見・パース・管理（新規）
2. **システムプロンプト拡張**: 利用可能スキル一覧の注入（既存の `system_prompt.rs` を拡張）
3. **execute_sub_agent への変更は不要**: 親LLMが適切にパラメータを構成してツールを呼び出す

### アーキテクチャ設計

#### 1. スキル管理レイヤー（新規）

```
packages/llms/src/agent/skills/
├── mod.rs                    # モジュール定義
├── models.rs                 # Skill エンティティとメタデータ構造
├── skill_loader.rs           # 統合スキルローダー（Library + Filesystem）
├── skill_loader_library.rs   # Library API 経由でのスキル取得
└── skill_loader_filesystem.rs # ファイルシステムからのスキル取得
```

#### 2. ドメインモデル

```rust
/// スキルエンティティ（Agent Skills 標準 + Claude Code 拡張）
pub struct Skill {
    // --- Agent Skills 標準フィールド ---
    pub name: String,                          // 必須。1-64文字、小文字英数字+ハイフン
    pub description: String,                   // 必須。1-1024文字
    pub content: String,                       // Markdown body（子エージェントの指示として使用）
    pub license: Option<String>,
    pub compatibility: Option<String>,         // 1-500文字。環境要件
    pub allowed_tools: Option<String>,         // スペース区切りのツールリスト
    pub metadata: HashMap<String, String>,     // string→string マッピング

    // --- Claude Code 拡張フィールド（Tachyon も対応） ---
    pub context: Option<SkillContext>,         // fork: sub-agentで隔離実行
    pub agent: Option<String>,                 // sub-agentタイプ（context: fork 時）
    pub model: Option<String>,                 // スキル実行時のモデル
    pub disable_model_invocation: bool,        // LLM自動呼び出し禁止（デフォルト: false）
    pub user_invocable: bool,                  // ユーザーメニュー表示（デフォルト: true）
    pub argument_hint: Option<String>,         // 引数ヒント

    // --- Tachyon 固有 ---
    pub source: SkillSource,
}

pub enum SkillContext {
    Fork,  // sub-agentで隔離実行（Claude Code の context: fork に対応）
}

impl Skill {
    /// Reference型（インライン注入）か Task型（sub-agent実行）かを判定
    pub fn is_forked(&self) -> bool {
        matches!(self.context, Some(SkillContext::Fork))
    }
}

pub enum SkillSource {
    Library { org_username: String, repo_username: String },
    Filesystem { path: PathBuf },
}

/// スキルローダートレイト
#[async_trait]
pub trait SkillLoader: Send + Sync {
    async fn load_skills(&self) -> Result<Vec<Skill>>;
}
```

#### 3. システムプロンプト統合

`system_prompt.rs` の sub_agent セクションを拡張し、利用可能なスキル一覧を追加:

```rust
// 既存の sub_agent セクションに追加
// Progressive Disclosure: 起動時は name + description のみ注入（~100トークン/スキル）
// content（Markdown body）はスキル選択後に execute_sub_agent の
// user_custom_instructions として渡す
let skills_section = if !skills.is_empty() {
    format!(
        r#"
## Available Skills

The following skills are available. When a task matches a skill's purpose,
use `execute_sub_agent` to spawn a child agent with the skill's instructions.

{skills_list}

### How to use a skill:
Use `execute_sub_agent` with:
- `task`: The specific sub-task to perform
- `user_custom_instructions`: The skill's full instructions (will be provided when you select a skill)
- `model`: The skill's recommended model from metadata (if available)
- `max_requests`: The skill's recommended value from metadata (if available)
"#,
        skills_list = skills.iter().map(|s| {
            let mut line = format!("- **{}**: {}", s.name, s.description);
            if let Some(compat) = &s.compatibility {
                line.push_str(&format!(" ({})", compat));
            }
            line
        }).collect::<Vec<_>>().join("\n")
    )
} else {
    String::new()
};
```

### Library サービスとの統合

Library の既存機能を活用：

- **Markdown プロパティ型**: スキルコンテンツを `PropertyType::Markdown` として保存
- **GitHub Markdown Import**: GitHub リポジトリから既存のスキルをインポート
- **データ検索**: Library API の `search_data` でスキルを検索
- **リポジトリ管理**: 組織単位でスキルリポジトリを管理

### 技術選定

- **YAML パース**: `serde_yaml` を使用して SKILL.md の frontmatter をパース
- **パス解決**: `std::path::PathBuf` と `home` クレートでユーザーディレクトリを解決
- **スキル選択**: LLM自身が判断（システムプロンプトにスキル一覧を提示し、LLMが適切なスキルを選んで `execute_sub_agent` を呼ぶ）

## 実装フェーズ

### フェーズ1: スキルローダーとドメインモデル 📝

- [ ] `Skill` エンティティの定義（`packages/llms/src/agent/skills/models.rs`）
- [ ] `FilesystemSkillLoader` の実装（SKILL.md のパースと読み込み）
- [ ] YAML frontmatter のパース処理
- [ ] 単体テストの作成

### フェーズ2: システムプロンプト統合 📝

- [ ] `system_prompt.rs` にスキル一覧セクションを追加
- [ ] `sub_agent` が有効な場合にのみスキル情報を表示
- [ ] スキル説明の文字数制限
- [ ] `ExecuteAgent` / `RecursiveAgent` にスキルローダーを注入
- [ ] 統合テストの作成

### フェーズ3: Library 統合 📝

- [ ] `LibrarySkillLoader` の実装（Library API 経由でスキル取得）
- [ ] Library データからスキルへの変換ロジック
- [ ] 統合スキルローダー（Library + Filesystem のフォールバック）
- [ ] Library API クライアントの統合（`library` クレートの利用）
- [ ] 単体テスト・統合テスト

### フェーズ4: ツールアクセス制限 📝

- [ ] `allowed-tools` フィールドに基づく子エージェントの `ToolAccessConfig` 制限
- [ ] スキルの `allowed-tools` → `ToolAccessConfig` への変換ロジック
- [ ] テストの作成

### フェーズ5: エラーハンドリングと最適化 📝

- [ ] スキル読み込みエラーの適切な処理
- [ ] スキルキャッシュ機能
- [ ] ログ出力の追加
- [ ] パフォーマンステスト

## タスク分解

### 主要タスク

- [x] 要件定義の明確化
- [x] 技術調査・検証
- [x] Sub Agent 基盤の実装（`feat/agent-sub-agent` で完了）
- [ ] フェーズ1: スキルローダーとドメインモデル
- [ ] フェーズ2: システムプロンプト統合
- [ ] フェーズ3: Library 統合
- [ ] フェーズ4: ツールアクセス制限
- [ ] フェーズ5: エラーハンドリングと最適化
- [ ] 統合テスト
- [ ] ドキュメント更新

## テスト計画

### 単体テスト

1. **スキルローダー**
   - Filesystem からの SKILL.md パース（正常系・異常系）
   - Library API 経由でのスキル取得
   - Library データからスキルへの変換
   - 統合ローダーの優先順位確認（Library > Filesystem）

2. **システムプロンプト統合**
   - スキル一覧の正確なフォーマット
   - 空のスキルリストでの動作
   - 文字数制限の動作

### 統合テスト

1. **エンドツーエンド**
   - スキルがシステムプロンプトに注入される
   - 親エージェントが `execute_sub_agent` でスキルを実行する
   - 子エージェントがスキルの指示に従って動作する
   - 結果が親エージェントに返却される

2. **シナリオテスト**
   - REST API 経由でスキル付きエージェント実行
   - スキルなしのエージェント実行（後方互換性）
   - sub_agent が無効時にスキル一覧が表示されない

3. **Library 統合シナリオ**
   - GitHub Markdown Import でスキルをインポート
   - Library API 経由でスキルを検索・取得
   - スキルの更新がエージェント実行に反映される

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| Library API の依存性 | 中 | Filesystem フォールバックを実装。Library 未接続でも動作 |
| スキルファイルのパースエラー | 中 | エラーログを出力し、問題のあるスキルはスキップして続行 |
| システムプロンプトの長さ制限 | 高 | スキル説明の文字数制限。content はシステムプロンプトに含めず、execute_sub_agent 呼び出し時にのみ渡す |
| 子エージェントのコスト増大 | 中 | スキルの推奨 max_requests で制限。Billing は親 execution に統合済み |
| セキュリティリスク（悪意のあるスキル） | 高 | Library の権限管理を活用。`allowed-tools` でツールアクセスを制限 |
| Sub Agent のタイムアウト | 中 | スキルの推奨 timeout 設定。デフォルト300秒（既存制限） |

## 参考資料

- [Agent Skills 公式サイト](https://agentskills.io/home)
- [Agent Skills 仕様](https://agentskills.io/specification)
- [Claude Code Skills ドキュメント](https://code.claude.com/docs/en/skills) — Claude Code 拡張フィールド（`context: fork`, `agent`, `model` 等）の公式リファレンス
- [GitHub: Agent Skills 例](https://github.com/huggingface/skills)
- Sub Agent 実装: `packages/llms/src/agent/tool/sub_agent.rs`
- システムプロンプト: `packages/llms/src/agent/system_prompt.rs`
- ExecuteAgent usecase: `packages/llms/src/usecase/execute_agent.rs`
- ToolAccessConfig: `packages/llms/src/agent/tool_access.rs`
- Sub Agent taskdoc: `docs/src/tasks/in-progress/agent-sub-agent/task.md`

## 完了条件

- [ ] すべての機能要件を満たしている
- [ ] スキルローダー（Filesystem + Library）が動作する
- [ ] システムプロンプトにスキル一覧が正しく注入される
- [ ] 親エージェントが `execute_sub_agent` でスキルを実行できる
- [ ] 子エージェントがスキルの指示に従って動作する
- [ ] 単体テストと統合テストがすべて通過
- [ ] コードレビューが完了
- [ ] 正式な仕様ドキュメントを作成済み（`docs/src/tachyon-apps/llms/agent-skills.md`）
- [ ] サンプルスキルを `.github/skills/` に追加済み
- [ ] タスクディレクトリを `completed/[新バージョン]/` に移動済み

### バージョン番号の決定基準

このタスクは新機能追加のため、**マイナーバージョンを上げる**。

## 備考

- **2種類の実行方式**: `context: fork`（Task型）は `execute_sub_agent` で隔離実行。`context` 未指定（Reference型）はインラインでシステムプロンプトに注入
- **Claude Code 拡張フィールドに対応**: `context`, `agent`, `model`, `disable-model-invocation`, `user-invocable` 等の Claude Code 拡張フィールドをサポート。Agent Skills 標準との互換性を維持しつつ拡張
- **LLM によるスキル選択**: スキル選択ロジックを独自実装せず、LLM自身がシステムプロンプトのスキル一覧を見て適切なスキルを判断
- **Progressive Disclosure に従う**: 起動時は `name` + `description` のみをシステムプロンプトに注入（バジェット上限あり）。Task型の `content` は `execute_sub_agent` の `user_custom_instructions` として渡す。Reference型の `content` は呼び出し時にインライン注入
- **Library 統合を優先**: Filesystem は後方互換性のため残すが、Library を主要な実装とする
- `scripts/` ディレクトリの実行機能はスコープ外（将来拡張）
- 非同期スキル実行は `backlog/agent-sub-agent-async` の実装後に検討
