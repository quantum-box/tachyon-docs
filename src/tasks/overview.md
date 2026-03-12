# タスク

このセクションでは、プロジェクトで実行されるタスクの詳細な仕様と進捗を管理します。

## 構成

### Todo
直近で着手予定のタスク。

- [Worktree分離の運用検証と残課題対応](./todo/agent-worktree-ops-validation/task.md)
- [開発ツールベースイメージの公開と効果検証](./todo/dev-tools-image-release-validation/task.md)
- [DataView を DuckDB 専用にする可否検討](./todo/duckdb-data-view-only/task.md)
- [DataView SQLでプロパティkey参照を可能にする](./todo/data-view-sql-property-key/task.md)

### In Progress
現在進行中のタスクです。

- [Library Parquet配信のS3権限・Terraform整備](./in-progress/library-parquet-s3-permissions/task.md)

### Feature
新機能の開発タスクを管理します。

- [aichatのAgentChatPageをtachyonに統合](./feature/integrate-aichat-agentchatpage-to-tachyon.md)

### Bugfix
バグ修正タスクを管理します。

- [tachyon-api APIキー動作確認と修正](./completed/v0.28.0/api-key-auth-fix/task.md)

### 今後追加予定のカテゴリ

- **Improvement**: 既存機能の改善
- **Refactor**: リファクタリング
- **Infrastructure**: インフラ・設定関連
- **Documentation**: ドキュメント作成・更新

## タスクドキュメント作成ガイドライン

新しいタスクドキュメントを作成する際は、[template.md](../template/basic.md)をベースに以下の構造で作成してください：

1. **概要**: タスクの簡潔な説明
2. **背景・目的**: 解決したい課題と目標
3. **詳細仕様**: 機能要件と非機能要件
4. **実装方針**: アーキテクチャと技術選定
5. **タスク分解**: フェーズごとのチェックリスト
6. **テスト計画**: テスト戦略
7. **リスクと対策**: 潜在的な問題と対処法
8. **スケジュール**: 期限とマイルストーン
9. **完了条件**: 明確な完了基準

## 進捗管理

各タスクドキュメントでは以下のマーカーを使用して進捗を表示します：

- ✅ 完了 (Completed)
- 🔄 進行中 (In progress)  
- 📝 TODO (To do)
