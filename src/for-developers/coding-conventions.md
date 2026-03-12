# コーディング規約

このドキュメントは、Tachyon Apps プロジェクトにおけるコーディング規約をまとめたものです。
開発者はこの規約に従ってコードを記述してください。

## Rust

### フォーマットとツール

- **rustfmt**: 必須。行幅は 76 文字。
- **clippy**: 必須。警告は修正する。
- **実行**: `mise run fmt`（Docker内で実行）、`mise run clippy`（Docker内で実行）

### アーキテクチャ

- **Clean Architecture**: `domain/`, `usecase/`, `interface_adapter/`, `handler/` を分離する。
- 詳細は [Clean Architecture](./clean-architecture.md) を参照。

### ドキュメント

- **Public API**: 充実した Rustdoc を付ける（引数・戻り値・エラー・サンプル）。
- **Rustdoc**: ` ```rust` サンプルコードとエラーハンドリングの説明を必ず含める。

### エラーハンドリング

- **`errors::Result<T>`**: 統一されたエラーハンドリングに使用。
- **早期リターン**: `?` 演算子を活用。
- **`Option::ok_or` vs `ok_or_else`**:
  - `ok_or`: 引数を即座に評価する。`Option` が `Some` でもエラー値が生成される。
  - `ok_or_else`: クロージャを遅延評価する。`None` の場合のみエラーが生成される。
  - **推奨**: エラー生成にコストがかかる場合（例: `Backtrace::capture()` を含む）は `ok_or_else` を使用する。

```rust
// ❌ 非推奨: Option が Some でも Backtrace::capture() が実行される
let user = option.ok_or(errors::not_found!("User not found"))?;

// ✅ 推奨: None の場合のみエラーが生成される
let user = option.ok_or_else(|| errors::not_found!("User not found"))?;
```

### テスト

- **フレームワーク**: `#[tokio::test]` を使用。
- **ID 生成**: ULID (`def_id!` マクロ) を優先。
- **SQLx マクロ**: テストコードでは `sqlx::query!` などは使用しない。リポジトリやモックを使用する。

### SQLx

- **オンライン検証**: 原則としてオンライン検証を使用する。
- **`SQLX_OFFLINE=true`**: 使用禁止。
- **キャッシュ更新**: 必要時は `mise run docker-sqlx-prepare` でキャッシュを作成し、即座に削除する。

### ユースケース実装

- **命名**: 動詞を前に置く（例: `create_workflow.rs`, `update_user.rs`）。
- **構造**: Input/Output 構造体を定義し、InputPort トレイトを実装する。
- **詳細**: [Clean Architecture](./clean-architecture.md) の「ユースケースの実装規約」を参照。

## TypeScript / React

### フォーマット

- **Biome**: プロジェクトの設定に従う。
  - シングルクオート
  - 末尾カンマ
  - 必要最小限のセミコロン

### Next.js

- **App Router**: 使用する。
- **Server Component**: デフォルト。クライアント側は必要時のみ `'use client'` を付ける。

### GraphQL

- **クエリファイル**: `.graphql` ファイルに分離する。
- **型生成**: `yarn codegen --filter=<app>` で型生成。`@/gen/graphql` を利用する。

### ファイル命名

- **コンポーネント**: kebab-case（例: `feature-flag-list.tsx`）
- **Hooks**: camelCase with `use` prefix（例: `useApiService.ts`）
- **Utils**: kebab-case（例: `format-currency.ts`）
- **Stories**: コンポーネント名 + `.stories.tsx`

### テスト

- **Storybook**: タグで対象を絞り、日付は固定値でモックする。
- **インタラクションテスト**: 必須として実装する。

### 状態管理

- **Tab コンポーネント**: nuqs でクエリパラメーターに同期し、ブックマークや履歴操作に追従させる。

### エラーハンドリング

- **`neverthrow` の `Result` 型**: 段階的に移行中。
- **新規実装**: try-catch の代わりに `Result<T, E>` 型を使用し、エラーを明示的に処理する。
- **既存コード**: 機会を見て移行する。

## ドキュメント

### 言語

- **ドキュメント**: 日本語で記述。
- **コードコメント**: 英語で記述。
- **エラーメッセージ**: 英語で記述。

### 図表

- **図**: PlantUML を使用。
- **進捗記号**: ✅（完了）/ 🔄（進行中）/ 📝（計画中）

### 構造化データ

- **YAML**: 構造化された仕様は YAML で記述し、単位・通貨を明記する。

## Examples / Tests

### Examples

- **モック禁止**: `examples/` 配下のコードではモックを使用しない。
- **実サービス**: 実際の API やサービスを使用した実装例を提供する。

### Tests

- **モック許可**: `tests/` ではモック・スタブの利用を許可する。
- **独立性**: テストの独立性と再現性を確保する。

## 命名規則

### Rust

- **定数**: `SCREAMING_SNAKE_CASE`
- **変数・関数**: `snake_case`
- **型**: `PascalCase`

### TypeScript

- **定数**: `SCREAMING_SNAKE_CASE`
- **変数・関数**: `camelCase`
- **型**: `PascalCase`

## 参考資料

- [Clean Architecture](./clean-architecture.md)
- [AGENTS.md](../../../AGENTS.md)
- [CLAUDE.md](../../../CLAUDE.md)

