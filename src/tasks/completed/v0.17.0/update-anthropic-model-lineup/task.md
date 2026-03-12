---
title: "Anthropic最新モデル対応"
type: improvement
emoji: "🧠"
topics:
  - LLM
  - Anthropic
  - Pricing
published: true
targetFiles:
  - packages/providers/anthropic
  - packages/procurement
  - packages/catalog
  - apps/tachyon
  - docs
github: https://github.com/quantum-box/tachyon-apps
---

# Anthropic最新モデル対応

## 概要

Anthropicが2025年に投入したClaude 4.1/4.5系モデルのラインアップと価格体系を、LLMプロバイダー層および調達・カタログ・フロントエンド各コンテキストへ反映する。

## 背景・目的

- 2025年8月〜9月にAnthropicがClaude Opus 4.1およびClaude Sonnet 4.5を公開したが、現行コードはClaude 4.0/3.x世代の情報で止まっている。
- 原価・商品マッピング・UI表示が旧モデルに基づくため、最新プランの選択や課金見積もりが正しく行えない。
- 各コンテキストで最新モデルを扱えるよう更新し、将来の差し替えに備えたデータ構造を整える。

## 詳細仕様

### 機能要件

1. LLMプロバイダーのモデル定義・デフォルト選択をClaude Opus 4.1 / Claude Sonnet 4.5に更新し、旧モデルはレガシー扱いで残す。
2. 価格計算（NanoDollar換算）を最新の公開料金（Opus: $15/$75, Sonnet: $3/$15, 3.5 Haiku据え置き）へ更新し、キャッシュ割引率も維持する。
3. 調達コンテキストの原価データ（`ProcurementConfiguration`）と商品マッピング（Catalog）を新モデルIDへ対応させる。
4. フロントエンドのモデル選択肢・テストデータ・ドキュメントを最新IDへ差し替える。
5. 既存シードやドキュメント内のAnthropicモデルリストを最新化し、整合性を保つ。

### 非機能要件

- 既存API/GraphQLスキーマに破壊的変更を加えない。
- 価格計算の精度を維持し、NanoDollar換算ロジックへ影響を与えない。
- 影響範囲のテスト（Rustユニット、TypeScriptユニット）が引き続き成功すること。

### コンテキスト別の責務

```yaml
contexts:
  llms_provider:
    description: "Anthropic APIクライアントとモデル定義を提供"
    responsibilities:
      - モデルID/メタデータ/価格の最新化
      - 代表モデルのデフォルト設定の更新
  procurement:
    description: "調達・原価設定の集中管理"
    responsibilities:
      - 最新モデルの原価を設定
      - 価格更新日時の更新とベースコストの整合
  catalog:
    description: "販売商品とLLMモデルのマッピング"
    responsibilities:
      - 新モデルIDに対応する商品IDの紐付け
  frontend:
    description: "UI上のモデル選択・表示"
    responsibilities:
      - 選択肢・翻訳・テストデータの更新
      - 旧モデルラベルの整理
  docs:
    description: "内部/外部向けドキュメント"
    responsibilities:
      - モデル一覧・価格表の更新
```

### 仕様のYAML定義

```yaml
anthropic_models:
  - id: claude-opus-4-1-20250805
    display: "Claude Opus 4.1"
    context_window: 200000
    pricing_usd_per_million:
      prompt: 15.0
      completion: 75.0
      cached_prompt: 7.5
    status: latest
  - id: claude-sonnet-4-5-20250929
    display: "Claude Sonnet 4.5"
    context_window: 200000
    pricing_usd_per_million:
      prompt: 3.0
      completion: 15.0
      cached_prompt: 1.5
    status: latest
  - id: claude-3-5-haiku-20241022
    display: "Claude 3.5 Haiku"
    context_window: 200000
    pricing_usd_per_million:
      prompt: 0.8
      completion: 4.0
      cached_prompt: 0.4
    status: latest
legacy_models:
  - claude-opus-4-20250514
  - claude-sonnet-4-20250514
  - claude-3-7-sonnet-20250219
```

## 実装方針

### アーキテクチャ設計

- Clean Architectureに沿い、domain層の値オブジェクトとinfrastructure層の設定を段階的に更新。
- モデル定義は`packages/providers/anthropic`内で一元管理し、他コンテキストは同モジュールの定数を参照する形へ整理（可能な範囲で依存を減らす）。
- シード/ドキュメントは差分更新とし、履歴はGitで追跡。

### 技術選定

- Rust: 既存モジュールを拡張、`LazyLock<HashMap>`の更新。
- TypeScript: モデル一覧・Hook初期値の更新。
- ドキュメント: md/YAML手動編集（ASCII維持）。

### TDD（テスト駆動開発）戦略

#### 既存動作の保証
- `packages/providers/anthropic`のユニットテスト（モデル検証等）が通ることを確認。
- TypeScript側は既存テスト（`useAgentStream`など）を更新し、Vitestが成功するよう維持。

#### テストファーストアプローチ
- 新しい価格・モデルIDで失敗するテストを先に調整し、その後コード更新。

#### 継続的検証
- `mise run check`、必要に応じて`yarn test --filter`を実行予定。

## タスク分解

### 主要タスク
- [x] 要件定義の明確化
- [x] 技術調査・検証
- [x] 実装
- [x] テスト・品質確認（`cargo test -p providers_anthropic` / `yarn --cwd apps/tachyon test --model-picker` / `mise run check` 完走）
- [x] ドキュメント更新

## Playwright MCPによる動作確認

本タスクは主にデータ/設定の更新でありUIの動的動作確認は優先度低。

### 実施タイミング
- [x] 実装完了後の初回動作確認
- [x] PRレビュー前の最終確認
- [x] バグ修正後の再確認

### 動作確認チェックリスト
- [x] AIモデル選択画面でAnthropic最新モデルが表示される
- [x] Pricing画面でAnthropicモデル価格が更新されている

## 2025-10-19
- ✅ `cargo test -p providers_anthropic` / `mise run check` / `yarn --cwd apps/tachyon test --model-picker` を再実行し、UI上でAnthropic最新モデルが反映されていることをPlaywrightシナリオで確認。
