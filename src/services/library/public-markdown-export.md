---
title: "Library データのMarkdown公開エクスポート"
type: spec
emoji: "📄"
topics:
  - library
  - markdown
  - public-api
published: true
github: https://github.com/quantum-box/tachyon-apps
---

# Library データのMarkdown公開エクスポート

## 概要
- 公開リポジトリのデータを Markdown 形式で取得するエンドポイントを提供する。
- frontmatter に `id`, `title` および本文以外のプロパティを YAML で含め、本文は `content` プロパティ（markdown/html/string）を優先的に出力する。
- 匿名アクセスを許容（公開リポジトリのポリシーに準拠）。

## エンドポイント
- `GET /v1beta/repos/{org}/{repo}/data/{data_id}/md`
- ヘッダー
  - `x-platform-id`: Platform ID（必須）
  - `Authorization: Bearer <access_token>`（ログイン時推奨、匿名でも可）

## レスポンス
- `Content-Type: text/markdown; charset=utf-8`
- 構造
  - Frontmatter: YAML。`id`, `title` を必ず含む。`content` 以外のプロパティを型に応じて YAML 化。
  - Body: `content` プロパティ（Markdown > Html > String）。なければ Markdown プロパティ → Html プロパティ → `# <title>` フォールバック。

### 例
```markdown
---
id: data_01kb7x4hjz0prpmtypr263v2ke
title: "Quarterly Metrics"
tags:
  - finance
  - report
updatedAt: "2025-10-20T12:34:56Z"
views: 123
---

# Quarterly Metrics

This quarter we shipped **3** major features and reduced latency by 18%.
```

## 挙動メモ
- `content` という名前のプロパティがあれば本文として優先採用。
- Markdown/Html プロパティは frontmatter には含めず本文候補としてのみ使用。
- MultiSelect/Relation などの複合型は YAML で表現（`dataIds` 配列など）。

## フロントエンド連携
- `apps/library/src/app/v1beta/[org]/[repo]/data/[dataId]/md/route.ts` で本エンドポイントをフェッチし、そのまま `text/markdown` を返却。セッションがあれば accessToken を使用。

## 既知の留意点
- 非公開リポジトリは従来どおり権限で弾かれる。
- 追加のプロパティ型が増えた場合、frontmatter 変換ロジックの拡張が必要。
