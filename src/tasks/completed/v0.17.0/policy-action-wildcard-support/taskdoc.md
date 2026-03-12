# PolicyActionワイルドカード対応 taskdoc

## 基本情報
- 着手日: 2025-10-16
- 担当: Codex (assistant)
- 参照タスク: docs/src/tasks/improvement/policy-action-wildcard-support/task.md
- 関連領域: authコンテキスト認可、TiDB/MySQLスキーマ、GraphQL Policy管理

- フェーズ0 調査準備 ✅ (2025-10-16 完了)
  - [x] タスク仕様(task.md)の読解
  - [x] 対象ディレクトリと既存コード構成の確認
  - [x] 新規エンティティ/マイグレーションの追加要否を整理
- フェーズ1 設計プランニング ✅ (2025-10-16 完了)
  - [x] ドメイン層への`PolicyActionPattern`導入方針を決定
  - [x] 認可評価ロジックの優先順位変更案を確定
  - [x] globset採用時の依存追加方針を整理
  - [x] GraphQL/Usecaseでの入出力互換性シナリオを整理
- フェーズ2 実装 ✅
  - [x] `policy_action_patterns` マイグレーション作成 (up/down, index設定)
  - [x] ドメイン/サービス層へのパターン評価実装
  - [x] SQLxリポジトリ更新（明示アクション+パターン取得）
  - [x] GraphQL/Usecase 入出力更新
- フェーズ3 テスト & 検証 ✅
  - [x] ユニットテスト・統合テスト追加/更新（Allow/Deny優先順位、パターン一致）
  - [x] `mise run check` / `mise run ci-node` の成功確認（2025-10-18 実施）
  - [x] 必要に応じてベンチマークやキャッシュ評価メモを追記（glob評価メモを追記済み）
- フェーズ4 ドキュメント整備 ✅
  - [x] `policy-management.md` 等関連ドキュメント更新（ワイルドカード仕様追記）
  - [x] taskdoc/verification-report 更新
  - [x] リリースノート案の草案化

## 2025-10-19
- ✅ `mise run check` / `mise run ci-node` を完走し、`policy-management.md`・verification-report を更新。Playwrightは不要と判断して完了扱い。

## 仕様理解メモ
- 既存 `policy_actions` は明示的な`action_id`紐付けのみで、Context単位のまとめ指定が不可。
- 新テーブル `policy_action_patterns` を導入して `context_pattern` / `name_pattern` / `effect` を保持し、`*` と `?` のワイルドカードに対応する。
- 認可判定順序は「明示Deny → パターンDeny → 明示Allow → パターンAllow」とし、最初にマッチした結果を返す。
- パフォーマンス確保のため、`globset` などの事前コンパイル可能なパターンマッチライブラリを活用予定。
- GraphQL/API 側では従来の明示アクション指定に加えてパターン配列を扱うスキーマを追加し、後方互換性を維持する。

## 初期課題・検討事項
1. `globset` 採用時の `async-graphql` derive との依存関係やビルド時間への影響。
2. `policy_action_patterns` の down マイグレーションでデータをどう安全にロールバックするか。
3. 既存シードデータへのパターン導入手順（例: 管理者ポリシーに `*:*` を追加するタイミング）。
4. 認可キャッシュ層（存在する場合）への反映方法とキャッシュ無効化戦略。

## 直近TODO
- [x] `packages/auth/domain/src` 配下の現行 Policy/Service 実装を精読し、変更インパクトを taskdoc に追記。
- [x] `packages/auth/src/interface_adapter/gateway/sqlx_policy_repository.rs` での取得フローを確認し、必要なSQLと戻り値構造を設計。
- [x] マイグレーションの命名方針と適用順を決め、タスクdocに記載。
- [x] 設計レビュー観点（Allow/Deny 優先など）をまとめ、ユーザーへ共有。
  - [x] GraphQL `Policy.actions` の実装補完と`action_patterns`フィールドのエンドツーエンド確認。
