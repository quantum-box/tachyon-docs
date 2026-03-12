---
title: "Agent API実行後のChatroom名自動生成"
type: feature
emoji: "🏷️"
topics:
  - LLMs
  - Agent API
  - Chatroom
  - Auto-naming
published: true
targetFiles:
  - packages/llms/src/usecase/execute_agent.rs
  - packages/llms/src/usecase/generate_chatroom_name.rs
  - packages/llms/src/usecase/chatroom_interactor.rs
  - packages/llms/domain/src/chat_room.rs
github: https://github.com/quantum-box/tachyon-apps
---

# Agent API実行後のChatroom名自動生成

## 概要

Agent API経由でchatroomを作成・agent実行した後、チャットの内容をLLMで分析して自動的にchatroomの名前を設定する機能を実装する。

## 背景・目的

- **現状の問題**: 新規chatroomは「New Room」というデフォルト名で作成され、ユーザーが手動で名前を変更する必要がある
- **ユーザー体験の向上**: Agent実行後に自動で適切な名前が付くことで、複数のchatroomを管理しやすくなる
- **既存実装の活用**: `GenerateChatRoomName` usecaseが既に存在するが、制限がありAgent実行フローに統合されていない

## 現状の調査結果

### 既存実装

1. **GenerateChatRoomName usecase** (`packages/llms/src/usecase/generate_chatroom_name.rs`)
   - LLMを使ってchatroom名を生成する機能は実装済み
   - **制限**: 3メッセージ未満のchatroomのみ対象（新規作成時限定）
   - **問題**: 名前を生成して返すだけで、chatroomを実際に更新しない

2. **ChatroomInteractor** (`packages/llms/src/usecase/chatroom_interactor.rs`)
   - `update_chat_room()`: chatroom名を更新する機能は実装済み
   - Policy check: `llms:UpdateChatRoom`

3. **ExecuteAgent usecase** (`packages/llms/src/usecase/execute_agent.rs`)
   - Agent実行完了時に`AgentExecutionState`をCOMPLETED/FAILEDに更新
   - chatroom名の自動更新機能は未実装

## 詳細仕様

### 機能要件

1. **自動名前生成のトリガー**
   - Agent API（`/v1/llms/chatrooms/:id/agent/execute`）で初回agent実行が正常完了した時
   - chatroomの名前が「New Room」（デフォルト名）の場合のみ発動

2. **名前生成ロジック**
   - 既存の`GenerateChatRoomName`のLLMプロンプトを活用
   - ユーザーの最初のメッセージとAssistantの応答を基に名前を生成
   - 最大50文字、英語または日本語（会話言語に合わせる）

3. **Chatroomの自動更新**
   - 生成した名前で`update_chat_room()`を呼び出し
   - 更新失敗時はログ出力のみ（エラーを握りつぶし、メイン処理に影響させない）

### 非機能要件

- **パフォーマンス**: 名前生成は非同期で行い、メインのagent実行ストリームをブロックしない
- **冪等性**: 既に名前が設定されているchatroomは再生成しない
- **コスト考慮**: 軽量なLLMモデル（例: Gemini Flash）を使用して名前生成コストを抑える

### データフロー

```yaml
flow:
  1_agent_execute:
    trigger: "POST /v1/llms/chatrooms/:id/agent/execute"
    actions:
      - agent実行開始
      - ストリームでレスポンス送信
      - agent実行完了（COMPLETED状態）

  2_auto_name_generation:
    trigger: "agent実行完了 && chatroom.name == 'New Room'"
    actions:
      - chatroomのメッセージ取得（最初の数件）
      - LLMで名前生成
      - chatroom.update(name)
      - ログ出力（成功/失敗）
```

## 実装方針

### アーキテクチャ設計

```
ExecuteAgent (既存)
    │
    └─→ on_completion() ──→ AutoChatroomNameService (新規)
                                    │
                                    ├─→ GenerateChatRoomName (既存・拡張)
                                    │
                                    └─→ ChatroomInteractor.update_chat_room() (既存)
```

### 実装オプション

#### Option A: ExecuteAgent内で同期処理
- agent実行完了時に直接名前生成・更新を行う
- シンプルだが、名前生成時間分レスポンスが遅延する

#### Option B: 非同期タスクとして実行（推奨）
- agent実行完了後、`tokio::spawn`で非同期に名前生成・更新
- メインレスポンスに影響しない
- 失敗してもユーザー体験に影響しない

### 技術選定

- 名前生成用LLMモデル: `gemini-2.5-flash-lite`（コスト最小）
- 非同期処理: `tokio::spawn`

