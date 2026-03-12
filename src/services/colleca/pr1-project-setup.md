# PR #1: プロジェクト基盤セットアップ

## 概要

Collecaサービスの基本構造と開発環境を整備するための初期PRです。このPRでは、フロントエンドとバックエンドのプロジェクト構造、共通パッケージ、データベース設計、CI/CD設定などの基盤を構築します。

## 実装内容

### 1. APIプロジェクト構造の作成

**ディレクトリ**: `apps/colleca-api/`

```
apps/colleca-api/
├── Cargo.toml
├── src/
│   ├── main.rs              # エントリーポイント
│   ├── app.rs               # アプリケーション構造体
│   ├── config.rs            # 設定管理
│   ├── error.rs             # エラー定義
│   ├── domain/              # ドメインモデル
│   │   ├── collection.rs    # コレクションモデル
│   │   ├── product.rs       # 商品モデル
│   │   └── user.rs          # ユーザーモデル
│   ├── usecase/             # ユースケース
│   │   ├── collection/      # コレクション関連ユースケース
│   │   ├── product/         # 商品関連ユースケース
│   │   └── user/            # ユーザー関連ユースケース
│   ├── adapter/             # アダプター
│   │   ├── controller/      # コントローラー
│   │   └── gateway/         # ゲートウェイ
│   └── handler/             # APIハンドラー
│       ├── graphql/         # GraphQLハンドラー
│       └── rest/            # RESTハンドラー
└── migrations/              # データベースマイグレーション
```

**Cargo.toml**:
```toml
[package]
name = "colleca-api"
version = "0.1.0"
edition = "2021"
workspace = true

[dependencies]
axum = { workspace = true }
tokio = { workspace = true }
serde = { workspace = true }
serde_json = { workspace = true }
sqlx = { workspace = true }
tracing = { workspace = true }
async-graphql = { workspace = true }
async-graphql-axum = { workspace = true }
tower = { workspace = true }
tower-http = { workspace = true }
auth = { path = "../../packages/auth" }
colleca-common = { path = "../../packages/colleca-common" }
```

### 2. UIプロジェクト構造の作成

**ディレクトリ**: `apps/colleca-ui/`

```
apps/colleca-ui/
├── package.json
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
├── public/
│   ├── favicon.ico
│   └── images/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── auth/
│   │   ├── collections/
│   │   └── profile/
│   ├── components/
│   │   ├── common/
│   │   ├── collection/
│   │   └── product/
│   ├── hooks/
│   ├── lib/
│   │   ├── api.ts
│   │   └── auth.ts
│   ├── styles/
│   │   └── globals.css
│   └── types/
└── .env.local
```

**package.json**:
```json
{
  "name": "colleca-ui",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "graphql": "^16.8.0",
    "graphql-request": "^6.1.0",
    "tailwindcss": "^3.3.0",
    "postcss": "^8.4.31",
    "autoprefixer": "^10.4.16",
    "@heroicons/react": "^2.0.18",
    "zod": "^3.22.4",
    "react-hook-form": "^7.47.0",
    "next-auth": "^4.24.4"
  },
  "devDependencies": {
    "typescript": "^5.2.2",
    "@types/react": "^18.2.33",
    "@types/react-dom": "^18.2.14",
    "@types/node": "^20.8.9",
    "eslint": "^8.52.0",
    "eslint-config-next": "^14.0.0"
  }
}
```

### 3. 共通パッケージの作成

**ディレクトリ**: `packages/colleca-common/`

```
packages/colleca-common/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── dto/
    │   ├── collection.rs
    │   ├── product.rs
    │   └── user.rs
    ├── error.rs
    └── utils/
        ├── url.rs
        └── validation.rs
```

**Cargo.toml**:
```toml
[package]
name = "colleca-common"
version = "0.1.0"
edition = "2021"
workspace = true

[dependencies]
serde = { workspace = true }
serde_json = { workspace = true }
thiserror = { workspace = true }
url = { workspace = true }
regex = { workspace = true }
```

### 4. データベースマイグレーション

**ファイル**: `apps/colleca-api/migrations/20250426000001_initial_schema.sql`

```sql
-- ユーザーテーブル
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    profile_image_url TEXT,
    bio TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 外部認証テーブル
CREATE TABLE user_auth_providers (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY (provider, provider_user_id)
);

-- 商品テーブル
CREATE TABLE products (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'JPY',
    image_url TEXT,
    url TEXT NOT NULL,
    ec_site VARCHAR(50) NOT NULL,
    ec_product_id VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY (ec_site, ec_product_id)
);

-- コレクションテーブル
CREATE TABLE collections (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    cover_image_url TEXT,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- コレクション商品テーブル
CREATE TABLE collection_products (
    id VARCHAR(36) PRIMARY KEY,
    collection_id VARCHAR(36) NOT NULL,
    product_id VARCHAR(36) NOT NULL,
    position INT NOT NULL,
    comment TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY (collection_id, product_id)
);

-- アフィリエイト設定テーブル
CREATE TABLE affiliate_settings (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    ec_site VARCHAR(50) NOT NULL,
    affiliate_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY (user_id, ec_site)
);

-- クリックトラッキングテーブル
CREATE TABLE click_tracking (
    id VARCHAR(36) PRIMARY KEY,
    collection_id VARCHAR(36) NOT NULL,
    product_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36),
    ip_address VARCHAR(45),
    user_agent TEXT,
    referrer TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

### 5. CI/CD設定

**ファイル**: `.github/workflows/colleca.yml`

```yaml
name: Colleca CI/CD