- [x] `mise run check` / `mise run ci-node` の実行と記録。
- [x] `cargo test -p auth_domain --doc` のドキュメントテスト修正（`policy.rs` のサンプルコード更新済み）。
- [x] `cargo test -p auth --test policy_management_integration_test` の実行（DB接続あり、ワイルドカード統合テスト含む）。
- [x] `policy-management.md` 等ドキュメントの更新ドラフト作成。
- [x] Playwright動作確認の要否を判断し、必要ならシナリオを準備（ダッシュボード側は不要と判断）。

## 実装メモ（2025-10-16）
- `PolicyActionPattern` ドメインを追加し、globバリデーション・マッチングヘルパー・テストを整備。`globset` 依存を導入し ASCII範囲での`*`/`?`マッチのみ許可。
- `policy_action_patterns` マイグレーション(up/down)とシード(`AdminPolicy`向け `*:*` Allow)を新設。
- SQLxリポジトリにパターンCRUDを追加し、`PolicyRepository` トレイトを拡張。`PolicyService`/`CheckPolicy`/usecase 層をワイルドカード対応に更新。
- GraphQL/Usecase 入力へ `action_patterns` 系フィールドを追加し、Register/Updateポリシーでパターンの保存・削除を処理。GraphQL `Policy` に `action_patterns` フィールドを追加し取得ロジックを実装。
- テスト: CheckPolicyパターン許可/拒否ケース、`PolicyActionPattern` 単体、Register/Update usecase パターン操作の検証を追加。
- 統合テスト: `policy_management_integration_test` にワイルドカードパターンの許可/拒否を検証するケースを追加。AdminPolicy を付与したユーザーExecutorでユースケースを実行し、`CheckPolicy` がスキップされない状態で Allow→Deny の優先順位を検証。

## 設計ドラフトメモ（2025-10-16）
- `PolicyActionPattern` ドメインオブジェクトを新設し、`context_pattern` / `name_pattern` / `effect` を保持する。コンパイル済み `GlobMatcher` を内部にキャッシュして `matches(context, name)` をO(1)で評価できるようにする。
- `PolicyRepository` トレイトにパターン用メソッド群（`find_action_patterns_by_policy` / `save_policy_action_pattern(s)` / `delete_policy_action_pattern`）を追加し、SQLx実装で `policy_action_patterns` テーブルを操作する。
- `PolicyService` には明示アクションとパターン双方を返す `find_policy_action_config`（仮）を追加し、`CheckPolicy` サービスは1ポリシーあたり1回のリポジトリ呼び出しで両リストを取得して順序「明示Deny→パターンDeny→明示Allow→パターンAllow」で評価する。
- `globset` クレートを `auth_domain` に追加し、`PolicyActionPattern` 生成時にバリデーションを行う。無効パターンは作成時に `Error::business_logic` を返して保存を阻止する。
- GraphQL 入力では既存の個別アクション配列に加えて `pattern_actions`（仮称）を追加し、後方互換のため既存フィールドは必須のまま維持。レスポンスにも同様のパターンリストを付与する。
- 新マイグレーションは `20251016103000_policy_action_patterns.(up|down).sql` を追加予定。`policy_action_patterns` テーブルを作成し、downではDROP TABLEのみ実施。適用順は既存Policy系マイグレーションの後に配置する。

## 設計レビュー観点（2025-10-16）
- 優先順位: 明示Deny > パターンDeny > 明示Allow > パターンAllow。いずれかで判定が確定した時点で後続チェックを打ち切る。
- キャッシュ戦略: `PolicyActionPattern` 生成時に `GlobMatcher` を構築し、呼び出し側では参照のみ行うためランタイム負荷を抑える。大量ポリシーの場合は後続で`PolicyService`にキャッシュレイヤーを追加可能。
- 互換性: 既存Usecaseの `actions` 入力はそのまま維持し、パターン用の新フィールドを追加。旧クライアントは影響を受けない。

## リスクメモ
- ワイルドカード導入で既存ポリシーとの重複マッチによる予期せぬDenyが発生する恐れがあるため、テストケースで重点確認する。
- glob評価の負荷が高まる場合、キャッシュやプリコンパイルが必須。ボトルネック発生時は `globset::GlobSetBuilder` の活用や `regex` 代替を検討する。

## 次回更新予定
- 完了済みのため追加更新予定なし。
