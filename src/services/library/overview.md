# Library

このサービスは以下のような機能を提供する。

- リポジトリの管理
- データの管理
- バージョン管理
- 差分管理
- リポジトリのポリシーの管理
- Markdownプロパティ型（[詳細](./property-type-markdown.md)）
- **Location型**（[仕様](./location-type.md)）— 位置情報（緯度・経度）プロパティ、Google Maps連携
- **Date型**（[仕様](./date-property-type.md)）— 日付プロパティタイプ、ISO 8601形式
- **ガントチャートビュー**（[仕様](./gantt-chart-view.md)）— 日付ベースのプロジェクト管理・タスク管理ビュー
- **DuckDB DataView**（[仕様](./duckdb-data-view.md)）— クライアントサイドSQLによるデータビュー高速化
- データの公開Markdownエクスポート（[仕様](./public-markdown-export.md)）
- **GitHub Sync**（[仕様](./github-sync.md)）— データをFrontmatter MarkdownとしてGitHubへ同期
- **Linear Sync**（[仕様](./linear-sync.md)）— Linear Issues と Library データの同期
- **GitHub Markdown Import**（[仕様](./github-markdown-import.md)）— GitHubリポジトリからMarkdownをインポート
- **多言語対応（i18n）**（[仕様](./i18n.md)）— 日本語/英語の2言語対応
- GraphQL/REST シナリオテスト（[仕様](./api-scenario-tests.md)）

url: `organization/repository`

## 実装状況ドキュメント

- [Library実装サマリー](./implementation.md) — 画面・GraphQL呼び出し・未実装領域を横断的に整理した最新版メモ。

## domain model

```plantuml
title Library domain model
hide method

entity Organization {
    id
    username
}

entity User {
    id
    private_organization_id
}
User --> Organization

entity Repository {
    id
    organization_id
    username
    policies: Vec<Policy>
}
Repository --> Organization

entity Database {
    id
    repository_id
}
Database --> Repository

class Policy {
    user_id
    role
}
Policy --> User
Policy --> Repository

enum Role {
    Owner
    Writer
    Read
}
Role --> Policy

```

## usecase

- public
  - リポジトリを閲覧する
  - リポジトリを検索する
  - データを取得する
  - データを検索する
- only all signed_in user
  - pull requestを作成する
- only own repository user
  - リポジトリを登録・更新する
  - データを登録・更新する
- only owner
  - データを削除する
  - リポジトリのpolicyを変更する
  - リポジトリを削除する

## Data migration

古いバージョンのデータを新しいバージョンに移行する。
database_managerのテナントIDはplatformIdからoperatorIdに移行した
Library上ではorgIdはoperatorIdと同等

```sql
-- 更新対象レコード数の確認
SELECT 'objects' as table_name, COUNT(*) as count
FROM tachyon_apps_database_manager.objects o
JOIN LIBRARY.repos r ON o.object_name = r.username
WHERE o.tenant_id = 'tn_01j702qf86pc2j35s0kv0gv3gy'
UNION ALL
SELECT 'fields' as table_name, COUNT(*) as count
FROM tachyon_apps_database_manager.fields f
JOIN tachyon_apps_database_manager.objects o ON f.object_id = o.id
JOIN LIBRARY.repos r ON o.object_name = r.username
WHERE f.tenant_id = 'tn_01j702qf86pc2j35s0kv0gv3gy'
UNION ALL
SELECT 'data' as table_name, COUNT(*) as count
FROM tachyon_apps_database_manager.data d
JOIN tachyon_apps_database_manager.objects o ON d.object_id = o.id
JOIN LIBRARY.repos r ON o.object_name = r.username
WHERE d.tenant_id = 'tn_01j702qf86pc2j35s0kv0gv3gy';

-- 更新クエリ（前回と同じ）
UPDATE tachyon_apps_database_manager.objects o
JOIN LIBRARY.repos r ON o.object_name = r.username
SET o.tenant_id = r.org_id
WHERE o.tenant_id = 'tn_01j702qf86pc2j35s0kv0gv3gy';

UPDATE tachyon_apps_database_manager.fields f
JOIN tachyon_apps_database_manager.objects o ON f.object_id = o.id
JOIN LIBRARY.repos r ON o.object_name = r.username
SET f.tenant_id = r.org_id
WHERE f.tenant_id = 'tn_01j702qf86pc2j35s0kv0gv3gy';

UPDATE tachyon_apps_database_manager.data d
JOIN tachyon_apps_database_manager.objects o ON d.object_id = o.id
JOIN LIBRARY.repos r ON o.object_name = r.username
SET d.tenant_id = r.org_id
WHERE d.tenant_id = 'tn_01j702qf86pc2j35s0kv0gv3gy';
```
