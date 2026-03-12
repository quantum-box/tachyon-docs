---
title: Agent API パッチアップデート - 動作確認とエラー修正
type: improvement
emoji: 🔧
topics:
  - Agent API
  - Service Account
  - Credit System
  - Bug Fix
published: true
targetFiles:
  - apps/tachyon-api/
  - apps/tachyon/
  - packages/
github: https://github.com/quantum-box/tachyon-apps/blob/main/docs/src/tasks/improvement/agent-api-patch-update/task.md
---

# Agent API パッチアップデート - 動作確認とエラー修正

## 概要

Agent APIの動作確認とエラー修正を行い、以下の一連のフローを正常に動作させる：
1. Service Account作成
2. API Key発行
3. Credit Charge（クレジットチャージ）
4. Agent API実行（REST APIエンドポイント）

これらが正常に動作することで、リリース可能な状態にしてパッチアップデートを行う。

**特に重要：** Agent APIはREST APIエンドポイントとして直接テストを行い、実際のクライアント利用を想定したサンプルクライアントも作成する。

## 背景・目的

- Agent APIの基本実装は完了しているが、実際の動作確認が不十分
- Service Account → API Key → Credit → Agent API の一連のフローで問題が発生している可能性
- 商用リリースに向けて、エンドツーエンドの動作を保証する必要がある
- 発見されたバグやエラーを修正し、安定した動作を確保する

## 詳細仕様

### 機能要件

1. **Service Account管理**
   - Service Accountの作成が正常に動作すること
   - 作成されたService Accountの一覧表示が正常に動作すること

2. **API Key管理**
   - Service AccountからAPI Keyの発行が正常に動作すること
   - 発行されたAPI Keyの管理画面が正常に動作すること

3. **Credit管理**
   - Creditのチャージが正常に動作すること
   - 残高の確認が正常に動作すること
   - 消費履歴の確認が正常に動作すること

4. **Agent API実行（REST APIエンドポイント）**
   - 発行されたAPI Keyを使用してAgent APIが正常に実行できること
   - curlコマンドやHTTPクライアントから直接APIを呼び出せること
   - ストリーミングレスポンスが正常に動作すること
   - 実行時のクレジット消費が正常に動作すること
   - エラーハンドリングが適切に動作すること

5. **サンプルクライアントの作成**
   - examplesディレクトリにサンプルクライアントを作成
   - 実際のAPI利用方法を示すコード例の提供
   - 複数の言語での実装例（TypeScript、Python、etc.）

### 非機能要件

- 各操作のレスポンス時間が適切であること
- エラーメッセージが分かりやすく、適切に表示されること
- セキュリティ上問題のないこと

### 確認すべき環境

```yaml
development_environment:
  base_url: "http://localhost:16000"
  tenant_id: "tn_01hjjn348rn3t49zz6hvmfq67p"
  api_endpoint: "http://localhost:50054"
  
required_services:
  - tachyon-api (Port: 50054)
  - tachyon (Port: 16000)
  - database (MySQL via Docker Compose)

agent_api_endpoints:
  base_url: "http://localhost:50054"
  auth_header: "Authorization: Bearer <api_key>"
  tenant_header: "x-operator-id: tn_01hjjn348rn3t49zz6hvmfq67p"
  
  endpoints:
    - path: "/v1/agent/chat"
      method: "POST"
      description: "Agent chat execution"
      streaming: true
    - path: "/v1/agent/status"
      method: "GET"
      description: "Agent status check"
```

## 実装方針

### 動作確認アプローチ

1. **段階的確認**
   - 各機能を個別に確認
   - 統合テストで全体フローを確認
   - エラーケースも含めて確認

2. **実際のブラウザでの確認**
   - Playwright MCPを使用してブラウザでの動作確認
   - ユーザー操作の観点から確認

3. **REST API エンドポイントでの直接確認**
   - curlコマンドでのAPI呼び出し確認
   - HTTPクライアントでのストリーミング確認
   - 認証・認可の確認
   - エラーレスポンスの確認

4. **サンプルクライアントでの確認**
   - 実際のクライアント利用を想定したテスト
   - 複数言語での実装例確認

### エラー修正方針

- 発見されたエラーは都度修正
- 根本原因の特定と修正
- 再発防止策の実装

## タスク分解

