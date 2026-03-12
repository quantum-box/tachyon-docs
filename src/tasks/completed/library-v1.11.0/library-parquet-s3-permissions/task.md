---
title: "Library Parquet配信のS3権限・Terraform整備"
type: "tech"
emoji: "🔐"
topics:
  - Library
  - S3
  - Parquet
  - Terraform
  - Security
published: true
targetFiles:
  - apps/library-api/src/handler/data.rs
  - cluster/n1-aws/main.tf
  - cluster/n1-aws/modules/
  - cluster/n1-aws/variables.tf
  - cluster/n1-aws/output.tf
  - docs/src/services/library/duckdb-data-view.md
github: "https://github.com/quantum-box/tachyon-apps"
---

# Library Parquet配信のS3権限・Terraform整備

## 概要

Library の Parquet 配信（Presigned URL）のために必要な **S3権限とTerraform設定** を整理・整備する。
**本タスクは実装準備のみ**とし、実装作業は **別ブランチ** で行う。

## 背景・目的

- Parquet を S3 に置く場合、library-api 実行環境の IAM 権限が必須
- Presigned URL を安全に発行するには権限範囲・バケットポリシー・CORSが必要
- 将来の実装に備えて IaC を先に整備しておきたい

## 詳細仕様

### 機能要件

1. S3 バケットと IAM 権限の設計方針を決定
2. Terraform で必要な権限・ポリシー・CORS を定義
3. Presigned URL の有効期限・再発行フローの前提を整理

### 非機能要件

- 最小権限でのアクセス制御
- バケット・オブジェクト命名規則を明確化
- 監査/運用に耐えるログ・可視性

### 仕様のYAML定義

```yaml
s3:
  bucket:
    name: "library-parquet-<env>"
    region: "ap-northeast-1"
  permissions:
    required:
      - s3:PutObject
      - s3:GetObject
      - s3:HeadObject
      - s3:ListBucket
      - s3:DeleteObject
  cors:
    allowed_methods: [GET, HEAD]
    allowed_headers: ["*"]
    max_age_seconds: 3000
presigned_url:
  ttl_seconds: 300
  refresh_strategy: "expire_then_refetch"
```

## 実装方針（検討対象）

### アーキテクチャ設計

- library-api が S3 に Parquet を書き込み、Presigned URL を発行
- フロントエンドは Presigned URL で取得（AWS権限は不要）
- 既存の Parquet エンドポイント (`/data/parquet`) は維持

### 技術選定

- AWS S3（既存の `aws-sdk-s3` 前提）
- Terraform: `cluster/n1-aws` 配下で IAM / Bucket / CORS を管理

## タスク分解

### 主要タスク
- [x] S3 バケット命名・環境区分の整理
- [x] IAM 権限（最小権限）ポリシー設計
- [x] Terraform モジュール/変数設計
- [x] CORS 設定の決定
- [x] Presigned URL の TTL/更新方針の明文化
- [x] Terraform 実装（S3/IAM/CORS/Lifecycle）
- [x] Lambda 環境変数追加
- [ ] 実装着手用の別ブランチ運用フロー整理（後続タスク）

## Playwright MCPによる動作確認

※本タスクは IaC/設計準備のみのため実施しない。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 権限過多によるセキュリティリスク | 高 | 最小権限に限定し、必要アクションを明文化 |
| Presigned URL 期限切れ | 中 | 再取得フローを明示 |
| CORS不備で取得不可 | 中 | 事前に GET/HEAD を許可 |

## スケジュール

- 設計確定: ✅ 2025-01-15 完了
- Terraform整備: ✅ 2025-01-15 完了
- 実装ブランチ対応: 🔄 後続タスクとして実施

---

## 後続タスク

### library-api の実装作業（別ブランチ）

Terraform 設定が適用された後、library-api 側の実装を行う必要があります。

```rust
// apps/library-api/src/handler/data.rs の修正箇所
// 1. 環境変数からバケット名を取得
let bucket = std::env::var("LIBRARY_PARQUET_BUCKET")
    .unwrap_or_else(|_| "library-parquet-dev".to_string());

// 2. ParquetStorage の初期化時にバケット名を使用
```

### 実装ブランチ運用フロー

1. `feature/library-parquet-impl` ブランチを作成
2. library-api の修正
   - 環境変数 `LIBRARY_PARQUET_BUCKET` を使用
   - TTL を設定可能に（オプション）
3. ローカルテスト（LocalStack または実S3）
4. PR作成・レビュー
5. マージ後、Terraform apply

## 完了条件

