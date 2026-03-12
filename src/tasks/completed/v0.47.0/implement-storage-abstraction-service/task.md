---
title: AWS / Cloudflare を抽象化する Storage サービスと管理UIを実装する
type: feature
emoji: "🗂️"
topics:
  - Storage
  - AWS
  - Cloudflare
  - Rust
  - Next.js
  - Clean Architecture
published: true
targetFiles:
  - packages/storage/
  - apps/tachyon-api/
  - apps/tachyon/src/app/v1beta/[tenant_id]/
  - docs/src/tachyon-apps/
github: https://github.com/quantum-box/tachyon-apps
---

# AWS / Cloudflare を抽象化する Storage サービスと管理UIを実装する

## 概要

AWS（S3）と Cloudflare（R2）の差分を吸収する共通 Storage サービスを導入し、
バックエンドから provider 非依存 API でファイル操作できるようにする。
あわせて、Storage 設定と接続確認を行える管理 UI を追加する。

## 背景・目的

- 現在のストレージ連携は provider 固有実装に寄りやすく、切替コストが高い。
- マルチテナント SaaS として、環境やテナントごとに AWS / Cloudflare を柔軟に使い分けたい。
- ユースケース層がクラウド固有 SDK 依存を持つとテスト容易性が下がるため、境界を明確化したい。
- 運用で必要な「どの provider を使うか」「接続できるか」の確認を UI から実施したい。

期待する成果:

1. `StorageRepository`（仮称）経由で provider 非依存 API を利用できる。
2. 設定値で provider を `aws` / `cloudflare` に切り替え可能。
3. Storage provider を設定・検証できる管理 UI が追加される。
4. 既存機能（添付ファイルや生成物保存など）の移行方針が明文化される。

## 新しい context 追加案

Storage は複数ドメインから横断利用されるため、既存コンテキストへ分散実装するより
**`storage` コンテキストを新設**する。

- `packages/storage/`: domain / usecase / interface_adapter を集約
- `apps/tachyon-api`: storage context の router / schema 統合
- `apps/tachyon`: storage context 用の管理 UI

この構成により、以下を満たせる:

- 責務分離（ファイル管理の関心を1か所に集約）
- provider 切替ロジックの共通化
- 将来的な provider 追加（例: GCS）時の影響局所化

## 詳細仕様

### 機能要件（Backend）

1. **共通操作 API**
   - Put object（metadata, content-type, cache-control 対応）
   - Get object（bytes / stream）
   - Delete object
   - Generate presigned URL（GET / PUT）
   - Exists / Head 相当

2. **プロバイダー切替**
   - 設定ファイルまたは DB 設定で provider を `aws` / `cloudflare` から選択可能。
   - bucket, region, endpoint, credentials を provider ごとに定義可能。

3. **障害時のエラーモデル統一**
   - `NotFound` / `PermissionDenied` / `RateLimited` / `Timeout` / `Unknown` に正規化。
   - ユースケース層は provider 固有エラーコードを直接扱わない。

4. **観測性**
   - request_id, provider, bucket, key, latency を構造化ログで出力。
   - 失敗時は retry 回数と最終エラー種別を記録。

### 機能要件（UI）

1. **Storage 設定画面**
   - AWS / Cloudflare の provider 選択
   - bucket / endpoint / region / key prefix の入力
   - Secret 参照キー（secret_ref）入力

2. **接続確認アクション**
   - 「接続テスト」ボタンで provider に対するヘルスチェックを実行
   - 成功/失敗を UI 上に表示（失敗時は normalized error を表示）

3. **監査可能性**
   - 設定更新履歴（誰がいつ変更したか）を表示
   - 直近テスト結果（実行時刻・実行者・結果）を表示

### 非機能要件

- **可用性**: ネットワーク一時障害に対して指数バックオフ付き再試行。
- **セキュリティ**: 認証情報は Secrets Manager / secret_ref 経由で注入（平文保存禁止）。
- **保守性**: provider 実装差し替え時のユースケース層変更を最小化。
- **性能**: 大きなファイルは stream API 優先でメモリ使用量を抑制。

### コンテキスト別の責務

