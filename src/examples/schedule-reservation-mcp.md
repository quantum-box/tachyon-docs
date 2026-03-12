# 日程調整と予約実行のMCPサンプル

このサンプルコードは、MCPを使用して日程調整と予約実行を行う例を示しています。

## 機能概要

✅ 3日後、4日後、5日後の候補日を自動生成
✅ `ask`ツールを使用して出欠確認を行う
✅ 参加者の返答に基づいて最適な日程を選択
✅ 選択された日程で予約を実行

## 使用方法

```
cargo run -p llms --example schedule_reservation_mcp
```

## 実装の詳細

このサンプルは以下のステップで日程調整と予約実行を行います：

1. 候補日の生成: 現在の日付から3日後、4日後、5日後の日付を候補として生成
2. 出欠確認: `ask`ツールを使用して参加者の出欠を確認（サンプルではモックデータを使用）
3. 日程選択: 最も多くの参加者が参加できる日を選択
4. 予約実行: 選択された日程で予約を実行（サンプルではモックサーバーを使用）

## 関連ファイル

- `packages/llms/examples/schedule_reservation_mcp.rs`: サンプルコード
- `packages/llms/src/usecase/command_stack/mcp/hub.rs`: MCPハブの実装
- `packages/llms/src/usecase/command_stack/types.rs`: `Ask`ツールの定義を含む型定義
