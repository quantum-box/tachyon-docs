# 多言語化（i18n）全ページ検証チェックリスト

## 検証日時
2025-10-08

## 検証環境
- ブラウザ: Playwright MCP (Chromium)
- 開発サーバー: http://localhost:16000
- テストアカウント: id: test, password: hmw2atd@HCF3qwu*rcn
- テナントID: tn_01hjjn348rn3t49zz6hvmfq67p

## 凡例
- ✅ 検証完了（日本語化確認済み）
- 🔄 検証中
- ⏳ 未検証
- ❌ 問題あり
- N/A 対象外

---

## 1. 公開/マーケティング系ページ

### 1.1 ランディングページ
- [x] `/` - トップページ
  - [x] Hero セクション
  - [x] Feature セクション
  - [x] UseCase セクション
  - [x] Pricing セクション
  - [x] Contact セクション
  - [x] Header ナビゲーション
  - [x] Footer
  - [x] 言語切り替えボタン（EN/JA）

### 1.2 価格情報ページ
- [x] `/agent-api` - Agent API紹介ページ
- [x] `/pricing/llm` - LLM料金表
- [ ] `/pricing/llm/models/[provider]/[model]` - モデル別詳細（英語文言が未適用：要翻訳対応）

### 1.3 新規組織作成
- [x] `/new-org` - 新規組織作成フォーム
- [x] `/new-org/success` - 作成完了ページ（Playwright MCPで日英確認済み）

---

## 2. サインアップ/認証フロー

### 2.1 サインアップ
- [x] `/signup` - サインアップLP
- [x] `/signup/create-account` - アカウント作成
- [x] `/signup/verify-email` - メール認証
- [x] `/signup/confirm` - 確認ページ（Playwright MCPで日英確認済み）
- [x] `/signup/welcome` - ウェルカムページ
- [x] `/signup/workspace-setup` - ワークスペース設定
- [x] `/signup/onboarding` - オンボーディング（日英ともに文言切替確認済み）

### 2.2 認証
- [x] `/sign_in` - サインイン
- [x] `/sign_out` - サインアウト（日英確認済み）
- [x] `/signin` - リダイレクト（動作確認のみ／日英確認済み）

---

## 3. エラーページ

- [x] `/403` - アクセス拒否
- [ ] `/error.tsx` - 500サーバーエラー（直アクセスでは404のため検証未実施）
- [x] `/not-found.tsx` - 404ページ

---

## 4. v1beta ダッシュボード

### 4.1 メインダッシュボード
- [x] `/v1beta/[tenant_id]` - ダッシュボードトップ
  - [x] パンくずリスト
  - [x] ページタイトル
  - [x] メトリクスカード
  - [x] クイックアクション
  - [x] お知らせセクション

### 4.2 共通レイアウト
- [x] サイドバーナビゲーション
  - [x] AI Studio グループ
  - [x] Tachyon アプリグループ
  - [x] クイックリンク
  - [x] ユーザードロップダウン
- [x] ヘッダー（Toggle Sidebar ボタン）
- [x] パンくずリスト共通表示

---

## 5. AI Suite

### 5.1 AI Studio
- [x] `/v1beta/[tenant_id]/ai/studio` - AI Studio ダッシュボード
  - [x] ページタイトル・説明
  - [x] 実行統計セクション
  - [x] クイックアクションカード
  - [x] 最近の実行セクション
- [ ] `/v1beta/[tenant_id]/ai/studio/editor` - プロンプトエディタ（主要UIが英語固定／日本語翻訳が適用されない）
- [ ] `/v1beta/[tenant_id]/ai/studio/history` - 実行履歴（英語切替時も日本語表示のまま：翻訳キー欠落）

### 5.2 Chat
- [ ] `/v1beta/[tenant_id]/ai/chat` - Chat layout（表示可：翻訳未適用・文言バラバラ）
- [ ] `/v1beta/[tenant_id]/ai/chat/[chatroom_id]` - 個別チャットルーム（詳細ページ）（一覧が500のため未検証）
- [ ] `/v1beta/[tenant_id]/ai/chat-temporary` - Chat Temporary（入力プレースホルダー等が英語のみ）
- [ ] `/v1beta/[tenant_id]/ai/chat-stream` - Chat Stream（詳細ページ）（ツールバー日本語／本文英語で混在）