```yaml
contexts:
  storage:
    description: "新設コンテキスト。provider 非依存なストレージ機能を提供"
    sub_layers:
      domain:
        - StorageObjectKey value object
        - StorageError enum
        - StorageRepository trait
      usecase:
        - PutObject
        - GetObject
        - DeleteObject
        - GeneratePresignedUrl
        - TestStorageConnection
      interface_adapter:
        - AwsStorageRepository
        - CloudflareStorageRepository
        - provider エラーの正規化
      handler:
        - REST / GraphQL endpoint
        - 入力バリデーション

  tachyon_ui:
    description: "Storage 管理画面"
    responsibilities:
      - provider 設定フォーム
      - 接続テスト実行
      - 監査情報表示
```

### 仕様のYAML定義

```yaml
storage:
  provider: aws # aws | cloudflare
  default_bucket: "tachyon-assets"
  timeout_ms: 5000
  retry:
    max_attempts: 3
    base_delay_ms: 200
    max_delay_ms: 2000

providers:
  aws:
    service: "s3"
    region: "ap-northeast-1"
    endpoint: "" # AWS公式を使う場合は空
    force_path_style: false
    credentials_source: "aws_iam_role"

  cloudflare:
    service: "r2"
    region: "auto"
    endpoint: "https://<account_id>.r2.cloudflarestorage.com"
    force_path_style: true
    credentials_source: "static_key"
    access_key_id_secret_ref: "global/cloudflare-r2-access-key-id"
    secret_access_key_secret_ref: "global/cloudflare-r2-secret-access-key"

object_key_policy:
  pattern: "{tenant_id}/{context}/{yyyy}/{mm}/{ulid}.{ext}"
  validation:
    max_length: 1024
    allowed_prefixes:
      - "uploads/"
      - "generated/"
```

## 実装方針

### アーキテクチャ設計

- 新規 `storage` context を作成し、Clean Architecture（domain/usecase/interface_adapter/handler）で実装。
- `apps/tachyon-api` の起動時に設定値を読み込み、`aws` / `cloudflare` 実装を DI で注入。
- `apps/tachyon` に管理 UI（Storage Settings page）を追加し、REST/GraphQL 経由で設定・接続テストを実施。

### 技術選定

- AWS SDK for Rust を使用（S3 + R2 互換 endpoint 対応）。
- Presigned URL は SDK 標準機能を使用。
- UI は既存 Next.js + GraphQL/REST クライアント規約に合わせる。
- 設定管理は既存 Config ローダー + Secret 参照基盤に統合。

### TDD（テスト駆動開発）戦略

#### 既存動作の保証
- 既存ファイル保存機能の E2E / scenario test を先に棚卸し。
- 既存 API のレスポンス互換性をゴールデンテスト化。

#### テストファーストアプローチ
- `StorageRepository` 契約テストを先に作成。
- AWS / Cloudflare 両実装で同一契約テストが通ることを確認。
- UI はフォーム送信と接続テストの interaction test を先に作成。

#### 継続的検証
- Rust 実装追加時に `mise run check`。
- API 変更を伴う場合は `mise run docker-scenario-test`。
- UI 変更は `yarn lint --filter=tachyon`, `yarn ts --filter=tachyon`, `yarn format --filter=tachyon`。

## タスク分解

### 主要タスク
- [ ] 要件定義（対象ユースケース・移行対象・設定責務を確定）
- [ ] `storage` context 新設（domain/usecase/interface_adapter/handler）
- [ ] provider 実装（AwsStorageRepository / CloudflareStorageRepository）
- [ ] API 実装（設定取得・更新・接続テスト）
- [ ] UI 実装（設定フォーム、接続テスト、監査情報）
- [ ] テスト・品質確認（契約テスト、シナリオテスト、UI テスト）
- [ ] ドキュメント更新（運用手順、設定例、移行ガイド）

### マイルストーン

1. **M1: 設計確定**
   - `storage` context 境界と責務が合意されている
   - provider 名称を `aws` / `cloudflare` で統一

2. **M2: 最小実装完了**
   - put/get/delete/presign が AWS・Cloudflare 両方で動作
   - provider 切替が設定で可能

3. **M3: UI 提供完了**
   - 管理 UI から設定更新・接続テストが可能
   - 監査情報と最終テスト結果を確認可能

4. **M4: 本番運用準備**
   - 監視項目・アラート方針を文書化
   - ランブック（障害時切替手順）を整備

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] 実装完了後の初回動作確認
- [ ] PRレビュー前の最終確認
- [ ] バグ修正後の再確認

### 動作確認チェックリスト
- [ ] Storage設定画面が表示される
- [ ] provider を AWS / Cloudflare で切り替え保存できる
- [ ] 接続テストボタンで結果が表示される
- [ ] 入力バリデーションエラーが適切に表示される
- [ ] 設定変更履歴と最終テスト結果が表示される

