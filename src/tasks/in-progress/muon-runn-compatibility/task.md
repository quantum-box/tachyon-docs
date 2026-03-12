---
title: "muon: runn互換の式ベースアサーション + runbookインポート"
type: "feature"
emoji: "🧪"
topics: ["muon", "runn", "scenario-test", "expression-engine", "CEL"]
published: true
targetFiles:
  - muon/src/model.rs
  - muon/src/runner.rs
  - muon/src/validator.rs
  - muon/src/expression.rs
  - muon/src/runn_parser.rs
  - muon/Cargo.toml
github: ""
---

# muon: runn互換の式ベースアサーション + runbookインポート

## 概要

muonにrunn (k1LoW/runn) 互換の式ベースアサーション (`test:`) とrunbookファイルの直接インポート機能を追加する。これにより、muonのアウトプット検証の厳密性が大幅に向上し、既存のrunnユーザーが移行しやすくなる。

## 背景・目的

- **アウトプット検証の厳密性**: 現在のmuonは `expect:` セクションで宣言的な検証のみ。`status == 200 && len(body.items) > 0` のような複合条件式が書けない
- **runn互換性**: runn は国内で広く使われているAPIシナリオテストツール。互換性を持つことで:
  - 既存の runn runbook をそのまま muon で実行可能に
  - runn ユーザーが muon に乗り換えやすくなる
  - muon の Markdown シナリオ + SSE 検証という独自の強みを活かしつつ、runn のエコシステムも取り込める

## 詳細仕様

### 機能要件

#### 1. 式ベースアサーション (`test:` セクション)

```yaml
steps:
  - id: create_user
    request:
      method: POST
      url: /api/users
      body: { name: "alice" }
    expect:
      status: 201          # 既存のexpectも併用可能
    test: |
      current.res.status == 201
      && current.res.body.name == "alice"
      && size(current.res.body.roles) > 0
      && current.res.body.id.matches("^us_")
    bind:
      user_id: current.res.body.id
```

#### 2. 組み込み変数

| 変数 | 説明 | 例 |
|------|------|-----|
| `current` | 現在のステップの結果 | `current.res.status`, `current.res.body`, `current.res.headers` |
| `previous` | 直前のステップの結果 | `previous.res.body.id` |
| `steps` | 全ステップの結果マップ | `steps.create_user.res.body.id` |
| `vars` | ユーザー定義変数 | `vars.base_url` |
| `env` | 環境変数 | `env.API_KEY` |

#### 3. `current.res` の構造

```json
{
  "res": {
    "status": 200,
    "headers": { "content-type": "application/json" },
    "body": { /* parsed JSON */ },
    "rawBody": "..."
  },
  "req": {
    "method": "POST",
    "url": "/api/users",
    "headers": { ... },
    "body": { ... }
  }
}
```

#### 4. 式エンジン (CEL) でサポートする関数

runn の expr-lang と CEL の対応:

| expr-lang (runn) | CEL (muon) | 備考 |
|---|---|---|
| `len(x)` | `size(x)` | `len()` もエイリアスとして登録 |
| `contains(str, sub)` | `str.contains(sub)` | `contains(str, sub)` もカスタム関数で登録 |
| `startsWith(str, pre)` | `str.startsWith(pre)` | 同一 |
| `endsWith(str, suf)` | `str.endsWith(suf)` | 同一 |
| `matches(str, re)` | `str.matches(re)` | 同一 |
| `compare(x, y, ...paths)` | `compare(x, y, paths)` | カスタム関数として実装 |
| `diff(x, y, ...paths)` | `diff(x, y, paths)` | カスタム関数として実装 |
| `type(x)` | `type(x)` | CEL組み込み |
| `has(x.field)` | `has(x.field)` | CEL組み込み |
| `faker.UUID()` | 未対応 (将来課題) | |
| `jwt.*` | 未対応 (将来課題) | |

#### 5. `bind:` セクション (runn互換の変数バインド)

```yaml
bind:
  user_id: current.res.body.id
  token: current.res.headers.authorization
```

既存の `save:` と共存。`save:` はJSONパスベース、`bind:` は式ベース。

#### 6. runbook YAMLインポート

runn形式のrunbook YAMLを直接読み込み、muon内部モデルに変換:

```yaml
# runn形式 (input)
desc: User API Test
runners:
  req: http://localhost:3000
vars:
  email: test@example.com
steps:
  create_user:
    req:
      /api/users:
        post:
          headers:
            Content-Type: application/json
          body:
            application/json:
              email: "{{ vars.email }}"
    test: |
      current.res.status == 201
    bind:
      user_id: current.res.body.id
```

