---
title: "iac copy operator manifest"
emoji: ""
type: "tech"
topics: []
published: true
targetFiles: ["packages/iac", "packages/iac/src/usecase/copy_operator_manifest.rs"]
github: "https://github.com/quantum-box/tachyon-apps/blob/main/docs/src/tachyon-apps/iac/copy_operator_manifest.md"
---

# Copy operator manifest

## 権限

管理者ユーザーが実行できる

## 内容

現在のOperatorのPlatformはテンプレートの事前作成が必要。
マニフェストテンプレートからマニフェストの作成をクライアントで行う。

## メモ

コピーするもの

* provider config
* iam関連
  * service account
  * api key
* parent_tenant
* IaC
  * copy operator template usecase
  * manifest
    * enabledProviders
      * hubspot
      * stripe
      * square
      * openlogi
      * (slack)

oauth認証の場合は、テンプレートのプロバイダ情報をそのまま使えばいい。プロバイダの認証情報をプロバイダごとに紐づけているため。(hubspot, square, slackはアプリ連携がある）

stripeなどは認証情報をもらう必要がある

```
template
```