### 5.3 Agent
- [ ] `/v1beta/[tenant_id]/ai/agent/chat` - エージェントチャット（見出し・ボタンが英語のまま）
- [ ] `/v1beta/[tenant_id]/ai/agent/api` - Agent API（404）

### 5.4 その他AI機能
- [ ] `/v1beta/[tenant_id]/ai` - AIプレイグラウンド（フォーム・タブが英語／ラベル混在）
- [ ] `/v1beta/[tenant_id]/ai/memory` - メモリー管理（ヘッダー・テーブルが英語表示）
- [ ] `/v1beta/[tenant_id]/ai/history` - AI履歴（詳細ページ）（テーブル見出し英語／空状態のみ日本語）

---

## 6. Billing（課金管理）

- [x] `/v1beta/[tenant_id]/billing` - Billing ダッシュボード
  - [x] ページタイトル・説明
  - [x] クレジット残高セクション
  - [x] 支払い方法セクション
  - [x] クレジット情報セクション
  - [x] 取引履歴テーブル
  - [x] クレジット購入ダイアログ（purchase-credits-dialog.tsx で辞書適用済み）
  - [x] 支払い方法追加ダイアログ（add-payment-method-dialog.tsx で辞書適用済み）
- [x] `/v1beta/[tenant_id]/billing/success` - 購入成功ページ（Storybook + I18nProvider で文言確認済み）

---

## 7. Pricing（価格管理）

### 7.1 メイン
- [x] `/v1beta/[tenant_id]/pricing` - Pricing ダッシュボード
  - [x] パンくずリスト（dict.page.breadcrumb で多言語化）
  - [x] ページタイトル（pricing.page.title/description を参照）
  - [x] Suspense フォールバック（文言無しのスピナーのみ）

### 7.2 サービス価格
- [x] `/v1beta/[tenant_id]/pricing/services` - サービス一覧
  - [x] 統計カード（api-services-stats.tsx で dict.cards〜 を利用）
  - [x] フィルター（table.dict.filters を利用）
  - [x] テーブル表示（table.dict.columns/summary を利用）
  - [x] ページネーション（table.dict.pagination を利用）
- [x] `/v1beta/[tenant_id]/pricing/services/[id]` - サービス詳細
  - [x] サービス概要（service-overview + dict.summary）
  - [x] 価格マッピングリスト（price-mapping-list.tsx dict を参照）
  - [x] 価格マッピングダイアログ（dialog が useTranslation 済み）
  - [x] 価格シミュレーター（price-simulator.tsx dict を参照）
  - [x] 価格履歴テーブル（historyCard 文言を利用）

### 7.3 その他価格管理
- [x] `/v1beta/[tenant_id]/pricing/plans` - プラン管理（pricing.plans dict を参照）
- [x] `/v1beta/[tenant_id]/pricing/segments` - セグメント管理（pricing.segments dict を参照）
- [x] `/v1beta/[tenant_id]/pricing/analysis` - 価格分析（pricing.analysis dict を参照）
- [x] `/v1beta/[tenant_id]/pricing/[policyId]` - ポリシー詳細（PricingPolicyList/PricingPolicyDialog が dict を参照）

---

## 8. IAM（アクセス管理）

### 8.1 メイン
- [x] `/v1beta/[tenant_id]/iam` - IAM ダッシュボード
  - [x] ページタイトル・説明
  - [x] 統計カード（4枚）
  - [x] クイックアクションセクション
  - [x] 管理カードセクション
  - [x] セキュリティリマインダー

### 8.2 ユーザー管理
- [ ] `/v1beta/[tenant_id]/iam/user` - ユーザーリスト
  - [ ] ユーザー招待ダイアログ
  - [ ] ユーザー一覧テーブル
- [ ] `/v1beta/[tenant_id]/iam/user/[user_id]` - ユーザー詳細（詳細ページ）

### 8.3 サービスアカウント
- [ ] `/v1beta/[tenant_id]/iam/service_account` - サービスアカウント一覧
- [ ] `/v1beta/[tenant_id]/iam/service_account/[id]` - サービスアカウント詳細（詳細ページ）

