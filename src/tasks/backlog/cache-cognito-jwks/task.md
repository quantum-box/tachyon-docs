---
title: "Cognito JWKSキャッシュの実装"
type: tech
emoji: "🛡️"
topics:
  - authentication
  - jwks
  - caching
published: true
targetFiles:
  - packages/providers/cognito/src/jwks.rs
  - packages/providers/cognito/src/verify.rs
  - packages/providers/cognito/src/client.rs
github: https://github.com/quantum-box/tachyon-apps
---

# Cognito JWKSキャッシュの実装

## 概要

CognitoのJWKSを取得するロジックにプロセス内キャッシュを導入し、`Cache-Control: max-age` の範囲内では再フェッチを避けつつ、期限切れ時のみ再取得する仕組みを整備する。

## 背景・目的

- 外部IdP（Cognito）のJWKS取得はHTTP往復が発生し、リクエストごとにフェッチするとレイテンシが増加する。
- 現状は都度`fetch_jwks`を呼び出しており、キャッシュを行っていないため負荷が無駄に掛かっている。
- 本番環境でも`Cache-Control`の有効期限内であれば再取得せずに検証を済ませたい。
- キャッシュの導入でレスポンスの安定化とエラー耐性（短時間のネットワーク断）を向上させる。

## 詳細仕様

### 機能要件

1. `packages/providers/cognito::Client` が JWKS を取得する際、プロセス内メモリにキャッシュする。
2. `Cache-Control` の `max-age` を尊重し、期限内はキャッシュを返す。期限切れの場合は再フェッチを試みる。
3. 再フェッチに失敗した場合でも直前のキャッシュが存在すれば利用を継続し、警告ログを出す。
4. 初回取得またはキャッシュなし状態で取得が失敗した場合は従来どおりエラーを返す。
5. キャッシュは本番／開発問わず同挙動。追加で開発環境向け永続化は今回範囲外とし、将来対応に備えて拡張性を確保する（構造体で抽象化）。
6. スレッドセーフに扱えるよう非同期処理と整合性を保つ（例：`tokio::sync::RwLock`）。
7. キャッシュヒット／ミス／失効など重要イベントを `tracing` ログで記録する。

### 非機能要件

- パフォーマンス: 認証リクエスト時に外部HTTP呼び出しが発生しないことを基本とする。
- セキュリティ: 有効期限切れのキーは原則利用しない。再フェッチ失敗時のみ最後のキャッシュを暫定利用し、ログを残す。
- 保守性: 今後開発環境向け永続化やオフラインモード拡張が可能な設計とする。
- 並行性: 複数タスクから同時アクセスされても整合性が保たれるようにする。

### コンテキスト別の責務

```yaml
contexts:
  providers/cognito:
    description: "Cognito連携用クライアント"
    responsibilities:
      - JWKS取得ロジックの実装とキャッシュ管理
      - 検証処理で利用するキーの提供
      - 将来的な永続化やバックグラウンド更新の拡張余地を確保
```

### 仕様のYAML定義

```yaml
jwks_cache:
  max_age_source: "Cache-Control header"
  retry_policy:
    max_retries: 1
    backoff: "fixed 100ms"
  logging:
    hit: "trace"
    miss: "info"
    stale_use: "warn"
  metrics:
    pending: false
```

## 実装方針

### アーキテクチャ設計

- `Client` 内に `JwksCache` 構造体を保持し、`RwLock<Option<CacheEntry>>` で管理する。
- `verify_token` からは `get_cached_jwks` ヘルパを通じて取得する。
- キャッシュ更新は `fetch_jwks` をラップする新メソッド内で行い、複数タスクの同時更新を防ぐ。
- 将来の永続化拡張に備え、キャッシュ構造体をモジュール内に切り出す。

### 技術選定

- 非同期実行環境は既存どおり `tokio`。
- キャッシュ同期には `tokio::sync::RwLock` を用いる。
- ログは `tracing`。
- 時刻計算は `std::time::Instant` を基本とし、システムクロック変更の影響を避ける。

### TDD（テスト駆動開発）戦略

- 既存: `fetch_jwks` のユニットテストは不足しているため、新設のキャッシュモジュール用テストを作成する。
- 新規テスト方針:
  - [ ] `max-age` 内で同一インスタンスが再フェッチしないこと。
  - [ ] 期限切れ後に再フェッチされること。
  - [ ] 再フェッチ失敗時に古いキャッシュを使い続けること。
  - [ ] キャッシュなしで失敗した場合にエラーが返ること。
- `reqwest` を直接モックできないため、HTTP取得部分を抽象化するか `wiremock` を利用してテストを行う。

## タスク分解

- フェーズ1: キャッシュ構造の設計 📝
  - [ ] `JwksCache` 構造体と`CacheEntry`の設計
  - [ ] TTL計算と状態判定のユニットテスト
- フェーズ2: `Client` への統合 📝
  - [ ] キャッシュ読み取り→有効期限チェック→再フェッチのフロー実装
  - [ ] 失敗時フォールバックとログ実装
- フェーズ3: テスト整備 📝
  - [ ] 単体テスト追加（キャッシュヒット／ミス／期限切れ）
  - [ ] `cargo test -p cognito` 実行

## テスト計画

- 単体テスト: `packages/providers/cognito` にキャッシュ専用テストを追加。
- 結合テスト: 既存APIキー関連テストで実際の検証が成功するか確認（必要に応じて環境変数で制御）。
- 実行コマンド: `cargo test -p cognito` を最小セットとして実施。

## リスクと対策

- 再フェッチ失敗時の古いデータ利用がセキュリティリスク → 警告ログを出し、監視で検知できるようにする。
- 高並行アクセスでの同時再フェッチ → `RwLock` と結果共有で抑制。
- ヘッダーに `max-age` が含まれない場合 → 従来処理を踏襲しエラー扱い。

## スケジュール

- 本日（2025-10-26）タスク開始。
- 2025-10-28 までに実装とテストを完了することを目標。

## 完了条件

- `verify_token` が期限内のキャッシュを再利用することを確認。
- キャッシュ更新・失敗時のログが出力される。
- 新規テストが追加され、`cargo test -p cognito` が成功する。
- Taskdoc と実装コードが同期された状態で PR 作成可能なこと。
