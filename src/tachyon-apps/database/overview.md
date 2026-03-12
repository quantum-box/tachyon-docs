# Database

[![hackmd-github-sync-badge](https://hackmd.io/7bD-N3V5RAq7MRGn9pHd9A/badge)](https://hackmd.io/7bD-N3V5RAq7MRGn9pHd9A)



動的スキーマのデータを格納するサービス
スキーマレスにしたいデータだけをDBとして扱う

## property type

データベースでは以下のプロパティタイプをサポートしています：

- String: 文字列型
- Integer: 整数型
- Html: HTML型
- Relation: 関連型
- Select: 単一選択型
- MultiSelect: 複数選択型
- Id: ID型
- Location: 位置情報型（緯度・経度）

詳細な各型の仕様については、対応するドキュメントを参照してください。




## usecase

```plantuml
skinparam actorStyle awesome
left to right direction

actor user
actor application

rectangle "database action" {
    usecase "新規DB作成" as create_database
    usecase "プロパティ追加" as add_property
    usecase "プロパティタイプ選択" as choose_property_type
    usecase "データベース定義を見る" as get_database_definition

    usecase "データ追加" as add_data
    usecase "データ更新" as update_data
}

user --> create_database                
user --> add_property
user --> choose_property_type
user --> add_data
user --> update_data

```

## domain

```plantuml

hide methods

rectangle "Database agg"{
    entity Database<<root>> {
        DatabaseId
        TenantId
        Name
    }
}

rectangle "Property agg"{
    entity Property<<root>> {
        PropertyId
        TenantId
        DatabaseId
        Name
        PropertyType
        IsIndexed
        PropertyNum
        ' Index // user defined index
    }
    
    enum PropertyType {
        String
        Integer
        Html
        Relation
        Select
        MultiSelect
        Id
        Location
    }
    Property -> PropertyType
}

rectangle "Data agg" {
    entity Data <<root>> {
        DataId
        TenantId
        DatabaseId
        Name
        propertyData 
    }
    
    class PropertyData {
        PropertyId
        Value
    }
    Data "1"->"1..n" PropertyData
}

note bottom of Data
    propertyDataは、50propertyまで
    （増やすことは可能）
end note


' 以下は一旦実装しない　追加のリリースとかで
entity Indexes {
    id
    TenantId
    ObjectId
    FieldNum
}

entity Relationships {
    Id
    TenantId
    ObjectId
    RelationId
    TargetObjectId
}

Data }|--|| Database
Property }|--|| Database
Indexes }|--|| Data
Relationships }|--|| Data

```

## Ubiquitous language



| 言語             | eng                 | desc                                       |
| ---------------- | ------------------- | ------------------------------------------ |
| データベース     | database            | RDBでいうtableみたいなもの                 |
| プロパティ       | property            | RDBでいうcolumnにあたる                    |
| プロパティタイプ | property_type       | propertyの制約                             |
| データベース定義 | database_definition | データベースのproperty_type一覧            |
| データ           | data                | データベースの一つ一つの要素、RDBでいうrow　s |

