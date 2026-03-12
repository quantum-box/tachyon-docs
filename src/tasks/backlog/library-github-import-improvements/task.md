---
title: "Library GitHub Import Improvements"
type: improvement
emoji: "🔧"
topics:
  - Library
  - GitHub
  - Performance
  - Testing
published: true
targetFiles:
  - apps/library-api/src/usecase/import_markdown_from_github.rs
  - packages/providers/github/src/oauth.rs
github: https://github.com/quantum-box/tachyon-apps/pull/925
---

# Library GitHub Import Improvements

## 概要

PR #925 のAIレビュー指摘事項をまとめたタスク。GitHub Markdown Import機能の品質向上を目的とする。

## レビューサマリー

| カテゴリ | スコア | 状況 |
|---------|-------|------|
| Security | 8/10 | 良好、軽微な改善点あり |
| Architecture | 7/10 | クリーンだが複雑なUsecase |
| Performance | 6/10 | シリアル処理がボトルネック |
| Testing | 5/10 | フロントは良好、バックエンド不足 |
| Maintainability | 7/10 | 構造化されているが簡素化可能 |

## 優先度別タスク

### High Priority 🔴

#### 1. インテグレーションテストの追加

**問題**: インポートフロー全体のテストがない

**対応**:
- [ ] `apps/library-api/tests/github_import.rs` を作成
- [ ] OAuth認証からインポート完了までのE2Eテスト
- [ ] エラーシナリオテスト（ネットワーク失敗、無効トークン等）

```rust
// テスト例
#[tokio::test]
async fn test_import_markdown_from_github_success() {
    // Setup mock GitHub API
    // Execute import
    // Verify created data
}

#[tokio::test]
async fn test_import_markdown_from_github_network_error() {
    // Setup mock to return network error
    // Verify graceful error handling
}
```

#### 2. バッチ/並列処理の実装

**問題**: ファイルを順次処理しており、大規模リポジトリで遅い

**場所**: `apps/library-api/src/usecase/import_markdown_from_github.rs:382-492`

**対応**:
- [ ] `futures::stream::iter` を使用した並列処理
- [ ] バッチサイズの設定（推奨: 10ファイル/バッチ）
- [ ] 進捗コールバックの追加

```rust
// 改善例
use futures::stream::{self, StreamExt};

let batch_size = 10;
let results = stream::iter(selected_files.chunks(batch_size))
    .map(|chunk| async {
        // Process chunk in parallel
        futures::future::join_all(chunk.iter().map(import_single_file)).await
    })
    .buffer_unordered(3)
    .collect::<Vec<_>>()
    .await;
```

### Medium Priority 🟡

#### 3. Usecaseの分割

**問題**: `ImportMarkdownFromGitHub::execute` が684行で責務過多

**対応**:
- [ ] `FindOrCreateRepository` Usecase抽出
- [ ] `EnsureProperties` Usecase抽出
- [ ] `ImportSingleFile` Usecase抽出
- [ ] オーケストレーション層でまとめる

```
import_markdown_from_github.rs (オーケストレーション)
├── find_or_create_repository.rs
├── ensure_properties.rs
└── import_single_file.rs
```

#### 4. GitHub APIレート制限対応

**問題**: 大量インポート時にGitHub APIレート制限に当たる可能性

**対応**:
- [ ] レート制限ヘッダーのチェック (`X-RateLimit-Remaining`)
- [ ] 制限到達時のバックオフ処理
- [ ] ユーザーへの警告通知

```rust
// packages/providers/github/src/oauth.rs に追加
pub struct RateLimitInfo {
    remaining: u32,
    reset_at: DateTime<Utc>,
}

pub async fn check_rate_limit(token: &str) -> Result<RateLimitInfo>;
```

#### 5. Base64デコードのエラーハンドリング強化

**問題**: 不正なBase64コンテンツでエラーが不明確

**場所**: `packages/providers/github/src/oauth.rs:607-615`

**対応**:
- [ ] 明示的なエラーメッセージ追加
- [ ] 不正コンテンツのスキップオプション

```rust
// 改善例
let decoded = base64::engine::general_purpose::STANDARD
    .decode(&content.content)
    .map_err(|e| {
        errors::Error::bad_request(format!(
            "Failed to decode file content for '{}': {}",
            path, e
        ))
    })?;
```

### Low Priority 🟢

#### 6. 定数の集約

**問題**: マジックナンバーやハードコードされた値が散在

**対応**:
- [ ] `constants.rs` を作成
- [ ] ページサイズ（1000）を定数化
- [ ] GitHub API URLを定数化

```rust
// apps/library-api/src/usecase/constants.rs
pub const GITHUB_API_PAGE_SIZE: u32 = 1000;
pub const IMPORT_BATCH_SIZE: usize = 10;
pub const MAX_DIRECTORY_DEPTH: usize = 10;
```

#### 7. パラメータリストの簡素化

**問題**: `import_single_file` に10以上のパラメータ

**場所**: `import_markdown_from_github.rs:601`

**対応**:
- [ ] `ImportContext` 構造体の導入
- [ ] パラメータをグループ化

```rust
struct ImportContext<'a> {
    executor: &'a auth::Executor,
    multi_tenancy: &'a auth::MultiTenancy,
    repo: &'a Repo,
    properties: &'a HashMap<String, PropertyId>,
    github_config: &'a GitHubConfig,
}

async fn import_single_file(
    ctx: &ImportContext<'_>,
    path: &str,
    content: &str,
) -> Result<ImportedData>;
```

#### 8. Storybookエラーシナリオテスト

**問題**: エラー状態のテストがない

**対応**:
- [ ] MSWを使用したエラーモック
- [ ] ネットワークエラーストーリー追加
- [ ] 認証エラーストーリー追加

```typescript
// apps/library/src/app/v1beta/[org]/_components/github-import-dialog.stories.tsx
export const NetworkError: Story = {
  parameters: {
    msw: {
      handlers: [
        rest.get('*/api/github/*', (req, res, ctx) => {
          return res(ctx.status(500), ctx.json({ error: 'Network error' }))
        }),
      ],
    },
  },
}
```

## 潜在的バグ

### 1. 空のfrontmatterハンドリング

**問題**: 空または不正なYAMLでエラーが発生する可能性

**対応**:
- [ ] 空frontmatterを空オブジェクトとして扱う
- [ ] パースエラー時のフォールバック

### 2. 重複検出のJSONパースエラー

**問題**: `ext_github` のJSONパースが失敗すると静かに無視される

**場所**: `import_markdown_from_github.rs:344-358`

**対応**:
- [ ] パースエラーのログ出力追加
- [ ] ユーザーへの警告表示

### 3. ディレクトリ深度制限

**問題**: 深いディレクトリ構造でスタックオーバーフローの可能性

**場所**: `expand_path_recursive` 関数

**対応**:
- [ ] 最大深度の設定（推奨: 10）
- [ ] 反復処理への書き換え検討

## 参考

- [PR #925](https://github.com/quantum-box/tachyon-apps/pull/925)
- [AIレビューコメント](https://github.com/quantum-box/tachyon-apps/pull/925#issuecomment-3625465260)
- [GitHub Markdown Import仕様](../../services/library/github-markdown-import.md)

## 完了条件

- [ ] High Priority タスクがすべて完了
- [ ] テストカバレッジが向上
- [ ] パフォーマンステスト実施

