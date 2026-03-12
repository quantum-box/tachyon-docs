---
title: "command_stackからrecursive_agentへの再構築"
type: "refactor"
emoji: "🔧"
topics: ["Rust", "clean-architecture", "責務分離", "リファクタリング", "recursive-agent"]
published: true
targetFiles: ["packages/llms/src/usecase/command_stack/", "packages/llms/src/usecase/recursive_agent/"]
github: ""
---

# command_stackからrecursive_agentへの再構築

## 概要

現在のcommand_stackディレクトリを、より適切な名称である`recursive_agent`に変更し、同時に内部構造をリファクタリングする。CommandStackという名前は実装の詳細を表しているが、RecursiveAgentという名前は本来の目的（再帰的にタスクを実行するエージェント）を明確に表現する。この変更により、コードの意図がより明確になり、保守性とテスタビリティが向上する。

## 背景・目的

### 現在の課題

1. **CommandStack構造体の肥大化**
   - 1600行以上の巨大な構造体で、複数の責務を持っている
   - 新しいタスクの作成、メッセージ処理、ストリーム処理、永続化が混在
   - コンストラクタのパラメータが13個と多すぎる

2. **責務の混在**
   - `recursive.rs`でビジネスロジック、プレゼンテーション、永続化ロジックが混在
   - `chat_stream.rs`でXMLパース、プロバイダー呼び出し、チャンク変換が混在
   - `types.rs`でドメインオブジェクトとDTOが混在

3. **テストの困難さ**
   - モックの設定が複雑
   - 統合テストと単体テストの境界が曖昧
   - テストケースが1000行以上に肥大化

4. **保守性の問題**
   - 新機能追加時の影響範囲が予測困難
   - ファイル間の依存関係が複雑
   - コードの重複が散見される

### 解決したい問題

- 各クラスが単一責任原則に従うようにする
- テストしやすい構造にする
- 新機能の追加を容易にする
- コードの可読性と保守性を向上させる

## 詳細仕様

### 現在のアーキテクチャ分析

```
command_stack/  # 名前が実装詳細を表している
├── recursive.rs          # CommandStack構造体（1600行）- 名前が曖昧
├── chat_stream.rs        # AttemptApiRequest（XMLパース+API呼び出し）
├── types.rs             # 型定義（900行）
├── system_prompt.rs     # システムプロンプト生成
├── messages_to_chunk.rs # メッセージ変換
├── parse_xml_streaming.rs # XMLストリーミングパース
└── mcp/                 # MCP関連
```

### 機能要件

#### 1. 責務の明確な分離
- **ドメインロジック**: メッセージの組み立て、会話フローの制御
- **アプリケーションサービス**: ユースケースの実行、外部システムとの連携
- **インフラストラクチャ**: データの永続化、API呼び出し
- **プレゼンテーション**: ストリーミング応答の管理

#### 2. 単一責任原則の適用
- 各クラスが1つの理由でのみ変更される
- 依存関係の方向が一方向になる
- インターフェースが小さく、焦点が絞られている

#### 3. テスタビリティの向上
- 依存性注入によるモックの容易化
- 単体テストと統合テストの明確な分離
- テストダブルの作成が簡単

### 非機能要件

- **パフォーマンス**: 現在の処理速度を維持
- **互換性**: 既存APIとの完全な互換性
- **メモリ使用量**: 現状以下に抑制
- **可読性**: コードレビューが容易

## 実装方針

### 新しいディレクトリ構造（recursive_agentへの移行）

```
recursive_agent/              # 目的を明確に表す名前
├── mod.rs                    # パブリックAPIのエクスポート
├── agent.rs                  # RecursiveAgent実装（旧CommandStack）
├── types/                    # 型定義の整理
│   ├── mod.rs
│   ├── chunks.rs            # AgentChunk関連
│   ├── stream.rs            # ストリーム関連型
│   └── messages.rs          # MessageCollection
├── stream/                   # ストリーム処理関連
│   ├── mod.rs
│   ├── handler.rs           # StreamHandler（旧AttemptApiRequest）
│   ├── xml_parser.rs        # XMLパース
│   └── chunk_converter.rs   # チャンク変換
├── prompts/                  # プロンプト関連
│   ├── mod.rs
│   └── system.rs            # システムプロンプト
├── core/                     # コアロジック
│   ├── mod.rs
│   ├── session.rs           # セッション管理
│   ├── conversation.rs      # 会話状態管理
│   ├── message_handler.rs   # メッセージ処理
│   └── completion.rs        # 完了判定
└── mcp/                      # MCP関連
    ├── mod.rs
    ├── hub.rs
    └── types.rs
```

