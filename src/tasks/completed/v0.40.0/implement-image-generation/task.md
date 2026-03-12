---
title: "画像生成機能の実装"
type: feature
emoji: "🎨"
topics:
  - LLMs
  - Image Generation
  - Nano Banana Pro
  - GPT Image
  - Gemini 3 Pro Image
  - FLUX.2
  - Ideogram 3.0
published: true
targetFiles:
  - packages/llms/domain/src/
  - packages/llms/src/usecase/
  - packages/llms/src/adapter/
  - packages/llms/src/registry/
github: https://github.com/quantum-box/tachyon-apps
---

# 画像生成機能の実装

## 概要

LLMsパッケージに画像生成機能を追加する。Nano Banana Pro (Gemini 3 Pro Image)、GPT Image 1.5、およびその他の主要な画像生成モデルをサポートし、統一されたAPIで画像生成を実行できるようにする。

## 背景・目的

- **市場動向**: 2025年後半から高品質な画像生成モデルが次々とリリースされている
  - Nano Banana Pro (Gemini 3 Pro Image) - 2025年11月リリース
  - GPT Image 1.5 - 2025年12月リリース（OpenAI最新）
  - FLUX.2 - 2025年11月リリース（Black Forest Labs）
  - Ideogram 3.0 - 2025年3月リリース（テキストレンダリング最強）
- **DALL-E廃止**: DALL-E 2/3は2026年5月12日に廃止予定のため、GPT Imageへの移行が必要
- **ユーザーニーズ**: テキストから画像を生成する機能は、コンテンツ作成、デザイン、マーケティングなど多くの用途で需要がある
- **システム統合**: 既存のLLMチャット機能と統合し、会話の中で画像生成を指示できるようにしたい
- **課金連携**: 既存のNanoDollar課金システムと統合し、画像生成の利用量を適切に課金する

## 詳細仕様

### 機能要件

1. **対応モデル（優先度順）**

   **Phase 1 - 最優先**
   - **Nano Banana Pro** (Gemini 3 Pro Image / gemini-3-pro-image-preview)
     - Google DeepMind製、4K解像度対応、テキストレンダリング優秀
     - 検索グラウンディング、マルチリファレンス融合対応
   - **GPT Image 1.5** (gpt-image-1.5) - OpenAI最新モデル
     - 4倍高速、高精度編集、オートリグレッシブモデル
     - gpt-image-1-mini: 80%低コスト版も対応

   **Phase 2 - 追加対応**
   - **FLUX.2** (Black Forest Labs)
     - オープンウェイト版あり、商用利用可
   - **Ideogram 3.0**
     - テキストレンダリング業界最高、ロゴ・ポスター向け

   **非対応（廃止予定）**
   - ~~DALL-E 2/3~~ - 2026年5月12日廃止予定

2. **画像生成API**
   - テキストプロンプトから画像を生成
   - 画像サイズ・解像度の指定（1K/2K/4K）
   - アスペクト比の指定
   - 生成枚数の指定（1-4枚）
   - 生成品質の指定（low/medium/high）
   - スタイルの指定

3. **画像編集API（Phase 2）**
   - 既存画像の編集（inpainting）
   - image-to-image変換
   - スタイル変換
   - キャラクター/オブジェクトの一貫性保持（Nano Banana Pro）

4. **ストレージ連携**
   - 生成画像のS3/R2への保存
   - 署名付きURL経由でのアクセス
   - メタデータの保存（プロンプト、モデル、生成日時など）

### 非機能要件

- **パフォーマンス**: 画像生成は15-60秒程度かかるため、非同期処理を前提とする
- **スケーラビリティ**: 同時生成リクエストの制御（キュー管理）
- **コスト管理**: NanoDollar単位での課金、生成前のコスト見積もり
- **セキュリティ**: プロンプトフィルタリング（不適切コンテンツの生成防止）

### コンテキスト別の責務

```yaml
contexts:
  llms:
    description: "画像生成の統合とAPI提供"
    responsibilities:
      - 画像生成プロバイダーの抽象化
      - 統一された生成APIの提供
      - 生成履歴の管理
      - チャットコンテキストとの統合

  payment:
    description: "画像生成の課金処理"
    responsibilities:
      - 画像生成コストの見積もり
      - クレジット消費の記録
      - 課金レポートへの反映

  storage:
    description: "生成画像の保存と配信"
    responsibilities:
      - S3/R2への画像アップロード
      - 署名付きURLの生成
      - メタデータの管理
```

### 仕様のYAML定義

