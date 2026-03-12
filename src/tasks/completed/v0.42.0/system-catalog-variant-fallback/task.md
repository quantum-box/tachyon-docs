---
title: "CatalogApp にシステムテナントフォールバックを追加"
type: "feature"
emoji: "🔧"
topics: ["catalog", "multi-tenancy", "agent-api", "system-tenant"]
published: true
targetFiles:
  - packages/catalog/src/app.rs
  - apps/tachyon-api/src/di.rs
  - scripts/seeds/n1-seed/005-order-products.yaml
github: https://github.com/quantum-box/tachyon-apps
---

# CatalogApp にシステムテナントフォールバックを追加

## 概要

API_SERVICE商品（LLMモデルバリアント）をシステムレベルの商品として全テナントからアクセス可能にする。`LlmProviderRegistry` と同じ `system_tenant_id`（Host テナント `tn_01jcjtqxah6mhyw4e5mahg02nd`）フォールバックパターンを `CatalogApp` に導入する。

## 背景・目的

- **現状の問題**: Agent API で `anthropic/claude-opus-4.5` 等のモデルを使用しようとすると、商品がテナント `tn_01hjryxysgey07h5jz5wagqj0m`（Tachyon dev）にのみ登録されているため、本番テナント `tn_01hjjn348rn3t49zz6hvmfq67p` からは「Model is not available for this tenant」エラーが発生する
- **原因**: `CatalogApp.find_variant_by_provider_and_model` がリクエストテナントのみで検索し、システムテナントへのフォールバックがない
- **既存パターン**: `LlmProviderRegistry` には既に同様の `system_tenant_id` フォールバックが実装済み（`packages/llms/src/registry/llm_provider_registry.rs`）

## 詳細仕様

### 機能要件

1. `CatalogApp` に `system_tenant_id` を設定可能にする
2. `find_variant_by_provider_and_model` でリクエストテナントにバリアントがない場合、システムテナントにフォールバック
3. `CatalogLlmPricingFallback` でも同様のフォールバックを実装
4. シードデータの API_SERVICE 商品を Host テナントに移動

### 非機能要件

- 既存のテナント固有商品の検索動作に影響を与えない（リクエストテナント優先）
- `LlmProviderRegistry` と同じ SYSTEM_TENANT_ID を共有

## 実装方針

### アーキテクチャ設計

`LlmProviderRegistry` のフォールバックパターンを踏襲:
1. リクエストテナントで検索
2. 見つからない場合、system_tenant_id が設定されていて異なるテナントなら再検索
3. それでも見つからない場合は None を返す

## タスク分解

### 主要タスク

- [x] `CatalogApp` に `system_tenant_id` フィールドと `with_system_tenant_id` メソッド追加
- [x] `AppBuilder` に `system_tenant_id` サポート追加
- [x] `find_variant_by_provider_and_model` にフォールバックロジック追加
- [x] `CatalogLlmPricingFallback` にフォールバック追加
- [x] `di.rs` で `system_tenant_id` を注入
- [x] シードデータの tenant_id を Host テナントに変更
- [x] コンパイル確認 (`mise run check`)
- [x] シード反映 (`mise run docker-seed`)

## 対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `packages/catalog/src/app.rs` | CatalogApp + AppBuilder + CatalogLlmPricingFallback にフォールバック追加 |
| `apps/tachyon-api/src/di.rs` | system_tenant_id の注入 |
| `scripts/seeds/n1-seed/005-order-products.yaml` | API_SERVICE 商品の tenant_id を Host テナントに変更 |

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 本番データのtenant_id不整合 | 高 | フォールバック機構により、旧テナントでも新テナントでも検索可能 |
| FK制約違反 | 中 | シードの全関連テーブルを一括変更 |

## 完了条件

- [x] 全テナントから Agent API のモデルバリアントが解決される
- [x] `mise run check` が通る
- [x] シードデータが正常に投入される
