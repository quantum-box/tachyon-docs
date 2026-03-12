# verification-report

- 状態: ✅ 完了 (2025-09-20)
- メモ: `packages/errors` のバリアント再編後に Rust ワークスペース全体と対象クレート単体でビルド確認を実施。

- 実施コマンド:
  - `cargo check -p errors`
  - `cargo check -p errors --features axum-extension,graphql`
  - `mise run check` （`cargo check --examples --tests` 実行）