on:
  push:
    branches: [ main ]
    paths:
      - 'apps/colleca-api/**'
      - 'apps/colleca-ui/**'
      - 'packages/colleca-common/**'
  pull_request:
    branches: [ main ]
    paths:
      - 'apps/colleca-api/**'
      - 'apps/colleca-ui/**'
      - 'packages/colleca-common/**'

jobs:
  backend-test:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: password
          MYSQL_DATABASE: colleca_test
        ports:
          - 3306:3306
        options: --health-cmd="mysqladmin ping" --health-interval=10s --health-timeout=5s --health-retries=3

    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Rust
        uses: actions-rs/toolchain@v1
        with:
          profile: minimal
          toolchain: stable
          override: true
          components: rustfmt, clippy
      
      - name: Cache dependencies
        uses: actions/cache@v3
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}
      
      - name: Run migrations
        run: |
          cd apps/colleca-api
          cargo install sqlx-cli --no-default-features --features mysql
          sqlx database create --database-url mysql://root:password@localhost:3306/colleca_test
          sqlx migrate run --database-url mysql://root:password@localhost:3306/colleca_test
      
      - name: Check formatting
        run: cargo fmt --all -- --check
      
      - name: Run clippy
        run: cargo clippy --all-targets --all-features -- -D warnings
      
      - name: Run tests
        run: cargo test --package colleca-api --package colleca-common
        env:
          DATABASE_URL: mysql://root:password@localhost:3306/colleca_test

  frontend-test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'yarn'
      
      - name: Install dependencies
        run: |
          cd apps/colleca-ui
          yarn install --frozen-lockfile
      
      - name: Run linting
        run: |
          cd apps/colleca-ui
          yarn lint
      
      - name: Run type checking
        run: |
          cd apps/colleca-ui
          yarn tsc --noEmit
```

### 6. 開発環境のDockerfile作成

**ファイル**: `apps/colleca-api/Dockerfile`

```dockerfile
FROM rust:1.70 as builder

WORKDIR /app
COPY . .

RUN cargo build --package colleca-api --release

FROM debian:bullseye-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/colleca-api /usr/local/bin/

ENV RUST_LOG=info

EXPOSE 8080

CMD ["colleca-api"]
```

**ファイル**: `apps/colleca-ui/Dockerfile`

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

COPY . .

RUN yarn install --frozen-lockfile
RUN yarn build

FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV production

COPY --from=builder /app/apps/colleca-ui/next.config.js .
COPY --from=builder /app/apps/colleca-ui/package.json .
COPY --from=builder /app/apps/colleca-ui/public ./public
COPY --from=builder /app/apps/colleca-ui/.next/standalone ./
COPY --from=builder /app/apps/colleca-ui/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
```

**ファイル**: `compose.colleca.yml`

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: password
      MYSQL_DATABASE: colleca
    ports:
      - "3306:3306"
    volumes:
      - mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 3

  colleca-api:
    build:
      context: .
      dockerfile: apps/colleca-api/Dockerfile
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=mysql://root:password@mysql:3306/colleca
      - RUST_LOG=info
    depends_on:
      mysql:
        condition: service_healthy

  colleca-ui:
    build:
      context: .
      dockerfile: apps/colleca-ui/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8080
    depends_on:
      - colleca-api

volumes:
  mysql-data:
```

## 技術的詳細

### アーキテクチャ

- バックエンドはClean Architectureに基づいて設計
  - ドメイン層: ビジネスロジックとエンティティ
  - ユースケース層: アプリケーションロジック
  - アダプター層: 外部システムとの連携
  - インフラ層: データベースやフレームワーク

- フロントエンドはNext.jsのApp Routerを採用
  - サーバーコンポーネントを活用
  - クライアントコンポーネントは必要な場合のみ使用
  - Tailwind CSSでスタイリング

### データベース設計

- ユーザー、商品、コレクションの基本モデル
- 多対多関係の適切な設計
- インデックス最適化
- 外部キー制約による整合性確保

### セキュリティ考慮事項

- HTTPS通信
- CSRF対策
- 入力バリデーション
- 認証・認可の適切な実装

## テスト計画

- ユニットテスト: 各コンポーネントの機能テスト
- 統合テスト: APIエンドポイントのテスト
- E2Eテスト: ユーザーフローのテスト

## 次のステップ

このPRがマージされた後、PR #2（ユーザー認証システム）とPR #3（商品情報取得システム）を並行して進めることができます。
