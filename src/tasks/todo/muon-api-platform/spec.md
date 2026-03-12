# Muon API Platform — Postmanライクなシナリオテストプラットフォーム

## 概要

Rust製CLIシナリオテストフレームワーク「muon」を、PostmanライクなAPI開発プラットフォームへ進化させる。
Postman改悪（強制クラウド同期、価格改定、UIの肥大化）で離脱したユーザーを獲得するポジショニング。

### 差別化ポイント

| 観点 | Postman | muon API Platform |
|------|---------|-------------------|
| 実行速度 | Electron製、重い | Rust製、軽量・高速 |
| シナリオテスト | Collection Runner（手動構築） | YAML/Markdown宣言的フロー（ネイティブ） |
| オフライン | クラウド強制 | オフラインファースト（Tauri） |
| データ保存 | クラウド（プラン制限） | ローカルファイル（Git管理可能） |
| CI/CD連携 | Newman（別ツール） | 同一バイナリでCLI/UI切り替え |
| 式言語 | JavaScript sandbox | CEL（軽量・安全） |
| SSE/Streaming | 限定的 | ネイティブ対応 |

---

## muon 現状アーキテクチャ

### ファイル構成

```
muon/
├── src/
│   ├── bin/muon.rs          # CLI エントリポイント (clap)
│   ├── lib.rs               # Public API exports
│   ├── model.rs             # データモデル (TestScenario, TestStep, HttpRequest, etc.)
│   ├── config.rs            # TestConfigManager (ファイル検出・ロード)
│   ├── runner.rs            # DefaultTestRunner (実行エンジン)
│   ├── validator.rs         # JSON/ヘッダー/データ検証
│   ├── expression.rs        # CEL式評価 (test/bind)
│   ├── markdown_parser.rs   # .scenario.md パーサー
│   ├── runn_parser.rs       # runn互換 runbook パーサー
│   ├── sse.rs               # SSEパーサー/バリデーション
│   └── api_client.rs        # TachyonOps API クライアント（レポート送信）
├── action.yml               # GitHub Action定義
└── tests/fixtures/          # テスト用YAMLファイル
```

### コアデータモデル

```
TestScenario
├── name, description, tags
├── vars: HashMap<String, Value>       # グローバル変数
├── config: TestConfig                 # base_url, headers, timeout, continue_on_failure
└── steps: Vec<TestStep>
    └── TestStep
        ├── name, id, description
        ├── request: HttpRequest       # method, url, headers, query, body
        ├── expect: ResponseExpectation # status, headers, json, json_eq, sse, contains
        ├── save: HashMap              # JSONPath → 変数保存
        ├── test: Option<String>       # CEL式アサーション
        ├── bind: HashMap              # CEL式 → 変数バインド
        ├── loop_config: Option        # リトライ/ポーリング（count, until, interval, backoff）
        ├── include: Option            # 外部シナリオ参照
        └── condition: Option<String>  # スキップ条件
```

### 実行フロー

```
CLI → TestConfigManager.load_all_scenarios()
    → DefaultTestRunner.run(scenario) for each
        → Step loop:
            1. condition チェック（スキップ判定）
            2. include → 再帰実行
            3. loop_config → リトライ制御
            4. expand_variables() → {{var}} 展開
            5. send_request() → HTTP実行
            6. validate() → status/headers/json/sse/CEL
            7. save/bind → 変数抽出
            8. steps_map 更新 → cross-step参照
    → TestResult → TestRunReport
```

### 拡張ポイント（UIフック可能箇所）

1. **TestScenario** — YAML ↔ JSON 相互変換可能、UIモデルとして直接利用可
2. **DefaultTestRunner::run()** — async、ステップごとのコールバック追加容易
3. **TestResult/StepResult** — 全データSerializable、リアルタイムストリーミング可能
4. **vars HashMap** — 実行中の変数状態をUIで可視化可能
5. **tracing** — 構造化ログをUIにリダイレクト可能

### 既存依存で利用可能なもの

- `tokio` — async runtime（サーバー対応済み）
- `serde/serde_json` — JSON API
- `axum 0.7` — dev-dependenciesにあり、本体に昇格可能
- `reqwest` — HTTPクライアント

---

## Phase 1: `muon serve` モード — ローカルWebサーバー + 実行UI

### 目的

`muon serve` コマンドでローカルWebサーバーを起動し、ブラウザからシナリオの一覧表示・実行・結果確認ができる状態にする。

### 画面仕様

#### 1-1. シナリオ一覧画面 (`/`)

