---
title: "Saved Memory機能を実装する"
type: feature
emoji: "🧠"
topics:
  - LLM
  - Memory
  - Agents
  - Next.js
published: false
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/memory/
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/chat/
  - apps/tachyon-api/src/agents/
  - packages/agents/
  - packages/llms/
github: https://github.com/quantum-box/tachyon-apps
---

# Saved Memory機能を実装する

## 概要

ChatGPTのSaved Memoryと同等の「ユーザーが明示的に覚えてほしい事実を登録し、チャット時のシステムプロンプトへ注入する」機能をtachyon-appsに新設し、AI Studioの会話体験をパーソナライズできるようにする。

## 背景・目的

- 既存のAgent/Chat機能には、ユーザーごとの嗜好や継続的に参照したい設定を保存する仕組みがないため、毎回プロンプトに記述する必要があり体験価値が低い。
- ChatGPTで公開されているSaved Memoryは「ユーザーが明示的に“Remember that ...”と指示した項目だけを保持し、システムプロンプトに差し込む」というシンプルな仕組みでUXを大きく向上させている。
- まずはSaved Memoryだけをスコープにし、Reference Chat HistoryやUser Insightsのような高コストなRAG/クラスタリング処理を導入せずに、ユーザー主導の永続メモリ機能を素早く追加する。

## 詳細仕様

### 機能要件

1. チャット入力を監視し、「remember that / remember / save to memory」などのキーワード＋命令を検出した場合にSaved Memory候補生成フローを起動する。曖昧/短期/保存不適切と判断した場合は保存せず、チャットへ説明メッセージを返す。
2. LLMツール（仮称: `saved_memory_bio`）を使い、ユーザー発話を「事実の配列 → 省略的な節」に変換し、既存メモとの明確な矛盾やセンシティブ/短期内容を判定する。
3. 保存候補はバックエンドのUsecaseで構文的な重複チェックとテナント境界の検証のみを行い、許可された項目だけDBへ永続化する。拒否理由はチャットにフィードバックする。
4. 全Saved Memoryはチャット開始時および各メッセージ送信時にシステムプロンプトへ注入される。注入順序は作成日時昇順（安定順）、上限は8件（暫定）とし、超過時は最古メモからアーカイブへ移す。
5. フロントエンドにSaved Memory一覧UIを新設し、作成日時・内容・状態（active/archived）を閲覧、削除、アーカイブ解除できる。履歴は`/v1beta/[tenant_id]/ai/memory`直下に配置。
6. 利用者はUIから任意のメモを手動追加できる。追加・削除操作はAudit Logに追記し、マルチテナント境界を越えて参照できないようOperator/Platform IDでスコープする。
7. メモには「短期情報やセンシティブ情報は保存禁止」というポリシーを設定し、NGワードや検出ルールにヒットした場合は保存を拒否し、チャットで理由を説明する。
8. REST APIからSaved Memory一覧取得・作成・削除・アーカイブ操作が可能であり、Next.js/Agent CLI双方から再利用できる。GraphQL対応は将来フェーズで検討する。

受け入れ条件:
- チャットで「Remember that I am a vegetarian」と送信するとSaved Memoryに「Is a vegetarian」のような節が登録され、次のプロンプトに自動注入される。
- 「Remember that I am a vegetarian」「Remember that I am not a vegetarian」のような矛盾を連続送信した場合、2件目は拒否され理由が返る。
- UIからSaved Memoryを削除すると次回以降のチャットへは注入されない。
- Saved Memory一覧はtenant/operatorごとに分離され、他operatorでは表示も注入もされない。

### Saved Memoryの前提と注入ルール

- Saved Memoryはユーザーが明示的に保存した事実のみを扱い、システム側から推論・自動生成しない。
- 連続する同一/類似命令であっても、LLMツールが保存不適と判断した場合は候補に含めず説明のみ返す。
- システムプロンプトには以下テンプレートで注入し、モデルに強い既知情報として認識させる。

  ```
  The user has explicitly asked you to remember the following facts.
  Treat them as stable truths unless the user deletes them.
  1. Is a vegetarian
  2. Lives in Tokyo
  ```

- 注入済みメモを再解釈したり要約/結合したりせず、保存された節をそのまま列挙する。
- Saved Memoryを増やす責任はユーザーにあり、短期的な情報や推論結果を自動で登録しない。
- Archived状態はChatGPT本家には存在しないが、tachyonでは注入上限管理とUX改善のためのプロダクト拡張として導入する。

### 非機能要件

