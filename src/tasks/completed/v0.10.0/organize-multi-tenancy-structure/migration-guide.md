# マルチテナンシー構造移行ガイド

## 概要

このドキュメントは、既存のTachyon Appsシステムを新しいマルチテナンシー構造に移行するためのガイドです。

## 移行の概要

### 変更点

1. **テナント階層の明確化**
   - Host → Platform → Operator の3階層構造
   - 各レベルでの設定管理と継承メカニズム

2. **フロントエンドの変更**
   - TenantContextの導入
   - ハードコードされたtenant_idの除去
   - 権限に基づく動的な設定画面表示

3. **バックエンドの変更**
   - ConfigurationProviderトレイトの導入
   - 継承ポリシーによる設定管理
   - 監査ログの追加

## 移行手順

### Phase 1: 準備

1. **バックアップの作成**
   ```bash
   # データベースのバックアップ
   mysqldump -h 127.0.0.1 -P 15000 -u root tachyon_apps > backup_$(date +%Y%m%d).sql
   ```

2. **依存関係の更新**
   ```bash
   # フロントエンド
   yarn install
   
   # バックエンド
   cargo update
   ```

### Phase 2: データベース移行

1. **新しいテーブルの作成**
   ```sql
   -- テナント階層管理テーブル
   CREATE TABLE `tenant_hierarchy` (
     `tenant_id` VARCHAR(29) NOT NULL,
     `tenant_type` ENUM('host', 'platform', 'operator') NOT NULL,
     `parent_id` VARCHAR(29),
     `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (`tenant_id`),
     FOREIGN KEY (`parent_id`) REFERENCES `tenant_hierarchy`(`tenant_id`)
   );
   
   -- 設定監査ログテーブル
   CREATE TABLE `configuration_audit_log` (
     `id` VARCHAR(32) NOT NULL,
     `tenant_id` VARCHAR(29) NOT NULL,
     `user_id` VARCHAR(29) NOT NULL,
     `category` VARCHAR(50) NOT NULL,
     `before_value` JSON,
     `after_value` JSON,
     `note` TEXT,
     `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (`id`),
     INDEX `idx_tenant_created` (`tenant_id`, `created_at`)
   );
   ```

2. **既存データの移行**
   ```sql
   -- 既存のテナントをOperatorとして登録
   INSERT INTO `tenant_hierarchy` (tenant_id, tenant_type, parent_id)
   SELECT 
     tenant_id,
     'operator' as tenant_type,
     'pl_default' as parent_id  -- デフォルトPlatform
   FROM existing_tenants;
   
   -- デフォルトPlatformを作成
   INSERT INTO `tenant_hierarchy` (tenant_id, tenant_type, parent_id)
   VALUES ('pl_default', 'platform', 'hs_default');
   
   -- デフォルトHostを作成
   INSERT INTO `tenant_hierarchy` (tenant_id, tenant_type, parent_id)
   VALUES ('hs_default', 'host', NULL);
   ```

### Phase 3: コード更新

1. **フロントエンドの更新**

   a. layout.tsxの更新
   ```typescript
   // Before
   export default function Layout({ children }) {
     return <>{children}</>
   }
   
   // After
   import { TenantProvider } from '@/app/providers/TenantProvider'
   
   export default function Layout({ children, params }) {
     return (
       <TenantProvider tenantId={params.tenant_id}>
         {children}
       </TenantProvider>
     )
   }
   ```

   b. ハードコードされたtenant_idの置換
   ```typescript
   // Before
   const tenantId = 'tn_01hjjn348rn3t49zz6hvmfq67p'
   
   // After
   import { useTenant } from '@/lib/hooks/use-tenant'
   const { tenantInfo } = useTenant()
   const tenantId = tenantInfo?.id
   ```

2. **バックエンドの更新**

   a. ConfigurationProvider実装の追加
   ```rust
   // 各パッケージにconfiguration.rsを追加
   impl ConfigurationProvider for YourProvider {
       // 実装
   }
   ```

   b. GraphQLリゾルバーの更新
   ```rust
   // tenant_configuration.rsをGraphQLスキーマに追加
   .data(iac_config_provider)
   .data(payment_config_provider)
   .data(llms_config_provider)
   ```

### Phase 4: Feature Flag設定

1. **新機能の段階的有効化**
   ```yaml
   features:
     - key: multi_tenancy_settings
       enabled: false  # 最初は無効
       strategy: gradual_rollout
       parameters:
         percentage: 0  # 0%から開始
   
     - key: operator_settings_enabled
       enabled: true
       strategy: tenant_targeting
       targets:
         - tn_pilot_tenant_1
         - tn_pilot_tenant_2
   ```

2. **段階的ロールアウト**
   - Week 1: 社内テスト（0%）
   - Week 2: パイロット顧客（10%）
   - Week 3: 段階的拡大（25% → 50%）
   - Week 4: 全体公開（100%）

### Phase 5: 検証

1. **機能テスト**
   ```bash
   # E2Eテストの実行
   yarn test:e2e --filter=tachyon
   
   # 統合テストの実行
   cargo test -p auth_domain
   cargo test -p payment
   cargo test -p llms
   ```

2. **パフォーマンステスト**
   - 設定取得のレスポンスタイム
   - 継承処理のオーバーヘッド
   - データベースクエリの最適化

3. **セキュリティ監査**
   - 権限チェックの確認
   - 設定の不正な上書き防止
   - 監査ログの適切な記録

## ロールバック手順

問題が発生した場合のロールバック手順：

1. **Feature Flagの無効化**
   ```yaml
   features:
     - key: multi_tenancy_settings
       enabled: false  # 即座に無効化
   ```

2. **コードのロールバック**
   ```bash
   # 前のバージョンにロールバック
   git checkout <previous-version-tag>
   yarn install
   yarn build
   ```

3. **データベースのロールバック**
   ```bash
   # バックアップから復元
   mysql -h 127.0.0.1 -P 15000 -u root tachyon_apps < backup_20250121.sql
   ```

## トラブルシューティング

### よくある問題

1. **設定が反映されない**
   - キャッシュのクリア: `yarn cache clean`
   - ブラウザキャッシュのクリア
   - Feature Flagの確認

2. **権限エラー**
   - tenant_hierarchyテーブルの確認
   - Feature Flagのtenant_targeting確認
   - ユーザーロールの確認

3. **パフォーマンス問題**
   - 継承チェーンの深さ確認（3階層まで）
   - インデックスの最適化
   - キャッシュ戦略の見直し

## サポート

移行に関する質問やサポートが必要な場合：

- Slackチャンネル: #tachyon-migration
- ドキュメント: [Multi-tenancy Architecture](../../../tachyon-apps/authentication/multi-tenancy.md)
- 緊急時連絡先: sre-team@quantum-box.io