# Playwright MCPを使った動作確認ガイド

このドキュメントでは、Playwright MCPツールを使用してWebアプリケーションの動作確認を行う方法について説明します。

## 概要

Playwright MCPは、ブラウザの自動操作を可能にするツールで、手動テストと同等の動作確認を自動的に実行できます。

## 基本的な使用方法

### 1. ブラウザの起動とナビゲーション

```bash
# ページを開く
mcp__playwright__browser_navigate --url "http://localhost:3000"

# ページのスナップショットを取得
mcp__playwright__browser_snapshot
```

### 2. 要素の操作

#### クリック操作
```bash
# 要素をクリック
mcp__playwright__browser_click --element "ボタンのテキスト" --ref "button[aria-label='送信']"
```

#### テキスト入力
```bash
# テキストフィールドに入力
mcp__playwright__browser_type --element "入力フィールド" --ref "input[name='email']" --text "test@example.com"
```

#### セレクトボックスの操作
```bash
# オプションを選択
mcp__playwright__browser_select_option --element "選択ボックス" --ref "select[name='plan']" --values ["premium"]
```

### 3. ページの状態確認

#### スクリーンショット
```bash
# 全体のスクリーンショット
mcp__playwright__browser_take_screenshot --filename "page-state.png"

# 特定要素のスクリーンショット
mcp__playwright__browser_take_screenshot --element "フォーム部分" --ref ".billing-form" --filename "form-state.png"
```

#### 待機処理
```bash
# テキストが表示されるまで待機
mcp__playwright__browser_wait_for --text "処理が完了しました"

# 一定時間待機
mcp__playwright__browser_wait_for --time 3
```

### 4. ネットワークリクエストの確認

```bash
# ネットワークリクエストの一覧を取得
mcp__playwright__browser_network_requests
```

### 5. コンソールメッセージの確認

```bash
# コンソールログを確認
mcp__playwright__browser_console_messages
```

## 動作確認フロー

### 1. 準備
1. アプリケーションを起動
2. 必要なテストデータを準備
3. ブラウザを開く

### 2. シナリオ実行
1. ページにナビゲート
2. 必要な操作を実行
3. 結果を確認

### 3. 検証
1. スクリーンショットで視覚的確認
2. ネットワークリクエストで通信確認
3. コンソールログでエラー確認

## トラブルシューティング

### ブラウザがインストールされていない場合
```bash
mcp__playwright__browser_install
```

### 要素が見つからない場合
1. スナップショットで現在のページ状態を確認
2. セレクタが正しいか確認
3. 要素が表示されるまで待機処理を追加

### タイミングの問題
- 要素の表示を待つ: `wait_for`を使用
- ページの読み込みを待つ: ナビゲート後に少し待機
- 非同期処理の完了を待つ: 特定のテキストやステータスを待機

## ベストプラクティス

1. **明確な要素識別**
   - aria-labelやroleを優先的に使用
   - data-testidは最終手段

2. **適切な待機処理**
   - 固定時間の待機より、条件付き待機を使用
   - ページの状態変化を待つ

3. **段階的な確認**
   - 各操作後にスナップショットを取得
   - エラーが発生した場合はコンソールログを確認

4. **再現性の確保**
   - 同じ手順で同じ結果が得られることを確認
   - テストデータの初期化を適切に行う

## 実践例：Billing機能の動作確認

### シナリオ
TachyonアプリケーションのBilling機能を確認する

### 手順

1. **アプリケーションへのアクセス**
```bash
# ページを開く
mcp__playwright__browser_navigate --url "http://localhost:16000"
```

2. **Billingページへの遷移**
```bash
# Billingリンクをクリック
mcp__playwright__browser_click --element "Billing" --ref "link要素のref"
```

3. **タブの切り替え**
```bash
# 各タブをクリックして内容を確認
mcp__playwright__browser_click --element "クレジット購入" --ref "tab要素のref"
mcp__playwright__browser_click --element "取引履歴" --ref "tab要素のref"
mcp__playwright__browser_click --element "支払い方法" --ref "tab要素のref"
```

4. **スクリーンショットによる記録**
```bash
# 画面状態を記録
mcp__playwright__browser_take_screenshot --filename "billing-overview.png"
```

### 確認ポイント

- **クレジット残高の表示**: 現在の残高が正しく表示されているか
- **タブの動作**: 各タブが正しく切り替わるか
- **エラーメッセージ**: 残高不足などの警告が適切に表示されるか
- **開発環境の制限**: 開発環境では課金機能が無効になっていることの表示

### Agent API実行の確認

1. **AI Studioへの移動**
```bash
mcp__playwright__browser_click --element "Playground" --ref "link要素のref"
```

2. **メッセージの送信**
```bash
# テキスト入力
mcp__playwright__browser_type --element "メッセージ入力フィールド" --ref "textbox要素のref" --text "テストメッセージ"
# 送信
mcp__playwright__browser_click --element "送信" --ref "button要素のref"
```

