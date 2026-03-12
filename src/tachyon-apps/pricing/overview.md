# 価格設定機能

## 概要

Tachyonの価格設定機能は、提供するサービスの価格を柔軟に管理し、調達コストに基づいて適切な利益を確保するための包括的なシステムです。

## 主要機能

### 1. [APIサービス管理](./api-services-management.md)
膨大な数のAPIサービスを効率的に管理するためのスケーラブルなUI。検索、フィルタリング、ソート機能により、数千のサービスでも素早くアクセス可能。

### 2. サービス価格設定
各APIサービスの価格を個別に設定：
- 基本料金と従量課金の組み合わせ
- 調達原価へのマークアップ率設定
- 有効期間による価格管理
- [価格マッピング UI の詳細](./api-service-price-mapping-clarity.md)

### 3. 料金プラン管理
顧客セグメントに応じた料金プランの作成：
- Standard、Pro、Enterpriseなどのプラン定義
- プラン別の割引率設定
- 含まれる機能とクレジットの管理

### 4. 価格分析
収益性と競争力を確保するための分析機能：
- サービス別の利益率表示
- [価格シミュレーション](./pricing-simulation.md)
- 使用量に基づく収益予測

## アーキテクチャ

価格設定システムは以下のコンポーネントで構成されています：

- **Catalogパッケージ**: サービスカタログと価格マッピングの管理
- **Orderパッケージ**: 製品情報の基盤
- **Procurementパッケージ**: 調達原価との連携
- **Paymentパッケージ**: 実際の課金処理

## 利用シナリオ

### 新しいAPIサービスの追加
1. Productとして新しいAPIサービスを登録
2. ProductUsagePricingで従量課金設定を定義
3. ServicePriceMappingで価格を設定
4. 料金プランでの割引を適用

### 価格改定
1. 新しい価格マッピングを作成（有効期間を設定）
2. 価格シミュレーションで影響を確認
3. 段階的に新価格へ移行

### 利益率の最適化
1. 現在の利益率を分析
2. 競合価格と比較
3. マークアップ率を調整

### 5. テナント階層価格統合
Pricing Context がLLM課金フローに統合され、テナント階層（Host → Platform → Operator）ごとのマークアップが自動適用されます。
- SKUベースの価格解決
- Host原価 → Platform markup → Operator markup の段階的価格計算
- [Pricing Context仕様（Phase 3-4統合）](./pricing-context-specification.md#llm課金フロー統合phase-3-4)

## 関連ドキュメント

- [サービスカタログアーキテクチャ](/architecture/service-catalog.md)
- [課金システム](/tachyon-apps/billing/overview.md)
- [Agent API価格設定](/services/tachyon/agent-api.md)
- [Pricing Context仕様](./pricing-context-specification.md)
