# Agent コマンドスタック ActorId 統一

## 概要
Agent API の実行系 (`ExecuteAgent`, `ResumeAgent`, Command Stack) が `UserId` 前提だった実装を刷新し、全経路を `ActorId` へ統一した。これによりサービスアカウント実行がサポートされ、監査・課金ログは実行主体を失わずに保持される。

## 背景
- 旧実装では `Executor::ServiceAccount` を拒否し、自動化タスクの実行ができなかった。
- チャット履歴と課金処理が `UserId` 固定文字列を永続化しており、サービスアカウント利用時に不整合が発生。

## 変更点
| コンポーネント | 旧仕様 | 新仕様 |
| --- | --- | --- |
| `ExecuteAgent` / `ResumeAgent` | `Executor::User` のみ許可 | `Executor::ServiceAccount` も許可し、`ActorId` を保持 |
| Command Stack | `UserId` を `String` で保存 | `ActorId` を強い型で保持し、復元時に種別判定 |
| 履歴保存 (`chat_message.owner` 等) | 文字列 (`us_...`) | `ActorId::as_str()` を保存し、`from_str` で復元 |
| BillingContext | `UserId` を所有者 ID として使用 | `ActorId` を受け取り、サービスアカウント課金も追跡 |
| メモリ検索などユーザー固有処理 | 常時実行 | `matches!(actor_id, ActorId::User(_))` のときのみ実行 |

## データモデル
```rust
pub enum ActorId {
    User(UserId),
    ServiceAccount(ServiceAccountId),
}
```
- 文字列保存時は `ActorId::as_str()` を利用し、`us_` / `sa_` プレフィックスで判別。
- `ActorId::from_str` で厳密に復元。未知プレフィックスは `Error::InvalidActorId` を返す。

## 実行フローへの影響
1. コントローラー層で `Executor` を `ActorId` へ変換。
2. Command Stack は `ActorContext` に `ActorId` を保持し、全ツール処理で利用。
3. BillingContext は `ActorId` から課金主体を解決し、サービスアカウントの場合は紐づくオペレーターを参照。

## テスト
- `ExecuteAgent`/`ResumeAgent` のサービスアカウント起動パスを追加。
- Command Stack のメモリ検索ユニットテストで `ActorId::ServiceAccount` 時のスキップを検証。
- `cargo test -p llms` および `mise run check` を完走。

## マイグレーション指針
- 過去データは `us_` プレフィックスを持つため下位互換あり。サービスアカウント導入後に `sa_` 付きデータが増える。
- 既存 API のレスポンススキーマは変わらず、`actor_id` フィールドで実行主体を返却。

## 関連ドキュメント
- [サービスアカウント対応チャットルームオーナー](./chatroom-actor-id.md)

## 関連タスク
- [AgentコマンドスタックのActorId統一](../../tasks/completed/v0.20.0/unify-agent-actor-id/task.md)
