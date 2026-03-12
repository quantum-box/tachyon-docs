# Tachyon サービス概要

Tachyonは企業向けの統合AI開発プラットフォームです。インフラ管理からAI開発まで、開発者とオペレータが必要とする機能を一つのプラットフォームで提供します。

## 主要機能

### AI Studio ✅
AI開発のための統合開発環境
- **Prompt Editor**: 変数サポート付きプロンプト作成・編集
- **Agent実行**: SSEストリーミングによるリアルタイム実行
- **履歴管理**: LocalStorageベースの実行履歴追跡
- **MCP統合**: Model Context Protocol対応ツール連携

[詳細仕様 →](./ai-studio.md)

### Agent API ツール実行基盤 ✅
エージェントが指示するファイル操作・検索・コマンド実行を安全に完了させるRust実装を整備。
- ワークスペース境界のサニタイズと 1MB 制限付き I/O
- `bash -lc` ベースのコマンド実行とタイムアウト管理
- ツール種別ごとのテレメトリ収集 (`llms_agent_tool_duration_ms`)

[詳細仕様 →](../../tachyon-apps/llms/agent-api/tool-execution.md)

### Agent API MCP初期化高速化 ✅
MCP Hub の初期化パスをキャッシュ・並列化し、レスポンス初動を大幅に短縮。
- 同一設定の再利用に LR U キャッシュを導入
- 接続処理を `FuturesUnordered` で並列化し最大同時接続数を制御
- `llms_agent_mcp_init_ms` ヒストグラムで改善効果を可視化

[詳細仕様 →](../../tachyon-apps/llms/agent-api/mcp-initialization-performance.md)

### Infrastructure as Code (IaC)
- Provider設定管理
- Platform Manifestテンプレート
- クラウドリソース管理

### Identity and Access Management (IAM)
- サービスアカウント管理
- オペレータ権限管理
- マルチテナント認証

### Feature Flag（機能フラグ管理）✅
エンタープライズレベルの機能フラグ管理システム
- **9種類の評価戦略**: パーセンテージ、ターゲティング、プラン別など
- **A/Bテスト**: 決定的ハッシュによる一貫性のあるバリアント割り当て
- **OpenFeature互換**: 業界標準API実装
- **リアルタイム管理**: サーバー再起動なしでフラグ制御

[詳細仕様 →](./feature-flag.md)

### Billing（課金管理）✅
クレジットチャージ式の使用量ベース課金システム
- **クレジット管理**: 残高確認・購入・履歴管理
- **Agent API課金**: トークン使用量とツール使用に基づく課金
- **Stripe統合**: 安全な決済処理
- **0.1クレジット精度**: 細かい使用量の正確な記録

[詳細仕様 →](./llm-billing.md)

### Tachyon API グレースフルシャットダウン ✅
Kubernetes のローリングアップデートやローカル停止時でも、進行中リクエストを完了させた上で API を終了。
- **シグナル対応**: SIGINT / SIGTERM を監視し 1 回のみグレースフルシャットダウンを実行
- **axum連携**: `with_graceful_shutdown` を適用し新規接続を拒否、既存処理を待機
- **運用ログ**: 開始・完了メッセージを `tracing::info` で出力しオペレーションを可視化

[詳細仕様 →](./graceful-shutdown-tachyon-api.md)

### xAI Grok-4 Provider ✅
xAI Grok-4 ファミリーの統合プロバイダ実装
- **Rustプロバイダ**: `packages/providers/xai` で `LLMProvider`/`ChatProvider` を実装し、`XAI_API_KEY` で認証
- **PricingRegistry連携**: NanoDollar 換算済みの調達価格を `XaiPricingProvider` から提供
- **UI更新**: Tachyon モデル選択ダイアログへ Grok 4 / Grok 4 Fast / Grok Code Fast 1 を追加

[詳細仕様 →](./llm-xai-grok4.md)

### Procurement & Pricing（調達・価格設定）✅
サービスの原価管理と顧客向け価格設定を統合管理
- **調達管理**: サプライヤー・契約・原価管理
- **価格ポリシー**: 柔軟なマークアップ率設定
- **ルールエンジン**: ボリューム割引・セグメント別価格
- **価格分析**: 収益最適化と競合分析

[詳細仕様 →](./procurement-pricing.md)

## アーキテクチャ

### マルチテナンシー構造
```
Host
└── Platform（プラットフォーム提供者）
    └── Operator（顧客企業）
        └── User（エンドユーザー）
```

### 技術スタック
- **Frontend**: Next.js, TypeScript, Tailwind CSS
- **Backend**: Rust axum
- **Database**: MySQL (TiDB)
- **Infrastructure**: AWS, Kubernetes

## バージョン履歴

### v0.8.0 (2025-06-21)
- ✅ Feature Flag管理システム実装完了
  - 9種類の評価戦略（Percentage, Targeting, Plan, Time, Version等）
  - A/Bテスト機能（決定的バリアント割り当て）
  - OpenFeature互換API実装
  - 包括的な管理UI（作成・編集・分析・レポート）
  - GraphQL統合とリアルタイムメトリクス
  - 監視・アラート機能

### v0.6.0 (2025-01-16)
- ✅ 調達・価格設定システム実装完了
  - Procurementコンテキスト（サプライヤー・契約・原価管理）
  - Pricingコンテキスト（ポリシー・ルール・セグメント管理）
  - 管理画面UI（調達管理・価格設定・分析ダッシュボード）
  - PaymentContext統合による動的価格計算
  - GraphQL API完全実装

### v0.5.0 (2025-01-14)
- ✅ Agent API クレジット課金システム実装完了
  - Stripe Customer Balance API統合
  - 0.1クレジット精度のトークンベース課金
  - GraphQL API（残高・履歴・購入）
  - PaymentAppインターフェース設計
  - Anthropicプロバイダー対応

### v0.4.0 (2024-01-13)
- ✅ AI Studio実装完了
  - Dashboard, Editor, History画面
  - 変数システムと動的プレビュー
  - Agent API統合とSSEストリーミング
  - LocalStorage永続化
  - MCP統合（設定から実行まで）
  - レスポンシブレイアウト
  - 包括的テスト（Storybook + Playwright）

### v0.1.0
- 基本プラットフォーム構造

### v0.0.0
- 初期セットアップ
- IaC・IAM基盤機能