## テスト計画

- 単体テスト:
  - object key 生成ルール
  - error 正規化
  - config バリデーション
- 契約テスト:
  - 同一テストケースを AWS / Cloudflare 実装へ適用
- 統合テスト:
  - Presigned URL で upload/download できること
- シナリオテスト:
  - API 経由でファイル登録→参照→削除の一連動作
- UI テスト:
  - 設定フォーム操作
  - 接続テスト実行

## リスクと対策

1. **Cloudflare と AWS の互換差分**
   - 対策: 互換性マトリクスを作成し、非対応機能を抽象 API から除外。

2. **署名付きURLの期限・ヘッダー差分**
   - 対策: 期限と必須ヘッダーを共通制約として契約テスト化。

3. **運用時の設定ミス（bucket / endpoint / secret_ref）**
   - 対策: 起動時バリデーション + 接続テスト + UI 入力制約で事前検知。

4. **新規 context 増加に伴う導入コスト**
   - 対策: まず1ユースケース移行で MVP 化し、段階移行する。

## スケジュール

- Week 1: 要件確定、`storage` context 設計、PoC
- Week 2: Backend 実装（adapter + usecase + API）
- Week 3: UI 実装、既存機能移行、テスト拡充
- Week 4: 運用ドキュメント整備、最終検証

## 完了条件

- [ ] `storage` context が新設され provider 非依存 API を提供している
- [ ] AWS / Cloudflare 両方で put/get/delete/presign が動作する
- [ ] 管理 UI から provider 設定と接続テストができる
- [ ] 既存の少なくとも1機能が新 Storage サービス経由へ移行されている
- [ ] テスト（単体 / 契約 / シナリオ / UI）が CI で安定して通る
- [ ] 運用・設定ドキュメントが更新されている

## 実装進捗

- ✅ Phase 1: 要件定義・設計
- ✅ Phase 2: Backend 最小実装
  - ✅ `packages/storage/` context 新設（domain/usecase/interface_adapter/adapter）
  - ✅ ドメイン層: `ObjectKey` value object, `StorageError` enum, `StorageService` trait
  - ✅ usecase層: `GeneratePresignedUrl`, `PutObject`, `TestConnection`
  - ✅ gateway層: `S3StorageService`（AWS S3 / Cloudflare R2 / MinIO 対応）
  - ✅ axumアダプター: `POST /v1/storage/presigned-url`, `POST /v1/storage/test-connection`
  - ✅ tachyon-api 統合: DI (`di.rs`), Router (`router.rs`), Lambda (`lambda.rs`)
  - ✅ 単体テスト: config serde / provider display / from_config / error conversions
  - ✅ `LegacyStorageAdapter`: 既存 `persistence::Storage` 利用箇所を新 storage context 経由に移行
  - ✅ コンパイル＆フォーマット確認: `mise run check` / `mise run fmt-fix` 通過
- ✅ Phase 3: UI 実装
  - ✅ Storage 設定画面 (`settings/host/storage/page.tsx`)
  - ✅ ホストナビゲーションに Storage リンク追加
  - ✅ 接続テスト実行 UI (StorageContent client component)
- ✅ Phase 4: テスト
  - ✅ シナリオテスト (`storage_rest.yaml`): 接続テスト・Presigned URL バリデーション
  - ✅ TypeScript 型チェック通過 (`yarn ts --filter=tachyon`)

### Phase 2 実装メモ

- 既存の `persistence::Storage` トレイト（put_object / presigned_get のみ）を拡張し、新 `storage::StorageService` トレイトで delete_object / head_object / presigned_put_url / test_connection をサポート。
- AWS S3, Cloudflare R2, MinIO は全て S3 互換 API のため、`S3StorageService` 一つで対応（`StorageConfig` の `provider` フィールドで切り替え）。
- `rust-s3` 0.34.0 の `presign_put` にカスタムヘッダーを渡す API が内部的に `None` 渡しになっている点に注意（content-type はクライアント側で PUT 時に指定する設計）。
- `storage::App` が usecase ファクトリを提供し、DI は `Arc<storage::App>` を Extension に注入。
- `LegacyStorageAdapter` が `persistence::Storage` トレイトを実装し、内部で `StorageService` にデリゲート。これにより `source_explore` 等の既存コードは変更なしで新 storage context を利用。