```yaml
# 画像生成モデルの定義 (2026年1月時点)
image_generation_models:
  # Google DeepMind - Nano Banana Pro (Gemini 3 Pro Image)
  nano_banana_pro:
    provider: google
    api_name: "gemini-3-pro-image-preview"
    description: "Nano Banana Pro - Google DeepMind's flagship image model (Nov 2025)"
    capabilities:
      - text_to_image
      - image_to_image
      - inpainting
      - text_rendering
      - search_grounding
      - multi_reference_fusion
      - character_consistency
    resolutions: ["1024x1024", "2048x2048", "4096x4096"]
    supported_formats: ["png", "jpeg", "webp"]
    pricing:
      # ~$0.12/image (24 credits) via third-party APIs
      per_image_1k: 80_000_000       # $0.08
      per_image_2k: 120_000_000      # $0.12
      per_image_4k: 200_000_000      # $0.20

  # OpenAI GPT Image Series
  openai_gpt_image:
    provider: openai
    models:
      - name: "gpt-image-1.5"
        api_name: "gpt-image-1.5"
        description: "GPT Image 1.5 - Latest OpenAI model (Dec 2025), 4x faster"
        capabilities:
          - text_to_image
          - image_to_image
          - precise_editing
          - autoregressive
        quality_levels: ["low", "medium", "high"]
        pricing:
          # Token-based pricing translates to roughly:
          low_square: 20_000_000       # ~$0.02
          medium_square: 70_000_000    # ~$0.07
          high_square: 190_000_000     # ~$0.19
          # 20% cheaper than gpt-image-1

      - name: "gpt-image-1"
        api_name: "gpt-image-1"
        description: "GPT Image 1 - Original GPT-4o based model (Apr 2025)"
        quality_levels: ["low", "medium", "high"]
        pricing:
          low_square: 25_000_000       # ~$0.025
          medium_square: 87_500_000    # ~$0.0875
          high_square: 237_500_000     # ~$0.2375

      - name: "gpt-image-1-mini"
        api_name: "gpt-image-1-mini"
        description: "GPT Image 1 Mini - Cost-efficient version (Oct 2025), 80% cheaper"
        quality_levels: ["low", "medium", "high"]
        pricing:
          low_square: 5_000_000        # ~$0.005
          medium_square: 17_500_000    # ~$0.0175
          high_square: 47_500_000      # ~$0.0475

  # FLUX.2 (Black Forest Labs) - Phase 2
  flux2:
    provider: black_forest_labs
    models:
      - name: "flux2-pro"
        description: "FLUX.2 Pro - Production-grade model (Nov 2025)"
        open_weights: false
      - name: "flux2-dev"
        description: "FLUX.2 Dev - Open-weights version, excellent value"
        open_weights: true

  # Ideogram 3.0 - Phase 2
  ideogram:
    provider: ideogram
    models:
      - name: "ideogram-3.0"
        description: "Ideogram 3.0 - Best text rendering (Mar 2025)"
        capabilities:
          - text_to_image
          - best_in_class_text_rendering
        use_cases: ["logos", "posters", "marketing", "typography"]

  # DEPRECATED - Do not implement
  deprecated:
    - name: "dall-e-3"
      deprecation_date: "2026-05-12"
      replacement: "gpt-image-1.5"
    - name: "dall-e-2"
      deprecation_date: "2026-05-12"
      replacement: "gpt-image-1-mini"

# 画像生成リクエストの定義
image_generation_request:
  required_fields:
    - prompt: string
    - model: string
  optional_fields:
    - size: string  # "1024x1024", "1024x1792", etc.
    - quality: string  # "standard" | "hd"
    - style: string  # "natural" | "vivid"
    - n: integer  # 1-4
    - response_format: string  # "url" | "b64_json"

# 画像生成レスポンスの定義
image_generation_response:
  fields:
    - id: string
    - created: timestamp
    - model: string
    - images:
        - url: string
        - revised_prompt: string
        - width: integer
        - height: integer
    - usage:
        cost_nanodollars: integer
```

## 実装方針

### アーキテクチャ設計

```
┌─────────────────────────────────────────────────────────────┐
│                         REST API                             │
│  POST /v1/images/generations                                 │
│  GET  /v1/images/{id}                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Usecase Layer                           │
│  GenerateImage / GetImageGenerationResult                    │
│  - 認可チェック                                              │
│  - コスト見積もり・課金                                       │
│  - プロバイダー選択                                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  ImageGenerationProvider Trait               │
│  - generate(prompt, options) -> ImageGenerationResult        │
│  - estimate_cost(options) -> NanoDollar                      │
└─────────────────────────────────────────────────────────────┘
           │                  │                    │
           ▼                  ▼                    ▼
    ┌──────────┐      ┌──────────────┐     ┌─────────────┐
    │NanoBanana│      │OpenAI DALL-E │     │Google Imagen│
    │  Provider│      │   Provider   │     │  Provider   │
    └──────────┘      └──────────────┘     └─────────────┘
```

### 技術選定

