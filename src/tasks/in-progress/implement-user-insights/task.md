---
title: "User Insights機能を実装する"
type: feature
emoji: "🧭"
topics:
  - LLM
  - Memory
  - Agents
  - Next.js
  - Rust
published: false
targetFiles:
  - packages/llms/domain/src/user_insight.rs
  - packages/llms/domain/src/repository.rs
  - packages/llms/src/usecase/user_insights/*
  - packages/llms/src/adapter/axum/user_insight_handler.rs
  - packages/llms/src/app.rs
  - packages/llms/src/agent/system_prompt.rs
  - apps/tachyon/src/lib/user-insights.ts
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/memory/*
  - docs/src/tachyon-apps/llms/user-insights.md
  - packages/llms/migrations/*user_insights*.sql
github: https://github.com/quantum-box/tachyon-apps
---

# User Insights機能を実装する

## 概要

Saved Memoryに続き、チャット履歴を自動解析して利用者の傾向を要約する「User Insights」をtachyon-appsに追加する。週次バッチとオンデマンド再生成により、複数会話を横断した好み・専門分野・口調などを抽出し、LLMのシステムプロンプトへ注入することで応答品質を向上させる。

## 背景・目的

- ChatGPT調査より、Saved Memoryだけでは拾いきれない「ユーザーの継続的な嗜好」や「頻出する技術領域」を自動抽出するUser InsightsがUXを大きく改善していることが判明した。
- Tachyonでも会話ログを大量に保持しているが、長期的な知見を体系化できておらず、エージェントが毎回同じ質問を繰り返したり、ユーザーの文体・好みを踏まえた回答ができていない。
- Saved Memoryはユーザー主導で事実を保存する仕組みだが、User Insightsはシステムが自動で気づきをまとめる点が異なる。両者を併用し、ChatGPTに近いメモリ階層を再現する。

## 詳細仕様

### 機能要件

1. **Insight生成パイプライン**
   - チャットメッセージ（Userロール）のEmbeddingを集計し、K-means++（暫定: Faiss powered clustering or cosine similarity grouping）でクラスタリング。
   - クラスタごとにLLMへプロンプトし、「ユーザーの行動 + 該当期間 + Confidence」を含むInsightテキストを生成。
   - Insight数は最大12件、Confidenceは`LOW/MEDIUM/HIGH`のEnum。
   - 生成対象期間:
     - 直近14日以内: 直接引用できるメッセージを含む詳細Insight。
     - 15日〜180日: 要約主体。各Insightに`time_span`（例: "2025-01-10 to 2025-03-18" / "from 2025-01 onwards"）。
2. **再生成トリガー**
   - 週次ジョブ（`mise run cron-user-insights`から起動予定）で「直近7日にメッセージを送ったユーザー」を抽出し、一括生成キューを投入。
   - 管理UIからオンデマンド再生成（Current userのみ）を実行可能。完了までローディング表示。
3. **REST API**
   - `GET /v1/agent/insights` : 現行Insight一覧。Saved/GeneratedAt、time_span、confidence、source_countを返却。
   - `POST /v1/agent/insights/regenerate` : 現在のユーザーについて再生成ジョブを同期実行（レスポンス200/202）。
   - RBACアクション `ai_memory:ManageUserInsights` を追加。
4. **System Prompt注入**
   - `default_system_prompt`に `USER INSIGHTS` セクションを追加し、Confidence順(HIGH→LOW)、時間情報付きで列挙。Saved Memoryとは別ブロック。
   - Insightごとに以下フォーマット:
     ```
     - (High confidence, Feb–Mar 2025) User has asked multiple in-depth questions about Rust async streams and prefers concrete code snippets.
     ```
5. **UI/UX**
   - `/v1beta/[tenant_id]/ai/memory` ページを「Saved Memory」「User Insights」タブ構造に拡張。
   - Insightカードではテキスト、Confidenceピル、期間、関連メッセージ数を表示。再生成ボタン＆最終更新日時を表示。
   - Insightsは読み取り専用。削除は不可（再生成で上書き）。
6. **観測/監査**
   - Insight生成ジョブのトレーシングSpan + 生成結果（件数、所要時間、拒否件数）をStructured logへ出力。
   - 失敗時はRetry 3回、完全失敗時はUIへアラートを返し、Saved Memoryには影響なし。

### 非機能要件

- 1 Insightあたり最大400文字。LLM出力を正規化し、禁止語やPIIが含まれる場合は破棄。
- 生成ジョブ1回あたりLLMトークン上限 8k。チャット履歴が多い場合は期間>180日分をサンプリング。
- DB保存はテナント+ユーザーでスコープし、他オペレーターから読み取れないようにする。
- 再生成APIはIdempotent（リクエスト中に別ジョブ開始不可）。
- Confidence評価: クラスタに含まれるメッセージ数と時期の一貫性で算出（例: 5件以上かつ期間60日以内 → High）。

### コンテキスト別の責務

```yaml
contexts:
  llms-domain:
    description: "Insightドメインモデルとリポジトリ"
    responsibilities:
      - UserInsightエンティティ/値オブジェクト・Confidence enum
      - UserInsightRepositoryトレイト
  llms-usecase:
    description: "Insight生成/取得ユースケース"
    responsibilities:
      - GenerateUserInsights (クラスタ/LLM呼び出し)
      - ListUserInsights (REST/Prompt用)
      - RegenerateUserInsights (APIトリガー)
  llms-adapter:
    description: "RESTハンドラ・DB実装"
    responsibilities:
      - `/v1/agent/insights*` ハンドラ
      - SqlxUserInsightRepository + マイグレーション
  agent-runtime:
    description: "プロンプト注入"
    responsibilities:
      - default_system_prompt拡張
      - ExecuteAgentでSaved MemoryとInsightsを両方渡す
  tachyon-frontend:
    description: "AI Studio UI"
    responsibilities:
      - MemoryページにUser Insightsタブを追加
      - 再生成ボタンと状態表示
      - 新しいlib API client (`/lib/user-insights.ts`)
  ops/cron:
    description: "週次バッチ"
    responsibilities:
      - `mise run cron-user-insights` スクリプト雛形
      - Activeユーザー抽出→Usecaseに投入
```

### 仕様のYAML定義

```yaml
tables:
  user_insights:
    description: "自動生成されたユーザーインサイト"
    columns:
      - { name: id, type: ulid, pk: true }
      - { name: tenant_id, type: varchar(32), index: true }
      - { name: user_id, type: varchar(32), index: true }
      - { name: summary, type: text, limit: 400 }
      - { name: confidence, type: enum(LOW|MEDIUM|HIGH) }
      - { name: started_at, type: datetime, nullable: true }
      - { name: ended_at, type: datetime, nullable: true }
      - { name: message_count, type: int }
      - { name: cluster_keywords, type: json }
      - { name: last_generated_at, type: datetime }
      - { name: created_at, type: datetime }
      - { name: updated_at, type: datetime }
    indexes:
      - name: user_insights_user_idx
        columns: [tenant_id, user_id, confidence DESC, last_generated_at DESC]

rest:
  - method: GET
    path: /v1/agent/insights
    headers: [Authorization, x-operator-id, x-user-id]
    response:
      insights:
        - id: ui_01h...
          summary: "User prefers concise, code-focused answers"
          confidence: HIGH
          started_at: "2025-02-01T00:00:00Z"
          ended_at: "2025-03-15T00:00:00Z"
          message_count: 12
          cluster_keywords: ["Rust async", "trait objects"]
          last_generated_at: "2025-04-20T09:00:00Z"
  - method: POST
    path: /v1/agent/insights/regenerate
    headers: [Authorization, x-operator-id, x-user-id]
    body:
      mode: on_demand # reserved
    responses:
      202: { job_id: "ui_job_..." }
      200: { insights: [...] } (同期完了モード)
```

#### Insight生成アルゴリズム（擬似コード）

```rust
fn generate_insights(messages: Vec<MessageEmbedding>) -> Result<Vec<UserInsight>> {
    let filtered = filter_sensitive(messages);
    let clusters = search::adaptive_kmeans(filtered, max_k = 8);
    let mut insights = Vec::new();
    for cluster in clusters {
        if cluster.size < MIN_CLUSTER_SIZE || cluster.variance > MAX_VARIANCE {
            continue;
        }
        let time_span = span(cluster.dates);
        let prompt = build_prompt(cluster.text_samples, &time_span);
        let llm = llm::inference(prompt)?;
        insights.push(UserInsight::from_llm(llm, cluster.metadata));
    }
    Ok(normalize_confidence(insights).take(MAX_INSIGHTS))
}
```

### タスク分解

#### フェーズ1: 調査・設計 ✅ (2026-01-28)
- [x] 既存チャット履歴とEmbedding取得経路の洗い出し
- [x] Insightドメイン設計（スキーマ、Enum、制約）
- [x] LLMプロンプト雛形と出力Schema定義

#### フェーズ2: バックエンド実装 ✅ (2026-01-28)
- [x] `user_insights`マイグレーション追加
- [x] `UserInsight`エンティティ/Repository/Sqlx実装
- [x] `GenerateUserInsights` / `ListUserInsights` / `RegenerateUserInsights` usecase
- [x] RESTハンドラとApp DI、RBACアクション
- [x] Agent実行時のシステムプロンプト注入

#### フェーズ3: バッチ/ジョブ ✅ (2026-01-28)
- [x] `mise run cron-user-insights` タスクとドキュメント
- [x] Activeユーザー抽出クエリ（直近7日メッセージ）
- [x] 並列実行とリトライ戦略（EventBridge + Lambda + per-userロック）

実装メモ: `lambda-user-insights` を EventBridge (`var.user_insight_cron_schedule`、デフォルトは毎週月曜UTC 15:00) から起動。Lambda は `RegenerateUserInsights` usecase を各ユーザーに対して sequential に実行し、成功/失敗件数を CloudWatch Logs に出力する。ローカルでも `mise run cron-user-insights` で同じバイナリを実行できる。

#### フェーズ4: フロントエンド ✅ (2026-01-28)
- [x] `/lib/user-insights.ts` API Client
- [x] MemoryページUI拡張（Insightsタブ、カードUI、再生成ボタン）
- [x] 国際化辞書とSWR連携

#### フェーズ5: テスト・ドキュメント 🔄
- [x] Rust単体テスト（`mise run check`）
- [ ] Playwright/Storybookまたはスクショ
- [x] `docs/src/tachyon-apps/llms/user-insights.md` 仕様まとめ
- [x] シナリオテスト追加（`apps/tachyon-api/tests/scenarios/user_insights_rest.yaml`）
  - `GET /v1/agent/insights` が 200 で insights 配列を返す
  - `POST /v1/agent/insights/regenerate` に `model: "mock/completion"` を渡すと 200 が返る（`USE_MOCK_LLM_PROVIDER=true` 環境で検証）
  - サービスアカウントコンテキストで list/regenerate が 403 になる
  - 備考: LLMレスポンスのJSON解析失敗時は既存insightsを維持して200を返す安全な動作を追加。`regenerate` ハンドラに optional `model` フィールド（`RegenerateInsightsRequest`）を追加し、CI でモックモデルを明示指定できるようにした
- [ ] 動作確認レポート & タスク完了条件チェック

### テスト計画

- Rust: `mise run check` ＋ 新規usecaseのユニットテスト。
- SQLx: `mise run docker-sqlx-prepare`で`user_insights` schema検証。
- API: `curl /v1/agent/insights`でRBAC/レスポンス確認、`regenerate`で多重起動テスト。
- Agent: ダミーチャットを作成しプロンプトダンプでInsight挿入を確認。
- Frontend: `yarn test-storybook --filter=tachyon -- --includeTags=memory,insights`（新規タグ追加予定）。

### リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| Embedding/クラスタリング精度不足 | 高 | 最低限のヒューリスティック（TF-IDF + grouping）を実装し、LLMで補正。必要に応じFeature Flagで段階的Rollout |
| LLMコスト高騰 | 中 | Insight数上限/最小クラスタサイズ設定、クラスタテキストは少数サンプルのみ渡す |
| 再生成APIの同時実行 | 中 | tenant+user単位のmutexロックをUsecaseに実装し、429/Conflictを返却 |
| センシティブ情報混入 | 高 | Saved Memoryと同様のフィルタリングレイヤーを共通化し、不適切内容はInsight化しない |
| UI更新に伴う遅延 | 低 | InsightsタブはSWR+Skeletonで非同期ロードし、Saved Memoryへの影響を分離 |

### 参考資料

- Eric Hayes, "How ChatGPT Memory Works"（ユーザー提供ノート）
- OpenAI system prompt: Bio tool / User Insights出力例
- 既存 `docs/src/tachyon-apps/llms/saved-memory.md`

## 完了条件

- [ ] `user_insights`テーブルおよびSqlx Repositoryが追加されている
- [ ] Insight生成/取得/再生成のUsecase・REST APIが実装されている
- [ ] AgentシステムプロンプトにUser Insightsが注入される
- [ ] `/v1beta/[tenant_id]/ai/memory`からInsightsを閲覧・再生成できる
- [ ] `docs/src/tachyon-apps/llms/user-insights.md`に仕様が記載されている
- [ ] 動作確認レポートが `docs/src/tasks/in-progress/implement-user-insights/verification-report.md` に追記されている

### バージョン番号の決定基準

- [ ] 新機能追加 → 次回リリースでマイナーバージョンを +0.1 する予定

## 備考

- Saved Memory / User Insights / Chat Historyの3階層で段階的に記憶を強化する計画の第2弾。今後Reference Chat History RAG導入時には同taskdocを更新する。