- [x] Terraform で必要な S3/IAM/CORS 設定が定義されている
- [x] library-api の必要権限が明文化されている
- [x] 実装着手の前提条件が揃っている

---

## 調査結果（2025-01-15）

### 現状の構成

#### Library API の実行環境
- **Lambda 関数**: `lambda-library-api` / `lambda-library-api-dev`
- **IAM ロール**: `aws_iam_role.lambda_role` を共有
- **現在の S3 権限**: `AmazonS3FullAccess` が付与（`source-explore` バケット用に設定されたもの）

#### 既存の Parquet 実装 (`apps/library-api/src/handler/data.rs`)
- **エンドポイント**: `GET /v1beta/repos/{org}/{repo}/data/parquet`
- **オブジェクトパス**: `library/{org}/{repo}/data-{fingerprint}.parquet`
- **署名URL TTL**: 900秒（15分）ハードコード
- **圧縮**: SNAPPY
- **キャッシング**: SHA256 ベースのフィンガープリントでメモリキャッシュ

#### Terraform 構成
```
cluster/n1-aws/
├── main.tf          # VPC, S3(source-explore), IAM 基盤
├── lambda.tf        # Lambda モジュール定義
├── variables.tf     # 変数定義
├── output.tf        # 出力定義
└── modules/
    ├── ecs/         # ECS サービス + IAM
    ├── lambda/      # Lambda 関数
    └── amplify_nextjs/  # フロントエンド
```

### 課題
1. **S3 権限が過剰**: `AmazonS3FullAccess` は全バケット操作を許可（最小権限原則に違反）
2. **Library 専用バケットがない**: 現在は `source-explore` または未定義のバケットを使用
3. **CORS 設定がない**: Presigned URL をブラウザから取得する際に必要
4. **環境変数でバケット名を設定できない**: Lambda 定義に環境変数が不足

---

## 設計決定事項

### 1. S3 バケット命名規則

```yaml
bucket_naming:
  pattern: "{project}-library-parquet-{environment}"
  examples:
    - tachyon-library-parquet-production
    - tachyon-library-parquet-staging

  object_path:
    pattern: "library/{org}/{repo}/data-{fingerprint}.parquet"
    example: "library/my-org/my-repo/data-abc123def456.parquet"
```

### 2. IAM 権限設計（最小権限）

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LibraryParquetReadWrite",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:HeadObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::tachyon-library-parquet-*/*"
    },
    {
      "Sid": "LibraryParquetListBucket",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::tachyon-library-parquet-*",
      "Condition": {
        "StringLike": {
          "s3:prefix": ["library/*"]
        }
      }
    }
  ]
}
```

### 3. CORS 設定

```json
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedOrigins": [
        "https://library.n1.tachy.one",
        "https://library.dev.n1.tachy.one",
        "http://localhost:5010"
      ],
      "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

### 4. Presigned URL 方針

| 項目 | 値 | 理由 |
|------|-----|------|
| TTL | 900秒（15分） | DuckDB WASM の読み込み完了に十分な時間 |
| 更新戦略 | expire_then_refetch | 期限切れ後に再取得（キャッシュ有効活用） |
| 署名方式 | SigV4 | AWS SDK デフォルト |

### 5. Lambda 環境変数（追加）

```hcl
environment_variables = {
  "LIBRARY_PARQUET_BUCKET" = aws_s3_bucket.library_parquet.id
}
```

---

## Terraform 実装内容

### 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `cluster/n1-aws/main.tf` | S3 バケット、CORS、IAM ポリシー追加 |
| `cluster/n1-aws/lambda.tf` | 環境変数 `LIBRARY_PARQUET_BUCKET` 追加 |
| `cluster/n1-aws/output.tf` | バケット名・ARN の出力追加 |

### 追加リソース一覧

```hcl
# S3 バケット
aws_s3_bucket.library_parquet
aws_s3_bucket_versioning.library_parquet
aws_s3_bucket_server_side_encryption_configuration.library_parquet
aws_s3_bucket_public_access_block.library_parquet
aws_s3_bucket_cors_configuration.library_parquet
aws_s3_bucket_lifecycle_configuration.library_parquet

# IAM ポリシー
aws_iam_policy.library_parquet_s3
aws_iam_role_policy_attachment.lambda_library_parquet_s3
```

### ライフサイクルルール

- **30日後**: STANDARD_IA（低頻度アクセス）に移行
- **非カレントバージョン**: 7日後に削除

### 出力値

| 出力名 | 説明 |
|--------|------|
| `library_parquet_bucket_name` | バケット名 |
| `library_parquet_bucket_arn` | バケット ARN |
