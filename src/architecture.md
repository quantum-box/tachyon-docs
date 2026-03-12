# Tachyon Architecture

```plantuml
left to right direction

component Database
component Cms
component Crm
component Sfa
component Projects
component Auth
component "BPO(Process manager)" as Bpo
component FeatureFlag
component SourceExplore

database "RDB(DBaaS)" as Rdb {
    node region1
    node region2
    node region3
}

Database --> Rdb
Sfa --> Rdb
FeatureFlag --> Rdb
SourceExplore --> Rdb
Auth --> Rdb
Bpo --> Rdb

Cms --> Database
Crm --> Database
Projects --> Database
```

## components

| コンポーネント名 | 概要 | 責務 |
| --- | --- | --- |
| DBaaS | 社内DB | 冗長性・パフォーマンス |
| Database | バージョン管理・DB操作 | 開発者ユーザビリティ |

## 関連ドキュメント

- [rmcp SSEハンドリング改善](./architecture/mcp-sse-handling.md)

### DBaaaS

社内DBaaS

### Database

スキーマレスリレーショナルデータベース