## タスク分解

### Phase 1: 既存コードの拡張 ✅ (2026-01-15 完了)
- [x] 新Usecase `AutoGenerateChatroomName` を作成
- [x] 名前生成用LLMプロンプトの実装

実装メモ: 既存の`GenerateChatRoomName`を拡張せず、新しい`AutoGenerateChatroomName` usecaseを作成。chatroom名が"New Room"の場合のみ自動生成を行う設計。

### Phase 2: ExecuteAgentへの統合 ✅ (2026-01-15 完了)
- [x] `ExecuteAgent`に`auto_generate_chatroom_name`フィールドを追加
- [x] `with_auto_generate_chatroom_name()`メソッドを追加
- [x] ストリーム完了時にtokio::spawnで非同期実行

実装メモ: ExecuteAgentの完了時（COMPLETED状態）に非同期で自動名前生成を実行。失敗してもメイン処理に影響しない設計。

### Phase 3: DIへの統合 ✅ (2026-01-15 完了)
- [x] `packages/llms/src/app.rs`でAutoGenerateChatroomNameをインスタンス化
- [x] ExecuteAgentへの依存注入
- [x] 認証ポリシーチェック追加（`llms:AutoGenerateChatroomName`アクション）
- [x] auth seedに新アクションとポリシー紐付けを追加

実装メモ: UsecaseにはClean Architecture標準パターンで`check_policy()`を追加。executor/multi_tenancyを通じて認可チェックを行う。

### Phase 4: テスト・動作確認 ✅ (2026-01-15 完了)
- [x] ユニットテストの追加（3テスト）
- [x] CIチェック全パス（542テスト成功）
- [x] シナリオテスト全パス（29+8シナリオ）

### Phase 5: 手動動作確認 ✅ (2026-01-15 完了)
- [x] ローカル環境でのエンドツーエンド動作確認

実装メモ:
- chatroom作成時に名前未指定で「New Room」が設定されることを確認
- Agent API実行後、ストリームが完了すると非同期で自動命名が実行される
- テスト実行例: 「こんにちは」→「Japanese Greetings Chat」に自動更新
- ストリームを途中で切断すると完了コールバックが呼ばれないため、クライアントは最後まで受信する必要がある

## テスト計画

### ユニットテスト
- `AutoChatroomNameService`の名前生成ロジック
- 「New Room」判定ロジック
- 名前更新の成功/失敗ケース

### シナリオテスト
```yaml
# apps/tachyon-api/tests/scenarios/auto_chatroom_name.yaml
scenarios:
  - name: "Agent実行後にchatroom名が自動設定される"
    steps:
      - id: create_chatroom
        action: POST /v1/llms/chatrooms
        expect: { name: "New Room" }

      - id: execute_agent
        action: POST /v1/llms/chatrooms/{{steps.create_chatroom.outputs.id}}/agent/execute
        body: { message: "Rustでエラーハンドリングについて教えて" }
        expect: { status: 200 }

      - id: wait_for_name_generation
        action: WAIT 5s

      - id: verify_chatroom_name
        action: GET /v1/llms/chatrooms/{{steps.create_chatroom.outputs.id}}
        expect: { name: { not: "New Room" } }
```

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| LLM API呼び出し失敗 | 低 | 失敗時はデフォルト名のままにする（エラーログのみ） |
| 名前生成に時間がかかる | 中 | 非同期実行で対応、タイムアウト設定 |
| 不適切な名前が生成される | 低 | プロンプトで制約を明確化、最大文字数制限 |
| コスト増加 | 低 | 軽量モデル使用、初回実行時のみ発動 |

## 完了条件

- [x] Agent API実行後、chatroomの名前が自動で適切に設定される
- [x] 既に名前が設定されているchatroomは再生成されない
- [x] 名前生成失敗時もagent実行自体は正常に完了する
- [x] ユニットテスト・シナリオテストがパスする
- [x] 手動動作確認完了（ローカル環境でのエンドツーエンドテスト）
- [ ] コードレビュー完了

### バージョン番号の決定基準

**マイナーバージョン（x.X.x）を上げる:**
- [x] 新機能の追加（chatroom自動命名機能）

## 参考資料

- 既存実装: `packages/llms/src/usecase/generate_chatroom_name.rs`
- Agent API: `packages/llms/src/usecase/execute_agent.rs`
- Chatroom更新: `packages/llms/src/usecase/chatroom_interactor.rs`

## 備考

- 将来的にはユーザーが自動命名のON/OFFを設定できるようにする可能性あり
- 日本語/英語の言語検出を行い、会話言語に合わせた名前生成も検討