### 8.4 ポリシー・アクション
- [x] `/v1beta/[tenant_id]/iam/policies` - ポリシー管理（`policy-management.tsx` を `t.v1beta.iam.policies.list` に接続し、リストUI・トースト・統計カードを翻訳対応）
- [x] `/v1beta/[tenant_id]/iam/policies/[id]` - ポリシー詳細（`policy-detail.tsx` のボタン、タブ、ダイアログ、トーストを辞書化）
- [x] `/v1beta/[tenant_id]/iam/actions` - アクションリファレンス（`action-management.tsx` の検索・フィルター・表・統計・トーストを日本語化）

### 8.5 オペレーター
- [x] `/v1beta/[tenant_id]/iam/operator` - オペレーター管理（`OperatorTable` 列ヘッダー・検索・メニュー・ページネーションを `t.v1beta.iam.operator.table` で翻訳）

---

## 9. Feature Flags

- [x] `/v1beta/[tenant_id]/feature-flags` - Feature Flags メイン
  - [x] ページタイトル・説明
  - [x] サイドバーサブメニュー
  - [x] フィーチャーフラグリスト
- [ ] `/v1beta/[tenant_id]/feature-flags/playground` - Playground
- [ ] `/v1beta/[tenant_id]/feature-flags/reports` - A/Bテストレポート

---

## 10. IaC（Infrastructure as Code）

- [x] `/v1beta/[tenant_id]/iac` - IaC メイン
  - [x] ページタイトル
  - [x] サイドバーサブメニュー
- [ ] `/v1beta/[tenant_id]/iac/provider` - プロバイダー設定
- [ ] `/v1beta/[tenant_id]/iac/platform_manifest_template` - プラットフォームテンプレート

---

## 11. MCP設定

- [ ] `/v1beta/[tenant_id]/mcp-config` - MCP設定メイン

---

## 12. Procurement（調達管理）

- [x] `/v1beta/[tenant_id]/procurement` - Procurement メイン
  - [x] ページタイトル・説明
  - [x] サイドバーサブメニュー
  - [x] ナビゲーションカード（4項目）
- [ ] `/v1beta/[tenant_id]/procurement/products` - プロダクト一覧
- [ ] `/v1beta/[tenant_id]/procurement/prices` - 価格一覧
- [ ] `/v1beta/[tenant_id]/procurement/suppliers` - サプライヤー管理（準備中）
- [ ] `/v1beta/[tenant_id]/procurement/contracts` - 契約管理（準備中）

---

## 13. Self-Service

- [ ] `/v1beta/[tenant_id]/self-service` - Self-Service カタログ
  - [ ] プロダクトカタログ
  - [ ] チェックアウトダイアログ
- [ ] `/v1beta/[tenant_id]/self-service/orders` - 注文一覧
- [ ] `/v1beta/[tenant_id]/self-service/orders/[order_id]` - 注文詳細

---

## 14. Settings（設定）

### 14.1 メイン
- [ ] `/v1beta/[tenant_id]/settings` - 設定メイン

### 14.2 Host設定
- [ ] `/v1beta/[tenant_id]/settings/host/system` - システム設定
- [ ] `/v1beta/[tenant_id]/settings/host/database` - データベース設定
- [ ] `/v1beta/[tenant_id]/settings/host/security` - セキュリティ設定
- [ ] `/v1beta/[tenant_id]/settings/host/monitoring` - モニタリング設定
- [ ] `/v1beta/[tenant_id]/settings/host/pricing` - 価格設定

### 14.3 Platform設定
- [ ] `/v1beta/[tenant_id]/settings/platform/providers` - プロバイダー設定
- [ ] `/v1beta/[tenant_id]/settings/platform/operators` - オペレーター設定
- [ ] `/v1beta/[tenant_id]/settings/platform/limits` - 制限設定
- [ ] `/v1beta/[tenant_id]/settings/platform/pricing` - 価格設定

### 14.4 Operator設定
- [ ] `/v1beta/[tenant_id]/settings/operator` - 組織設定

---

## 15. 共通コンポーネント

### 15.1 エラーハンドリング
- [ ] GraphQLエラー通知（`mutationError.ts`）
- [ ] トーストメッセージ

### 15.2 共通UI
- [ ] DataTable
  - [ ] フィルター
  - [ ] ページネーション
  - [ ] ソート
  - [ ] 空状態表示
- [ ] ダイアログ/モーダル
- [ ] フォーム共通要素

---

## 検証方法

各ページについて以下を確認：