### フェーズ1: 環境確認と基本動作確認 📝
- [ ] 開発環境の起動確認
- [ ] 各サービスの起動状態確認
- [ ] データベース接続確認
- [ ] 基本画面の表示確認

### フェーズ2: Service Account機能の動作確認 📝
- [ ] Service Account作成画面の表示確認
- [ ] Service Account作成の動作確認
- [ ] Service Account一覧の表示確認
- [ ] 作成したService Accountの詳細確認

### フェーズ3: API Key機能の動作確認 📝
- [ ] API Key発行画面の表示確認
- [ ] API Key発行の動作確認
- [ ] 発行されたAPI Keyの表示確認
- [ ] API Key管理画面の動作確認

### フェーズ4: Credit機能の動作確認 📝
- [ ] Credit残高の表示確認
- [ ] Creditチャージ画面の表示確認
- [ ] Creditチャージの動作確認
- [ ] チャージ後の残高更新確認

### フェーズ5: Agent API実行確認（REST APIエンドポイント） 📝
- [ ] Agent API実行画面の表示確認
- [ ] 発行されたAPI Keyでの認証確認
- [ ] curlコマンドでのAgent API直接実行確認
- [ ] ストリーミングレスポンスの確認
- [ ] HTTPクライアントでのAPI実行確認
- [ ] 実行後のクレジット消費確認
- [ ] エラーレスポンスの確認（不正なAPI Key、クレジット不足等）

### フェーズ6: エラーケース・統合テスト 📝
- [ ] 不正なAPI Keyでのアクセス確認
- [ ] クレジット不足時の動作確認
- [ ] ネットワークエラー時の動作確認
- [ ] 全フローの統合テスト

### フェーズ7: サンプルクライアント作成 📝
- [ ] examplesディレクトリの作成
- [ ] TypeScriptサンプルクライアントの作成
- [ ] Pythonサンプルクライアントの作成
- [ ] curlコマンドサンプルの作成
- [ ] 各サンプルクライアントでの動作確認
- [ ] READMEドキュメントの作成

### フェーズ8: バグ修正 📝
- [ ] 発見されたエラーの修正
- [ ] 修正後の動作確認
- [ ] 回帰テストの実施

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] 各フェーズ完了後の動作確認
- [ ] バグ修正後の回帰テスト
- [ ] 最終的な統合テスト

### 動作確認チェックリスト

#### Service Account機能
- [ ] Service Account作成画面の表示
- [ ] フォームへの入力操作
- [ ] 作成ボタンクリック後の動作
- [ ] 作成成功メッセージの表示
- [ ] 作成されたService Accountの一覧表示
- [ ] 作成したService Accountの詳細画面

#### API Key機能
- [ ] API Key発行画面への遷移
- [ ] API Key発行フォームの表示
- [ ] API Key発行の実行
- [ ] 発行されたAPI Keyの表示
- [ ] API Key一覧での確認
- [ ] API Keyの詳細情報表示

#### Credit機能
- [ ] Billing画面への遷移
- [ ] 現在のクレジット残高の表示
- [ ] クレジットチャージフォームの表示
- [ ] チャージ金額の入力
- [ ] チャージ実行の動作
- [ ] チャージ完了後の残高更新

#### Agent API機能
- [ ] Agent Chat画面への遷移
- [ ] チャット画面の表示
- [ ] メッセージ入力フォーム
- [ ] メッセージ送信の動作
- [ ] AI応答の表示
- [ ] クレジット消費の反映

#### REST API直接テスト
- [ ] curlコマンドでのAPI呼び出し
- [ ] 認証ヘッダーの確認
- [ ] リクエストボディの確認
- [ ] ストリーミングレスポンスの確認
- [ ] エラーレスポンスの確認
- [ ] レスポンスヘッダーの確認

### 確認時の注意事項
- [ ] コンソールエラーの有無確認
- [ ] ネットワークリクエストの確認
- [ ] エラーメッセージの適切な表示
- [ ] ローディング状態の確認
- [ ] 各操作のレスポンス時間確認

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| Service Account作成エラー | 高 | データベース接続確認、バリデーション強化 |
| API Key発行エラー | 高 | 認証システム確認、トークン生成確認 |
| Credit計算エラー | 中 | 計算ロジック確認、テストケース追加 |
| Agent API実行エラー | 高 | 外部API接続確認、エラーハンドリング強化 |
| データベース接続エラー | 高 | 接続設定確認、再試行ロジック確認 |

