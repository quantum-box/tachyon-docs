# Services

それぞれのサービスのスキーマが存在する
それれ全てにアクセスしたい

サービスでは関心の分離を行い、データとしてはSSOTにより一箇所で管理したい。

```plantuml
left to right direction
title schema

actor user

package apps {
  component auth
  component crm
  component payment
  component delivery
}

note bottom of apps
  アプリケーションのためのサービス
  *関心の分離
end note

database database

note bottom of database
  データのためのサービス
  *信頼できる唯一の情報源
end note

user --> auth
user --> crm
user --> payment
user --> delivery

auth --> database
crm --> database
payment --> database
delivery --> database
```

関心の分離SoC
実世界のオブジェクトのある側面にのみアクセスできる。

信頼できる唯一の情報源SSo T
