# Axum, Utoipa

このドキュメントでは、axumとutoipaを使用してREST APIを構築し、OpenAPI (Swagger) ドキュメントを自動生成する方法について説明します。

## 目次

- [概要](#概要)
- [セットアップ](#セットアップ)
- [基本的な使い方](#基本的な使い方)
- [エンドポイントの定義](#エンドポイントの定義)
- [スキーマの定義](#スキーマの定義)
- [OpenAPIドキュメントの生成](#openapi-ドキュメントの生成)
- [Swagger UIの統合](#swagger-uiの統合)

## 概要

utoipaは、RustのコードからOpenAPI (Swagger) ドキュメントを自動生成するためのライブラリです。axumと組み合わせることで、APIドキュメントの管理を効率化できます。

## セットアップ

```toml
[dependencies]
axum = "0.7"
utoipa = { version = "5", features = ["axum_extras"] }
utoipa-swagger-ui = "5"
```

## 基本的な使い方

### 1. モデルの定義

```rust
use utoipa::ToSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct User {
    #[schema(example = "1")]
    id: i32,
    #[schema(example = "John Doe")]
    name: String,
    #[schema(example = "john@example.com")]
    email: String,
}
```

### 2. APIハンドラーの定義

```rust
use axum::{
    routing::{get, post},
    Json, Router,
};
use utoipa::OpenApi;

#[utoipa::path(
    get,
    path = "/users/{id}",
    responses(
        (status = 200, description = "User found successfully", body = User),
        (status = 404, description = "User not found")
    ),
    params(
        ("id" = i32, Path, description = "User ID")
    )
)]
async fn get_user(Path(id): Path<i32>) -> Result<Json<User>, StatusCode> {
    // 実装
}
```

### 3. OpenAPI構造体の定義

```rust
#[derive(OpenApi)]
#[openapi(
    paths(
        get_user,
        create_user,
        // 他のエンドポイント
    ),
    components(
        schemas(User)
    ),
    tags(
        (name = "users", description = "User management API")
    )
)]
pub struct ApiDoc;
```

## エンドポイントの定義

エンドポイントには以下の要素を含めることができます：

- Path parameters
- Query parameters
- Request body
- Response types
- Security requirements

```rust
#[utoipa::path(
    post,
    path = "/users",
    request_body = User,
    responses(
        (status = 201, description = "User created successfully", body = User),
        (status = 400, description = "Invalid input")
    ),
    security(
        ("api_key" = [])
    )
)]
async fn create_user(
    Json(user): Json<User>,
) -> Result<(StatusCode, Json<User>), StatusCode> {
    // 実装
}
```

## スキーマの定義

複雑なスキーマの例：

```rust
#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[schema(example = json!({
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "roles": ["ADMIN", "USER"]
}))]
pub struct UserWithRoles {
    id: i32,
    name: String,
    email: String,
    #[schema(example = json!(["ADMIN", "USER"]))]
    roles: Vec<String>,
}
```

## OpenAPIドキュメントの生成

```rust
use axum::{Router, Server};
use utoipa_swagger_ui::SwaggerUi;

#[tokio::main]
async fn main() {
    let app = Router::new()
        .merge(SwaggerUi::new("/swagger-ui")
            .url("/api-docs/openapi.json", ApiDoc::openapi()))
        .route("/users", get(get_users).post(create_user))
        .route("/users/:id", get(get_user));

    Server::bind(&"0.0.0.0:3000".parse().unwrap())
        .serve(app.into_make_service())
        .await
        .unwrap();
}
```

## Swagger UIの統合

Swagger UIは以下のURLでアクセスできます：

- Swagger UI: `http://localhost:3000/swagger-ui/`
- OpenAPI JSON: `http://localhost:3000/api-docs/openapi.json`

## ベストプラクティス

✅ エンドポイントには適切なタグを付ける
```rust
#[utoipa::path(
    get,
    path = "/users",
    tag = "users"
)]
```

✅ レスポンスには適切な説明を含める
```rust
#[utoipa::path(
    responses(
        (status = 200, description = "List of all users", body = Vec<User>),
        (status = 401, description = "Unauthorized - Invalid or missing API key"),
        (status = 500, description = "Internal server error")
    )
)]
```

✅ スキーマには例を含める
```rust
#[derive(ToSchema)]
#[schema(example = json!({
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
}))]
```

✅ セキュリティ要件を明確に定義する
```rust
#[derive(OpenApi)]
#[openapi(
    components(
        security_schemes(
            ("api_key" = (
                type = "apiKey",
                in = Header,
                name = "X-API-Key"
            ))
        )
    )
)]
```

## 参考リンク

- [utoipa GitHub](https://github.com/juhaku/utoipa)
- [utoipa crates.io](https://crates.io/crates/utoipa)
- [axum GitHub](https://github.com/tokio-rs/axum)

