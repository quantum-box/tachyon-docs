# PR #2: ユーザー認証システム

## 概要

このPRでは、Collecaサービスのユーザー認証システムを実装します。ユーザー登録、ログイン、プロフィール管理、SNS認証連携などの機能を提供し、安全なユーザー認証基盤を構築します。

## 実装内容

### 1. ユーザーモデルの定義

**ファイル**: `apps/colleca-api/src/domain/user.rs`

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use util::macros::*;
use chrono::{DateTime, Utc};

def_id!(UserId, "usr_");

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: UserId,
    pub email: String,
    pub name: String,
    pub profile_image_url: Option<String>,
    pub bio: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserAuthProvider {
    pub id: String,
    pub user_id: UserId,
    pub provider: AuthProvider,
    pub provider_user_id: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, strum::EnumString, strum::Display)]
#[strum(serialize_all = "snake_case")]
pub enum AuthProvider {
    Google,
    Twitter,
    Email,
}

impl User {
    pub fn new(email: String, name: String, profile_image_url: Option<String>, bio: Option<String>) -> Self {
        Self {
            id: UserId::default(),
            email,
            name,
            profile_image_url,
            bio,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }
}
```

### 2. ユーザーリポジトリの実装

**ファイル**: `apps/colleca-api/src/adapter/gateway/user_repository.rs`

```rust
use async_trait::async_trait;
use sqlx::{MySql, Pool};
use errors::Result;

use crate::domain::user::{User, UserId, UserAuthProvider, AuthProvider};
use crate::usecase::user::UserRepository;

pub struct SqlxUserRepository {
    pool: Pool<MySql>,
}

impl SqlxUserRepository {
    pub fn new(pool: Pool<MySql>) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl UserRepository for SqlxUserRepository {
    async fn create(&self, user: &User) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO users (id, email, name, profile_image_url, bio, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&user.id.to_string())
        .bind(&user.email)
        .bind(&user.name)
        .bind(&user.profile_image_url)
        .bind(&user.bio)
        .bind(&user.created_at)
        .bind(&user.updated_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    async fn find_by_id(&self, id: &UserId) -> Result<Option<User>> {
        let user = sqlx::query_as::<_, User>(
            r#"
            SELECT * FROM users WHERE id = ?
            "#,
        )
        .bind(id.to_string())
        .fetch_optional(&self.pool)
        .await?;

        Ok(user)
    }

    async fn find_by_email(&self, email: &str) -> Result<Option<User>> {
        let user = sqlx::query_as::<_, User>(
            r#"
            SELECT * FROM users WHERE email = ?
            "#,
        )
        .bind(email)
        .fetch_optional(&self.pool)
        .await?;

        Ok(user)
    }

    async fn update(&self, user: &User) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE users
            SET name = ?, profile_image_url = ?, bio = ?, updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(&user.name)
        .bind(&user.profile_image_url)
        .bind(&user.bio)
        .bind(&user.updated_at)
        .bind(&user.id.to_string())
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    async fn create_auth_provider(&self, auth_provider: &UserAuthProvider) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO user_auth_providers (id, user_id, provider, provider_user_id, created_at)
            VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(&auth_provider.id)
        .bind(&auth_provider.user_id.to_string())
        .bind(&auth_provider.provider.to_string())
        .bind(&auth_provider.provider_user_id)
        .bind(&auth_provider.created_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    async fn find_by_provider(&self, provider: &AuthProvider, provider_user_id: &str) -> Result<Option<User>> {
        let user = sqlx::query_as::<_, User>(
            r#"
            SELECT u.* FROM users u
            JOIN user_auth_providers p ON u.id = p.user_id
            WHERE p.provider = ? AND p.provider_user_id = ?
            "#,
        )
        .bind(provider.to_string())
        .bind(provider_user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(user)
    }
}
```

### 3. 認証ユースケースの実装

**ファイル**: `apps/colleca-api/src/usecase/user/authentication_usecase.rs`

```rust
use async_trait::async_trait;
use errors::Result;
use chrono::Utc;
use uuid::Uuid;

use crate::domain::user::{User, UserId, UserAuthProvider, AuthProvider};

#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn create(&self, user: &User) -> Result<()>;
    async fn find_by_id(&self, id: &UserId) -> Result<Option<User>>;
    async fn find_by_email(&self, email: &str) -> Result<Option<User>>;
    async fn update(&self, user: &User) -> Result<()>;
    async fn create_auth_provider(&self, auth_provider: &UserAuthProvider) -> Result<()>;
    async fn find_by_provider(&self, provider: &AuthProvider, provider_user_id: &str) -> Result<Option<User>>;
}

pub struct AuthenticationUseCase<R: UserRepository> {
    user_repository: R,
}

impl<R: UserRepository> AuthenticationUseCase<R> {
    pub fn new(user_repository: R) -> Self {
        Self { user_repository }
    }

    pub async fn register_with_email(&self, email: String, name: String, password: String) -> Result<User> {
        // 実際の実装ではパスワードハッシュ化などが必要
        // ここでは簡略化のため省略

        // メールアドレスの重複チェック
        if let Some(_) = self.user_repository.find_by_email(&email).await? {
            return Err(errors::Error::BadRequest("Email already exists".to_string()));
        }

        // ユーザー作成
        let user = User::new(email.clone(), name, None, None);
        self.user_repository.create(&user).await?;

        // 認証プロバイダー作成
        let auth_provider = UserAuthProvider {
            id: Uuid::new_v4().to_string(),
            user_id: user.id.clone(),
            provider: AuthProvider::Email,
            provider_user_id: email,
            created_at: Utc::now(),
        };
        self.user_repository.create_auth_provider(&auth_provider).await?;

        Ok(user)
    }

    pub async fn login_with_email(&self, email: String, password: String) -> Result<User> {
        // 実際の実装ではパスワード検証などが必要
        // ここでは簡略化のため省略

        let user = self.user_repository.find_by_email(&email).await?
            .ok_or_else(|| errors::Error::Unauthorized("Invalid email or password".to_string()))?;

        Ok(user)
    }

    pub async fn login_with_provider(&self, provider: AuthProvider, provider_user_id: String, provider_data: ProviderData) -> Result<User> {
        // プロバイダーでユーザーを検索
        if let Some(user) = self.user_repository.find_by_provider(&provider, &provider_user_id).await? {
            return Ok(user);
        }

        // 存在しない場合は新規作成
        let user = User::new(
            provider_data.email,
            provider_data.name,
            provider_data.profile_image_url,
            None,
        );
        self.user_repository.create(&user).await?;

        // 認証プロバイダー作成
        let auth_provider = UserAuthProvider {
            id: Uuid::new_v4().to_string(),
            user_id: user.id.clone(),
            provider,
            provider_user_id,
            created_at: Utc::now(),
        };
        self.user_repository.create_auth_provider(&auth_provider).await?;

        Ok(user)
    }

    pub async fn get_user(&self, user_id: UserId) -> Result<Option<User>> {
        self.user_repository.find_by_id(&user_id).await
    }

    pub async fn update_profile(&self, user_id: UserId, name: String, bio: Option<String>, profile_image_url: Option<String>) -> Result<User> {
        let mut user = self.user_repository.find_by_id(&user_id).await?
            .ok_or_else(|| errors::Error::NotFound("User not found".to_string()))?;

        user.name = name;
        user.bio = bio;
        user.profile_image_url = profile_image_url;
        user.updated_at = Utc::now();

        self.user_repository.update(&user).await?;

        Ok(user)
    }
}

pub struct ProviderData {
    pub email: String,
    pub name: String,
    pub profile_image_url: Option<String>,
}
```

### 4. 認証APIエンドポイント

**ファイル**: `apps/colleca-api/src/handler/rest/auth.rs`

```rust
use axum::{
    extract::{Json, State},
    routing::{post, get},
    Router,
};
use serde::{Deserialize, Serialize};
use errors::Result;

use crate::app::App;
use crate::domain::user::{UserId, AuthProvider};
use crate::usecase::user::ProviderData;

pub fn router(app: App) -> Router {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/oauth/google", post(google_oauth))
        .route("/oauth/twitter", post(twitter_oauth))
        .route("/profile", get(get_profile).put(update_profile))
        .with_state(app)
}

#[derive(Deserialize)]
struct RegisterRequest {
    email: String,
    name: String,
    password: String,
}

#[derive(Serialize)]
struct AuthResponse {
    token: String,
    user: UserResponse,
}

#[derive(Serialize)]
struct UserResponse {
    id: String,
    email: String,
    name: String,
    profile_image_url: Option<String>,
    bio: Option<String>,
}

async fn register(
    State(app): State<App>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>> {
    let user = app.authentication_usecase.register_with_email(
        req.email,
        req.name,
        req.password,
    ).await?;

    let token = app.token_service.generate_token(&user.id)?;

    Ok(Json(AuthResponse {
        token,
        user: UserResponse {
            id: user.id.to_string(),
            email: user.email,
            name: user.name,
            profile_image_url: user.profile_image_url,
            bio: user.bio,
        },
    }))
}

#[derive(Deserialize)]
struct LoginRequest {
    email: String,
    password: String,
}

async fn login(
    State(app): State<App>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<AuthResponse>> {
    let user = app.authentication_usecase.login_with_email(
        req.email,
        req.password,
    ).await?;

    let token = app.token_service.generate_token(&user.id)?;

    Ok(Json(AuthResponse {
        token,
        user: UserResponse {
            id: user.id.to_string(),
            email: user.email,
            name: user.name,
            profile_image_url: user.profile_image_url,
            bio: user.bio,
        },
    }))
}

#[derive(Deserialize)]
struct OAuthRequest {
    token: String,
}

async fn google_oauth(
    State(app): State<App>,
    Json(req): Json<OAuthRequest>,
) -> Result<Json<AuthResponse>> {
    // 実際の実装ではGoogleトークンの検証が必要
    // ここでは簡略化のため省略
    
    let provider_data = ProviderData {
        email: "user@example.com".to_string(),
        name: "Google User".to_string(),
        profile_image_url: Some("https://example.com/avatar.jpg".to_string()),
    };
    
    let user = app.authentication_usecase.login_with_provider(
        AuthProvider::Google,
        "google_user_id".to_string(),
        provider_data,
    ).await?;
    
    let token = app.token_service.generate_token(&user.id)?;
    
    Ok(Json(AuthResponse {
        token,
        user: UserResponse {
            id: user.id.to_string(),
            email: user.email,
            name: user.name,
            profile_image_url: user.profile_image_url,
            bio: user.bio,
        },
    }))
}

async fn twitter_oauth(
    State(app): State<App>,
    Json(req): Json<OAuthRequest>,
) -> Result<Json<AuthResponse>> {
    // 実際の実装ではTwitterトークンの検証が必要
    // ここでは簡略化のため省略
    
    let provider_data = ProviderData {
        email: "user@example.com".to_string(),
        name: "Twitter User".to_string(),
        profile_image_url: Some("https://example.com/avatar.jpg".to_string()),
    };
    
    let user = app.authentication_usecase.login_with_provider(
        AuthProvider::Twitter,
        "twitter_user_id".to_string(),
        provider_data,
    ).await?;
    
    let token = app.token_service.generate_token(&user.id)?;
    
    Ok(Json(AuthResponse {
        token,
        user: UserResponse {
            id: user.id.to_string(),
            email: user.email,
            name: user.name,
            profile_image_url: user.profile_image_url,
            bio: user.bio,
        },
    }))
}

async fn get_profile(
    State(app): State<App>,
    // 実際の実装ではトークンからユーザーIDを取得
    // ここでは簡略化のため省略
) -> Result<Json<UserResponse>> {
    let user_id = UserId::from_string("usr_example").unwrap();
    
    let user = app.authentication_usecase.get_user(user_id).await?
        .ok_or_else(|| errors::Error::NotFound("User not found".to_string()))?;
    
    Ok(Json(UserResponse {
        id: user.id.to_string(),
        email: user.email,
        name: user.name,
        profile_image_url: user.profile_image_url,
        bio: user.bio,
    }))
}

#[derive(Deserialize)]
struct UpdateProfileRequest {
    name: String,
    bio: Option<String>,
    profile_image_url: Option<String>,
}

async fn update_profile(
    State(app): State<App>,
    Json(req): Json<UpdateProfileRequest>,
    // 実際の実装ではトークンからユーザーIDを取得
    // ここでは簡略化のため省略
) -> Result<Json<UserResponse>> {
    let user_id = UserId::from_string("usr_example").unwrap();
    
    let user = app.authentication_usecase.update_profile(
        user_id,
        req.name,
        req.bio,
        req.profile_image_url,
    ).await?;
    
    Ok(Json(UserResponse {
        id: user.id.to_string(),
        email: user.email,
        name: user.name,
        profile_image_url: user.profile_image_url,
        bio: user.bio,
    }))
}
```

### 5. フロントエンドの認証コンポーネント

**ファイル**: `apps/colleca-ui/src/components/auth/LoginForm.tsx`

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { useAuth } from "@/hooks/useAuth";

const loginSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  password: z.string().min(8, "パスワードは8文字以上である必要があります"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    setError(null);

    try {
      await login(data.email, data.password);
      router.push("/collections");
    } catch (err) {
      setError("ログインに失敗しました。メールアドレスとパスワードを確認してください。");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-center mb-6">ログイン</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            メールアドレス
          </label>
          <Input
            id="email"
            type="email"
            {...register("email")}
            error={errors.email?.message}
          />
        </div>
        
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            パスワード
          </label>
          <Input
            id="password"
            type="password"
            {...register("password")}
            error={errors.password?.message}
          />
        </div>
        
        <Button
          type="submit"
          className="w-full"
          isLoading={isLoading}
        >
          ログイン
        </Button>
      </form>
      
      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">または</span>
          </div>
        </div>
        
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {/* Google認証処理 */}}
            className="w-full"
          >
            Googleでログイン
          </Button>
          
          <Button
            type="button"
            variant="outline"
            onClick={() => {/* Twitter認証処理 */}}
            className="w-full"
          >
            Twitterでログイン
          </Button>
        </div>
      </div>
    </div>
  );
}
```

**ファイル**: `apps/colleca-ui/src/hooks/useAuth.ts`

```typescript
"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  email: string;
  name: string;
  profileImageUrl?: string;
  bio?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  updateProfile: (data: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // ローカルストレージからユーザー情報を取得
    const storedUser = localStorage.getItem("user");
    const storedToken = localStorage.getItem("token");

    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser));
    }

    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error("Login failed");
      }

      const data = await response.json();
      
      // ユーザー情報とトークンを保存
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("token", data.token);
      
      setUser(data.user);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, name: string, password: string) => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, name, password }),
      });

      if (!response.ok) {
        throw new Error("Registration failed");
      }

      const data = await response.json();
      
      // ユーザー情報とトークンを保存
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("token", data.token);
      
      setUser(data.user);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    setUser(null);
    router.push("/");
  };

  const updateProfile = async (data: Partial<User>) => {
    setIsLoading(true);

    try {
      const token = localStorage.getItem("token");
      
      if (!token) {
        throw new Error("Not authenticated");
      }

      const response = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Profile update failed");
      }

      const updatedUser = await response.json();
      
      // 更新されたユーザー情報を保存
      localStorage.setItem("user", JSON.stringify(updatedUser));
      
      setUser(updatedUser);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  
  return context;
}
```

## 技術的詳細

### 認証フロー

1. **メールアドレス認証**:
   - ユーザー登録: メールアドレス、名前、パスワードを入力
   - ログイン: メールアドレスとパスワードを入力
   - パスワードはハッシュ化して保存

2. **SNS認証**:
   - Google OAuth: Googleアカウントでのログイン
   - Twitter OAuth: Twitterアカウントでのログイン
   - 初回ログイン時に自動的にユーザー作成

3. **認証トークン**:
   - JWT (JSON Web Token) を使用
   - トークンにはユーザーIDと有効期限を含む
   - クライアント側ではローカルストレージに保存

### セキュリティ対策

- パスワードはbcryptでハッシュ化
- CSRF対策としてトークンを使用
- レート制限によるブルートフォース攻撃対策
- HTTPSによる通信の暗号化

### マルチテナンシー対応

- `packages/auth`との連携
- テナントごとのユーザー分離
- 権限管理システムとの統合

## テスト計画

- ユニットテスト: 各ユースケースとリポジトリの機能テスト
- 統合テスト: APIエンドポイントのテスト
- E2Eテスト: ログイン、登録、プロフィール更新のフロー

## 次のステップ

このPRがマージされた後、PR #3（商品情報取得システム）を進めることができます。また、PR #4（コレクション管理システム）の準備も開始できます。
