---
title: "MCP設定エディタ"
description: "Model Context Protocol (MCP)サーバーの設定を視覚的に編集するUI機能"
emoji: "⚙️"
topics: ["MCP", "設定エディタ", "JSON", "React", "UI"]
published: true
relatedFiles: [
  "apps/aichat/src/components/mcp/",
  "apps/aichat/src/app/mcp-config/",
  "apps/aichat/src/lib/mcp-config.ts",
  "apps/aichat/src/types/mcp.d.ts"
]
---

# MCP設定エディタ

## 概要

AiChatアプリケーションに、MCP（Model Context Protocol）サーバーの設定を視覚的に編集できるUIを実装します。ユーザーは直感的なフォームを通じて、Stdio接続とリモート接続（SSE/HTTP）の両方のMCPサーバー設定を作成・編集・検証できるようになります。

## 背景・目的

### 解決したい課題
- MCP設定JSONの手動編集は複雑でエラーが起きやすい
- 設定形式の違い（Stdio/Remote）を理解する必要がある
- バリデーションが難しく、設定ミスに気づきにくい
- 演習やトレーニング用の設定作成が煩雑

### 期待される効果
- 視覚的なUIによる設定ミスの削減
- リアルタイムバリデーションによる即座のフィードバック
- テンプレートによる素早い設定作成
- 設定のインポート/エクスポート機能による再利用性向上

## 詳細仕様

### 機能要件

#### 1. MCP設定エディタUI
- **サーバー一覧表示**
  - 登録済みMCPサーバーのリスト表示
  - 有効/無効状態の表示と切り替え
  - サーバータイプ（Stdio/Remote）の識別表示

- **サーバー追加・編集**
  - サーバータイプの選択（Stdio/SSE/HTTP）
  - タイプに応じた入力フォームの動的切り替え
  - リアルタイムバリデーション

- **Stdio接続設定**
  ```json
  {
    "command": "uvx",
    "args": ["mcp-server-git", "--repository", "."],
    "env": {"KEY": "value"},
    "always_allow": ["tool1", "tool2"],
    "disabled": false,
    "timeout": 45
  }
  ```

- **リモート接続設定（SSE/HTTP）**
  ```json
  {
    "url": "https://api.example.com/mcp",
    "transport": "sse",
    "headers": {"Authorization": "Bearer token"},
    "timeout": 60,
    "disabled": false
  }
  ```

#### 2. バリデーション機能
- URL形式の検証（リモート接続）
- コマンドの存在確認（Stdio接続）
- タイムアウト値の範囲チェック（1-300秒）
- 必須フィールドの確認
- JSON形式の整合性チェック

#### 3. プリセット・テンプレート
- よく使うMCPサーバーのテンプレート
  - Git操作用（mcp-server-git）
  - ファイルシステム用（mcp-server-filesystem）
  - Web検索用（mcp-server-brave-search）
  - カスタムスクリプト用

#### 4. インポート/エクスポート
- JSON形式での設定エクスポート
- 既存設定ファイルのインポート
- クリップボードへのコピー機能

#### 5. プレビュー機能
- 生成されるJSON設定のリアルタイムプレビュー
- シンタックスハイライト
- フォーマット済み表示

#### 6. Agent Chatとの統合
- **設定の永続化**
  - 作成したMCP設定をブラウザストレージに保存
  - セッション間での設定の復元
  
- **チャットでの利用**
  - `/agent/chat`ページでMCP設定をAPIリクエストに含める
  - アクティブなMCPサーバーの選択機能
  - MCPサーバーごとの有効/無効切り替え
  
- **ツール呼び出し**
  - MCPサーバーが提供するツールの一覧表示
  - ツール呼び出し結果のストリーミング表示
  - エラーハンドリングとリトライ機能

### 非機能要件
- **ユーザビリティ**
  - ドラッグ&ドロップによるサーバー順序変更
  - キーボードショートカット対応
  - モバイルレスポンシブ対応

- **パフォーマンス**
  - 大量のサーバー設定（100+）でもスムーズな動作
  - デバウンスによる入力最適化

- **アクセシビリティ**
  - スクリーンリーダー対応
  - キーボードナビゲーション
  - 適切なARIAラベル

## 追加で実装された機能

### Storybookサポート
- 全MCPコンポーネントのStoryファイルを作成
- インタラクティブなplayテストを含む
- ダークモード対応のストーリー
- モバイル・タブレット表示のストーリー
- localStorageの永続化テスト
- ファイルインポートのシミュレーション

### UI/UX改善
- **ダークテーマ対応**: ボタンやUIコンポーネントがダークモードで適切に表示
- **タイムアウトのオプション化**: タイムアウトを設定しない選択肢を追加
- **フォームリセット**: "Add Server"クリック時に確実にフォームがリセット
- **サーバー名の編集**: 既存サーバーの名前も変更可能（重複チェック付き）
- **ナビゲーション**: `/agent/chat`ページからMCP設定ページへのリンク追加

