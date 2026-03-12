---
title: "Better Authのトークン自動更新修正"
type: "bug"
emoji: "🐞"
topics:
  - Authentication
  - Cognito
  - BetterAuth
published: true
targetFiles:
  - apps/tachyon/src/app/auth/driver-better-auth.ts
  - apps/tachyon/src/app/auth/get-session.ts
  - packages/frontend-auth/src/server.ts
  - packages/frontend-auth/src/multi-tenancy.ts
  - packages/frontend-auth/src/schema.ts
github: https://github.com/quantum-box/tachyon-apps
---

# Better Authのトークン自動更新修正

## 概要

Tachyon フロントエンドに導入した Better Auth で Cognito のアクセストークンが失効後に自動更新されない問題を解消し、長時間の利用でも API 呼び出しが継続できるようにする。

## 背景・目的

- 2025-10-10 時点でも API 呼び出しはサインイン直後の `accessToken` を使用し続けるため、有効期限経過後に 401 が発生する。
- `refreshToken` がセッションへ渡っていないため、Better Auth 側でリフレッシュフローをトリガーできない。
- Cognito の `REFRESH_TOKEN_AUTH` フローを正しく実行し、ユーザー操作なしでトークンを入れ替えることで UX と可用性を向上させる。

## 詳細仕様

### 機能要件

1. `fetchSession` 相当のサーバー処理で `expiresAt` を確認し、残り 300 秒未満なら `REFRESH_TOKEN_AUTH` を実行する。
2. リフレッシュ成功時に `accessToken`, `idToken`, `expiresAt` を更新し、Better Auth のアダプタ経由で永続化する。
3. 新しいトークンを Next.js 側のセッションレスポンスおよび `/api/auth/get-session` のレスポンスへ即時反映する。
4. リフレッシュの失敗はセッション破棄とサインイン誘導で処理し、エラー内容を構造化ログで観測できるようにする。
5. セッション API は `refreshToken` をマスクしつつ、バックエンドのユースケースから参照できるように返却する。

### 非機能要件

- リフレッシュ処理は 500ms 以内を目標とし、リトライ回数は 1 回まで。
- ログ出力ではトークン文字列をマスクし、ユーザー ID・テナント ID を含める。
- 認証関連のエラーは既存の `errors::Error::Unauthorized` を利用し、HTTP 401 / GraphQL `UNAUTHENTICATED` を返す。

### コンテキスト別の責務

- **frontend-auth**: セッションスキーマに `refreshToken` を公開し、アダプタ更新を提供する。
- **tachyon-frontend**: `driver-better-auth` で有効期限の判定とリフレッシュ処理を実装し、SWR キャッシュを更新する。
- **cognito-integration**: AWS SDK を利用して `REFRESH_TOKEN_AUTH` をコールし、結果を正規化する。

## 仕様のYAML定義

```yaml
cognito_refresh:
  flow: "REFRESH_TOKEN_AUTH"
  token_ttl_threshold_seconds: 300
  retry_policy:
    max_attempts: 2
    delay_ms: 200
  secret_hash:
    enabled: true
session_payload:
  expose:
    - accessToken
    - expiresAt
    - operator
  mask:
    - refreshToken
logging:
  namespace: "better_auth.refresh"
  redact_fields:
    - accessToken
    - refreshToken
```

## 実装方針

### アーキテクチャ設計

- `apps/tachyon/src/app/auth/driver-better-auth.ts` にリフレッシュ専用ユーティリティを追加し、セッション取得時にパイプライン化する。
- AWS Cognito SDK は `@aws-sdk/client-cognito-identity-provider` を継続使用し、呼び出し部分を小さな関数に分離してテストしやすくする。
- セッション再構築後は Better Auth の `updateSession` を呼び出し、クライアント側キャッシュを更新する。

### 技術的検討（メモ）

- `packages/frontend-auth` の Prisma / Adapter 実装を確認し、`refreshToken` フィールドを返却しつつクライアント側では `null` にマスクする仕組みを追加する。
- `updateAge` 呼び出しと干渉しないよう、既存セッション更新ロジックを調整する。
- エラー処理は `AuthRefreshFailed` のようなドメインエラーコードを `errors::Error::Unauthorized` にラップしてログに出す。
- 2025-10-11: Better Auth の追加フィールド定義で `refreshToken.input` が `false` のままだったため永続化されず、`internalAdapter.updateUser` からも書き込めなかった。`input: true` のまま `returned: false` を維持してサーバー専用で利用する方針に更新。

### テスト戦略