### リファクタリング戦略

既存のパブリックAPIを維持しながら、ディレクトリ構造とファイル名を整理し、責務を明確に分離します。ファイル名は役割を明確に表現するものに変更し、関連する機能をサブディレクトリにグループ化します。

#### TDD（テスト駆動開発）によるリファクタリング

このリファクタリングは**TDD（Test-Driven Development）**のアプローチで実施します：

1. **既存の動作を保証するテストの作成**
   - 現在のCommandStackの全ての公開メソッドに対する統合テストを作成
   - 各種エッジケースのテストを追加
   - パフォーマンステストのベースラインを記録

2. **リファクタリングの実施**
   - 各フェーズでテストがグリーンであることを確認
   - 新しいコンポーネントは先にテストを書いてから実装
   - 既存の1672件のテストケースが全て通ることを保証

3. **継続的な検証**
   - 各コミットでテストスイートを実行
   - カバレッジが低下しないことを確認
   - パフォーマンスの劣化がないことを検証

### 主要コンポーネントの設計

#### 1. Session (コアロジック)
```rust
// core/session.rs
pub(crate) struct SessionContext {
    pub chat_room_id: domain::ChatRoomId,
    pub owner_id: value_object::UserId,
    pub config: SessionConfig,
}

pub(crate) struct SessionConfig {
    pub user_custom_instructions: Option<String>,
    pub assistant_name: Option<String>,
    pub additional_tool_description: Option<String>,
    pub model: Option<String>,
    pub max_requests: usize,
    pub auto_approve: bool,
}
```

#### 2. ConversationManager (コアロジック)
```rust
// core/conversation.rs
pub(crate) struct ConversationManager {
    messages: Arc<Mutex<MessageCollection>>,
    current_response: Arc<Mutex<MessageCollection>>,
    session: Arc<SessionContext>,
}

impl ConversationManager {
    pub async fn add_user_message(&self, content: &str) -> Result<()>
    pub async fn get_messages(&self) -> Vec<Message>
    pub async fn save_response(&self, messages: &[Message]) -> Result<()>
}
```

#### 3. StreamHandler (ストリーム処理)
```rust
// stream/handler.rs (旧chat_stream.rs)
pub struct StreamHandler {
    provider: Arc<dyn ChatStreamProviderV2>,
    mcp_hub: Option<Arc<McpHub>>,
    xml_parser: XmlParser,
}

#[async_trait]
impl AttemptApiRequestTrait for StreamHandler {
    async fn handle(&self, input: ChatStreamInput) -> Result<ChatStreamResponse>
}
```

#### 4. RecursiveAgent (パブリックAPI)
```rust
// agent.rs (旧recursive.rs/CommandStack)
pub struct RecursiveAgent {
    conversation: Arc<ConversationManager>,
    stream_handler: Arc<dyn AttemptApiRequestTrait>,
    message_handler: Arc<MessageHandler>,
    completion_handler: Arc<CompletionHandler>,
    message_repository: Arc<dyn ChatMessageRepository>,
}

impl RecursiveAgent {
    // 既存のpublicメソッドを維持
    pub fn new(...) -> Self
    pub async fn start_new_task(...) -> Self
    pub async fn handle(&self) -> Result<ChatStreamResponse>
    pub async fn add_user_message(&self, message: &str) -> Result<()>
}

// 後方互換性のためのエイリアス（移行期間中）
pub type CommandStack = RecursiveAgent;
```

### リファクタリング手順

#### Phase 0: TDD準備とディレクトリ名の変更
- 既存CommandStackの完全な動作仕様を記述するテストスイート作成
- 現在の動作を100%カバーする統合テストの追加
- パフォーマンスベンチマークの記録
- `command_stack/` → `recursive_agent/`へリネーム
- 依存関係のあるファイルのインポートパス更新
- 全テストがグリーンであることの確認

#### Phase 1: ディレクトリ構造の再編成
- サブディレクトリ（`types/`, `stream/`, `core/`, `prompts/`）の作成
- 既存ファイルのバックアップ
- 新しいmod.rsファイルの準備