```
┌─────────────────────────────────────────────────────────────┐
│  muon                                        [Run All] [⚙]  │
├─────────────────────────────────────────────────────────────┤
│  Filter: [________________] Tags: [auth ▼] [payment ▼]      │
├─────────────────────────────────────────────────────────────┤
│  ● User Authentication Flow        3 steps   auth    [▶ Run]│
│    Last: ✅ 245ms  2024-01-15 14:23                          │
│                                                              │
│  ● Payment Processing               5 steps   payment [▶ Run]│
│    Last: ❌ 1.2s   2024-01-15 14:20  "Status 500 != 200"    │
│                                                              │
│  ● SSE Streaming Test               2 steps   sse     [▶ Run]│
│    Never run                                                 │
└─────────────────────────────────────────────────────────────┘
```

- シナリオファイル自動検出（watchモード）
- タグ/名前でフィルタ
- 最終実行結果のサマリー表示
- 一括実行ボタン

#### 1-2. シナリオ詳細・実行画面 (`/scenarios/:id`)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back   User Authentication Flow              [▶ Run]     │
│  auth.scenario.yaml                                          │
├──────────┬──────────────────────────────────────────────────┤
│ Steps    │  Step 1: Login                                    │
│          │  ┌──────────────────────────────────────────────┐ │
│ 1. Login │  │ POST /api/auth/login                         │ │
│    ✅     │  │ Headers: Content-Type: application/json      │ │
│ 2. Get   │  │ Body:                                        │ │
│   Profile│  │   { "email": "test@example.com",             │ │
│    ✅     │  │     "password": "secret" }                   │ │
│ 3. Logout│  │                                              │ │
│    ✅     │  │ Expect: 200                                  │ │
│          │  │ JSON: { token: "{{saved}}" }                 │ │
│          │  ├──────────────────────────────────────────────┤ │
│ Vars:    │  │ Response (245ms)                    [Raw|Pretty]│
│ token=..│  │ Status: 200 OK                                │ │
│ user_id= │  │ { "token": "eyJ...", "user": { ... } }       │ │
│          │  └──────────────────────────────────────────────┘ │
├──────────┴──────────────────────────────────────────────────┤
│ Timeline: ──●──────●──────────●── 245ms total               │
└─────────────────────────────────────────────────────────────┘
```

- 左: ステップ一覧（実行状況インジケータ付き）
- 右: 選択中ステップのリクエスト/レスポンス詳細
- 下: 実行タイムライン（各ステップの所要時間可視化）
- 変数パネル: 現在のvars状態をリアルタイム表示

#### 1-3. 実行中のリアルタイム更新

- SSE（Server-Sent Events）でステップ実行状況をブラウザにストリーミング
- ステップごとに: `pending` → `running` → `passed`/`failed`
- 変数の変化をリアルタイム反映

### 技術設計

#### バックエンド (`muon serve`)

```
muon serve [--port 9800] [--path ./tests/scenarios] [--open]
```

- **axum** WebサーバーをCLIバイナリに統合
- 静的ファイル配信（埋め込みまたはディスク）
- REST API:
  - `GET /api/scenarios` — シナリオ一覧
  - `GET /api/scenarios/:id` — シナリオ詳細（パース済みJSON）
  - `POST /api/scenarios/:id/run` — 実行開始 → SSEストリーム返却
  - `GET /api/runs` — 実行履歴
  - `GET /api/runs/:id` — 実行結果詳細
- ファイルウォッチャー（notify crate）でシナリオ変更を検出
- WebSocket/SSE で変更通知をブラウザにプッシュ

#### フロントエンド

- **React + Vite** — SPAとしてビルド、Rustバイナリに埋め込み（`include_dir` or `rust-embed`）
- **Tailwind CSS** — スタイリング
- **shadcn/ui** — UIコンポーネント
- 状態管理: React Query（サーバー状態） + zustand（UIローカル状態）
- コード表示: Monaco Editor（読み取り専用、Phase 1）

#### ディレクトリ構成

```
muon/
├── src/                    # 既存 Rust コード
│   ├── bin/muon.rs         # serve サブコマンド追加
│   ├── server/
│   │   ├── mod.rs          # axum Router 構築
│   │   ├── routes.rs       # API ハンドラ
│   │   ├── state.rs        # AppState (scenarios, runs)
│   │   ├── sse.rs          # SSE ストリーミング
│   │   └── watcher.rs      # ファイルウォッチャー
│   └── ... (既存モジュール)
└── ui/                     # フロントエンド
    ├── package.json
    ├── vite.config.ts
    ├── src/
    │   ├── App.tsx
    │   ├── pages/
    │   │   ├── scenarios-list.tsx
    │   │   └── scenario-detail.tsx
    │   ├── components/
    │   │   ├── step-viewer.tsx
    │   │   ├── response-viewer.tsx
    │   │   ├── variable-panel.tsx
    │   │   └── timeline.tsx
    │   └── lib/
    │       ├── api.ts
    │       └── types.ts
    └── dist/               # ビルド成果物 → Rustに埋め込み