### Agent Chatとの統合
- **永続化**: MCP設定をlocalStorageに自動保存
- **API連携**: チャットリクエスト時に有効なMCP設定をAPIに送信
- **サーバー選択UI**: サイドバーでMCPサーバーの有効/無効を切り替え可能
- **リアルタイム反映**: 設定変更が即座にチャットに反映

### インポート/エクスポート
- **JSONエクスポート**: 設定をJSON形式でダウンロード
- **ファイルインポート**: JSON設定ファイルのドラッグ&ドロップ対応
- **クリップボードコピー**: ワンクリックで設定をコピー
- **エラーハンドリング**: 不正な設定の検証とフィードバック表示

### コード品質
- **ファイル命名規則**: コンポーネントファイル名をkebab-caseに統一
- **型安全性**: Zod schemaによる堅牢なバリデーション
- **状態管理**: keyプロパティを使った確実なコンポーネントリセット
- **lint修正**: `useAgentStream.ts`の`any`型を`StdioConfig | RemoteConfig`型に修正

## 実装方針

### アーキテクチャ

```
apps/aichat/
├── src/
│   ├── app/
│   │   └── mcp-config/              # MCP設定ページ
│   │       ├── page.tsx             # メインページ
│   │       └── layout.tsx           # レイアウト
│   ├── components/
│   │   └── mcp/                     # MCP関連コンポーネント
│   │       ├── mcp-config-editor.tsx  # エディタメイン
│   │       ├── server-list.tsx       # サーバー一覧
│   │       ├── server-form.tsx       # サーバー編集フォーム
│   │       ├── stdio-config-form.tsx  # Stdio設定フォーム
│   │       ├── remote-config-form.tsx # Remote設定フォーム
│   │       ├── json-preview.tsx      # JSONプレビュー
│   │       └── preset-templates.tsx  # テンプレート選択
│   ├── lib/
│   │   └── mcp-config.ts            # MCP設定ユーティリティ
│   │       ├── validation.ts        # バリデーション
│   │       ├── templates.ts         # テンプレート定義
│   │       └── converter.ts         # 形式変換
│   └── types/
│       └── mcp.d.ts                 # MCP型定義
```

### 技術選定
- **状態管理**: React Hook Form + Zustand
- **バリデーション**: Zod
- **UI**: Shadcn/ui + Radix UI
- **JSONエディタ**: Monaco Editor（軽量版）
- **アイコン**: Lucide React
- **永続化**: localStorage/sessionStorage
- **API通信**: 既存のtachyon-api-actionを活用

### データ構造

```typescript
// MCP設定の型定義
interface McpServerConfig {
  [serverName: string]: StdioConfig | RemoteConfig;
}

interface StdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  always_allow?: string[];
  disabled?: boolean;
  timeout?: number;
}

interface RemoteConfig {
  url: string;
  transport?: 'sse' | 'http';
  headers?: Record<string, string>;
  timeout?: number;
  disabled?: boolean;
}
```

## タスク分解

### フェーズ1: 基本設定 ✅ 完了
- [x] MCP型定義ファイルの作成
- [x] 設定ページのルーティング設定
- [x] 基本レイアウトの実装
- [x] バリデーションスキーマの定義

### フェーズ2: サーバー一覧機能 ✅ 完了
- [x] サーバーリストコンポーネントの実装
- [x] 有効/無効の切り替え機能
- [x] サーバーの削除機能
- [x] ドラッグ&ドロップによる並び替え

### フェーズ3: サーバー編集フォーム ✅ 完了
- [x] 基本フォームコンポーネントの実装
- [x] Stdio設定フォームの実装
  - [x] コマンド入力
  - [x] 引数リスト編集
  - [x] 環境変数エディタ
- [x] Remote設定フォームの実装
  - [x] URL入力とバリデーション
  - [x] ヘッダーエディタ
  - [x] トランスポート選択

### フェーズ4: プレビュー・テンプレート機能 ✅ 完了
- [x] JSONプレビューコンポーネントの実装
- [x] テンプレート選択UIの実装
- [x] プリセットテンプレートの定義
- [x] シンタックスハイライトの追加

### フェーズ5: インポート/エクスポート機能 ✅ 完了
- [x] JSONエクスポート機能の実装
- [x] ファイルインポート機能の実装
- [x] クリップボードコピー機能
- [x] エラーハンドリングとフィードバック

### フェーズ6: Agent Chatとの統合 ✅ 完了
- [x] 作成したMCP設定を`/agent/chat`ページで使用可能にする
  - [x] MCP設定の保存（localStorage/sessionStorage）
  - [x] チャットリクエスト時にMCP設定をAPIに送信
  - [x] アクティブなMCPサーバーの選択UI
  - [x] MCP設定の有効/無効をチャット画面から切り替え
- [x] MCP設定に基づくツール呼び出しの実装
  - [x] MCPサーバーから利用可能なツールの取得（APIレベルで実装済み）
  - [x] ツール呼び出し結果の表示（AgentStream内で実装済み）

