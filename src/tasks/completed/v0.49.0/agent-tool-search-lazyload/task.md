---
title: "Agent APIのTool検索によるLazy Load対応"
type: "feature"
emoji: "🧭"
topics:
  - "agent-api"
  - "tooling"
  - "context-optimization"
published: true
targetFiles:
  - "apps/tachyon-api/"
  - "packages/llms/"
  - "docs/src/tachyon-apps/"
github: "https://github.com/quantum-box/tachyon-apps"
---

# Agent APIのTool検索によるLazy Load対応

## 概要

Agent APIでtoolのLazy Loadとコンテキスト削減を実現するため、tool検索用のAPI/内部サービスを追加する。

## 背景・目的

- Agent APIが利用可能なtoolを一括で読み込むことでコンテキストが肥大化している
- 目的に応じたtool選定が難しく、プロンプト設計やUXに影響が出ている
- tool一覧を検索・絞り込みできる仕組みを導入し、必要なtoolのみをロードできるようにする
- 起動時にMCPサーバーを立ち上げる設計が初回のAgent APIレスポンス遅延に寄与しているため、Lazy Load導入で初回応答の遅さも緩和する

## 詳細仕様

### 機能要件

1. toolメタデータの検索APIを提供する
2. フィルタ条件（名前、カテゴリ、機能タグ、権限）で絞り込みできる
3. 検索結果からtool詳細を取得できる
4. Agent APIがtool一覧をリクエストする際にLazy Loadのフローを選択できる

### 非機能要件

- 検索APIの応答は100ms以内（ローカル開発環境での目安）
- toolメタデータはキャッシュ可能（TTLは設定可能）
- 既存のAgent APIフローを壊さない後方互換性を維持

### コンテキスト別の責務

```yaml
contexts:
  llms:
    description: "toolのメタデータ管理と検索"
    responsibilities:
      - toolメタデータの正規化
      - 検索条件の解釈
      - キャッシュ戦略の提供
  tachyon_api:
    description: "Agent APIのエンドポイント提供"
    responsibilities:
      - tool検索APIの公開
      - 認可/認証
      - レスポンスの整形
```

### 仕様のYAML定義

```yaml
# tool検索APIのリクエスト/レスポンス仕様
agent_tool_search:
  request:
    query: "string"       # 任意
    tags: ["string"]      # 任意
    categories: ["string"] # 任意
    permissions: ["string"] # 任意
    limit: 50              # 1-100
  response:
    items:
      - tool_id: "tool_..."
        name: "SearchTool"
        description: "検索用のツール"
        tags: ["search", "knowledge"]
        categories: ["utility"]
        availability:
          status: "available" # available | disabled
          reason: ""           # disabled理由がある場合
```

## 実装方針

### アーキテクチャ設計

- toolメタデータはLLMSコンテキストで集約し、検索はUsecaseで提供
- Agent APIは検索エンドポイントを追加し、必要に応じてtool詳細を取得
- Lazy Load用に既存のtool一覧取得フローと併存させる

### 技術選定

- 既存のRust/axum構成に合わせてRESTエンドポイントを追加
- toolメタデータは既存の構造体を流用し、検索条件を追加

## タスク分解

### 主要タスク
- [ ] 要件定義の明確化
- [ ] 技術調査・検証
- [ ] 実装
- [ ] テスト・品質確認
- [ ] ドキュメント更新

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] 実装完了後の初回動作確認
- [ ] PRレビュー前の最終確認

### 動作確認チェックリスト
- [ ] tool検索APIのレスポンス確認
- [ ] フィルタ条件の動作確認
- [ ] tool詳細取得の動作確認
- [ ] 既存フローとの互換性確認

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 検索APIの濫用による負荷増 | 中 | キャッシュとレート制御を検討 |
| 既存toolロードの挙動変更 | 中 | 既存フローは維持し段階的に移行 |

## 参考資料

- Agent API仕様
- Tool Job API関連ドキュメント

## 完了条件

- [ ] すべての機能要件を満たしている
- [ ] コードレビューが完了
- [ ] 動作確認レポートが完成している
- [ ] 正式な仕様ドキュメントを作成済み
- [ ] タスクディレクトリを completed/[新バージョン]/ に移動済み

## 備考

- 実装開始時に詳細なエンドポイント仕様を確定する