## 参考資料

- [Agent API仕様書](../../tachyon-apps/api/agent-api.md)
- [Service Account仕様書](../../tachyon-apps/iam/service-account.md)
- [クレジット管理仕様書](../../tachyon-apps/billing/credit-management.md)
- [開発環境セットアップ](../../README.md)

## 完了条件

- [ ] Service Account作成が正常に動作している
- [ ] API Key発行が正常に動作している
- [ ] Creditチャージが正常に動作している
- [ ] Agent API実行が正常に動作している（UI・REST API両方）
- [ ] curlコマンドでのAgent API直接実行が成功している
- [ ] ストリーミングレスポンスが正常に動作している
- [ ] サンプルクライアントが作成され動作確認済み
- [ ] 全てのエラーケースが適切に処理されている
- [ ] 動作確認レポートが完成している
- [ ] 発見されたバグが修正されている
- [ ] 回帰テストが完了している

### バージョン番号の決定基準

このタスクが完了した際のバージョン番号の上げ方：

**パッチバージョン（x.x.X）を上げる場合:**
- [x] バグ修正
- [x] 小さな改善（UIの微調整、メッセージの変更など）
- [x] ドキュメント更新
- [x] パフォーマンス改善
- [x] 既存機能の微調整

**マイナーバージョン（x.X.x）を上げる場合:**
- [ ] 新機能の追加
- [ ] 新しい画面の追加
- [ ] 新しいAPIエンドポイントの追加
- [ ] 新しいコンポーネントの追加
- [ ] 既存機能の大幅な改善
- [ ] 新しい統合やサービスの追加

**メジャーバージョン（X.x.x）を上げる場合:**
- [ ] 破壊的変更（既存APIの変更）
- [ ] データ構造の大幅な変更
- [ ] アーキテクチャの変更
- [ ] 下位互換性のない変更

## 備考

本タスクは商用リリースに向けた重要な品質保証作業となります。すべての機能が正常に動作することを確認し、発見されたバグを確実に修正することが重要です。

## 実装済み項目（2025-01-20）

### Agent APIのトークンベース課金実装 ✅

#### 実装内容
1. **BillingAwareCommandStackの実装**
   - CommandStackのDecoratorパターンによる課金機能追加
   - Usageチャンク受信時の即時課金（リクエスト単位での課金）
   - クレジット不足時の即座停止機能

2. **課金タイミングの変更**
   - 当初：イテレーション（AttemptCompletion）毎の課金
   - 変更後：Usageチャンク受信時の即時課金（トークン使用量判明時点で課金）

3. **コンテキスト境界の明確化**
   - 課金有効/無効の判断をllmsコンテキストから除去
   - PaymentAppインターフェースに課金制御を委譲
   - 既存のpayment::NoOpPaymentAppを活用（重複実装を削除）

4. **実装ファイル**
   - `/packages/llms/src/usecase/command_stack/billing_aware.rs`（新規作成）
   - `/packages/llms/src/usecase/command_stack/billing_aware_test.rs`（新規作成）
   - `/packages/llms/src/usecase/execute_agent.rs`（BillingAwareCommandStack適用）

#### 技術的詳細
- Rust async streamでのリアルタイム課金処理
- Arc<AtomicU32>によるスレッドセーフなリクエストカウンタ
- 包括的なテストスイート（正常系、エラー系、課金無効モード）
- rustdocによる詳細なドキュメント

#### 今後の課題
- metricsクレートのインポートとメトリクス記録の有効化
- CatalogAppServiceを使用した正確なコスト計算の実装

### Agent API REST エンドポイント仕様（暫定）

```yaml
# Agent API実行エンドポイント（推定）
endpoint: "POST /v1/agent/chat"
headers:
  - "Authorization: Bearer <api_key>"
  - "x-operator-id: <tenant_id>"
  - "Content-Type: application/json"
  
request_body:
  message: "string"  # ユーザーメッセージ
  stream: true       # ストリーミングレスポンス
  
response:
  - "text/event-stream" # Server-Sent Events
  - "application/json"  # 非ストリーミング時
```

### サンプルクライアント作成予定

```
examples/
├── typescript/
│   ├── package.json
│   ├── client.ts
│   └── README.md
├── python/
│   ├── requirements.txt
│   ├── client.py
│   └── README.md
├── curl/
│   ├── examples.sh
│   └── README.md
└── README.md
```