- **HTTP Client**: reqwest（既存のLLMプロバイダーと同様）
- **非同期処理**: tokio
- **ストレージ**: aws-sdk-s3 / cloudflare R2
- **画像処理**: imageクレート（リサイズ、フォーマット変換）

### ドメインモデル

```rust
// packages/llms/domain/src/image_generation.rs

pub struct ImageGenerationRequest {
    pub id: ImageGenerationId,
    pub prompt: String,
    pub model: ImageModelName,
    pub size: ImageSize,
    pub quality: ImageQuality,
    pub style: Option<ImageStyle>,
    pub n: u8,  // 1-4
    pub operator_id: TenantId,
    pub user_id: UserId,
    pub created_at: DateTime<Utc>,
}

pub struct ImageGenerationResult {
    pub id: ImageGenerationId,
    pub request_id: ImageGenerationId,
    pub images: Vec<GeneratedImage>,
    pub revised_prompt: Option<String>,
    pub cost_nanodollars: NanoDollar,
    pub completed_at: DateTime<Utc>,
}

pub struct GeneratedImage {
    pub url: String,  // 署名付きURL
    pub width: u32,
    pub height: u32,
    pub format: ImageFormat,
}
```

## タスク分解

### Phase 1: 基盤実装 ✅

- [x] ドメインモデルの定義（`packages/llms/domain/src/image_generation.rs`）
- [x] ImageGenerationProvider トレイト定義（`packages/providers/llms_provider/src/image.rs`）
- [x] OpenAI Image Provider実装（`packages/providers/openai/src/image.rs`）— gpt-image-1.5, gpt-image-1, gpt-image-1-mini
- [x] Google AI Image Provider実装（`packages/providers/google_ai/src/image.rs`）— gemini-2.0-flash-exp-image-generation
- [x] xAI Image Provider実装（`packages/providers/xai/src/image.rs`）— grok-2-image
- [x] ImageGenerationRegistry の実装（`packages/llms/src/registry/image_generation_registry.rs`）
- [x] GenerateImage Usecase実装（`packages/llms/src/usecase/generate_image.rs`）
- [x] REST APIエンドポイントの実装（`packages/llms/src/adapter/axum/image_generation_handler.rs`）— POST /v1/images/generations
- [x] DI統合（`apps/tachyon-api/src/router.rs`）— ImageGenerationRegistry + GenerateImage inline構築
- [x] 認可ポリシー追加（`scripts/seeds/n1-seed/008-auth-policies.yaml`）— llms:GenerateImage アクション
- [x] シナリオテスト（`apps/tachyon-api/tests/scenarios/image_generation_rest.yaml`）— バリデーション検証
- [x] 課金連携（NanoDollar計算・PaymentApp統合）— Phase 1 完了

### Phase 2: ストレージ・永続化 📝

- [ ] 画像ストレージサービスの実装（S3/R2）
- [ ] ImageGenerationRepository の実装
- [ ] 生成履歴の保存・取得
- [ ] 署名付きURL生成
- [ ] 画像編集API（image-to-image, inpainting）

### Phase 3: 拡張プロバイダー 📝

- [ ] FLUX.2 プロバイダーの実装（Black Forest Labs）
- [ ] Ideogram 3.0 プロバイダーの実装（テキストレンダリング特化）
- [ ] Reve Image プロバイダーの実装（プロンプト忠実度）
- [ ] チャットコンテキストからの画像生成統合

### Phase 4: UI・動作確認 📝

- [ ] Tachyon管理画面での画像生成機能
- [ ] 生成履歴の表示
- [ ] コスト表示
- [ ] モデル比較機能

## Playwright MCPによる動作確認

### 動作確認チェックリスト

#### 画像生成API
- [x] REST APIでの画像生成リクエスト送信 — OpenAI, Google AI, xAI 全プロバイダーで200 OK確認
- [x] 生成結果の取得 — b64_json / URL形式で画像データ返却を確認
- [x] エラーハンドリング（不正なプロンプト、モデル指定ミス）— シナリオテストで5パターン確認済み

#### UI確認（Phase 4）
- [ ] 画像生成フォームの表示
- [ ] プロンプト入力と生成実行
- [ ] 生成中のローディング表示
- [ ] 生成結果の画像表示
- [ ] 生成履歴の一覧表示

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 外部APIの変更・非互換 | 高 | Provider traitによる抽象化、バージョン管理 |
| 画像生成の長時間化 | 中 | 非同期処理、タイムアウト設定、進捗通知 |
| 不適切コンテンツ生成 | 高 | プロンプトフィルタリング、利用規約明記 |
| コスト管理 | 中 | 事前見積もり表示、上限設定機能 |
| ストレージコスト | 低 | 自動削除ポリシー、圧縮 |

## 参考資料

