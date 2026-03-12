# 認証・権限管理システム概要

## システム概要

Tachyon Appsの認証・権限管理システムは、マルチテナント環境での安全かつ柔軟な権限制御を提供します。Keycloak連携による認証と、独自のPolicy管理システムによる細粒度の権限制御を組み合わせています。

## 主要コンポーネント

### 1. 認証システム (Authentication)

#### Keycloak統合
- **SSO対応**: Single Sign-Onによる統合認証
- **OAuth2/OIDC**: 標準プロトコル対応
- **トークン管理**: JWT/リフレッシュトークンの管理
- **Realm管理**: テナント別のRealm分離

#### 多要素認証
- **TOTP**: Time-based One-Time Password対応
- **SMS認証**: 電話番号による二段階認証
- **バックアップコード**: 緊急時のアクセス回復

### 2. [Policy管理システム](./policy-management.md)

#### 動的権限制御
- **Action定義**: システム内の操作を体系的に管理
- **Policy定義**: 権限ポリシーの柔軟な組み合わせ
- **リアルタイム適用**: DB変更の即座反映
- **管理UI**: 直感的な権限管理インターフェース

#### 細粒度制御
- **90個のAction**: 全コンテキストの操作を網羅
- **7個の標準Policy**: 一般的な権限パターンを提供
- **カスタムPolicy**: 組織固有の要件への対応

### 3. [マルチテナンシー](./multi-tenancy.md)

#### 階層構造
```
Host
└── Platform（プラットフォーム提供者）
    └── Operator（顧客企業）
        └── User（エンドユーザー）
```

#### テナント分離
- **データ分離**: テナント間のデータ完全分離
- **権限分離**: テナント固有の権限制御
- **設定分離**: テナント別の機能設定

## 実装アーキテクチャ

### Backend (Rust)
```
auth/
├── domain/           # ビジネスロジック
│   ├── user.rs      # Userエンティティ
│   ├── policy.rs    # Policy関連エンティティ
│   └── service/     # ドメインサービス
├── usecase/         # アプリケーションロジック
│   ├── register_*.rs
│   └── check_policy.rs
└── interface_adapter/  # 外部システム連携
    ├── gateway/     # リポジトリ実装
    └── controller/  # GraphQL実装
```

### Frontend (TypeScript/React)
```
/v1beta/[tenant_id]/iam/
├── dashboard        # IAM管理ダッシュボード
├── policies/        # Policy管理画面
├── users/          # User管理画面
├── service-accounts/ # ServiceAccount管理画面
└── actions/         # Action参照画面
```

## セキュリティ機能

### アクセス制御
- **認証済みユーザー**: 有効なJWTトークン必須
- **権限チェック**: 各操作での動的権限検証
- **リソース制御**: TRN (Tachyon Resource Name) による細粒度制御
- **SessionTimeOut**: セッション自動無効化

### 監査・ログ
- **認証ログ**: ログイン/ログアウト記録
- **権限変更ログ**: Policy変更の完全追跡
- **操作ログ**: 重要操作の実行記録
- **セキュリティアラート**: 異常アクセスの検知

### データ保護
- **暗号化**: パスワード・トークンの暗号化保存
- **秘匿情報管理**: 機密データの適切な保護
- **GDPR対応**: データ削除・エクスポート機能

## API仕様

### 認証API
```typescript
// ログイン
POST /auth/login
{
  "username": "string",
  "password": "string",
  "tenant_id": "string"
}

// トークン更新
POST /auth/refresh
{
  "refresh_token": "string"
}

// ログアウト
POST /auth/logout
```

### GraphQL権限管理API
```graphql
# User管理
type User {
  id: ID!
  username: String!
  email: String
  policies: [Policy!]!
  lastLoginAt: DateTime
}

# ServiceAccount管理
type ServiceAccount {
  id: ID!
  name: String!
  policies: [Policy!]!
  apiKey: String
  lastUsedAt: DateTime
}

# Policy管理（詳細は policy-management.md を参照）
```

