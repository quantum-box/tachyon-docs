---
title: "Secrets解決とLLMモデル解決の不具合修正"
type: "bug"
emoji: "🐛"
topics:
  - secrets
  - llms
  - billing
published: true
targetFiles:
  - packages/iac/src/service/secret_extractor.rs
  - packages/iac/src/service/secret_migration.rs
  - packages/llms/domain/src/llm_option.rs
  - packages/llms/src/usecase/completion_chat.rs
  - packages/llms/src/usecase/stream_completion_chat.rs
  - packages/llms/src/adapter/gateway/llm_command_service.rs
  - packages/payment/bin/sync_payment_products.rs
  - packages/crm/bin/sync_hubspot_products.rs
  - packages/auth/src/usecase/exchange_oauth_token.rs
  - apps/tachyon-api/src/di.rs
  - packages/tachyon_apps/src/secrets.rs
github: "https://github.com/quantum-box/tachyon-apps"
---

# Secrets解決とLLMモデル解決の不具合修正

## 概要

Secrets抽出時の上書き消失、LLMモデルのauto/default解決漏れ、$secret_ref未解決の実行経路を修正する。

## 背景・目的

- secrets移行により `$secret_ref` が増えたため、既存の読み書きフローで欠落・誤設定が起きる
- LLMの`auto`/`default`導入で、課金計算とモデル選択が不整合になっている
- 一部のバッチ/CLIやOAuthフローで`$secret_ref`が解決されず失敗する

## 詳細仕様

### 機能要件

1. Secret抽出/移行時に既存のsecret値を保持し、新規フィールドのみ更新する
2. LLMのモデル指定が`auto`/`default`の場合、実際のprovider/modelに解決して課金と実行に反映する
3. `$secret_ref`を利用する経路で、未解決のまま外部APIに送られない

### 非機能要件

- 既存のAPI挙動・セキュリティポリシーを維持
- 既存の暗黙的なdefault動作との後方互換性に配慮

### コンテキスト別の責務

```yaml
contexts:
  iac:
    description: "マニフェスト保存時のsecret抽出と移行"
    responsibilities:
      - secret値のマージ保存
      - $secret_ref置換の整合性

  llms:
    description: "モデル指定の解決と課金計算"
    responsibilities:
      - auto/defaultの解決
      - 実モデル名での課金計算

  auth/payment/crm:
    description: "secret参照を使う実行経路"
    responsibilities:
      - $secret_refの解決・取得
```

## 実装方針

- SecretExtractor/SecretMigrationに既存secretのマージ処理を追加
- LLMModelOptionのruntime解決を実行前に行い、課金と実行で同じprovider/modelを使う
- `$secret_ref`を使うCLI/バッチ/OAuthにsecret resolverを導入

## タスク分解

### 主要タスク
- [x] 要件定義の明確化 ✅
- [x] 技術調査・検証 ✅
- [x] 実装 ✅
- [x] テスト・品質確認 ✅
- [x] ドキュメント更新 ✅

## テスト計画

- 既存ユニットテストの更新
- LLMモデル解決の新規テスト追加（auto/default）
- Secretマージの新規テスト追加

## リスクと対策

- Secret解決により意図しないsecret露出が起きないよう、内部用途のみで解決
- 既存のdefaultモデルとの互換性を確認

## スケジュール

- 実装: 2026-01-20
- 確認/調整: 2026-01-20

## 完了条件

- Secret抽出/移行で既存値が消えない
- auto/defaultモデル指定で実行と課金が一致する
- OAuth/CLI経路で$secret_refが解決される

## 実装メモ

- ChatStreamProvidersのdefaultモデル解決は`model.id`からprovider接頭辞を除去し、`provider/model`の二重化を避ける
- `resolve_symbolic_model`/`get_default_model_for_provider`のテストを追加