自動的にmuon内部モデル (`TestScenario`) に変換される。

#### 7. `loop:` / `until:` 対応

```yaml
steps:
  - id: wait_ready
    request:
      method: GET
      url: /api/status
    loop:
      count: 10
      until: "current.res.body.status == 'ready'"
      interval: 2
      multiplier: 1.5
      maxInterval: 10
```

#### 8. `include:` 対応

```yaml
steps:
  - id: setup
    include:
      path: setup.scenario.md
      vars:
        token: "{{ vars.admin_token }}"
```

### 非機能要件

- 既存の `expect:` / `save:` は完全に後方互換
- CEL式のコンパイルはシナリオロード時に行い、実行時はキャッシュを使用
- 式評価のタイムアウト: 1秒
- 並列テスト実行に対応 (CEL Programはスレッドセーフ)

## 実装方針

### 技術選定

**式評価エンジン: `cel` クレート (v0.12.0)**

選定理由:
- Google CEL仕様準拠。非チューリング完全で安全
- `serde_json::Value` との統合がネイティブ (`Serialize` → `add_variable`)
- ドット記法がそのまま動作
- 組み込み関数: `size()`, `contains()`, `startsWith()`, `endsWith()`, `matches()`, `has()`
- カスタム関数登録が簡潔
- スレッドセーフ (コンパイル済み `Program` を並列テストで共有可能)
- 急成長中 (crates.io 75k DL, 2025-12に v0.12.0リリース)

不採用の理由:
- `rhai`: オーバースペック (スクリプティングエンジン)、JSON統合にボイラープレート多い
- `evalexpr`: ドット記法非対応、JSON統合なし
- `jexl-eval`: ドキュメント薄い (13%)、コミュニティ小さい

### アーキテクチャ

```
muon/src/
├── expression.rs      # NEW: CEL式評価エンジンラッパー
│   ├── ExpressionEngine
│   │   ├── compile(expr) -> CompiledExpr
│   │   ├── evaluate(compiled, context) -> Result<bool>
│   │   └── resolve_path(expr, context) -> Result<Value>
│   └── runn互換カスタム関数 (len, contains, compare, diff)
├── runn_parser.rs     # NEW: runn形式YAML → TestScenario 変換
│   ├── parse_runbook(yaml) -> TestScenario
│   └── convert_step(runn_step) -> TestStep
├── model.rs           # MODIFY: TestStep に test/bind/loop 追加
├── runner.rs          # MODIFY: current/previous/steps管理、test/bind/loop評価
├── validator.rs       # MINOR: expression.rs に委譲
├── config.rs          # MODIFY: .runbook.yml 自動検出
├── markdown_parser.rs # 変更なし (serde default で対応)
├── sse.rs             # 変更なし
└── api_client.rs      # 変更なし
```

## タスク分解

### Phase 1: 式評価エンジン + `test:` / `bind:` / `current` ✅

核となる機能。これが動けば残りは拡張。

- [x] `cel` クレートを Cargo.toml に追加
- [x] `expression.rs` モジュール作成
  - [x] `evaluate_test()` / `resolve_value()` 関数
  - [x] runn互換カスタム関数: `len()` (→ `size()` エイリアス), `compare()`, `diff()`, `type_of()`
  - [x] `serde_json::Value` → CELコンテキスト変換
  - [x] 単体テスト 15件: 基本式、複合条件、パス解決、カスタム関数、has/in/ternary
- [x] `model.rs` に `test`, `bind`, `loop_config`, `include` フィールド追加
  - [x] `TestStep` に `test: Option<String>`, `bind: HashMap<String, String>`
  - [x] `LoopConfig` 構造体: `count`, `until`, `interval`, `multiplier`, `max_interval`
  - [x] `IncludeConfig` 構造体: `path`, `vars`
- [x] `runner.rs` の変更
  - [x] ステップ実行後に `current` 変数を自動設定 (`res.status`, `res.headers`, `res.body`)
  - [x] `previous` 変数の管理
  - [x] `steps` マップに `res` キーを追加 (既存の `outputs` と並存)
  - [x] `env` 変数の追加 (環境変数へのアクセス)
  - [x] `test:` 式の評価処理
  - [x] `bind:` の処理 (`save:` の後に実行)
  - [x] `loop:` / `until:` 対応 (指数バックオフ)