- [Nano Banana Pro (Gemini 3 Pro Image) - Google Blog](https://blog.google/technology/ai/nano-banana-pro/)
- [Nano Banana API - Google AI for Developers](https://ai.google.dev/gemini-api/docs/nanobanana)
- [OpenAI Image Generation API](https://platform.openai.com/docs/guides/image-generation)
- [OpenAI Image Generation Model Introduction](https://openai.com/index/image-generation-api/)
- [GPT Image Wikipedia](https://en.wikipedia.org/wiki/GPT_Image)
- [FLUX.2 - Black Forest Labs](https://blackforestlabs.ai/)
- [Ideogram 3.0](https://ideogram.ai/)
- [Complete Guide to AI Image Generation APIs 2026](https://wavespeed.ai/blog/posts/complete-guide-ai-image-apis-2026/)
- 既存LLMプロバイダー実装: `packages/llms/src/registry/`

## 完了条件

### Phase 1（v0.40.0）
- [x] Nano Banana Pro (Gemini 3 Pro Image) での画像生成が動作する — gemini-3-pro-image-preview: 200 OK, $0.039
- [x] GPT Image 1.5 での画像生成が動作する — gpt-image-1.5: 200 OK, $0.040 (low)
- [x] gpt-image-1-mini での低コスト画像生成が動作する — 200 OK, $0.007 (low)
- [x] REST APIで画像生成・取得ができる — POST /v1/images/generations 全プロバイダー動作確認済み
- [x] NanoDollar課金が正しく計算・記録される
- [x] シナリオテストが通る（バリデーション5ステップ全パス）
- [ ] コードレビューが完了
- [x] 仕様ドキュメントを作成済み（docs/src/tachyon-apps/llms/image-generation.md）

### Phase 2（将来）
- [ ] 生成画像がストレージに保存される（S3/R2）

### バージョン番号の決定基準

**マイナーバージョン（x.X.x）を上げる:**
- [x] 新機能の追加（画像生成機能）
- [x] 新しいAPIエンドポイントの追加

## 調査メモ (2026-01-20 更新)

### Nano Banana Pro (Gemini 3 Pro Image)

- **正式名称**: Gemini 3 Pro Image (gemini-3-pro-image-preview)
- **リリース日**: 2025年11月20日 (Google DeepMind)
- **特徴**:
  - 4K解像度対応（1K/2K/4Kの3段階）
  - 優秀なテキストレンダリング（ポスター、UI、パッケージ向け）
  - 検索グラウンディング（最新情報を反映した画像生成）
  - マルチリファレンス融合（複数参照画像の統合）
  - キャラクター/オブジェクトの一貫性保持（複数フレーム対応）
- **API**: Google AI Gemini API経由
- **価格**: 約$0.08-0.20/画像（解像度による）
- **参考**: サードパーティAPI (Kie.ai等) では20%安い価格で提供

### GPT Image シリーズ (OpenAI)

- **モデル系譜**:
  1. **gpt-image-1** (2025年4月23日): GPT-4oベースの初代モデル、1週間で7億枚生成
  2. **gpt-image-1-mini** (2025年10月6日): 80%低コスト版
  3. **gpt-image-1.5** (2025年12月16日): 最新版、4倍高速、20%安い
- **特徴**:
  - DALL-Eと異なりオートリグレッシブモデル
  - image-to-image変換対応
  - 高精度な編集機能
  - 実写レベルのフォトリアリズム
- **価格**: トークンベース（低$0.02 / 中$0.07 / 高$0.19 per image）
- **重要**: DALL-E 2/3は**2026年5月12日廃止**

### FLUX.2 (Black Forest Labs)

- **リリース**: 2025年11月
- **特徴**:
  - 実験段階から本番グレードへの進化
  - オープンウェイト版（flux2-dev）あり
  - 商用利用可
- **バリエーション**: Pro版（API）、Dev版（オープン）

### Ideogram 3.0

- **リリース**: 2025年3月26日
- **特徴**:
  - **テキストレンダリング業界最高**
  - ELOレーティングで人間評価トップ
- **用途**: ロゴ、ポスター、マーケティング素材

### その他注目モデル

- **Reve Image** (2025年3月): プロンプト忠実度最高、突如登場しトップクラスに
- **Midjourney v7** (2025年4月): アーキテクチャ一新、Draft Mode（10倍速）、動画生成対応
- **HiDream-I1** (2025年4月): 170億パラメータのオープンソース

## 備考

- **Phase 1優先**: Nano Banana Pro + GPT Image 1.5 の2つに絞って実装
- **コスト効率版**: gpt-image-1-mini は低コスト要件向けに対応
- **DALL-E非対応**: 廃止予定のため実装しない
- **非同期処理**: 画像生成は時間がかかるため、ToolJobシステムとの統合を検討
- **LMArenaスコア**: GPT Image 1.5が1264でトップ
