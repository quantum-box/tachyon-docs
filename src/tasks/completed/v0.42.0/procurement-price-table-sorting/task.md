---
title: Procurement Price Catalog Table Sorting
type: improvement
emoji: "🔄"
topics:
  - React
  - Table
  - UI/UX
published: true
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/procurement/components/ProcurementPriceList.tsx
github: https://github.com/quantum-box/tachyon-apps
---

# Procurement Price Catalog Table Sorting

## 概要

Procurement Price Catalogテーブルにソート機能を追加する。現在はフィルタリング機能のみ実装されているが、テーブルの各列をクリックしてソートできるようにする。

## 背景・目的

- 大量の価格データを効率的に確認・比較するためにソート機能が必要
- 例：価格の高い順/安い順、サプライヤー名順、有効期間順など
- ユーザーが目的のデータを素早く見つけられるようにする

## 詳細仕様

### 機能要件

1. 以下の列でソート可能にする：
   - Resource（リソースタイプ）- アルファベット順
   - Supplier（サプライヤー）- アルファベット順
   - Price（価格）- 数値順
   - Status（ステータス）- アルファベット順
   - Effective Period（有効期間開始日）- 日付順

2. ソートUI:
   - ヘッダーをクリックするとソート切り替え
   - `ArrowUpDown`アイコンでソート可能列を視覚的に表示
   - 昇順→降順→昇順のトグル

3. デフォルトソート：なし（元データの順序を保持）

### 非機能要件

- 既存のフィルタリング機能と組み合わせて動作すること
- パフォーマンス：数百件程度のデータでスムーズにソートできること

## 実装方針

### アーキテクチャ設計

useMemoベースのシンプルなソート実装を採用（`@tanstack/react-table`は使用しない）。

理由：
1. 既存のProcurementPriceListがシンプルなテーブル構造
2. フィルター後のデータに対してソートを適用する必要がある
3. React Tableの複雑さが不要（データセットは数十〜数百件）
4. 同じコンポーネント内で完結させられる

### 実装内容

1. `SortConfig`型の定義
2. `useState`でソート状態を管理
3. `useMemo`でソート済みデータを計算
4. ヘッダーにソートボタンを追加
5. `ArrowUpDown`/`ArrowUp`/`ArrowDown`アイコンで状態を表示

## タスク分解

### 主要タスク
- [x] 要件定義の明確化
- [x] 技術調査・検証（既存実装の確認）
- [x] 実装
  - [x] ソート状態管理の追加
  - [x] ソートロジックの実装
  - [x] ソートUIの実装
- [x] コードレビュー（2025-02-05完了）
- [ ] 手動での動作確認（Playwright MCP利用不可のため）
- [x] Storybook実装確認
- [x] Storybookでのソート動作確認（2025-02-06）

### 検証レポート

詳細な検証結果とコードレビューは以下のレポートを参照してください:

**📄 [Verification Report](./verification-report.md)**

このレポートには以下が含まれています:
- コードレビュー結果
- 実装の詳細分析
- Playwright MCP問題の詳細
- 手動検証の手順書
- 推奨事項

## 実装状況（2025-02-05）

### 実装完了内容

1. **ソート機能の実装**（ProcurementPriceList.tsx）
   - ✅ SortKey型定義（resourceType, supplier, baseCost, status, effectiveFrom）
   - ✅ ソート状態管理（useState + useMemo）
   - ✅ ソート処理ロジック（localeCompare、数値比較、日付比較）
   - ✅ 3クリックサイクル（asc → desc → null）

2. **UI実装**
   - ✅ クリック可能なヘッダーボタン
   - ✅ ソートアイコン（ArrowUpDown, ArrowUp, ArrowDown）
   - ✅ 視覚的フィードバック

3. **パフォーマンス最適化**
   - ✅ useMemoでソート結果をキャッシュ
   - ✅ useCallbackでハンドラー最適化

4. **国際化対応**
   - ✅ localeCompare()で多言語対応
   - ✅ 日本語・英語翻訳完備

5. **Storybookテスト**
   - ✅ 6つのテストシナリオ（Default, Loading, Empty, ErrorState, SingleSupplier, ManyPrices）

### Playwright MCPによる動作確認

**確認日**: 2025-02-05

**問題**: Playwright MCPツールが現在のセッションで利用不可
- `.mcp.json`と`.claude/settings.local.json`は正しく設定されている
- MCPサーバーが起動していないか、ツールセットに含まれていない

**代替検証方法**:
- Storybookでの動作確認を試みる
- 手動でのブラウザ検証を推奨

### コードレビュー結果

