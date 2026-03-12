---
title: "シナリオテストのMarkdown記法対応"
type: "improvement"
emoji: "🧩"
topics:
  - ScenarioTest
  - Markdown
  - DX
published: true
targetFiles:
  - apps/tachyon-api/tests/scenarios/
  - apps/tachyon-api/tests/scenarios/*.scenario.md
  - packages/*/tests/scenarios/
  - tools/
  - docs/
github: ""
---

# シナリオテストのMarkdown記法対応

## 概要

現行のYAMLベースシナリオテストに加えて、Markdownのフロントマターとコードブロックで記述できる形式を追加し、コメントや説明の記載を容易にする。

## 背景・目的

- シナリオテストの可読性を高め、説明や背景情報を併記しやすくする。
- Markdownにすることでレビューや共有時の意図伝達がスムーズになる。
- 既存YAMLとの互換性を維持し、段階的に移行可能な形式にする。

## 詳細仕様

### 機能要件

1. Markdownファイル内のフロントマターを解析してシナリオ設定を取得する。
2. Markdown本文中のコードブロックからシナリオ定義を抽出する。
3. 既存のYAMLフォーマットとの互換性を保ち、どちらでも実行可能にする。
4. Markdown内の説明文・コメントはテスト実行結果に影響しない。
5. エラー時はファイル名・行番号・ブロック種別を含むメッセージを返す。

### 非機能要件

- 既存シナリオの実行速度に大きな影響を与えない。
- パースエラーは分かりやすいメッセージで報告する。
- Markdown記法は最小限の規約で運用できる。

### 仕様のYAML定義

```yaml
markdown_scenario:
  front_matter:
    required:
      - name
      - description
    optional:
      - tags
      - vars
  code_blocks:
    - language: "yaml scenario"
      content: "YAMLベースのシナリオ定義"
    - language: graphql
      usage: "Step内のGraphQLの本文に埋め込むためのスニペット"
  compatibility:
    - existing_yaml: true
    - md_extension: ".scenario.md"
```

### 想定するMarkdown例

```markdown
---
name: "tool-jobs rest scenario"
description: "Tool Job REST APIの主要フローを確認"
tags: [tool-jobs, rest]
vars:
  operator_id: tn_01hjryxysgey07h5jz5wagqj0m
---

# Tool Jobs Scenario

このシナリオはRESTエンドポイントの作成→取得→一覧→キャンセルを検証する。

```yaml scenario
steps:
  - id: create
    method: POST
    path: /v1/agent/tool-jobs
    headers:
      Authorization: "Bearer dummy-token"
      x-operator-id: "{{vars.operator_id}}"
    body:
      prompt: "Write a haiku"
```
```

サンプルとして `apps/tachyon-api/tests/scenarios/tool_job_rest.scenario.md` を追加し、既存 `tool_job_rest.yaml` をMarkdown化した具体例として扱う。共通設定と各ステップを複数の ` ```yaml scenario` ブロックに分割し、説明文を挟める構成にしている。

## 実装方針

### アーキテクチャ設計

- 既存のシナリオパーサーにMarkdown対応レイヤーを追加し、YAML/Markdownの入力を統一構造へ正規化する。
- Markdownパースは軽量なライブラリを使用し、front matterとcode block抽出に限定する。

### 技術選定

- Markdownパース: 既存依存の有無を確認し、最小限の依存追加で実装する。
- Front matter: YAML front matter（`---`）を採用。

## タスク分解

### 主要タスク
- [x] 要件定義の明確化
- [x] Markdown記法の仕様策定
- [x] 既存YAMLとの互換性検証
- [x] 実装
  - [x] `packages/test_runner/src/markdown_parser.rs` — front matter + code block パーサー
  - [x] `packages/test_runner/src/model.rs` — `TestScenario::from_markdown()` 追加
  - [x] `packages/test_runner/src/config.rs` — `.scenario.md` ファイル検出・ディスパッチ
  - [x] `packages/test_runner/src/lib.rs` — `markdown_parser` モジュール登録
- [x] テスト・品質確認（10テスト全PASS）
- [ ] ドキュメント更新

## テスト計画

- 既存YAMLシナリオの回帰テスト
- Markdownシナリオの成功ケース
- フロントマター欠落・不正なコードブロックの失敗ケース

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| パース仕様が複雑化 | 中 | 記法を最小限に固定し、テンプレートを提供する |
| 互換性の崩れ | 高 | 既存YAMLのパスはそのまま残し、拡張として追加する |
| 行番号のエラー報告が不十分 | 中 | 解析時に行番号を保持し、エラーに含める |

## 参考資料

- `apps/tachyon-api/tests/scenarios/` の既存シナリオファイル
- `docs/src/tasks/template.md`

## 完了条件

- [x] Markdown形式のシナリオが実行可能
- [x] 既存YAMLシナリオに影響がない
- [x] エラー時のメッセージに行番号・ブロック種別が含まれる
- [ ] ドキュメントの使用例が整備されている

## 実装メモ

### 変更ファイル一覧
| ファイル | 変更内容 |
|---------|---------|
| `packages/test_runner/src/markdown_parser.rs` | 新規: Markdownパーサー（front matter, code block抽出, config merge） |
| `packages/test_runner/src/model.rs` | `TestScenario::from_markdown()` 追加 |
| `packages/test_runner/src/config.rs` | `.scenario.md` ファイル検出、パースディスパッチ |
| `packages/test_runner/src/lib.rs` | `markdown_parser` モジュール登録 |
| `apps/tachyon-api/tests/scenarios/tool_job_rest.scenario.md` | 既存（サンプル） |

### 設計判断
- 外部Markdownパースライブラリは追加せず、`---` 区切りと ` ```yaml scenario ` フェンスの正規表現的な検出で十分軽量に実装した。
- コードブロック内に `config` を置けるようにし、front matterの config とマージする（code block側が勝つ）。これにより既存サンプルとの互換性を確保。
- `tags` フィールドは将来のフィルタリング用にパースするが、現時点では `TestScenario` に保持しない（`#[allow(dead_code)]`）。