### フェーズ7: 高度な機能 ✅ 完了
- [x] 設定の検証とテスト接続
  - [x] テスト接続APIの実装（モック）
  - [x] TestConnectionDialogコンポーネント
  - [x] 接続結果の表示（成功/失敗/ツール一覧）
- [x] 設定履歴機能
  - [x] 設定の自動保存機能
  - [x] 履歴の表示・復元機能
  - [x] 履歴の削除機能
- [x] 設定の共有機能
  - [x] 共有リンクの生成
  - [x] URLパラメータからのインポート
  - [x] セキュリティ注意事項の表示
- [x] 演習用プリセットの追加
  - [x] トレーニング用プリセット（6種類）
  - [x] プリセットのビジュアル区別

## テスト計画

### 単体テスト
- バリデーション関数のテスト
- 形式変換関数のテスト
- テンプレート生成のテスト

### 統合テスト
- フォーム入力からJSON生成までのフロー
- インポート/エクスポートの往復テスト
- エラーケースの処理

### E2Eテスト
- サーバー追加・編集・削除の一連の操作
- テンプレートからの設定作成
- JSONインポートからの編集

## リスクと対策

### 技術的リスク
- **複雑な設定構造**
  - 対策：段階的な実装とユーザーテスト
  - プログレッシブディスクロージャーの採用

- **バリデーションの複雑さ**
  - 対策：Zodスキーマによる型安全な検証
  - エラーメッセージの分かりやすい表示

### UXリスク
- **初心者への配慮不足**
  - 対策：ツールチップとヘルプテキストの充実
  - ガイドモードの実装

## スケジュール

- **フェーズ1-2**: 2日間（基本機能）✅ 完了
- **フェーズ3**: 2日間（フォーム実装）✅ 完了
- **フェーズ4**: 1日間（プレビューとテンプレート）✅ 完了
- **フェーズ5**: 1日間（インポート/エクスポート）✅ 完了
- **フェーズ6**: 2日間（Agent Chatとの統合）✅ 完了
- **フェーズ7**: 1日間（高度な機能）✅ 完了
- **テスト・修正**: 1日間

合計: 約9日間

### 実装進捗
- **完了**: フェーズ1-7（全機能実装完了）
  - 基本的なMCP設定エディタ機能
  - UI/UXの改善とアクセシビリティ
  - インポート/エクスポート機能
  - Agent Chatとの統合
  - テスト接続、履歴管理、共有機能
  - 演習用プリセット

## 完了条件

- [x] Stdio/Remote両方のMCPサーバー設定が作成できる
- [x] バリデーションエラーが適切に表示される
- [x] 生成されたJSONが正しい形式である
- [x] テンプレートから素早く設定を作成できる
- [x] 設定のインポート/エクスポートが動作する
- [x] Agent Chatから設定の有効/無効を切り替えられる
- [x] MCP設定がAPIリクエストに含まれる
- [x] MCPツール呼び出しが動作する
- [x] 設定の検証とテスト接続が動作する
- [x] 設定履歴の保存と復元ができる
- [x] 設定の共有リンクが生成できる
- [x] 演習用プリセットが利用できる
- [ ] すべてのテストがパスする
- [ ] アクセシビリティ要件を満たしている

## 実装の詳細

### MCPツール呼び出しの実装方法

MCPツール呼び出しは以下のように実装されています：

1. **MCP設定の送信**
   - `useAgentStream`フックで`loadMcpConfigFromStorage()`を使用してlocalStorageから設定を取得
   - 無効化されたサーバーをフィルタリング
   - `mcp_hub_config_json`パラメータとしてAPIに送信

2. **ツール呼び出しの表示**
   - `AgentStream`コンポーネントがSSEストリームから`tool_call`、`tool_call_args`、`tool_result`チャンクを受信
   - 各チャンクタイプに対応するコンポーネントで表示：
     - `AgentToolCall`: ツール呼び出しの開始を表示
     - `AgentToolCallArgs`: ツールに渡された引数を表示
     - `AgentToolResult`: ツールの実行結果を折りたたみ可能な形式で表示

3. **API側の処理**
   - LLMsのエージェントシステムがMCP設定を解釈
   - 適切なMCPサーバーに接続してツールを実行
   - 結果をSSEストリームとして返送

### 今後の改善点

- テストカバレッジの向上
- アクセシビリティ機能の実装
- フェーズ7の高度な機能（設定検証、履歴管理、共有機能）の実装

## 参考資料

### 内部リソース
- `/docs/mcp-implementation.md` - MCP実装ガイド
- `/docs/src/tachyon-apps/llms/mcp-transport-support.md` - トランスポート仕様
- `/packages/llms/examples/settings.json` - 設定例
- `/docs/examples/schedule-reservation-mcp.md` - MCPサンプル

### 外部リソース
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [React Hook Form Documentation](https://react-hook-form.com/)
- [Zod Schema Validation](https://zod.dev/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)