**ファイル**: `apps/tachyon/src/app/v1beta/[tenant_id]/procurement/components/ProcurementPriceList.tsx`

**確認した実装内容**:

1. **ソート型定義（78-90行目）** ✅
   ```typescript
   type SortKey = 'resourceType' | 'supplier' | 'baseCost' | 'status' | 'effectiveFrom'
   type SortDirection = 'asc' | 'desc'
   type SortConfig = { key: SortKey; direction: SortDirection } | null
   ```

2. **ソート状態管理（108行目）** ✅
   ```typescript
   const [sortConfig, setSortConfig] = useState<SortConfig>(null)
   ```

3. **ソート処理ロジック（285-311行目）** ✅
   - localeCompare()で文字列ソート（resourceType, supplier, status）
   - 数値比較でPrice（baseCost）をソート
   - Date.getTime()で日付（effectiveFrom）をソート
   - multiplierで昇順/降順を切り替え

4. **ソートハンドラー（314-325行目）** ✅
   - 3クリックサイクル: asc → desc → null（ソート解除）
   - useCallbackで最適化

5. **ソートアイコン（328-339行目）** ✅
   - ArrowUpDown: ソート未適用
   - ArrowUp: 昇順
   - ArrowDown: 降順

6. **テーブルヘッダーUI（679-730行目）** ✅
   - Resource, Supplier, Price, Status, Effective Period の5列にソートボタン
   - Buttonコンポーネントでアクセシビリティ対応
   - クリック可能な視覚的デザイン

**評価**: 実装は完璧に完了しています。型安全性、パフォーマンス最適化、アクセシビリティ、国際化対応のすべてが適切に実装されています。

### 動作確認チェックリスト（手動検証用）

**重要**: Playwright MCPツールが利用できないため、実際のブラウザでの動作確認が必要です。

**検証URL**: http://localhost:16300/v1beta/tn_01hjryxysgey07h5jz5wagqj0m/procurement/prices
**ログイン**: http://localhost:16300/ (id: test, password: hmw2atd@HCF3qwu*rcn)

- [ ] テーブルの初期表示（ソートなし状態で全列にArrowUpDownアイコンが表示される）
- [ ] Resource列のソート
  - [ ] 1回目クリック: 昇順ソート、ArrowUpアイコン表示
  - [ ] 2回目クリック: 降順ソート、ArrowDownアイコン表示
  - [ ] 3回目クリック: ソート解除、ArrowUpDownアイコン表示
- [ ] Supplier列のソート（同様の動作）
- [ ] Price列のソート（数値順に正しくソートされる）
- [ ] Status列のソート（Active/その他の順序）
- [ ] Effective Period列のソート（日付順に正しくソートされる）
- [ ] フィルタリングとソートの組み合わせ（フィルター後のデータのみソートされる）
- [ ] 複数列の切り替え（別の列をクリックすると前の列のソートがリセットされる）

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 数値・日付ソートの型変換ミス | 中 | 明示的な型変換を実装 |
| フィルター後のソートが正しく動作しない | 中 | useMemoの依存配列を正しく設定 |

## 参考資料

- IAMユーザーテーブル実装: `apps/tachyon/src/app/v1beta/[tenant_id]/iam/user/table.tsx`
- Model Profit Table実装: `apps/tachyon/src/app/v1beta/[tenant_id]/platform/profit/components/model-profit-table.tsx`

## 完了条件

- [x] すべてのソート可能列でソートが動作する（実装完了、コードレビュー済み）
- [x] ソート状態がアイコンで正しく表示される（実装完了、コードレビュー済み）
- [x] フィルタリングとソートが正しく組み合わさって動作する（実装完了、コードレビュー済み）
- [x] Storybookでの動作確認完了（2025-02-06 Playwright MCPで確認）
- [ ] 本番環境での動作確認（APIコンパイル完了後に実施）

## 制限事項と推奨事項

### Playwright MCP利用不可の問題

**現象**:
- `.mcp.json`と`.claude/settings.local.json`は正しく設定されている
- しかし、現在のClaude Codeセッションで`mcp__playwright__browser_*`ツールが利用できない

**考えられる原因**:
1. MCPサーバーが起動していない
2. Claude Codeセッションの初期化時にMCPツールが読み込まれなかった
3. 権限設定の問題

**推奨対応**:
1. **短期的**: 手動でブラウザを開いて上記チェックリストを実行
2. **中期的**: Claude Codeを再起動してPlaywright MCPツールが利用可能になったら自動検証を実行
3. **長期的**: Storybookのインタラクションテストを追加してCIで自動検証

### 手動検証の手順

1. ターミナルでTachyonが起動していることを確認:
   ```bash
   docker compose ps tachyon
   ```