#### Phase 2: 型定義の分離と移動
- `types.rs`を`types/`ディレクトリに分割
  - `chunks.rs`: AgentChunk関連
  - `stream.rs`: ChatStreamInput/Response
  - `messages.rs`: MessageCollection
- インポートパスの更新

#### Phase 3: ストリーム処理の再編成
- `chat_stream.rs` → `stream/handler.rs`
- `parse_xml_streaming.rs` → `stream/xml_parser.rs`
- `messages_to_chunk.rs` → `stream/chunk_converter.rs`
- 内部依存関係の整理

#### Phase 4: プロンプト処理の移動
- `system_prompt.rs` → `prompts/system.rs`
- プロンプト生成ロジックの整理

#### Phase 5: コアロジックの実装
- `core/session.rs`: セッション管理
- `core/conversation.rs`: 会話状態管理
- `core/message_handler.rs`: メッセージ処理
- `core/completion.rs`: 完了判定

#### Phase 6: RecursiveAgentの実装
- `recursive.rs` → `agent.rs`へリネーム
- CommandStack → RecursiveAgentへ名称変更
- 後方互換性のためのエイリアス追加
- 新しい内部構造への移行
- 既存APIの維持

#### Phase 7: 統合とテスト
- すべてのテストの実行
- インポートパスの修正
- パフォーマンス確認

## タスク分解

### Phase 0: TDD準備とディレクトリ名の変更
- [ ] 📝 既存の動作を保証する統合テストスイートの作成
  - [ ] `test_command_stack_behavior.rs`の作成
  - [ ] 全公開APIの動作テスト
  - [ ] エッジケースのテスト
  - [ ] エラーハンドリングのテスト
- [ ] 📝 パフォーマンスベンチマークの作成と記録
- [ ] 📝 テストカバレッジの測定と記録（目標: 90%以上）
- [ ] 📝 `command_stack/` → `recursive_agent/`へリネーム
- [ ] 📝 `packages/llms/src/usecase/mod.rs`の更新
- [ ] 📝 すべての依存ファイルのインポートパス更新
- [ ] 📝 全テスト（1672件）がグリーンであることの確認

### Phase 1: ディレクトリ構造の再編成
- [ ] 📝 各フェーズの開始前にテストスイートの実行（グリーン確認）
- [ ] 📝 `types/`, `stream/`, `core/`, `prompts/`ディレクトリの作成
- [ ] 📝 各ディレクトリに`mod.rs`を作成
- [ ] 📝 既存ファイルのバックアップ
- [ ] 📝 新しいディレクトリ構造のドキュメント化
- [ ] 📝 全テストがグリーンであることの確認

### Phase 2: 型定義の分離と移動
- [ ] 📝 型分離のためのテストケース作成（各型の使用箇所を網羅）
- [ ] 📝 `types/chunks.rs`の作成（AgentChunk関連を移動）
- [ ] 📝 `types/stream.rs`の作成（ストリーム関連型を移動）
- [ ] 📝 `types/messages.rs`の作成（MessageCollectionを移動）
- [ ] 📝 `types/mod.rs`でパブリックAPIをエクスポート
- [ ] 📝 既存コードのインポートパス更新
- [ ] 📝 全テストがグリーンであることの確認

### Phase 3: ストリーム処理の再編成
- [ ] 📝 `chat_stream.rs` → `stream/handler.rs`へ移動とリファクタリング
- [ ] 📝 `parse_xml_streaming.rs` → `stream/xml_parser.rs`へ移動
- [ ] 📝 `messages_to_chunk.rs` → `stream/chunk_converter.rs`へ移動
- [ ] 📝 `stream/mod.rs`でモジュール統合
- [ ] 📝 ストリーム処理の単体テスト更新

### Phase 4: プロンプト処理の移動
- [ ] 📝 `system_prompt.rs` → `prompts/system.rs`へ移動
- [ ] 📝 プロンプト生成ロジックの整理
- [ ] 📝 `prompts/mod.rs`の作成
- [ ] 📝 プロンプト関連のテスト更新

### Phase 5: コアロジックの実装（TDD）
- [ ] 📝 各コアコンポーネントのインターフェース定義とテスト作成
- [ ] 📝 `core/session.rs`のテスト作成→実装（SessionContext, SessionConfig）
- [ ] 📝 `core/conversation.rs`のテスト作成→実装（ConversationManager）
- [ ] 📝 `core/message_handler.rs`のテスト作成→実装（メッセージ処理）
- [ ] 📝 `core/completion.rs`のテスト作成→実装（完了判定ロジック）
- [ ] 📝 統合テストの実行とグリーン確認