```

### ビジネスルール

- `muon serve` はCLIモードと完全に独立。既存の `muon --path` は変更なし
- シナリオファイルは読み取り専用（Phase 1 では編集不可）
- 実行履歴はインメモリ（プロセス終了で消える）。Phase 3 で永続化検討
- ポートデフォルト: 9800（`--port` でオーバーライド）
- `--open` フラグでブラウザ自動起動

### 実装タスク分割（spawn向け）

| # | タスク | 見積ファイル数 | 依存 |
|---|--------|---------------|------|
| 1-A | 📝 CLIに `serve` サブコマンド追加 + axumサーバー起動の骨格 | 3-4 | なし |
| 1-B | 📝 REST API: シナリオ一覧/詳細エンドポイント | 3-4 | 1-A |
| 1-C | 📝 REST API: シナリオ実行 + SSEストリーミング | 4-5 | 1-B |
| 1-D | 📝 DefaultTestRunnerにコールバック/チャネル機構追加 | 2-3 | なし |
| 1-E | 📝 ファイルウォッチャー + WebSocket通知 | 2-3 | 1-A |
| 1-F | 📝 フロントエンド: プロジェクト初期化 + シナリオ一覧画面 | 5-8 | 1-B |
| 1-G | 📝 フロントエンド: シナリオ詳細・実行画面 | 8-12 | 1-C, 1-F |
| 1-H | 📝 フロントエンド: リアルタイム実行表示 + タイムライン | 5-8 | 1-G |
| 1-I | 📝 Rustバイナリへのフロントエンド埋め込み + ビルドパイプライン | 2-3 | 1-F |
**並列化可能**: 1-A/1-D は並列。1-F は 1-B 完了後開始。1-E は独立。

---

## Phase 2: シナリオエディタUI

### 目的

ブラウザ上でシナリオの作成・編集・テスト実行を一貫して行えるエディタを提供する。Postmanのリクエストビルダーに相当するが、シナリオ（複数ステップ）がファーストクラス。

### 画面仕様

#### 2-1. リクエストビルダー

```
┌─────────────────────────────────────────────────────────────┐
│  Step: Login                                    [Save] [▶]   │
├─────────────────────────────────────────────────────────────┤
│  [POST ▼] [https://api.example.com/auth/login             ] │
├─────────────────────────────────────────────────────────────┤
│  [Params] [Headers] [Body] [Auth] [Tests] [Variables]        │
├─────────────────────────────────────────────────────────────┤
│  Body (JSON):                                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ {                                                      │ │
│  │   "email": "{{vars.email}}",                           │ │
│  │   "password": "{{vars.password}}"                      │ │
│  │ }                                                      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Tests (CEL):                                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ current.res.status == 200                              │ │
│  │ && size(current.res.body.token) > 0                    │ │
│  └────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  Save Variables:                                             │
│  [token    ] ← [body.token           ] [+ Add]              │
│  [user_id  ] ← [body.user.id         ]                      │
└─────────────────────────────────────────────────────────────┘
```

#### 2-2. レスポンスビューア

```
┌─────────────────────────────────────────────────────────────┐
│  Response   Status: 200 OK   Time: 124ms   Size: 1.2 KB     │
├─────────────────────────────────────────────────────────────┤
│  [Pretty] [Raw] [Headers] [Cookies] [Tests]                  │
├─────────────────────────────────────────────────────────────┤
│  {                                                           │
│    "token": "eyJhbGciOiJIUzI1NiIs...",                      │
│    "user": {                                                 │
│      "id": "usr_01abc",                                     │
│      "email": "test@example.com",                           │
│      "roles": ["admin", "user"]                             │
│    }                                                         │
│  }                                                           │
├─────────────────────────────────────────────────────────────┤
│  Tests:                                                      │
│    ✅ Status is 200                                          │
│    ✅ Token is non-empty string                              │
│    ✅ User has admin role                                    │
└─────────────────────────────────────────────────────────────┘
```

#### 2-3. シナリオフローエディタ

```
┌─────────────────────────────────────────────────────────────┐
│  Scenario: User Authentication Flow     [YAML] [Visual]      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐               │
│  │ 1. Login │───→│ 2. Get   │───→│ 3. Logout│               │
│  │ POST     │    │  Profile │    │ POST     │               │
│  │ /login   │    │ GET /me  │    │ /logout  │               │
│  │ ✅ 124ms │    │ ✅ 89ms  │    │ ✅ 45ms  │               │
│  └──────────┘    └──────────┘    └──────────┘               │
│       │                                                      │
│       └─── token ──→ Authorization: Bearer {{token}}         │
│                                                              │
│  [+ Add Step]  [+ Add Condition]  [+ Add Loop]              │
└─────────────────────────────────────────────────────────────┘
```

- ドラッグ&ドロップでステップ順序変更
- ステップ間の変数フロー可視化（矢印で依存関係表示）
- YAML↔ビジュアルの双方向切り替え

#### 2-4. 環境変数マネージャー

```
┌─────────────────────────────────────────────────────────────┐
│  Environments          [dev ▼]  [+ New Environment]          │
├─────────────────────────────────────────────────────────────┤
│  Variable        dev              staging         prod       │
│  ─────────────────────────────────────────────────────────── │
│  base_url        localhost:3000   staging.api.com api.com    │
│  api_key         dev-key-xxx     stg-key-xxx     ●●●●●●●    │
│  email           test@test.com   test@test.com   -          │
└─────────────────────────────────────────────────────────────┘
```

- 環境ごとの変数セット管理
- センシティブ値のマスキング
- `.muon/environments/` にJSON/YAML保存

### 技術設計

- Monaco Editor: YAML/JSON/CEL シンタックスハイライト + 自動補完
- リアルタイムYAMLバリデーション（バックエンドにパース依頼 → エラーをエディタに表示）
- ファイル保存: REST API `PUT /api/scenarios/:id` → YAMLファイル書き出し
- 環境変数: `GET/PUT /api/environments` → `.muon/environments/*.yaml`
- Undo/Redo: エディタ側 + ファイルレベルでgit diff可能

### 実装タスク分割

| # | タスク | 見積ファイル数 | 依存 |
|---|--------|---------------|------|
| 2-A | 📝 REST API: シナリオ作成/更新/削除エンドポイント | 3-4 | Phase 1 |
| 2-B | 📝 REST API: 環境変数管理エンドポイント | 2-3 | Phase 1 |
| 2-C | 📝 REST API: YAMLバリデーション（リアルタイム） | 2 | Phase 1 |
| 2-D | 📝 フロントエンド: リクエストビルダー（タブUI） | 8-10 | Phase 1 |
| 2-E | 📝 フロントエンド: レスポンスビューア | 5-7 | 2-D |
| 2-F | 📝 フロントエンド: Monaco Editor統合（YAML/CEL） | 4-6 | 2-D |
| 2-G | 📝 フロントエンド: シナリオフローエディタ（ビジュアル） | 8-12 | 2-D |
| 2-H | 📝 フロントエンド: 環境変数マネージャー | 4-6 | 2-B |
| 2-I | 📝 YAML ↔ ビジュアルモデル双方向変換 | 3-5 | 2-G |

---

## Phase 3: Tauri化 — デスクトップアプリ

### 目的

Tauri v2でネイティブデスクトップアプリ化。オフラインファースト、OS統合、自動アップデート。

### 機能追加

#### 3-1. デスクトップ固有機能

- **プロジェクト管理**: 複数のシナリオディレクトリを「プロジェクト」として管理
- **ファイルシステム統合**: OS標準のファイルダイアログでシナリオ開く/保存
- **システムトレイ**: バックグラウンド実行、定期テスト
- **自動アップデート**: Tauri updater で GitHub Releases から配信
- **キーボードショートカット**: Cmd/Ctrl+Enter で実行、Cmd+S で保存
- **マルチウィンドウ**: 複数シナリオを別ウィンドウで並列操作

#### 3-2. 永続化

- **実行履歴**: SQLite でローカル保存
- **ワークスペース設定**: `.muon/config.toml`
- **最近開いたプロジェクト**: OS標準の最近使ったファイルに統合

#### 3-3. インポート/エクスポート

- **Postman Collection v2.1 → muon YAML 変換**
- **Insomnia エクスポート → muon YAML 変換**
- **cURL → ステップ変換**（クリップボードからペースト）
- **OpenAPI/Swagger → シナリオ雛形自動生成**

### 技術設計

```
muon/
├── src-tauri/              # Tauri バックエンド (Rust)
│   ├── src/
│   │   ├── main.rs         # Tauri エントリポイント
│   │   ├── commands.rs     # Tauri コマンド (IPC)
│   │   ├── db.rs           # SQLite (実行履歴)
│   │   ├── import/         # Postman/Insomnia/cURL/OpenAPI パーサー
│   │   └── updater.rs      # 自動アップデート
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                    # 既存 muon コアライブラリ
└── ui/                     # フロントエンド（Phase 1-2 と共有）
```

- **コアロジック共有**: `muon` crate をライブラリとして `src-tauri` から参照
- **IPC**: Tauri コマンドで `run_scenario()` / `list_scenarios()` 等を公開
- **ビルド**: `tauri build` で macOS (.dmg), Windows (.msi), Linux (.AppImage) 生成

### 実装タスク分割

| # | タスク | 見積ファイル数 | 依存 |
|---|--------|---------------|------|
| 3-A | 📝 Tauri プロジェクト初期化 + 既存UIの統合 | 5-8 | Phase 2 |
| 3-B | 📝 Tauri コマンド: シナリオ操作IPC | 4-6 | 3-A |
| 3-C | 📝 SQLite 実行履歴永続化 | 3-5 | 3-B |
| 3-D | 📝 Postman Collection インポーター | 3-5 | 3-A |
| 3-E | 📝 Insomnia/cURL/OpenAPI インポーター | 5-8 | 3-D |
| 3-F | 📝 プロジェクト管理UI（マルチプロジェクト） | 4-6 | 3-A |
| 3-G | 📝 システムトレイ + バックグラウンド実行 | 2-3 | 3-A |
| 3-H | 📝 自動アップデート + リリースパイプライン | 3-5 | 3-A |
| 3-I | 📝 クロスプラットフォームビルド CI | 2-3 | 3-H |

---

## 全体マイルストーン

| マイルストーン | 内容 | 目標 |
|---------------|------|------|
| **v0.1** | `muon serve` — 読み取り専用UI + シナリオ実行 | Phase 1 完了 |
| **v0.2** | リクエストビルダー + レスポンスビューア | Phase 2 前半 |
| **v0.3** | シナリオフローエディタ + 環境変数管理 | Phase 2 完了 |
| **v0.4** | Tauri デスクトップアプリ (macOS先行) | Phase 3 前半 |
| **v0.5** | インポーター (Postman/cURL/OpenAPI) + クロスプラットフォーム | Phase 3 完了 |

---

## spawn並列化戦略

### Phase 1 の並列実行プラン

```
spawn-1 (worktree1): バックエンド
  → 1-A (CLIサブコマンド) → 1-B (REST API一覧/詳細) → 1-C (実行+SSE)
  → 1-D (Runner コールバック) → 1-E (ファイルウォッチャー)

spawn-2 (worktree2): フロントエンド
  → 1-F (プロジェクト初期化 + 一覧画面)
  → 1-G (詳細・実行画面)
  → 1-H (リアルタイム表示 + タイムライン)
  → 1-I (バイナリ埋め込み)
```

- spawn-1 が 1-B を完了した時点で spawn-2 に API 仕様を共有し 1-F を開始
- 1-D（Runnerコールバック）は 1-C の前提だが、独立して先行実装可能

### Phase 2 以降

同様に バックエンド/フロントエンド を2 spawn で並列化。
Phase 3 は Tauri 固有タスクとして別 spawn を立てる可能性あり。

---

## 技術的考慮事項

### muon crate のリファクタリング（Phase 1 前提）

現在の `DefaultTestRunner` はステップ実行結果を最後にまとめて返す設計。
UIリアルタイム更新のため、実行中のイベントをチャネル (`tokio::sync::mpsc`) で送出する機構が必要。

```rust
// 追加するイベント型
enum RunEvent {
    ScenarioStarted { name: String, step_count: usize },
    StepStarted { index: usize, name: String },
    StepCompleted { index: usize, result: StepResult },
    VariableUpdated { key: String, value: Value },
    ScenarioCompleted { result: TestResult },
}
```

既存の `run()` メソッドは互換維持し、`run_with_events()` を追加する方針。

### バイナリサイズ

- Phase 1: フロントエンド埋め込みで +2-5MB 程度（gzip圧縮後）
- Phase 3: Tauri は別バイナリなので CLI 側に影響なし
- Feature flag で `serve` 機能をオプショナルにする検討

### セキュリティ

- `muon serve` はローカルホストのみバインド（デフォルト `127.0.0.1`）
- CORS: ローカルのみ許可
- ファイル書き込み（Phase 2）: 指定ディレクトリ外へのアクセスを禁止