3. **レスポンスの待機**
```bash
mcp__playwright__browser_wait_for --time 5
```

4. **課金状態の確認**
- Billingページに戻って残高の変化を確認
- 開発環境では残高が変化しないことを確認

## Agent実行時の課金機能テスト

### テストシナリオ

1. **残高チェックのテスト**
   - 残高不足時にAgent実行が拒否されることを確認
   - 十分な残高がある場合にAgent実行が許可されることを確認

2. **クレジット消費のテスト**
   - Agent実行後に正しい金額が消費されることを確認
   - トークン使用量に基づいて課金されることを確認
   - ツール使用に対する追加料金が正しく計算されることを確認

3. **Stripe Billing Credits連携テスト**
   - 使用量がStripeに正しく報告されることを確認
   - 環境変数が設定されていない場合のエラーハンドリング

### 手順

1. **Agent実行ページへの移動**
```bash
# Agent実行ページへ移動
mcp__playwright__browser_navigate --url "http://localhost:16000/v1beta/[tenant_id]/llms/agent"
```

2. **初期残高の確認**
```bash
# Billingページで残高を確認
mcp__playwright__browser_navigate --url "http://localhost:16000/v1beta/[tenant_id]/billing"
mcp__playwright__browser_snapshot
# 現在の残高をメモ
```

3. **Agentタスクの実行**
```bash
# Agent実行ページに戻る
mcp__playwright__browser_navigate --url "http://localhost:16000/v1beta/[tenant_id]/llms/agent"

# タスクを入力
mcp__playwright__browser_type --element "タスク入力フィールド" --ref "textarea[name='task']" --text "現在の日付と時刻を教えてください"

# 実行ボタンをクリック
mcp__playwright__browser_click --element "実行" --ref "button[type='submit']"

# 実行完了を待つ（最大60秒）
mcp__playwright__browser_wait_for --text "Agent completed" --time 60
```

4. **実行後の残高確認**
```bash
# Billingページで残高を再確認
mcp__playwright__browser_navigate --url "http://localhost:16000/v1beta/[tenant_id]/billing"
mcp__playwright__browser_snapshot

# 取引履歴タブで詳細を確認
mcp__playwright__browser_click --element "取引履歴" --ref "button[data-value='history']"
mcp__playwright__browser_wait_for --time 2
mcp__playwright__browser_snapshot
```

### 確認ポイント

#### 開発環境（BILLING_ENABLED=false）
- Agent実行が成功すること
- 残高が変化しないこと
- 取引履歴に記録が追加されないこと

#### ステージング環境（BILLING_ENABLED=true）
- 残高が適切に減少すること
- 取引履歴に「Agent execution」の記録が追加されること
- 消費クレジットの内訳が正しいこと：
  - 基本料金: 10クレジット
  - トークン料金: プロンプトトークン × 0.01 + 完了トークン × 0.02
  - ツール使用料金: 使用したツールに応じた料金

### トラブルシューティング

#### 残高不足エラーの場合
```bash
# エラーメッセージを確認
mcp__playwright__browser_snapshot
mcp__playwright__browser_console_messages

# 手動でクレジットを付与（開発環境）
# GraphQL Mutationまたは管理画面から実行
```

#### Stripe連携エラーの場合
```bash
# コンソールエラーを確認
mcp__playwright__browser_console_messages

# ネットワークリクエストを確認
mcp__playwright__browser_network_requests
```

### 自動テストスクリプトの例

```bash
#!/bin/bash
# test-agent-billing.sh

# 1. 初期残高を記録
echo "=== 初期残高の確認 ==="
mcp__playwright__browser_navigate --url "http://localhost:16000/v1beta/test-tenant/billing"
mcp__playwright__browser_wait_for --time 2
mcp__playwright__browser_take_screenshot --filename "billing-initial.png"

# 2. Agent実行
echo "=== Agent実行 ==="
mcp__playwright__browser_navigate --url "http://localhost:16000/v1beta/test-tenant/llms/agent"
mcp__playwright__browser_type --element "タスク" --ref "textarea[name='task']" --text "簡単なタスクです"
mcp__playwright__browser_click --element "実行" --ref "button[type='submit']"
mcp__playwright__browser_wait_for --text "completed" --time 30

# 3. 実行後の残高確認
echo "=== 実行後の残高確認 ==="
mcp__playwright__browser_navigate --url "http://localhost:16000/v1beta/test-tenant/billing"
mcp__playwright__browser_wait_for --time 2
mcp__playwright__browser_take_screenshot --filename "billing-after.png"

# 4. 取引履歴の確認
echo "=== 取引履歴の確認 ==="
mcp__playwright__browser_click --element "取引履歴" --ref "button[data-value='history']"
mcp__playwright__browser_wait_for --time 2
mcp__playwright__browser_take_screenshot --filename "transaction-history.png"

echo "テスト完了"
```