### Phase 6: RecursiveAgentの実装
- [ ] 📝 `recursive.rs` → `agent.rs`へリネーム
- [ ] 📝 CommandStack → RecursiveAgentへ構造体名変更
- [ ] 📝 後方互換性のためのtype aliasを追加
- [ ] 📝 新しい内部構造への移行
- [ ] 📝 既存パブリックAPIの維持確認
- [ ] 📝 後方互換性のテスト

### Phase 7: 統合とテスト
- [ ] 📝 すべての既存テストの実行と修正
- [ ] 📝 新しい統合テストの作成
- [ ] 📝 パフォーマンステストの実行
- [ ] 📝 ベンチマークの比較

### Phase 8: クリーンアップと最適化
- [ ] 📝 旧ファイルの削除
- [ ] 📝 不要なコードの削除
- [ ] 📝 ドキュメントの更新
- [ ] 📝 最終的なコードレビューとリリース準備

## テスト計画

### TDD実施計画
- **Red-Green-Refactorサイクル**: 全ての新規実装で適用
- **既存テストの活用**: 現在の1672件のテストを回帰テストとして使用
- **新規テストの追加**: 各リファクタリングステップごとに追加

### 単体テスト戦略
- **ドメインロジック**: 純粋なロジックテスト、モック不要
- **アプリケーションサービス**: モックを使用した振る舞いテスト
- **インフラストラクチャ**: 実装固有のテスト
- **プレゼンテーション**: 出力フォーマットのテスト

### 統合テスト戦略
- **エンドツーエンド**: 実際のLLMプロバイダーとの連携テスト
- **データフロー**: メッセージの流れの確認
- **パフォーマンス**: 処理時間とメモリ使用量の測定

### テストカバレッジ目標
- 単体テスト: 90%以上
- 統合テスト: 主要シナリオ100%
- パフォーマンステスト: 現状±10%以内

## リスクと対策

### リスク1: 既存機能の破壊
**影響度**: 高
**発生確率**: 中
**対策**: 
- 段階的な移行
- 包括的な回帰テスト
- フィーチャーフラグの活用

### リスク2: パフォーマンスの劣化
**影響度**: 中
**発生確率**: 低
**対策**:
- 継続的なベンチマーク
- プロファイリングツールの活用
- 最適化の優先順位付け

### リスク3: 開発期間の延長
**影響度**: 中
**発生確率**: 中
**対策**:
- 明確なマイルストーン設定
- 定期的な進捗確認
- 必要に応じたスコープ調整

### リスク4: チーム内の理解不足
**影響度**: 中
**発生確率**: 低
**対策**:
- 設計ドキュメントの充実
- コードレビューでの知識共有
- ペアプログラミングの活用

## スケジュール

### 週1: Phase 0-1 (名称変更と基礎準備)
- ディレクトリ名の変更
- 基本的なディレクトリ構造の準備

### 週2: Phase 2-3 (型とストリーム処理)
- 型定義の分離
- ストリーム処理の再編成

### 週3: Phase 4-5 (プロンプトとコアロジック)
- プロンプト処理の移動
- コアロジックの実装開始

### 週4: Phase 5-6 (コアロジック完成とRecursiveAgent)
- コアロジックの完成
- RecursiveAgentの実装

### 週5: Phase 7 (統合とテスト)
- 統合テスト
- パフォーマンステスト

### 週6: Phase 8 (最終調整)
- クリーンアップ
- ドキュメント更新
- リリース準備

## 完了条件

### 機能要件
- [ ] 既存APIとの完全な互換性維持
- [ ] 全機能の正常動作確認（全1672件のテストがグリーン）
- [ ] 新しいアーキテクチャでの実装完了

### 非機能要件
- [ ] パフォーマンスが現状の±10%以内
- [ ] テストカバレッジ90%以上達成
- [ ] メモリ使用量が現状以下

### 品質要件
- [ ] 静的解析ツールでのワーニング0件
- [ ] コードレビューでの承認
- [ ] ドキュメント更新完了

### 移行要件
- [ ] 既存コードの安全な削除
- [ ] 依存関係の最適化完了
- [ ] チームメンバーへの知識移転完了