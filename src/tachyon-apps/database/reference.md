# Reference


## salesforceを参考にマルチテナントスキーマを構築

https://www.publickey1.jp/blog/09/3_2.html

### Overview

```plantuml
left to right direction

rectangle MetadataTable {
    entity Objects {
        カスタムオブジェクト用のメタデータ
        ---
        Id(ObjectId)
        TenantId
        ObjectName
    }

    entity Fields {
        カスタム項目用のメタデータ
        ---
        Id(FieldId)
        TenantId
        ObjectId
        FieldName
        Datatype
        IsIndexed
        FieldNum
    }   
}

rectangle Datatable{
    entity Data {
        カスタムオブジェクトの構造化データを\n格納する大容量ヒープストレージ
        ---
        Id
        TenantId
        ObjectId
        Name
        Value0(可変長文字列)
        Value1
        Value2
        Value3
        ...
    }

    entity Clobs {
        カスタムオブジェクトの非構造化データを\n格納する大容量ヒープストレージ
    }
}

rectangle PiovotTable {
    entity  Indexes {
        一意でないインデックスを\n格納するピボットテーブル
    }
}


Objects --> Data
Fields --> Data
Clobs -right-> Data

Indexes -up-> Data

```

### ERD

```plantuml

hide method
entity Objects {
    Id(ObjectId)
    TenantId
    ObjectName
}

entity Fields {
    Id(FieldId)
    TenantId
    ObjectId
    FieldName
    Datatype
    IsIndexed
    FieldNum
}  
entity Data {
    Id
    TenantId
    ObjectId
    Name
    Value0(可変長文字列)
    Value1
    Value2
    Value3
    ...
}

entity Clobs {
}

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

Data }|--|| Objects
Fields }|--|| Objects
Indexes }|--|| Data
Relationships }|--|| Data

```

シェア
https://chat.openai.com/share/59d08e3e-ce0a-4646-93ab-df46c549fbb8

Chat
https://chat.openai.com/c/87a93ac1-886e-49ee-a5a5-1b40f7f88fd0
