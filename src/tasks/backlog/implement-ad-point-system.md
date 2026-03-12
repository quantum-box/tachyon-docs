---
title: "広告クレジットポイントシステムの実装"
type: "feature"
emoji: "🎯"
topics: ["Rust", "clean-architecture", "payment", "advertising", "native-app"]
published: true
targetFiles: ["packages/ad-credits/", "apps/tachyon-api/", "apps/tachyon/"]
github: ""
---

# 広告クレジットポイントシステムの実装

## 概要

ネイティブアプリにおいて、ユーザーが広告を視聴することでクレジット（ポイント）を獲得し、そのポイントを使用してTachyonプラットフォーム上の各種サービスを無料で利用できる仕組みを実装する。広告視聴によりポイントを付与し、サービス利用時にポイントをNanoDollarに換算して消費する。

## 背景・目的

### ビジネス背景

1. **収益化モデルの多様化**
   - 既存のサブスクリプション/従量課金に加え、広告ベースの無料利用モデルを提供
   - ユーザー獲得の敷居を下げ、プラットフォーム全体の利用促進

2. **ネイティブアプリへの対応**
   - ネイティブアプリ向けに広告SDKと連携
   - 広告収益をサービス利用コストに充当する仕組み

3. **ユーザー体験の向上**
   - 「ポイント獲得」というゲーミフィケーション要素でエンゲージメント向上
   - 無料でもサービスを試せる機会の提供

4. **汎用的なクレジットシステム**
   - エージェントAPI、LLM API、その他将来のサービスすべてに適用可能
   - PaymentコンテキストのNanoDollar課金と並列する代替支払い手段

### 技術的目標

- 広告視聴の検証（不正防止）
- ポイント残高のリアルタイム管理
- サービス利用時のポイント消費とNanoDollar換算
- 任意のコンテキストから利用可能な汎用API

## 詳細仕様

