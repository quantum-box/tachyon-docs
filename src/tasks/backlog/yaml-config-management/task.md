---
title: "tachyon-apiへのYAMLベース設定管理システムの実装"
type: "feature"
emoji: "⚙️"
topics: ["configuration", "yaml", "rust", "build-time"]
published: true
targetFiles: [
  "apps/tachyon-api/src/config.rs",
  "apps/tachyon-api/config/",
  "apps/tachyon-api/Cargo.toml"
]
github: "https://github.com/quantum-box/tachyon-apps"
---

# tachyon-apiへのYAMLベース設定管理システムの実装

## 概要

tachyon-apiにビルド時YAML設定ファイル読み込み機能を実装し、LLMプロバイダーの価格設定、課金システムの設定、機能フラグなどを柔軟に管理できるようにする。

## 背景・目的

### 現状の課題
- 設定が環境変数とコマンドライン引数に分散している
- LLMプロバイダーの価格設定がハードコードされている
- 環境ごとの設定管理が煩雑
- 設定変更時にコード修正が必要

### 解決したいこと
- 設定の一元管理
- ビルド時に設定を静的に埋め込むことで実行時の依存を削減
- 型安全な設定管理
- 環境別設定の柔軟な管理

## 詳細仕様

### 機能要件

1. **YAML設定ファイルのビルド時埋め込み**
   - `include_str!`マクロを使用した静的埋め込み
   - デプロイ時に設定ファイル不要

2. **階層的な設定管理**
   - デフォルト設定（default.yaml）
   - 環境別設定（development.yaml, production.yaml）
   - 環境変数による上書き
   - コマンドライン引数による最終上書き

3. **設定内容**
   ```yaml
   llm_providers:
     anthropic:
       models:
         - name: claude-3-5-sonnet
           input_cost_nanodollars: 3000
           output_cost_nanodollars: 15000
   
   billing:
     enabled: true
     free_trial_credits: 1000
     credit_packages:
       - name: starter
         credits: 1000
         price_usd: 10
   
   features:
     agent_api: true
     code_execution: true
     web_search: true
   ```

### 非機能要件

- **型安全性**: Rust の型システムで設定構造を定義
- **パフォーマンス**: ビルド時埋め込みにより実行時のファイルI/Oを削除
- **可読性**: YAML形式による人間に優しい設定
- **バージョン管理**: 設定ファイルもGit管理下

## 実装方針

### アーキテクチャ

```
apps/tachyon-api/
├── config/
│   ├── default.yaml        # デフォルト設定
│   ├── development.yaml    # 開発環境設定
│   └── production.yaml     # 本番環境設定
├── src/
│   ├── config.rs          # 設定管理モジュール
│   └── config/
│       ├── yaml.rs        # YAML設定構造体
│       └── merged.rs      # 統合設定ロジック
```

### 技術選定

- **serde_yaml**: YAML パース
- **include_str!**: ビルド時ファイル埋め込み
- **clap**: 既存のCLI引数パース（維持）

## タスク分解

### フェーズ1: 基本実装 📝
- [ ] config/default.yaml の作成
- [ ] YamlConfig 構造体の定義
- [ ] include_str! による埋め込み実装
- [ ] serde_yaml 依存の追加

### フェーズ2: 階層的設定管理 📝
- [ ] 環境別設定ファイルの作成
- [ ] 設定マージロジックの実装
- [ ] AppConfig 統合構造体の実装
- [ ] 既存のConfig構造体との統合

### フェーズ3: LLMプロバイダー価格設定の移行 📝
- [ ] 価格設定のYAML定義
- [ ] ハードコードされた価格の除去
- [ ] 価格設定読み込みロジックの実装

### フェーズ4: テストと検証 📝
- [ ] 単体テストの作成
- [ ] 設定マージのテスト
- [ ] 環境別設定の動作確認
- [ ] ビルド時埋め込みの検証

## テスト計画

### 単体テスト
- YAML パースのテスト
- 設定マージロジックのテスト
- 型変換のテスト

### 統合テスト
- 環境変数との統合テスト
- CLI引数との統合テスト
- 実際のアプリケーション起動テスト

### 動作確認
```bash
# 開発環境での起動
ENVIRONMENT=development cargo run --bin tachyon-api

# 本番環境での起動
ENVIRONMENT=production cargo run --bin tachyon-api

# CLI引数での上書き
cargo run --bin tachyon-api -- --port 8080
```

## リスクと対策

### リスク1: ビルド時間の増加
- **対策**: include_str! は高速なので影響は最小限

### リスク2: 設定ファイルのサイズ増大
- **対策**: 必要最小限の設定のみを含める

### リスク3: 後方互換性の破壊
- **対策**: 既存の環境変数・CLI引数を維持し、段階的に移行

## スケジュール

- **開始日**: 2025-01-28
- **フェーズ1完了**: 2025-01-28（1時間）
- **フェーズ2完了**: 2025-01-28（2時間）
- **フェーズ3完了**: 2025-01-29（2時間）
- **フェーズ4完了**: 2025-01-29（1時間）
- **完了予定日**: 2025-01-29

## 完了条件

- [ ] YAMLベースの設定ファイルがビルド時に埋め込まれる
- [ ] 環境別設定が正しく適用される
- [ ] 既存の環境変数・CLI引数による設定が引き続き機能する
- [ ] LLMプロバイダーの価格設定がYAMLから読み込まれる
- [ ] すべてのテストが通過する
- [ ] ドキュメントが更新される

## 実装メモ

<!-- 実装時の学びや決定事項をここに記録 -->

## 参考資料

- [Rust include_str! マクロ](https://doc.rust-lang.org/std/macro.include_str.html)
- [serde_yaml ドキュメント](https://docs.rs/serde_yaml/)
- [CLAUDE.md - 現在の設定管理](../../../CLAUDE.md#environment-configuration)