- 1ユーザーあたりの保存件数上限は10件（将来変更可）。超過時は保存不可エラーを返しUIで案内。
- 保存時は`x-operator-id`で必ずテナント境界を検証し、RBACポリシー `ai_memory:ManageSavedMemory` を追加して制御する。
- センシティブ情報（人種/宗教/政治/医療/性指向など）はバックエンドでマスク/拒否し、ログにも保存しない。
- LLMツール起動時のレスポンス SLA: 3〜5秒を目安にし、期限超過時は保存せずユーザーへリトライを案内。
- API/Usecaseは既存のObservability（tracing + structured log）に計測点を追加し、失敗率をGrafanaで監視できる。
- Feature Flag `ai.savedMemory` で段階的リリース。

### コンテキスト別の責務

```yaml
contexts:
  tachyon-frontend:
    description: "AI Studio UI / チャット画面 / Saved Memory管理ページ"
    responsibilities:
      - チャット入力からSaved Memory命令を検出してバックエンドへ伝搬
      - /ai/memory ページでCRUD UIとPlaywright確認
  tachyon-api:
    description: "RESTハンドラとUsecase"
    responsibilities:
      - Saved Memory Usecase (create/list/delete/archive) の実装
      - RBAC/Policyチェック、operator境界バリデーション
      - LLMツール呼び出し結果の正規化およびDB永続化
  agents-package:
    description: "Agent実行スタック & Prompt注入"
    responsibilities:
      - チャット実行時にSaved Memoryをシステムプロンプトへ挿入
      - BIOツール（saved_memory_bio）のコール契約を定義
  llms-package:
    description: "LLMプロバイダ・ツール実装"
    responsibilities:
      - saved_memory_bioツールのプロンプト/レスポンススキーマ
      - 失敗/遅延時のリトライとUsage計測
  persistence:
    description: "DBレイヤ & マイグレーション"
    responsibilities:
      - saved_memoriesテーブル作成（tenant + operator + userスコープ）
      - インデックス/ステータス管理/監査ログ
```

### 仕様のYAML定義

#### データモデル

```yaml
tables:
  saved_memories:
    description: "ユーザーが保存した明示的メモ"
    columns:
      - name: id
        type: ulid
        pk: true
      - name: tenant_id
        type: varchar(32)
      - name: operator_id
        type: varchar(32)
      - name: user_id
        type: varchar(32)
      - name: clause
        type: text   # 例: "Is a vegetarian"
      - name: raw_facts
        type: json   # LLMが抽出したfact配列
      - name: status
        type: enum(active|archived)
      - name: created_at
        type: timestamp
      - name: updated_at
        type: timestamp
    indexes:
      - unique(operator_id, user_id, clause_hash, status)
      - index(operator_id, status, created_at desc)

保存拒否（センシティブ/矛盾など）はレコードを作成せず、`audit_logs`に理由のみ記録する。
`clause_hash` は `clause` をtrim + lower-caseしたテキストに対して安定ハッシュ（例: SHA-256）を取り、同一節の重複保存を防ぐために用いる。
```

#### API

```yaml
rest:
  - method: GET
    path: /v1/agent/memory
    headers: [Authorization, x-operator-id, x-user-id?]
    response:
      data:
        - id: sm_01...
          clause: "Is a vegetarian"
          status: active
          created_at: "2025-04-29T10:11:00Z"
  - method: POST
    path: /v1/agent/memory
    body:
      clause: string
      source: manual|chat
    responses:
      201: { id, clause, status }
      409: { code: "CONTRADICTION" }
  - method: DELETE
    path: /v1/agent/memory/:id
  - method: POST
    path: /v1/agent/memory/:id/archive
```

#### LLMツール

```yaml
tool:
  name: saved_memory_bio
  description: "Transform user instructions into persistent facts"
  parameters:
    type: object
    properties:
      message:
        type: string
      existing_clauses:
        type: array
        items: string
  output:
    type: object
    properties:
      facts: string[]
      clauses: string[]
      contradictions: boolean
      near_duplicates: string[]
  prompt_template: |
    You are a tool that extracts stable, user-approved facts.
    1. Extract factual statements.
    2. Convert them into elliptical descriptive clauses ("Is a vegetarian").
    3. Compare with existing clauses; if contradictions/near duplicates are found,
       set contradictions=true and include notes.
    Short-term or sensitive data must be rejected.

`near_duplicates` はユーザー通知やデバッグ向けの補助情報であり、保存可否の最終判定はUsecase側の構文チェックに委ねる。
```

## 実装方針