### システム構成

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Flutter App   │────▶│  AdMob SSV       │────▶│  Tachyon API    │
│  (iOS/Android)  │     │  (Server-Side    │     │  /ad-credits/*  │
│                 │     │   Verification)  │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                                                │
        │ (Fallback: クライアント申告)                    │
        └────────────────────────────────────────────────┘
                                                         │
                                                         ▼
                                            ┌─────────────────────┐
                                            │   AdCredits Context │
                                            │  - ポイント管理       │
                                            │  - 履歴管理          │
                                            │  - 換算レート管理     │
                                            └─────────────────────┘
                                                         │
                        ┌────────────────────────────────┼────────────────────────────────┐
                        │                                │                                │
                        ▼                                ▼                                ▼
           ┌─────────────────────┐          ┌─────────────────────┐          ┌─────────────────────┐
           │   LLMs Context      │          │   Catalog Context   │          │   Future Services   │
           │  - Agent API        │          │  - 商品購入          │          │  - 新規サービス      │
           │  - Chat API         │          │  - サービス利用       │          │                     │
           └─────────────────────┘          └─────────────────────┘          └─────────────────────┘
```

### PaymentAppとの関係

```
┌─────────────────────────────────────────────────────────────────────┐
│                         サービス利用時の支払い                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌──────────────────┐              ┌──────────────────┐           │
│   │   PaymentApp     │     OR       │   AdCreditsApp   │           │
│   │  (NanoDollar)    │              │  (AdPoint)       │           │
│   │                  │              │                  │           │
│   │ - Stripe課金     │              │ - 広告視聴で獲得  │           │
│   │ - クレジットカード │              │ - 無料で利用可能  │           │
│   │ - サブスクリプション│              │ - NanoDollar換算 │           │
│   └──────────────────┘              └──────────────────┘           │
│            │                                  │                    │
│            └──────────────┬───────────────────┘                    │
│                           ▼                                        │
│                  ┌──────────────────┐                              │
│                  │  NanoDollar消費   │                              │
│                  │  (統一された課金)  │                              │
│                  └──────────────────┘                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### ドメインモデル

#### 値オブジェクト

```rust
/// ポイント値オブジェクト（NanoDollarとは別の単位系）
pub struct AdPoint(i64);

impl AdPoint {
    pub const ZERO: Self = Self(0);

    pub fn new(value: i64) -> Self { Self(value) }
    pub fn value(&self) -> i64 { self.0 }

    /// NanoDollarへの変換（換算レートを使用）
    pub fn to_nanodollar(&self, rate: &ConversionRate) -> NanoDollar {
        rate.convert(*self)
    }
}
```

```rust
/// ポイント→NanoDollar換算レート
/// 例: rate = 1_000_000 → 1ポイント = 1,000,000 NanoDollar = $0.001
pub struct ConversionRate {
    /// 1ポイントあたりのNanoDollar
    nanodollars_per_point: i64,
    effective_from: DateTime<Utc>,
    effective_until: Option<DateTime<Utc>>,
}
```

#### エンティティ

```rust
/// ユーザー別ポイント残高
pub struct AdPointBalance {
    id: AdPointBalanceId,           // ULID: apb_xxxxx
    user_id: UserId,
    operator_id: OperatorId,
    balance: AdPoint,               // 現在の残高
    lifetime_earned: AdPoint,       // 累計獲得ポイント
    lifetime_consumed: AdPoint,     // 累計消費ポイント
    updated_at: DateTime<Utc>,
}
```

```rust
/// 広告報酬種別
pub enum AdRewardType {
    Interstitial,      // インタースティシャル広告
    RewardedVideo,     // リワード動画広告（将来対応）
    Banner,            // バナー広告（将来対応）
}

impl AdRewardType {
    /// 広告種別ごとのデフォルトポイント
    pub fn default_points(&self) -> AdPoint {
        match self {
            Self::Interstitial => AdPoint::new(10),
            Self::RewardedVideo => AdPoint::new(50),
            Self::Banner => AdPoint::new(1),
        }
    }
}
```

```rust
/// 広告報酬記録
pub struct AdReward {
    id: AdRewardId,                 // ULID: adr_xxxxx
    user_id: UserId,
    operator_id: OperatorId,
    reward_type: AdRewardType,
    points_granted: AdPoint,

    // 検証情報
    verification_method: VerificationMethod,
    ad_network: AdNetwork,
    ad_unit_id: Option<String>,
    transaction_id: Option<String>, // 広告SDKからのトランザクションID

    // メタデータ
    device_info: Option<DeviceInfo>,
    ip_address: Option<IpAddr>,

    created_at: DateTime<Utc>,
}

pub enum VerificationMethod {
    ServerToServer,    // S2Sコールバック（信頼度高）
    ClientReport,      // クライアント申告（信頼度低）
}

pub enum AdNetwork {
    /// Google AdMob（現在サポート）
    AdMob,
    /// 将来の拡張用
    Other(String),
}
```

```rust
/// ポイント消費記録（汎用設計）
pub struct AdPointConsumption {
    id: AdPointConsumptionId,       // ULID: apc_xxxxx
    user_id: UserId,
    operator_id: OperatorId,
    points_consumed: AdPoint,
    nanodollars_equivalent: NanoDollar,
    conversion_rate_id: ConversionRateId,

    // サービス種別（どのサービスで消費されたか）
    service_type: ServiceType,
    // 紐付け先リソースID（サービスごとに異なる）
    resource_id: Option<String>,
    // 追加メタデータ
    metadata: Option<serde_json::Value>,

    created_at: DateTime<Utc>,
}

/// 消費先サービス種別
pub enum ServiceType {
    /// LLMs - Agent API
    AgentExecution,
    /// LLMs - Chat API
    ChatCompletion,
    /// Catalog - 商品購入
    ProductPurchase,
    /// Catalog - サービス利用
    ServiceUsage,
    /// その他（将来の拡張用）
    Other(String),
}
```

### 不正防止設計

#### レート制限

```rust
pub struct RateLimitConfig {
    /// 1時間あたりの最大広告視聴回数
    max_views_per_hour: u32,         // デフォルト: 20
    /// 1日あたりの最大広告視聴回数
    max_views_per_day: u32,          // デフォルト: 100
    /// 1日あたりの最大獲得ポイント
    max_points_per_day: AdPoint,     // デフォルト: 1000
}
```

#### AdMob SSV（Server-Side Verification）検証フロー

AdMob SSVはリワード広告の視聴完了をサーバー間で検証する仕組み。

```
1. Flutter App: ユーザーが広告視聴開始
   - google_mobile_ads パッケージで RewardedAd.load()
   - ServerSideVerificationOptions に user_id と custom_data を設定

2. Flutter App → AdMob: 広告視聴完了
   - RewardedAd.show() → onUserEarnedReward コールバック

3. AdMob → Tachyon API: SSVコールバック（自動）
   GET /v1/ad-credits/callbacks/admob?
     ad_network=5450213213286189855
     &ad_unit=ca-app-pub-XXXXXXXX/YYYYYYYY
     &custom_data={encoded_custom_data}
     &key_id=1234567890
     &reward_amount=10
     &reward_item=points
     &signature={ECDSA_signature}
     &timestamp=1234567890
     &transaction_id=abc123def456
     &user_id={user_id}

4. Tachyon API:
   a. Googleの公開鍵でECDSA署名を検証
   b. transaction_id の重複チェック
   c. ポイント付与
   d. 200 OK を返す（AdMobは200以外を再送）

5. Flutter App: 残高をAPI経由で再取得（または WebSocket/SSE で通知）
```

**AdMob SSV署名検証の実装**

```rust
use p256::ecdsa::{signature::Verifier, Signature, VerifyingKey};

/// AdMob SSVコールバックの検証
pub struct AdMobSsvVerifier {
    /// Googleの公開鍵キャッシュ（key_id → VerifyingKey）
    /// 鍵は https://www.gstatic.com/admob/reward/verifier-keys.json から取得
    keys: Arc<RwLock<HashMap<String, VerifyingKey>>>,
}

impl AdMobSsvVerifier {
    /// SSVコールバックの署名を検証
    pub async fn verify(&self, params: &AdMobSsvParams) -> Result<bool> {
        // 1. key_id に対応する公開鍵を取得
        let key = self.get_or_fetch_key(&params.key_id).await?;

        // 2. 署名対象のメッセージを構築（クエリパラメータを署名順に連結）
        let message = self.build_message(params);

        // 3. ECDSA署名を検証
        let signature = Signature::from_der(&base64_url_decode(&params.signature)?)?;
        key.verify(message.as_bytes(), &signature)?;

        Ok(true)
    }

    /// Googleの公開鍵を取得（キャッシュあり）
    async fn get_or_fetch_key(&self, key_id: &str) -> Result<VerifyingKey> {
        // キャッシュにあればそれを返す
        // なければ https://www.gstatic.com/admob/reward/verifier-keys.json から取得
    }
}
```

**Flutter側の実装例**

```dart
// google_mobile_ads パッケージを使用
import 'package:google_mobile_ads/google_mobile_ads.dart';

class AdManager {
  RewardedAd? _rewardedAd;

  Future<void> loadRewardedAd() async {
    await RewardedAd.load(
      adUnitId: 'ca-app-pub-XXXXXXXX/YYYYYYYY',
      request: const AdRequest(),
      rewardedAdLoadCallback: RewardedAdLoadCallback(
        onAdLoaded: (ad) {
          _rewardedAd = ad;
          // SSV用のカスタムデータを設定
          _rewardedAd!.setServerSideVerificationOptions(
            ServerSideVerificationOptions(
              userId: currentUserId,      // Tachyonのuser_id
              customData: jsonEncode({
                'operator_id': currentOperatorId,
                'reward_type': 'interstitial',
              }),
            ),
          );
        },
        onAdFailedToLoad: (error) => print('Failed to load: $error'),
      ),
    );
  }

  Future<void> showRewardedAd() async {
    if (_rewardedAd == null) return;

    await _rewardedAd!.show(
      onUserEarnedReward: (ad, reward) {
        // 広告視聴完了（SSVコールバックはAdMobが自動送信）
        // 残高を再取得
        refreshPointBalance();
      },
    );
  }
}
```

#### クライアント申告フォールバック

S2Sが失敗した場合のフォールバック:

```
1. ネイティブアプリ → Tachyon API
   POST /v1/ad-credits/rewards
   Headers:
     - Authorization: Bearer {user_token}
   Body:
     - reward_type: "interstitial"
     - ad_network: "admob"
     - client_timestamp: タイムスタンプ
2. Tachyon API: レート制限チェック → 低信頼度でポイント付与
```

### API設計

#### REST API（広告コールバック受信用）

```yaml
# AdMob SSVコールバック受信（GETメソッド）
# AdMobはGETでコールバックを送信する
GET /v1/ad-credits/callbacks/admob
  Query Parameters (AdMobが自動付与):
    ad_network: string        # AdMobネットワークID
    ad_unit: string           # 広告ユニットID (ca-app-pub-xxx/yyy)
    custom_data: string       # Flutter側で設定したカスタムデータ（URL encoded JSON）
    key_id: string            # 署名検証用の公開鍵ID
    reward_amount: number     # 報酬量（AdMob管理画面で設定）
    reward_item: string       # 報酬アイテム名
    signature: string         # ECDSA署名（Base64 URL encoded）
    timestamp: number         # Unixタイムスタンプ（秒）
    transaction_id: string    # 一意のトランザクションID
    user_id: string           # Flutter側で設定したユーザーID
  Response:
    200: (空レスポンスでOK、AdMobは200を受け取ると再送しない)
    400: (署名検証失敗、AdMobは再送しない)
    500: (サーバーエラー、AdMobは再送する)

# クライアント申告（フォールバック）
POST /v1/ad-credits/rewards
  Headers:
    Authorization: Bearer {token}
    X-Operator-Id: string (required)
  Body:
    reward_type: "interstitial" | "rewarded_video" | "banner"
    ad_network: "admob" | "unity_ads" | "applovin" | "other"
    client_timestamp: string (ISO8601)
  Response:
    200: { success: true, points_granted: number, balance: number }
    429: { error: "rate_limit_exceeded" }

# 残高照会
GET /v1/ad-credits/balance
  Headers:
    Authorization: Bearer {token}
    X-Operator-Id: string (required)
  Response:
    200: {
      balance: number,
      lifetime_earned: number,
      lifetime_consumed: number,
      nanodollar_equivalent: number,
      conversion_rate: { nanodollars_per_point: number }
    }

# 履歴取得
GET /v1/ad-credits/history
  Headers:
    Authorization: Bearer {token}
    X-Operator-Id: string (required)
  Query:
    limit: number (default: 20, max: 100)
    offset: number (default: 0)
    type: "reward" | "consumption" | "all" (default: "all")
  Response:
    200: {
      items: [...],
      total: number,
      has_more: boolean
    }
```

#### GraphQL API（アプリ向け）

```graphql
type Query {
  """ユーザーのポイント残高を取得"""
  adPointBalance: AdPointBalance!

  """ポイント履歴を取得"""
  adPointHistory(limit: Int = 20, offset: Int = 0, type: AdPointHistoryType = ALL): AdPointHistoryConnection!

  """現在の換算レートを取得"""
  adPointConversionRate: AdPointConversionRate!
}

type Mutation {
  """ポイントを消費してAPI利用権を取得（内部用）"""
  consumeAdPoints(input: ConsumeAdPointsInput!): ConsumeAdPointsPayload!
}

type AdPointBalance {
  balance: Int!
  lifetimeEarned: Int!
  lifetimeConsumed: Int!
  nanodollarEquivalent: String!
  conversionRate: AdPointConversionRate!
}

type AdPointConversionRate {
  nanodollarsPerPoint: String!
  effectiveFrom: DateTime!
  effectiveUntil: DateTime
}

type AdReward {
  id: ID!
  rewardType: AdRewardType!
  pointsGranted: Int!
  verificationMethod: VerificationMethod!
  adNetwork: AdNetwork!
  createdAt: DateTime!
}

type AdPointConsumption {
  id: ID!
  pointsConsumed: Int!
  nanodollarsEquivalent: String!
  """消費先サービス種別"""
  serviceType: ServiceType!
  """紐付け先リソースID（chat_room_id, product_id など）"""
  resourceId: ID
  """追加メタデータ"""
  metadata: JSON
  createdAt: DateTime!
}

enum ServiceType {
  AGENT_EXECUTION
  CHAT_COMPLETION
  PRODUCT_PURCHASE
  SERVICE_USAGE
  OTHER
}

union AdPointHistoryItem = AdReward | AdPointConsumption

type AdPointHistoryConnection {
  items: [AdPointHistoryItem!]!
  total: Int!
  hasMore: Boolean!
}

enum AdRewardType {
  INTERSTITIAL
  REWARDED_VIDEO
  BANNER
}

enum VerificationMethod {
  SERVER_TO_SERVER
  CLIENT_REPORT
}

enum AdNetwork {
  """Google AdMob（現在サポート）"""
  ADMOB
  """将来の拡張用"""
  OTHER
}

enum AdPointHistoryType {
  REWARD
  CONSUMPTION
  ALL
}

input ConsumeAdPointsInput {
  """消費するNanoDollar相当額（内部でポイントに換算）"""
  nanodollars: String!
  """消費先サービス種別"""
  serviceType: ServiceType!
  """紐付けるリソースID（任意）"""
  resourceId: ID
  """追加メタデータ（任意）"""
  metadata: JSON
}

type ConsumeAdPointsPayload {
  success: Boolean!
  pointsConsumed: Int!
  nanodollarsGranted: String!
  remainingBalance: Int!
}

# ========================================
# 管理者向けAPI（Tachyon管理画面用）
# ========================================

extend type Query {
  """ユーザー一覧（ポイント残高付き）"""
  adPointUsers(
    limit: Int = 20
    offset: Int = 0
    sortBy: AdPointUserSortField = BALANCE
    sortOrder: SortOrder = DESC
    search: String
  ): AdPointUserConnection! @hasRole(roles: [ADMIN, OPERATOR])

  """ユーザー詳細"""
  adPointUserDetail(userId: ID!): AdPointUserDetail @hasRole(roles: [ADMIN, OPERATOR])

  """統計情報"""
  adPointStats(
    period: StatsPeriod = LAST_30_DAYS
  ): AdPointStats! @hasRole(roles: [ADMIN, OPERATOR])

  """換算レート履歴"""
  conversionRateHistory(
    limit: Int = 20
    offset: Int = 0
  ): ConversionRateHistoryConnection! @hasRole(roles: [ADMIN, OPERATOR])

  """報酬設定"""
  adRewardSettings: AdRewardSettings! @hasRole(roles: [ADMIN, OPERATOR])
}

extend type Mutation {
  """手動ポイント付与（管理者用）"""
  grantAdPointsManual(input: GrantAdPointsManualInput!): GrantAdPointsManualPayload! @hasRole(roles: [ADMIN])

  """ポイント調整（管理者用）"""
  adjustAdPoints(input: AdjustAdPointsInput!): AdjustAdPointsPayload! @hasRole(roles: [ADMIN])

  """換算レート更新"""
  updateConversionRate(input: UpdateConversionRateInput!): UpdateConversionRatePayload! @hasRole(roles: [ADMIN])

  """報酬設定更新"""
  updateRewardSettings(input: UpdateRewardSettingsInput!): UpdateRewardSettingsPayload! @hasRole(roles: [ADMIN])
}

# ユーザー一覧
type AdPointUserConnection {
  items: [AdPointUser!]!
  total: Int!
  hasMore: Boolean!
}

type AdPointUser {
  userId: ID!
  userName: String
  email: String
  balance: Int!
  lifetimeEarned: Int!
  lifetimeConsumed: Int!
  lastActivityAt: DateTime
}

enum AdPointUserSortField {
  BALANCE
  LIFETIME_EARNED
  LIFETIME_CONSUMED
  LAST_ACTIVITY
}

# ユーザー詳細
type AdPointUserDetail {
  user: AdPointUser!
  recentRewards: [AdReward!]!
  recentConsumptions: [AdPointConsumption!]!
}

# 統計
type AdPointStats {
  totalPointsIssued: Int!
  totalPointsConsumed: Int!
  activeUsers: Int!
  totalAdViews: Int!
  dailyStats: [DailyStat!]!
}

type DailyStat {
  date: Date!
  pointsIssued: Int!
  pointsConsumed: Int!
  adViews: Int!
  activeUsers: Int!
}

enum StatsPeriod {
  LAST_7_DAYS
  LAST_30_DAYS
  LAST_90_DAYS
  THIS_MONTH
  LAST_MONTH
}

# 換算レート履歴
type ConversionRateHistoryConnection {
  items: [ConversionRateRecord!]!
  total: Int!
  hasMore: Boolean!
}

type ConversionRateRecord {
  id: ID!
  nanodollarsPerPoint: String!
  effectiveFrom: DateTime!
  effectiveUntil: DateTime
  createdBy: ID
  createdAt: DateTime!
}

# 報酬設定
type AdRewardSettings {
  rewardsByType: [RewardTypeSetting!]!
  rateLimits: RateLimitSettings!
  admobConfig: AdMobConfig!
}

type RewardTypeSetting {
  rewardType: AdRewardType!
  pointsGranted: Int!
  enabled: Boolean!
}

type RateLimitSettings {
  maxViewsPerHour: Int!
  maxViewsPerDay: Int!
  maxPointsPerDay: Int!
}

type AdMobConfig {
  """SSVコールバックURL（読み取り専用、AdMob管理画面に設定する）"""
  callbackUrl: String!
  """登録済みのad_unit_id一覧"""
  adUnitIds: [String!]!
}

# Mutations Input/Payload
input GrantAdPointsManualInput {
  userId: ID!
  points: Int!
  reason: String!
}

type GrantAdPointsManualPayload {
  success: Boolean!
  newBalance: Int!
  transactionId: ID!
}

input AdjustAdPointsInput {
  userId: ID!
  """正の値で追加、負の値で減算"""
  adjustment: Int!
  reason: String!
}

type AdjustAdPointsPayload {
  success: Boolean!
  newBalance: Int!
  transactionId: ID!
}

input UpdateConversionRateInput {
  nanodollarsPerPoint: String!
  effectiveFrom: DateTime!
}

type UpdateConversionRatePayload {
  success: Boolean!
  newRate: ConversionRateRecord!
}

input UpdateRewardSettingsInput {
  rewardsByType: [RewardTypeSettingInput!]
  rateLimits: RateLimitSettingsInput
}

input RewardTypeSettingInput {
  rewardType: AdRewardType!
  pointsGranted: Int!
  enabled: Boolean!
}

input RateLimitSettingsInput {
  maxViewsPerHour: Int!
  maxViewsPerDay: Int!
  maxPointsPerDay: Int!
}

type UpdateRewardSettingsPayload {
  success: Boolean!
  settings: AdRewardSettings!
}
```

### サービス連携（汎用設計）

#### ポイント消費フロー（任意のサービスから利用可能）

```
1. ユーザー: サービス呼び出し（Agent API, Chat API, 商品購入など）
2. サービス側: コスト見積もり（NanoDollar）
3. サービス側 → AdCredits Context: ポイント残高チェック
   - 残高のNanoDollar換算値 >= 見積もりコスト?
4. 実行開始（ポイント予約）
5. 実行完了
6. サービス側 → AdCredits Context: 実際のコスト分ポイント消費
7. 消費記録の保存（サービス種別・リソースIDを記録）
```

#### AdCreditsApp トレイト（PaymentAppと同じ抽象度）

```rust
#[async_trait]
pub trait AdCreditsApp: Send + Sync {
    /// ポイント残高を取得
    async fn get_balance(&self, input: &GetBalanceInput) -> Result<AdPointBalance>;

    /// 利用可能かチェック（NanoDollar換算で判定）
    /// PaymentApp::check_billing と同じインターフェース
    async fn check_availability(&self, input: &CheckAvailabilityInput) -> Result<()>;

    /// ポイントを消費（NanoDollar指定、内部でポイントに逆算）
    /// PaymentApp::consume_credits と同じインターフェース
    async fn consume_points(&self, input: &ConsumePointsInput) -> Result<ConsumePointsOutput>;

    /// ポイントを付与（広告報酬）
    async fn grant_reward(&self, input: &GrantRewardInput) -> Result<GrantRewardOutput>;
}
```

#### 利用例：各サービスからの呼び出し

```rust
// LLMs Context からの利用例
impl ExecuteAgent {
    pub async fn execute(&self, input: InputData) -> Result<Output> {
        let estimated_cost = self.estimate_cost(&input)?;

        // 支払い方法の判定
        match input.payment_method {
            PaymentMethod::AdPoints => {
                self.ad_credits_app.check_availability(...).await?;
            }
            PaymentMethod::Balance => {
                self.payment_app.check_billing(...).await?;
            }
        }
        // ...
    }
}

// Catalog Context からの利用例
impl PurchaseProduct {
    pub async fn execute(&self, input: InputData) -> Result<Output> {
        let product_cost = self.get_product_price(&input.product_id)?;

        match input.payment_method {
            PaymentMethod::AdPoints => {
                self.ad_credits_app.check_availability(...).await?;
                // 購入処理
                self.ad_credits_app.consume_points(...).await?;
            }
            PaymentMethod::Balance => {
                self.payment_app.check_billing(...).await?;
                self.payment_app.consume_credits(...).await?;
            }
        }
        // ...
    }
}
```

### データベース設計

```sql
-- ポイント残高テーブル
CREATE TABLE ad_point_balances (
    id VARCHAR(32) PRIMARY KEY,              -- apb_xxxxx
    user_id VARCHAR(32) NOT NULL,
    operator_id VARCHAR(32) NOT NULL,
    balance BIGINT NOT NULL DEFAULT 0,
    lifetime_earned BIGINT NOT NULL DEFAULT 0,
    lifetime_consumed BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

    UNIQUE KEY uk_user_operator (user_id, operator_id),
    INDEX idx_operator (operator_id)
);

-- 広告報酬記録テーブル
CREATE TABLE ad_rewards (
    id VARCHAR(32) PRIMARY KEY,              -- adr_xxxxx
    user_id VARCHAR(32) NOT NULL,
    operator_id VARCHAR(32) NOT NULL,
    reward_type VARCHAR(32) NOT NULL,        -- interstitial, rewarded_video, banner
    points_granted BIGINT NOT NULL,

    -- 検証情報
    verification_method VARCHAR(32) NOT NULL, -- server_to_server, client_report
    ad_network VARCHAR(32) NOT NULL,          -- admob, unity_ads, applovin, other
    ad_unit_id VARCHAR(255),
    transaction_id VARCHAR(255),

    -- メタデータ
    device_info JSON,
    ip_address VARCHAR(45),

    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    INDEX idx_user_operator (user_id, operator_id),
    INDEX idx_created_at (created_at),
    UNIQUE KEY uk_transaction (ad_network, transaction_id)
);

-- ポイント消費記録テーブル（汎用設計）
CREATE TABLE ad_point_consumptions (
    id VARCHAR(32) PRIMARY KEY,              -- apc_xxxxx
    user_id VARCHAR(32) NOT NULL,
    operator_id VARCHAR(32) NOT NULL,
    points_consumed BIGINT NOT NULL,
    nanodollars_equivalent BIGINT NOT NULL,
    conversion_rate_id VARCHAR(32) NOT NULL,

    -- サービス種別（どのサービスで消費されたか）
    service_type VARCHAR(32) NOT NULL,       -- agent_execution, chat_completion, product_purchase, service_usage, other
    -- 紐付け先リソースID（サービスごとに異なる）
    resource_id VARCHAR(64),                 -- chat_room_id, product_id, order_id など
    -- 追加メタデータ
    metadata JSON,

    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    INDEX idx_user_operator (user_id, operator_id),
    INDEX idx_service_type (service_type),
    INDEX idx_resource (resource_id),
    INDEX idx_created_at (created_at)
);

-- 換算レートテーブル
CREATE TABLE ad_point_conversion_rates (
    id VARCHAR(32) PRIMARY KEY,              -- acr_xxxxx
    operator_id VARCHAR(32) NOT NULL,
    nanodollars_per_point BIGINT NOT NULL,   -- 1ポイントあたりのNanoDollar
    effective_from DATETIME(6) NOT NULL,
    effective_until DATETIME(6),
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    INDEX idx_operator_effective (operator_id, effective_from, effective_until)
);

-- レート制限追跡テーブル
CREATE TABLE ad_reward_rate_limits (
    id VARCHAR(32) PRIMARY KEY,
    user_id VARCHAR(32) NOT NULL,
    operator_id VARCHAR(32) NOT NULL,
    window_start DATETIME(6) NOT NULL,
    window_type VARCHAR(16) NOT NULL,        -- hourly, daily
    count INT NOT NULL DEFAULT 0,
    points_total BIGINT NOT NULL DEFAULT 0,

    UNIQUE KEY uk_user_window (user_id, operator_id, window_start, window_type),
    INDEX idx_window_start (window_start)
);
```

## 実装方針

### ディレクトリ構造

```
packages/ad-credits/
├── Cargo.toml
├── migrations/
│   └── 20250116000000_create_ad_credits_tables.sql
├── domain/
│   └── src/
│       ├── lib.rs
│       ├── ad_point.rs           # AdPoint値オブジェクト
│       ├── conversion_rate.rs    # ConversionRate
│       ├── ad_point_balance.rs   # AdPointBalance
│       ├── ad_reward.rs          # AdReward, AdRewardType
│       ├── ad_point_consumption.rs
│       └── rate_limit.rs         # RateLimitConfig
├── src/
│   ├── lib.rs
│   ├── app.rs                    # AppBuilder
│   ├── app_trait.rs              # AdCreditsApp trait
│   ├── usecase/
│   │   ├── mod.rs
│   │   ├── grant_reward.rs       # 広告報酬付与
│   │   ├── get_balance.rs        # 残高取得
│   │   ├── consume_points.rs     # ポイント消費
│   │   ├── check_availability.rs # 利用可能チェック
│   │   ├── list_history.rs       # 履歴取得
│   │   └── verify_s2s_callback.rs # S2S検証
│   ├── adapter/
│   │   ├── axum/
│   │   │   ├── mod.rs
│   │   │   ├── callback_handler.rs   # S2Sコールバック
│   │   │   └── reward_handler.rs     # クライアント申告
│   │   └── graphql/
│   │       ├── mod.rs
│   │       ├── query.rs
│   │       └── mutation.rs
│   └── interface_adapter/
│       └── gateway/
│           ├── mod.rs
│           ├── balance_repository.rs
│           ├── reward_repository.rs
│           ├── consumption_repository.rs
│           └── rate_repository.rs
└── schema.graphql
```

### Clean Architectureの適用

```
┌─────────────────────────────────────────────────────────────┐
│                     Presentation Layer                       │
│  (axum handlers, graphql resolvers)                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│  (usecases: GrantReward, ConsumePoints, GetBalance, etc.)   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Domain Layer                           │
│  (AdPoint, AdPointBalance, AdReward, ConversionRate)        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Infrastructure Layer                       │
│  (SqlxBalanceRepository, SqlxRewardRepository, etc.)        │
└─────────────────────────────────────────────────────────────┘
```

### LLMsコンテキストとの連携

```rust
// packages/llms/src/usecase/execute_agent.rs への変更

impl ExecuteAgent {
    pub async fn execute(&self, input: InputData) -> Result<Output> {
        // 1. コスト見積もり
        let estimated_cost = self.estimate_cost(&input)?;

        // 2. 支払い方法の判定
        match input.payment_method {
            PaymentMethod::AdPoints => {
                // ポイント残高チェック
                self.ad_credits_app.check_availability(&CheckAvailabilityInput {
                    user_id: &input.user_id,
                    operator_id: &input.operator_id,
                    required_nanodollars: estimated_cost,
                }).await?;
            }
            PaymentMethod::Balance => {
                // 既存のNanoDollar残高チェック
                self.payment_app.check_billing(&CheckBillingInput {
                    // ...
                }).await?;
            }
        }

        // 3. 実行
        let result = self.execute_internal(&input).await?;

        // 4. 課金
        match input.payment_method {
            PaymentMethod::AdPoints => {
                self.ad_credits_app.consume_points(&ConsumePointsInput {
                    user_id: &input.user_id,
                    operator_id: &input.operator_id,
                    nanodollars_to_consume: result.actual_cost,
                    chat_room_id: Some(&input.chat_room_id),
                }).await?;
            }
            PaymentMethod::Balance => {
                self.payment_app.consume_credits(&ConsumeCreditsInput {
                    // ...
                }).await?;
            }
        }

        Ok(result)
    }
}
```

## タスク分解

### Phase 1: 基盤構築

- [ ] 📝 `packages/ad-credits` クレート作成
- [ ] 📝 Cargo.toml設定（依存関係）
- [ ] 📝 ドメインモデル実装
  - [ ] AdPoint値オブジェクト
  - [ ] ConversionRate
  - [ ] AdPointBalance
  - [ ] AdReward, AdRewardType
  - [ ] AdPointConsumption
  - [ ] RateLimitConfig
- [ ] 📝 データベースマイグレーション作成
- [ ] 📝 リポジトリトレイト定義

### Phase 2: ユースケース実装

- [ ] 📝 VerifyAdMobSsv（AdMob SSV署名検証）
  - [ ] Google公開鍵の取得・キャッシュ
  - [ ] ECDSA署名検証（p256クレート使用）
  - [ ] transaction_id重複チェック
- [ ] 📝 GrantReward（広告報酬付与）
  - [ ] SSV検証結果からポイント付与
  - [ ] クライアント申告ロジック（フォールバック）
  - [ ] レート制限チェック
- [ ] 📝 GetBalance（残高取得）
- [ ] 📝 ConsumePoints（ポイント消費）
  - [ ] NanoDollar→ポイント逆算
  - [ ] 消費記録保存（ServiceType付き）
- [ ] 📝 CheckAvailability（利用可能チェック）
- [ ] 📝 ListHistory（履歴取得）

### Phase 3: インフラストラクチャ実装

- [ ] 📝 SqlxBalanceRepository
- [ ] 📝 SqlxRewardRepository
- [ ] 📝 SqlxConsumptionRepository
- [ ] 📝 SqlxRateRepository
- [ ] 📝 SqlxRateLimitRepository

### Phase 4: API実装

- [ ] 📝 REST API（axum）
  - [ ] AdMob SSVコールバックエンドポイント（GET /v1/ad-credits/callbacks/admob）
  - [ ] クライアント申告エンドポイント（POST /v1/ad-credits/rewards）
  - [ ] 残高照会エンドポイント（GET /v1/ad-credits/balance）
  - [ ] 履歴取得エンドポイント（GET /v1/ad-credits/history）
- [ ] 📝 GraphQL API
  - [ ] Query: adPointBalance, adPointHistory, adPointConversionRate
  - [ ] Mutation: consumeAdPoints

### Phase 5: サービス連携（汎用）

- [ ] 📝 AdCreditsAppトレイト定義
- [ ] 📝 NoOpAdCreditsApp実装（開発用）
- [ ] 📝 AppBuilder統合
- [ ] 📝 PaymentMethod enum追加（Balance / AdPoints）
- [ ] 📝 LLMs Context連携（ExecuteAgent等）
- [ ] 📝 Catalog Context連携（商品購入等）
- [ ] 📝 ポイント消費フローの共通化

### Phase 6: tachyon-api統合

- [ ] 📝 DI設定
- [ ] 📝 ルーター統合
- [ ] 📝 認可ポリシー追加
- [ ] 📝 シードデータ（換算レート初期値）

### Phase 7: Tachyon管理画面（apps/tachyon）

#### 7-1: ダッシュボード
- [ ] 📝 `/v1beta/[tenant_id]/ad-credits` ページ作成
- [ ] 📝 統計サマリーカード（総発行ポイント、総消費ポイント、アクティブユーザー数）
- [ ] 📝 期間別グラフ（日次/週次/月次の発行・消費推移）
- [ ] 📝 広告視聴回数の推移

#### 7-2: ユーザー別ポイント管理
- [ ] 📝 `/v1beta/[tenant_id]/ad-credits/users` ユーザー一覧ページ
  - [ ] テーブル表示（ユーザーID、残高、累計獲得、累計消費、最終更新日）
  - [ ] 検索・フィルタ・ソート機能
  - [ ] ページネーション
- [ ] 📝 `/v1beta/[tenant_id]/ad-credits/users/[user_id]` ユーザー詳細ページ
  - [ ] 残高情報
  - [ ] 報酬履歴タブ
  - [ ] 消費履歴タブ
- [ ] 📝 手動ポイント付与・調整モーダル（管理者用）

#### 7-3: 換算レート管理
- [ ] 📝 `/v1beta/[tenant_id]/ad-credits/settings/rates` 換算レート設定ページ
  - [ ] 現在のレート表示（1ポイント = X NanoDollar = $Y）
  - [ ] レート変更フォーム（有効開始日時指定）
  - [ ] レート変更履歴テーブル

#### 7-4: 広告報酬設定
- [ ] 📝 `/v1beta/[tenant_id]/ad-credits/settings/rewards` 報酬設定ページ
  - [ ] 広告種別ごとのポイント設定（インタースティシャル、リワード動画等）
  - [ ] レート制限設定（時間/日あたりの上限）
- [ ] 📝 AdMob設定（コールバックURL表示、ad_unit_id管理）

#### 7-5: 履歴・監査
- [ ] 📝 `/v1beta/[tenant_id]/ad-credits/history` 全体履歴ページ
  - [ ] 報酬付与/消費のフィルタリング
  - [ ] サービス種別フィルタ
  - [ ] 日時範囲フィルタ
  - [ ] CSV/JSONエクスポート
- [ ] 📝 不正検知アラート表示（短時間大量視聴等）

#### 7-6: GraphQL クエリ/ミューテーション（管理者用）
- [ ] 📝 Query: adPointUsers, adPointUserDetail, adPointStats, conversionRateHistory
- [ ] 📝 Mutation: grantAdPointsManual, adjustAdPoints, updateConversionRate, updateRewardSettings

### Phase 8: テスト

- [ ] 📝 ドメインモデルの単体テスト
- [ ] 📝 ユースケースの単体テスト
- [ ] 📝 APIの統合テスト
- [ ] 📝 シナリオテスト作成
- [ ] 📝 管理画面のStorybookテスト
- [ ] 📝 管理画面のE2Eテスト（Playwright）

### Phase 9: ドキュメント

- [ ] 📝 API仕様書
- [ ] 📝 広告SDK連携ガイド
- [ ] 📝 ネイティブアプリ向け実装ガイド
- [ ] 📝 管理画面操作マニュアル

## テスト計画

### 単体テスト

- AdPoint値オブジェクトの演算テスト
- ConversionRateの変換テスト
- レート制限ロジックのテスト
- S2S署名検証のテスト

### 統合テスト

- 広告報酬付与→残高更新フロー
- ポイント消費→残高減少フロー
- レート制限超過時のエラー
- 重複トランザクションの拒否

### シナリオテスト

```yaml
# apps/tachyon-api/tests/scenarios/ad_credits.yaml
name: "Ad Credits Flow"
steps:
  - id: grant_reward
    description: "広告報酬を付与"
    request:
      method: POST
      path: /v1/ad-credits/rewards
      headers:
        Authorization: "Bearer dummy-token"
        x-operator-id: "tn_01hjryxysgey07h5jz5wagqj0m"
      body:
        reward_type: "interstitial"
        ad_network: "admob"
    expect:
      status: 200
      body:
        success: true
        points_granted: 10

  - id: check_balance
    description: "残高確認"
    request:
      method: GET
      path: /v1/ad-credits/balance
      headers:
        Authorization: "Bearer dummy-token"
        x-operator-id: "tn_01hjryxysgey07h5jz5wagqj0m"
    expect:
      status: 200
      body:
        balance: 10
```

## リスクと対策

### リスク1: 広告不正（アドフラウド）

**影響度**: 高
**発生確率**: 中
**対策**:
- S2S検証を優先、クライアント申告は補助
- 厳格なレート制限
- 異常検知（短時間に大量視聴等）
- Device Fingerprinting（将来）

### リスク2: 換算レートの不整合

**影響度**: 中
**発生確率**: 低
**対策**:
- レート変更時は新レコード追加（履歴保持）
- 消費時に適用レートを記録
- レート変更のAudit Log

### リスク3: 残高の整合性

**影響度**: 高
**発生確率**: 低
**対策**:
- トランザクション管理
- 楽観的ロック（version列）
- 消費前の残高再確認

## 完了条件

### 機能要件

#### バックエンド（API）
- [ ] AdMob SSVコールバックで広告報酬を付与できる
- [ ] クライアント申告で広告報酬を付与できる（フォールバック）
- [ ] ポイント残高を照会できる
- [ ] ポイントを消費して各種サービスを利用できる
  - [ ] LLMs Context（Agent API, Chat API）
  - [ ] Catalog Context（商品購入、サービス利用）
- [ ] 履歴を取得できる（サービス種別でフィルタ可能）

#### 管理画面（Tachyon）
- [ ] ダッシュボードで統計情報を確認できる
- [ ] ユーザー一覧でポイント残高を確認できる
- [ ] ユーザー詳細で履歴を確認できる
- [ ] 手動でポイントを付与・調整できる（管理者のみ）
- [ ] 換算レートを変更できる（管理者のみ）
- [ ] 広告報酬設定を変更できる（管理者のみ）
- [ ] 履歴をCSV/JSONでエクスポートできる

### 非機能要件

- [ ] レート制限が機能する
- [ ] 重複トランザクションを拒否できる
- [ ] APIレスポンスが500ms以内
- [ ] テストカバレッジ80%以上

### 品質要件

- [ ] `mise run ci` が通る
- [ ] ドキュメント完備
- [ ] コードレビュー完了

## 将来の拡張

1. **広告種別の追加**
   - リワード動画広告
   - バナー広告

2. **キャンペーン機能**
   - 期間限定ポイント2倍
   - 初回視聴ボーナス

3. **ポイント有効期限**（現在は無期限）
   - 付与から90日で失効
   - 失効前通知

4. **ポイント購入**
   - 課金でポイント購入
   - サブスクリプションでポイント定期付与

5. **リファラル報酬**
   - 友達紹介でポイント付与

## 参考資料

### 内部ドキュメント
- [NanoDollar仕様](../../../architecture/nanodollar-system.md)
- [USD課金システム](../../../tachyon-apps/payment/usd-billing-system.md)

### AdMob関連
- [AdMob SSV (Server-Side Verification)](https://developers.google.com/admob/android/ssv)
- [google_mobile_ads Flutter パッケージ](https://pub.dev/packages/google_mobile_ads)
- [RewardedAd クラスリファレンス](https://developers.google.com/admob/flutter/rewarded)
- [SSV公開鍵エンドポイント](https://www.gstatic.com/admob/reward/verifier-keys.json)

### Flutter実装
- [Flutter AdMob実装ガイド](https://developers.google.com/admob/flutter/quick-start)
- [ServerSideVerificationOptions](https://pub.dev/documentation/google_mobile_ads/latest/google_mobile_ads/ServerSideVerificationOptions-class.html)