## 運用・管理

### 管理者機能
1. **User管理**: ユーザー作成・編集・削除・無効化
2. **ServiceAccount管理**: API用アカウント管理
3. **Policy管理**: 権限ポリシーの作成・編集・割り当て
4. **監査**: アクセス・変更ログの確認

### セルフサービス
1. **プロフィール管理**: ユーザー自身による情報更新
2. **パスワード変更**: セキュアなパスワード更新
3. **MFA設定**: 多要素認証の設定・解除
4. **APIキー管理**: 開発者向けAPIキー発行

### 監視・運用
1. **ヘルスチェック**: システム正常性監視
2. **パフォーマンス監視**: 認証・権限チェックの応答時間
3. **セキュリティ監視**: 異常アクセス・総当たり攻撃の検知
4. **容量監視**: ユーザー数・セッション数の追跡

## 設定・環境変数

### Keycloak設定
```env
KEYCLOAK_URL=http://localhost:30081
KEYCLOAK_REALM=tachyon
KEYCLOAK_CLIENT_ID=tachyon-api
KEYCLOAK_CLIENT_SECRET=xxx
```

### データベース設定
```env
AUTH_DATABASE_URL=mysql://localhost:15000/tachyon_auth
REDIS_URL=redis://localhost:6379  # キャッシュ用
```

### セキュリティ設定
```env
JWT_SECRET=xxx                    # JWT署名用秘密鍵
SESSION_TIMEOUT=3600             # セッション有効期限（秒）
MFA_REQUIRED=false               # MFA強制フラグ
```

## トラブルシューティング

### よくある問題

#### 1. 認証失敗
- **症状**: ログインできない
- **原因**: Keycloak設定、パスワード期限切れ
- **対策**: Keycloak管理画面での確認、パスワードリセット

#### 2. 権限エラー
- **症状**: 「権限がありません」エラー
- **原因**: Policy割り当て不備、Action定義不整合
- **対策**: Policy管理画面での権限確認・修正

#### 3. セッション切断
- **症状**: 頻繁なログアウト
- **原因**: セッション設定、ネットワーク問題
- **対策**: タイムアウト設定調整、ネットワーク確認

### デバッグ手法
1. **ログ確認**: 認証・権限関連ログの詳細確認
2. **JWT検証**: トークンの有効性・権限内容の確認
3. **DB確認**: Policy割り当て状況の直接確認
4. **GraphQL Playground**: APIの直接テスト

## 今後の拡張予定

### 機能拡張
- **SAML対応**: エンタープライズ向けSSO拡張
- **外部ID連携**: Google, Microsoft, GitHubアカウント連携
- **Risk-based認証**: 行動分析による適応的認証
- **API Rate Limiting**: ServiceAccount向けレート制限

### 性能改善
- **キャッシュ強化**: Redis活用による高速化
- **並列処理**: 権限チェックの並列化
- **インデックス最適化**: DB検索性能向上

### 運用改善
- **自動化**: ユーザープロビジョニング自動化
- **通知機能**: セキュリティイベント通知
- **レポート機能**: 権限レポート自動生成
- **バックアップ**: 権限設定の定期バックアップ

## 関連ドキュメント

- [Policy管理システム詳細](./policy-management.md)
- [マルチテナンシー構造](./multi-tenancy.md)
- [Clean Architecture設計](../../architecture/clean-architecture.md)
- [GraphQL API仕様](../../api/graphql-schema.md)

## 参考情報

### 標準規格・仕様
- [OAuth 2.0](https://oauth.net/2/)
- [OpenID Connect](https://openid.net/connect/)
- [JWT (RFC 7519)](https://tools.ietf.org/html/rfc7519)
- [NIST認証ガイドライン](https://pages.nist.gov/800-63-3/)

### セキュリティベストプラクティス
- [OWASP認証チートシート](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP認可チートシート](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)