1. **日本語表示確認**
   - Cookie設定: `document.cookie = 'tachyon.locale=ja; path=/'; location.reload();`
   - すべてのUI要素が日本語で表示されているか
   - プレースホルダー、ボタン、ラベル、メッセージなど

2. **英語表示確認**
   - Cookie設定: `document.cookie = 'tachyon.locale=en; path=/'; location.reload();`
   - すべてのUI要素が英語で表示されているか

3. **言語切り替え確認**
   - 公開ページの言語切り替えボタン動作確認
   - ページ遷移後も言語設定が保持されているか

4. **翻訳品質確認**
   - 自然な表現が使われているか
   - 専門用語が適切に翻訳されているか
   - 文脈に合った表現か

5. **レイアウト確認**
   - 日本語表示時にレイアウトが崩れていないか
   - テキストのはみ出しや重なりがないか

---

## 検証結果記録テンプレート

各ページ検証時に記録する情報：

```markdown
### ページ名: `/path/to/page`
- **日本語表示**: ✅ / ❌
- **英語表示**: ✅ / ❌
- **確認項目**:
  - [ ] ページタイトル
  - [ ] ナビゲーション
  - [ ] メインコンテンツ
  - [ ] ボタン/リンク
  - [ ] フォーム要素
  - [ ] エラーメッセージ
  - [ ] 空状態表示
- **問題点**: （あれば記載）
- **スクリーンショット**: （必要に応じて）
```

---

## 優先順位

### 高優先度（主要フロー）
1. 公開ページ（ランディング、サインアップ）
2. 認証ページ（サインイン）
3. v1betaダッシュボード
4. Billing
5. IAM

### 中優先度（よく使う機能）
6. AI Studio
7. Pricing
8. Settings

### 低優先度（管理機能）
9. Feature Flags
10. IaC
11. MCP設定
12. Procurement
13. Self-Service

---

## 進捗状況

- **総ページ数**: 約100ページ
- **検証完了**: 22ページ（実ブラウザ検証）
- **検証中**: 0ページ
- **未検証**: 78ページ
- **進捗率**: 22%

### 検証完了ページ詳細
1. ✅ `/` - ランディングページ（全セクション）
2. ✅ `/agent-api` - Agent API紹介
3. ✅ `/pricing/llm` - LLM料金表
4. ✅ `/new-org` - 新規組織作成フォーム
5. ✅ `/signup` - サインアップLP
6. ✅ `/signup/create-account` - アカウント作成
7. ✅ `/signup/verify-email` - メール認証
8. ✅ `/signup/welcome` - ウェルカムページ
9. ✅ `/signup/workspace-setup` - ワークスペース設定
10. ✅ `/sign_in` - サインイン
11. ✅ `/403` - アクセス拒否
12. ✅ `/404` - ページが見つかりません
13. ✅ `/v1beta/[tenant_id]` - ダッシュボードトップ
14. ✅ サイドバーナビゲーション（全メニュー）
15. ✅ パンくずリスト
16. ✅ ヘッダー（Toggle Sidebar）
17. ✅ `/v1beta/[tenant_id]/ai/studio` - AI Studio ダッシュボード（全セクション）
18. ✅ `/v1beta/[tenant_id]/billing` - Billing ダッシュボード（メインセクション）
19. ✅ `/v1beta/[tenant_id]/iam` - IAM ダッシュボード（全セクション）
20. ✅ `/v1beta/[tenant_id]/procurement` - Procurement ダッシュボード（全セクション）
21. ✅ `/v1beta/[tenant_id]/feature-flags` - Feature Flags メイン（フラグ管理）
22. ✅ `/v1beta/[tenant_id]/iac` - IaC メイン

### コード実装確認済みモジュール
- ✅ Billing（billing-translations.ts）
- ✅ IAM（iam-translations.ts）
- ✅ Pricing（pricing-translations.ts）
- ✅ AI Studio（ai-translations.ts）
- ✅ Feature Flags（feature-flags-translations.ts）
- ✅ Self-Service（self-service-translations.ts）
- ✅ Procurement（procurement-translations.ts）

---

## 注記

- 詳細ページ（`[id]`等のダイナミックルート）は実装状況により検証スキップの可能性あり
- 準備中のページ（契約管理等）は検証対象外
- Cookie設定で言語切り替えを行うため、v1betaページでは言語切り替えボタンが表示されない仕様
