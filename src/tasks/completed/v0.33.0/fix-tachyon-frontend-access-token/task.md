---
title: "Tachyonフロントのdummy-token排除とアクセストークン統一"
type: "bugfix"
emoji: "🔐"
topics:
  - "frontend"
  - "auth"
  - "access-token"
published: true
targetFiles:
  - "apps/tachyon/src/lib/tachyon-api.ts"
  - "apps/tachyon/src/lib/agent-api.ts"
  - "apps/tachyon/src/lib/openfeature/openfeature-provider.tsx"
  - "apps/tachyon/src/components/mcp/mcp-config-editor.tsx"
  - "apps/tachyon/src/app/signup/actions.ts"
  - "apps/tachyon/src/app/v1beta/[tenant_id]/feature-flags/playground/components/sample-code.tsx"
  - "docs/src/tasks/in-progress/fix-tachyon-frontend-access-token/verification-report.md"
github: "https://github.com/quantum-box/tachyon-apps"
---

# Tachyonフロントのdummy-token排除とアクセストークン統一

## 概要

Tachyonフロントエンド内で残っている `dummy-token` 使用箇所を洗い出し、実際のアクセストークンで認証リクエストを行うように統一する。

## 背景・目的

- フロントエンドが開発用トークンに依存していると、本番相当の認証フローや権限検証が担保されない。
- セッションから取得できるアクセストークンを使うことで、実環境と同等の挙動を確認できるようにする。

## 詳細仕様

### 機能要件

1. `dummy-token` を用いたヘッダー生成を廃止し、セッションのアクセストークンを利用する。
2. アクセストークンが取得できない場合は、明確なエラーまたは無効化の挙動を返す。
3. サンプルコード内の例示も実トークン利用に合わせて更新する。

### 非機能要件

- 既存のAPIインターフェースを変更せずにアクセストークンの解決ロジックのみを調整する。
- トークンが未取得の場合でもUIが不正な状態にならないようガードを入れる。

### コンテキスト別の責務

```yaml
contexts:
  frontend:
    description: "Tachyonフロントエンドの認証ヘッダー生成"
    responsibilities:
      - セッションアクセストークンの利用
      - ダミートークンの排除
      - 例示コードの更新
```

## 実装方針

### アーキテクチャ設計

- `resolveAccessToken` の挙動を、実トークン優先・未取得時は明示的エラーとする。
- 各UIコンポーネントのAPI呼び出し前にアクセストークンを検証する。

### 技術選定

- NextAuthの `session.accessToken` を利用
- 既存の `resolveAccessToken` を共通ヘルパーとして活用

## タスク分解

### 主要タスク
- [x] 要件定義の明確化
- [x] 技術調査・検証
- [x] 実装
- [ ] テスト・品質確認
- [ ] ドキュメント更新

### 実装メモ ✅
- `dummy-token` の利用箇所を洗い出し、セッションの `accessToken` を使う構成に統一済み。
- `resolveAccessToken` は実トークン優先で、強制フラグ時のみ開発用トークンを許可する挙動に整理。

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] 実装完了後の初回動作確認
- [ ] PRレビュー前の最終確認
- [ ] バグ修正後の再確認

### 動作確認チェックリスト
- [ ] ログイン後にOpenFeatureのAPI呼び出しが401にならない
- [ ] MCP接続テストが実トークンで成功する
- [ ] サインアップフローが実トークンでGraphQLを呼び出す

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| アクセストークン未取得時に機能が無効化される | 中 | UIでのエラー表示とガードを追加する |

## 参考資料

- `apps/tachyon/src/lib/tachyon-api.ts`
- `apps/tachyon/src/lib/openfeature/openfeature-provider.tsx`

## 完了条件

- [ ] すべての機能要件を満たしている
- [ ] 動作確認レポートが完成している
- [ ] タスクディレクトリを completed/[新バージョン]/ に移動済み
