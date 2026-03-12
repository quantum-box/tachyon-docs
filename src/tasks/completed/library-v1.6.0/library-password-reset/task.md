---
title: "Library ユーザーパスワードリセット機能"
type: feature
emoji: "🔑"
topics:
  - Library
  - Authentication
  - AWS Cognito
  - Password Reset
published: true
targetFiles:
  - apps/library/src/app/(auth)/sign_up/cognito-actions.ts
  - apps/library/src/app/(auth)/forgot-password/page.tsx
  - apps/library/src/app/(auth)/forgot-password/forgot-password.stories.tsx
  - apps/library/src/app/(auth)/reset-password/page.tsx
  - apps/library/src/app/(auth)/reset-password/reset-password.stories.tsx
  - apps/library/src/app/(auth)/sign_in/form.tsx
github: https://github.com/quantum-box/tachyon-apps
---

# Library ユーザーパスワードリセット機能

## 概要

Library アプリケーションのユーザーがパスワードを忘れた際に、セルフサービスでパスワードをリセットできる機能を実装する。

## 背景・目的

- **なぜ必要か**: Library ユーザーがパスワードを忘れた場合、現在はリセット手段がなく、管理者に依頼するか新規アカウント作成が必要だった
- **解決したい課題**: ユーザー自身でパスワードリセットを完結できるようにする
- **期待される成果**: ユーザー体験の向上、サポート負荷の軽減

## 詳細仕様

### 機能要件

1. **Forgot Password ページ** (`/forgot-password`)
   - ユーザー名を入力するフォーム
   - 送信すると Cognito `ForgotPassword` API を呼び出し
   - 6桁の確認コードがユーザーのメールに送信される
   - 成功後、Reset Password ページへ自動遷移

2. **Reset Password ページ** (`/reset-password`)
   - ユーザー名（URLパラメータから自動入力）
   - 6桁確認コード入力フィールド
   - 新パスワード入力フィールド
   - パスワード確認フィールド
   - 送信すると Cognito `ConfirmForgotPassword` API を呼び出し
   - 成功後、Sign In ページへリダイレクト

3. **Sign In フォームへの導線追加**
   - パスワードフィールドの横に「Forgot password?」リンクを追加

### パスワード要件

```yaml
password_requirements:
  min_length: 8
  require_uppercase: true
  require_lowercase: true
  require_number: true
  require_symbol: false  # Cognito設定依存
```

### AWS Cognito API フロー

```yaml
password_reset_flow:
  step1_request:
    api: ForgotPassword
    input:
      - ClientId
      - Username
      - SecretHash
    output:
      - DeliveryMedium: EMAIL
      - Destination: masked_email
    side_effect: 6桁コードをメール送信

  step2_confirm:
    api: ConfirmForgotPassword
    input:
      - ClientId
      - Username
      - ConfirmationCode
      - Password
      - SecretHash
    output:
      - success/failure
```

### 非機能要件

- **セキュリティ**: SecretHash を使用した認証
- **UX**: ローディング状態の表示、エラーメッセージの適切な表示
- **レスポンシブ**: モバイル・デスクトップ両対応

## 実装方針

### アーキテクチャ設計

- 既存の認証フローと同じパターンを踏襲
- Server Actions (`'use server'`) を使用
- AWS SDK for JavaScript v3 を使用

### 技術選定

- **フロントエンド**: Next.js App Router, React Hook Form, Zod
- **バックエンド**: AWS Cognito Identity Provider
- **UI**: shadcn/ui コンポーネント

## タスク分解

### 主要タスク

- [x] Cognito パスワードリセット用サーバーアクション追加
  - `forgotPassword()` - リセットコード送信
  - `confirmForgotPassword()` - コード検証＆パスワード変更
- [x] Forgot Password ページ作成 (`/forgot-password`)
- [x] Reset Password ページ作成 (`/reset-password`)
- [x] Sign In フォームに「Forgot password?」リンク追加
- [x] Storybook ストーリー追加
  - `forgot-password.stories.tsx`
  - `reset-password.stories.tsx`
- [x] 動作確認（Mailinator使用）

## Playwright MCPによる動作確認

### 動作確認チェックリスト

#### パスワードリセットフロー
- [x] Sign In ページで「Forgot password?」リンクが表示される
- [x] リンクをクリックすると `/forgot-password` に遷移する
- [x] ユーザー名を入力して送信できる
- [x] 送信成功時にトースト通知が表示される
- [x] 自動的に `/reset-password` に遷移する
- [x] URLパラメータからユーザー名が自動入力される
- [x] 6桁コードと新パスワードを入力できる
- [x] パスワードリセット成功時にトースト通知が表示される
- [x] Sign In ページにリダイレクトされる
- [x] 新しいパスワードでログインできる

#### エラーケース
- [ ] 存在しないユーザー名での送信時のエラー表示
- [ ] 無効な確認コードでの送信時のエラー表示
- [ ] パスワード要件を満たさない場合のバリデーションエラー
- [ ] パスワード不一致時のバリデーションエラー

### 動作確認結果

実施日: 2025-12-06
テストユーザー: librarytest123@mailinator.com

#### ✅ 基本動作確認完了

| ステップ | 結果 |
|---------|------|
| 1. サインアップ | ✅ `librarytest123@mailinator.com` で作成 |
| 2. メール認証 | ✅ コード `920365` で認証完了 |
| 3. パスワードリセット要求 | ✅ 6桁コードがメール送信された |
| 4. リセットコード受信 | ✅ コード `155964` を Mailinator で取得 |
| 5. 新パスワード設定 | ✅ `NewPassword456!` に変更完了 |
| 6. 新パスワードでログイン | ✅ ダッシュボード表示成功 |

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| Cognito API エラー | 中 | 適切なエラーハンドリングとユーザーへのメッセージ表示 |
| メール配信遅延 | 低 | 「Resend Code」リンクを提供 |
| 確認コードの有効期限切れ | 低 | 再送信機能とエラーメッセージで対応 |

## 参考資料

- [AWS Cognito ForgotPassword API](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_ForgotPassword.html)
- [AWS Cognito ConfirmForgotPassword API](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_ConfirmForgotPassword.html)
- 既存実装: `apps/library/src/app/(auth)/sign_up/cognito-actions.ts`

## 完了条件

- [x] すべての機能要件を満たしている
- [x] Storybook ストーリーが追加されている
- [ ] コードレビューが完了
- [x] 動作確認が完了している
- [ ] タスクディレクトリを completed/[新バージョン]/ に移動済み

### バージョン番号の決定基準

このタスクは **パッチバージョン（x.x.X）を上げる** 対象です：
- [x] 小さな改善（認証周りの機能追加）
- [x] 既存機能の拡張（パスワードリセットはセルフサービス認証の一部）

## 備考

- Cognito のメール件名は「Verify your email address」で統一されている（サインアップ確認もパスワードリセットも同じ件名）
- 6桁の確認コードは Cognito のデフォルト設定