- [x] 統合テスト
  - [x] 基本的な `test:` 式の評価
  - [x] `bind:` による変数バインド
  - [x] `test:` と `expect:` の共存
  - [x] 既存シナリオの後方互換テスト (18件全パス)

### Phase 2: runbook YAMLインポーター ✅

runn形式のrunbook YAMLファイルを直接読み込み可能にする。

- [x] `runn_parser.rs` モジュール作成
  - [x] runbook YAML構造のデシリアライズモデル
  - [x] `runners:` セクションのパース (HTTP runnerのみ)
  - [x] `steps:` のマップ形式・リスト形式両対応
  - [x] runn HTTP request構造 (`/path: { post: { body: ... } }`) → muon `HttpRequest` 変換
  - [x] `test:` / `bind:` のパススルー
  - [x] `desc` → `name` / `description` マッピング
  - [x] `labels:` → `tags:` マッピング
  - [x] `vars:` のマッピング
  - [x] `force:` → `continue_on_failure` マッピング
  - [x] `test:` 式からステータスコード推論 (`current.res.status == 201` → 201)
- [x] `config.rs` で `.runbook.yml` / `.runn.yml` ファイルを自動検出
- [x] テスト 8件 (変換テスト) + 統合テスト 1件 (実行テスト)

### Phase 3: `include:` + 追加互換関数 ✅

- [x] `include:` 対応
  - [x] 外部シナリオファイルの読み込みと実行
  - [x] `vars:` のオーバーライド (親の変数 + include固有vars)
  - [x] config の継承 (base_url, headers)
- [x] 追加カスタム関数
  - [x] `type_of(x)` / `type()` エイリアス (int/uint/double/string/bool/list/map/null/bytes)
  - [x] `urlencode(str)` (URL encode)
  - 注: `pick`/`omit`/`merge`/`intersect` はCEL組み込みの `filter()`/`exists()` でカバー可能なため見送り
  - 注: `file(path)` はセキュリティ考慮が必要なため将来課題
- [x] テスト: 61ユニットテスト + 20インテグレーションテスト全パス

## テスト計画

### 単体テスト

- `expression.rs`: 式のコンパイル・評価、カスタム関数、エラーケース
- `runn_parser.rs`: 各種runbook形式のパースと変換

### 統合テスト

- 実際のHTTP APIに対する `test:` 式の評価
- runn形式runbookを読み込んでのE2E実行
- 既存の `.scenario.md` ファイルとの後方互換

### 互換性テスト

- runn公式サンプルのrunbookを取得し、muonで実行可能か検証

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| `cel` クレートのAPI安定性 | 中 | v0.12.0のAPIにラッパー層を設け、直接依存を避ける |
| expr-lang とCELの式構文差異 | 中 | `len()` → `size()` 等のエイリアス登録、差分をドキュメント化 |
| runbook形式の多様性 (gRPC, DB等) | 低 | HTTP runnerのみ初期対応、非対応runnerはスキップ+警告 |
| 既存シナリオの後方互換 | 高 | `test:` / `bind:` は `serde(default)` で追加、既存フィールドは一切変更しない |
| CEL式評価のパフォーマンス | 低 | コンパイル済み式のキャッシュ、1秒タイムアウト |

## 完了条件

- [x] `test:` セクションで CEL式ベースのアサーションが動作する
- [x] `bind:` セクションで変数バインドが動作する
- [x] `current` / `previous` / `steps` 組み込み変数が利用可能
- [x] runn形式 runbook YAML を直接読み込み・実行可能
- [x] `loop:` / `until:` でリトライが動作する
- [x] `include:` で外部シナリオ取り込みが動作する
- [x] 既存の全 `.scenario.md` ファイルが変更なしで動作する (後方互換)
- [x] `compare()` / `diff()` / `type_of()` / `urlencode()` 関数が動作する
- [x] 統合テストが全て pass (61ユニット + 20インテグレーション)
- [ ] ドキュメント (README, 移行ガイド) → 将来課題

## 参考資料

- [runn (k1LoW/runn)](https://github.com/k1LoW/runn) - Go製APIシナリオテストツール
- [expr-lang/expr](https://github.com/expr-lang/expr) - runnが使用する式評価エンジン
- [cel-rust](https://github.com/cel-rust/cel-rust) - Rust CEL実装 (muonで採用)
- [CEL Specification](https://github.com/google/cel-spec) - Google CEL仕様
- [muon README](../../muon/README.md) - muon現行ドキュメント
- [muon Markdown Guide](../../muon/docs/markdown-guide.md) - Markdown形式ガイド