- Vitest でリフレッシュ判定ユーティリティ（期限内 / 期限切れ / 無効トークン）のユニットテストを追加する。
- Cognito 呼び出しはモック化し、リトライやエラー分岐を検証する。
- Next.js API ルートの統合テストで `fetchSession` が新しいトークンを返すことを確認する。
- Playwright MCP で長時間セッションシナリオ（TTL 短縮環境）を確認する。

## タスク分解

### フェーズ1: 現状調査 ✅ (2025-10-10 完了)

- [x] 現在の Better Auth ドライバと `packages/frontend-auth` のスキーマを確認する。
- [x] Cognito Refresh フローの実装可否を再調査する。
- [x] 既存ログ / メトリクスでの失敗事象を洗い出す。

### フェーズ2: 設計と準備 ✅ (2025-10-10 完了)

- [x] リフレッシュユーティリティのインターフェース設計をまとめる。
- [x] `refreshToken` 公開に伴うセキュリティ確認を行う。
- [x] テストケースとモック戦略を洗い出す。

### フェーズ3: 実装 ✅ (2025-10-10 完了)

- [x] `frontend-auth` スキーマとサーバー処理を改修する。
- [x] Tachyon フロントのドライバ実装とログ整備を行う。
- [x] SWR キャッシュ更新と Next.js API の調整を実施する。

### フェーズ4: テスト・動作確認 🔄 (2025-10-10 着手)

- [ ] ユニット / 統合テストを作成し実行する。
- [x] `mise run check` を実行する（`ci-node` は未実施）。
- [ ] Playwright MCP によるブラウザ確認を実施する。
- [ ] 影響範囲の回帰確認を行う。

### フェーズ5: ドキュメント更新とクロージング 📝

- [ ] taskdoc と verification-report を最終更新する。
- [ ] 必要な仕様ドキュメントへの反映を完了する。
- [ ] 完了条件をチェックし、リリース準備を整える。

## テスト計画

- `packages/frontend-auth`: Vitest でリフレッシュロジックのユニットテストを実施する。
- `apps/tachyon`: `yarn ts --filter=tachyon` で型確認、`yarn lint --filter=tachyon` で静的検査を行う。
- シナリオテスト: 必要に応じて `apps/tachyon-api/tests/scenarios/` にリフレッシュシナリオを追加する。
- Playwright MCP: 長時間セッション継続とエラー時のサインアウト誘導を手動確認する。
- 実施ログ (2025-10-10): `yarn ts --filter=tachyon` / `yarn lint --filter=tachyon` / `mise run check`
- 実施ログ (2025-10-11): `yarn ts --filter=@tachyon-apps/frontend-auth` / `yarn lint --filter=@tachyon-apps/frontend-auth` / `yarn ts --filter=tachyon` / `yarn lint --filter=tachyon` / `mise run check`

## Playwright MCPによる動作確認

- [ ] サインイン後に擬似失効時間を設定し、自動リフレッシュが走ること。
- [ ] リフレッシュ直後でも GraphQL 呼び出しが成功し続けること。
- [ ] セッション破棄時にサインイン画面へ誘導され、トーストが表示されること。
- [ ] コンソールエラーが出力されないこと。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| Cognito のシークレットハッシュ計算失敗 | 高 | 既存実装を再利用しユニットテストで検証する |
| `refreshToken` 漏えい | 高 | レスポンスで `null` マスクし、ログでマスクフィールドを設定する |
| 既存セッション更新ロジックとの競合 | 中 | `updateAge` 呼び出し順を確認し、統合テストで二重更新を防止する |
| Playwright での長時間シナリオ再現難度 | 中 | TTL を短縮するフラグや環境変数を用意して検証する |

## スケジュール

- 調査・設計: 2025-10-10
- 実装: 2025-10-10 〜 2025-10-11
- テスト・動作確認: 2025-10-11
- ドキュメント更新: 2025-10-11

## 完了条件

- [ ] リフレッシュロジックが実装され、ユニット / 統合テストが通過している。
- [ ] `mise run check` と関連 lint / test コマンドが成功している。
- [ ] Playwright MCP による動作確認を完了し、レポートを更新した。
- [ ] taskdoc と関連ドキュメントが最新化されている。
- [ ] 必要に応じてリリースノートへ記載する準備ができている。

## 参考資料

- Better Auth / Cognito 連携既存コード (`apps/tachyon/src/app/auth`)
- AWS Cognito `REFRESH_TOKEN_AUTH` ドキュメント
- 社内ログダッシュボード（認証失敗率）