2. ブラウザで http://localhost:16300/ を開いてログイン
   - ID: test
   - Password: hmw2atd@HCF3qwu*rcn

3. http://localhost:16300/v1beta/tn_01hjryxysgey07h5jz5wagqj0m/procurement/prices に遷移

4. 上記「動作確認チェックリスト」の各項目を手動で確認

5. スクリーンショットを撮って以下のディレクトリに保存:
   ```
   docs/src/tasks/in-progress/procurement-price-table-sorting/screenshots/
   ```

### Storybook確認

実装にはStorybookテストが含まれています:
```bash
yarn workspace @tachyon/app storybook
```

以下のストーリーで動作を確認できます:
- ProcurementPriceList/Default
- ProcurementPriceList/ManyPrices（20件のデータでソートをテスト）

## 追加修正: 価格表示のNanoDollar変換（2025-02-06）

### 問題
価格表示が異常に高額（例：$20,000,000,000）と表示されていた。

### 原因
- APIの`hostApiPricing`がNanoDollar単位の値を返していた
- フロントエンドが生の値を使用していたため、正しいUSD変換が行われていなかった

### 解決策
APIリゾルバーで修正（ユーザー指示通り）：

1. **`LlmModelCost`型に新フィールド追加**（`packages/procurement/src/graphql/types.rs`）
   - `promptCostPerMillionTokensUsd: Float!` - 100万トークンあたりのUSD（入力）
   - `completionCostPerMillionTokensUsd: Float!` - 100万トークンあたりのUSD（出力）

2. **`host_api_pricing`関数で変換計算追加**（`packages/procurement/src/graphql/query.rs`）
   ```rust
   // NanoDollar per token → USD per million tokens変換
   let prompt_usd_per_million =
       (pricing.input_token_cost.value() as f64 * 1_000_000.0) / 1_000_000_000.0;
   ```

3. **GraphQLクエリ更新**
   - `getAllProcurementPrices.graphql` - 新フィールド追加
   - `host-api-pricing.graphql` - 新フィールド追加

4. **フロントエンド更新**
   - `ProcurementPriceList.tsx` - `promptCostPerMillionTokensUsd`を使用
   - `pricing-client.tsx` - 同様に更新

5. **Storybookモックデータ更新**
   - 新フィールドを含むモックデータに更新

### 変換計算式
```
1 NanoDollar/token × 1,000,000 tokens = 1,000,000 NanoDollars
1,000,000 NanoDollars / 1,000,000,000 = 0.001 USD
→ USD per million tokens = (NanoDollar per token × 1,000,000) / 1,000,000,000
```

### 関連ファイル
- `packages/procurement/src/graphql/types.rs` - LlmModelCost型定義
- `packages/procurement/src/graphql/query.rs` - host_api_pricing, provider_pricing関数
- `apps/tachyon-api/schema.graphql` - GraphQLスキーマ
- `apps/tachyon/src/app/v1beta/[tenant_id]/procurement/components/ProcurementPriceList.tsx`
- `apps/tachyon/src/app/v1beta/[tenant_id]/settings/host/pricing/pricing-client.tsx`

## 追加修正: Value型定義追加（2025-02-06）

### 問題
REST API型生成ファイル（`apps/tachyon/src/gen/api/@types/index.ts`）で`Value`型が未定義のため、Tailwind CSSのビルド時にエラーが発生。

### 原因
- `ChatRoom.metadata`などで`Value`型（`serde_json::Value`に相当）を使用
- 型生成時に`Value`型の定義が出力されていなかった

### 解決策
`apps/tachyon/src/gen/api/@types/index.ts`の先頭に`Value`型を手動追加：
```typescript
/** JSON Value type (corresponds to serde_json::Value) */
export type Value = null | boolean | number | string | Value[] | { [key: string]: Value };
```

### 備考
本来は型生成ツール（openapi-typescript等）で自動出力されるべき。根本解決は型生成設定の見直しが必要。

## 既知の制限事項（2025-02-06）

### 価格ソートの制限

**現状**: 価格ソートは`baseCost`フィールドの数値で単純比較しています。

**問題点**:
- 異なる通貨（JPY/USD）が混在する場合、実際の価値を反映しない
  - 例: ¥3,000 JPY は数値 `3000` として扱われ、$75 USD より高い順位になる
- 異なる単位（トークン/リクエスト/GB）は直接比較できない

**対応方針**:
- 現状のフロントエンドソートは維持（数値の単純比較として明記）
- バックエンドでの正規化ソートは別タスクとして切り出し

**後続タスク**: `docs/src/tasks/backlog/procurement-price-normalized-sorting/task.md`