1. **データモデル**: `saved_memories`テーブル＋`SavedMemory`ドメインを追加し、Usecase層でバリデーションを実施。ULIDは`sm_`プレフィックス。
2. **Usecase**: `SaveMemory`, `ListMemories`, `ArchiveMemory`, `DeleteMemory`を追加。`SaveMemory`は`executor`権限を確認後、RESTハンドラを通じてLLMツール結果を検証し保存。
3. **LLM統合**: Agent実行スタックで「remember that ...」発話時に`ToolCommand`を組み立てて`saved_memory_bio`を呼び出し、結果をUsecaseへ連携。
4. **プロンプト注入**: Agent起動時に`SavedMemoryRepository`からactiveメモを取得し、システムプロンプトテンプレートの`<<saved_memories>>`セクションへ整形注入。
5. **UI/UX**: Next.js App Routerで`/ai/memory`ページを用意し、テーブル＋CRUDモーダルを実装。チャット画面では保存成功/失敗をトースト表示し、neverthrow Resultでエラー処理。
6. **Feature Flag**: LaunchDarkly（もしくは既存設定）経由でtenant/ユーザー単位のロールアウトを管理し、Flagがfalseの場合はチャット検知/注入を行わない。
7. **Audit/Observability**: すべての作成/削除を`audit_logs`に記録。OpenTelemetry spanに`memory.count`属性を付与し、挿入件数を監視。

## タスク分解

### フェーズ1: 要件固め 📝
- [ ] Saved Memoryポリシー文言とNGカテゴリ定義を決定
- [ ] RBACアクション `ai_memory:ManageSavedMemory` を scripts/seeds に追加
- [ ] Feature Flag命名と環境設定を記録（docs更新含む）

### フェーズ2: バックエンド基盤 ✅
- [x] DBマイグレーションとRepository実装
- [x] Usecase + RESTハンドラ追加
- [x] Agentスタックのシステムプロンプト注入処理を実装

### フェーズ3: LLMツール連携 📝
- [ ] `saved_memory_bio`ツールのプロンプト/パラメータ定義
- [ ] チャット入力解析（Remember命令検出）とUsecase連携
- [ ] 矛盾/重複のヒューリスティック実装とユニットテスト

### フェーズ4: フロントエンドUI 🔄
- [x] `/ai/memory` ページとRESTクライアント
- [x] チャット画面からの保存結果通知UI
- [ ] E2E（Playwright MCP）シナリオ作成とスクリーンショット取得

### フェーズ5: 品質保証 📝
- [ ] `mise run docker-ci` で全体CI
- [ ] `mise run docker-scenario-test` にSaved Memoryシナリオを追加
- [ ] 手動検証 & 監査ログ/計測確認、verification-report更新

## テスト計画

- **ユニットテスト**: Usecaseのバリデーション、dedupeロジック、LLMレスポンス正規化。
- **統合テスト**: 新規RESTエンドポイント、Agent実行フローに対するシナリオテスト（apps/tachyon-api/tests/scenarios/ に `saved_memory.yaml` を追加）。
- **E2E**: Playwright MCPで `/ai/memory` ページのCRUD操作とチャット保存フローを確認（tachyon-dev プラットフォーム、base URL既定）。
- **監査/ロギング検証**: auditログとOpenTelemetryに記録されることを `mise run docker-logs` で確認。
- **セキュリティチェック**: センシティブ情報フィルターとRBACを含むネガティブテスト。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| LLMツールが過剰に事実を生成し誤保存 | 中 | 保存前にユーザー承認メッセージを返し、閾値超過時は明示確認を挟む |
| センシティブ情報の誤保存 | 高 | ルールベース + OpenAI moderation API（既存）で検出し拒否、ログにはマスク値のみ記録 |
| 注入メモが長すぎてcontext増大 | 中 | 1メモ80文字上限＋最大8件に制限、越えた場合はUIで圧縮を案内 |
| 既存チャットへの副作用 | 低 | Feature Flag + バックエンドで旧挙動を保持しながら段階的に有効化 |

## スケジュール（目安）

- 0.5日: 要件最終化と設計
- 1.0日: バックエンド・DB実装
- 0.5日: LLMツール統合
- 0.5日: フロントエンドUI
- 0.5日: テスト/ドキュメント/QA

## 参考資料

- Eric Hayes: *How ChatGPT Memory Works*（Saved Memory部分を中心にリバースエンジニアリングしたメモ）
- OpenAI ChatGPT公開プロンプト（bioツール説明抜粋）
- 社内 `docs/src/tachyon-apps/authentication/multi-tenancy.md`（テナント境界確認）

## 完了条件

- [ ] Saved Memory用テーブル・Usecase・API・UIが実装されFeature Flag下で動作する
- [ ] LLM `saved_memory_bio` ツールが本番設定で利用可能
- [ ] `apps/tachyon-api/tests/scenarios/saved_memory.yaml` を追加し `mise run docker-scenario-test` が成功
- [ ] Playwright MCPで `/ai/memory` とチャット保存フローのスクリーンショット付きレポートを作成
- [ ] docs（本taskdocと関連仕様）が更新され、完成後 `docs/src/tasks/completed/<version>/` へ移動できる状態になっている
