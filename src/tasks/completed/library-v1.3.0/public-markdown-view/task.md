---
title: "公開データのMarkdownレンダリング対応（.mdサフィックス）"
type: feature
emoji: "📝"
topics:
  - library
  - markdown
  - public-view
published: true
targetFiles:
  - apps/library/src/app/v1beta/[org]/[repo]/data/[dataId]/page.tsx
  - apps/library/src/app/v1beta/_components/data-detail-ui/
  - apps/library/src/lib/apiClient.ts
  - docs/src/tasks/feature/public-markdown-view/task.md
github: https://github.com/quantum-box/tachyon-apps
---

# 公開データのMarkdownレンダリング対応（.mdサフィックス）

## 概要
- URL に `.md` サフィックスが付いた場合、該当データを Markdown としてレンダリングする公開ビューを提供する。
- GraphQL で取得できる `properties` を YAML フロントマターに出力し、本文は Markdown/HTML プロパティをコンテンツとして扱う。
- 匿名ユーザーでもアクセス可能な公開パスを維持し、編集系 UI は非表示のまま。

## 背景・目的
- 公開リポジトリのデータを外部から静的ドキュメントとして参照したいニーズがある。
- 現状 `.md` 付きアクセスで 200 応答だが、ページ UI がそのまま表示されデザインや用途が不適切。
- Markdown と YAML frontmatter で返すことで、他ツール連携やプレーン表示が容易になる。

## 詳細仕様

### 機能要件
1. パス `/v1beta/:org/:repo/data/:dataId.md` でアクセスされた場合、通常ページではなく Markdown 表示を返す。
2. フロントマターには `properties` から Markdown/HTML 以外の値を Yaml として出力する。
3. 本文は `Markdown` または `Html` プロパティの内容を優先順で本文化（Markdown > Html を Markdown 化？要検討）。
4. `isPublic=false` の場合や NotFound 時は従来どおり 404/権限エラーを返す。
5. 匿名でも閲覧可だが、編集系 UI/アクションは表示しない。
6. Content-Type は `text/markdown; charset=utf-8` を設定する。

### 非機能要件
- パフォーマンス: 現行 GraphQL コール 1 回以内で完結する。
- セキュリティ: 公開フラグが false のデータは返さない。Markdown 生成時のエスケープを適切に行う。
- 保守性: `.md` ルーティングは Next.js App Router で実装し、既存ページとロジック共通化する。

### コンテキスト別の責務
- library フロント: ルーティング判定と Markdown 生成・レスポンス。
- GraphQL API: 既存の dataDetailPage を流用（追加フィールド不要想定）。

### 仕様のYAML定義（ドラフト）
```yaml
markdown_rendering:
  path_pattern: "/v1beta/:org/:repo/data/:dataId.md"
  frontmatter:
    include_properties: all_except: [Markdown, Html]
  body_source_priority: [Markdown, Html]
  content_type: "text/markdown; charset=utf-8"
  public_access: true
```

### サンプル出力（イメージ）
```
---
title: "Quarterly Metrics"
tags:
  - finance
  - report
owner: "ops-team"
updatedAt: "2025-10-20T12:34:56Z"
views: 123
---

# Quarterly Metrics

This quarter we shipped **3** major features and reduced latency by 18%.

## Highlights
- New billing dashboard
- Faster ingestion pipeline

```
※ frontmatter は Markdown/Html 以外の property を YAML 化、本文は Markdown プロパティをそのまま出力した例。

## 実装方針
- App Router の動的ルートで `.md` を suffix として扱うファイルを追加（例: `page.md.tsx` or middleware-free分岐）。
- `platformAction` を `allowAnonymous: true` で利用し公開取得。
- フロントマター生成の小ユーティリティを追加。
- DataDetailUi は変更不要（公開 .md は別レスポンス）。

## タスク分解
- [x] ルーティング: `.md` サフィックスのページを追加
- [x] データ取得: 既存クエリ流用し匿名許可（front は backend に委譲）
- [x] Markdown生成: frontmatter + 本文（backend側で生成）
- [x] Content-Type/ヘッダ設定
- [ ] 簡易テスト: 手動確認 (.md あり/なし、公私切替)
  - 2025-11-29 curl `http://localhost:50053/v1beta/repos/org1/repo1/data/data_01kb7x4hjz0prpmtypr263v2ke/md` → 404 NotFoundError: organization is not found（ローカルシード未整備のため保留）
- [x] ドキュメント更新

### 進捗メモ
- ✅ `.md` サフィックス: RSC 分岐は撤去（通常ページは従来どおり）
- ✅ 専用エンドポイント（Rust側）: `/v1beta/repos/:org/:repo/data/:dataId/md` で backend が frontmatter+body を生成し `text/markdown` 返却（content プロパティ優先・id含む）
- ✅ フロントの `/md` ルートは backend の `/md` にフェッチする形へ変更し、認証済みの場合は accessToken を使用（匿名時はヘッダー無し）
- 📝 次ステップ: 手動動作確認とドキュメント最終更新

### 完了後メモ
- 仕様ドキュメント: `docs/src/services/library/public-markdown-export.md` を追加
- CHANGELOG: ルート (`CHANGELOG.md`)、`apps/library/CHANGELOG.md`、`apps/library-api/CHANGELOG.md` に記載
- バージョン: library-api を 1.3.0 へ更新（apps/library は既に 1.3.0）
- アーカイブ: `docs/src/tasks/completed/library-v1.3.0/public-markdown-view/`

## Playwright MCPによる動作確認
- [ ] 匿名で `.md` URL にアクセスして Markdown 表示を確認
- [ ] 非公開データで 404/Unauthorized になること
- [ ] 通常 HTML ページが影響を受けないこと（ベーシックな 200 表示）

## リスクと対策
- Frontmatter へのデータ型変換ミス → プロパティ型ごとにユニット関数で変換
- Markdown/HTML 複数存在時の優先順位不整合 → 優先ルールをコードとドキュメントに明記

## スケジュール
- 実装: 0.5d
- 確認: 0.2d

## 完了条件
- `.md` アクセスで Markdown とフロントマターが返る
- 公開データのみ表示し、匿名閲覧可能
- 通常 UI に副作用なし
- タスクドキュメントが更新されている
