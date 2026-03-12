# Agentチャットルーム一覧画面

Tachyon フロントエンドに実装された `/v1beta/[tenant_id]/ai/agent/chatrooms` のチャットルーム一覧画面仕様をまとめる。

## 背景

- エージェント会話が1画面に集約されており過去履歴へのアクセス性が低かった。
- チャットルームCRUDがバックエンドで整備されたため、フロントから名称変更・削除を完結させる必要があった。
- 将来追加予定のフィルタや検索の土台として一覧UIを整備する。

## ページ構成

| セクション | 内容 |
| ---------- | ---- |
| ヘッダー | タイトル、説明文、新規チャット作成ボタン、再読込ボタン |
| リスト | チャットルームカード (名称 / 最終更新日時 / 最終メッセージ要約 / 操作メニュー) |
| 空状態 | チャットルームが存在しない場合の案内文と新規作成CTA |
| エラー状態 | API失敗時のエラーメッセージと再試行ボタン |

### レイアウト

- デフォルトは2カラムグリッド（`md:grid-cols-2`）。768px未満は1カラム。
- 各アイテムは `Card` コンポーネント + `HoverCard`。操作メニューは `DropdownMenu`。
- タイトルとアクション行は `flex`、`gap-2` で整列。

## データ取得

- `apps/tachyon/src/app/v1beta/[tenant_id]/ai/agent/chatrooms/page.tsx` は Server Component。
- 内部で `ChatroomList` Client Component を読み込み、`useSWR` で `/v1/llms/chatrooms` を取得。
- RESTクライアントは `src/lib/agent-api.ts` (`llmsClient.chatrooms.list`) を利用。`mise run codegen` により `src/gen/api` から生成。
- レスポンスを `ChatroomItem` (id, name, updatedAt, lastMessagePreview) に変換しUIへ渡す。

## ユーザー操作

### 新規チャット

1. `新規チャット` ボタン押下で `createChatroom` Server Action を呼び出す。
2. API成功後、返却された `chatroomId` で `/v1beta/[tenant_id]/ai/agent/chat?r=<id>` に遷移。
3. SWR `mutate()` を即時反映して新しいチャットをリスト先頭に挿入。

### リスト遷移

- アイテムクリックで `router.push("/v1beta/${tenant}/ai/agent/chat?r=${id}")`。
- `cmd + Enter` キーボードショートカットにも対応し、アクセシビリティを確保。

### 名前変更

1. メニュー `名前を変更` を選択。
2. `RenameChatroomDialog` を表示し、新名称を入力（`zod.string().min(1).max(100)`）。
3. `PATCH /v1/llms/chatrooms/{id}` を呼び出し成功したら `toast.success` 表示。
4. SWR `mutate()` を await してリストを再取得。

### 削除

1. メニュー `チャットを削除` を選択し `AlertDialog` を表示。
2. 確定後 `DELETE /v1/llms/chatrooms/{id}` を実行。
3. 成功したら `toast.success`、SWRキャッシュを `mutate()` で更新。
4. 現在閲覧中のチャットが削除された場合は `/v1beta/${tenant}/ai/agent/chatrooms` に戻す。

## エラーハンドリング

- API失敗時は `error` state をSWRから取得し、一覧の代わりに `ErrorState` コンポーネントを表示。
- バリデーションエラー (`422`) はフォーム内にエラーを表示し `toast.error` を併用。
- 認可エラー (`403`) は `ForbiddenState` を表示し再試行を隠す。

## 国際化

- 画面の全ての文言は `apps/tachyon/src/locales/{ja,en}/agent.json` に追加。
- `useTranslations('agent.chatrooms')` を利用し、`ja` / `en` 切替時にSSRで反映。
- 日付は `date-fns` の `format` + `locale` でローカライズ。

## パフォーマンス

- ページはServer Componentでプレースホルダーを返し、クライアントでSWRが初回フェッチ。
- Skeletonローディング（4件プレースホルダ）を配置し体感速度を向上。
- 一覧が10件を超えると仮想化は不要だが、今後の増加に備えて `IntersectionObserver` による lazy fetch の余地を残す。

## テスト

- Lint: `yarn --cwd apps/tachyon lint`。
- 型: `yarn --cwd apps/tachyon ts`。
- Storybook: `ChatroomList` の `*.stories.tsx` にてRename/Deleteのモック動作を確認。
- Playwright MCP: `Agentチャットルーム一覧` シナリオでSSR→CSR→操作メニューを検証予定。

## 依存関係

- バックエンド: [チャットルーム管理REST API](../llms/chatroom-management-rest-api.md)
- 認可: `llms:UpdateChatRoom` / `llms:DeleteChatRoom` ポリシー（sessionに基づき付与）
- ルーティング: `/v1beta/[tenant_id]/ai/agent/chat` 既存画面

## 関連リンク

- タスク: `docs/src/tasks/completed/v0.21.0/agent-chatroom-list/task.md`
- 動作確認: `docs/src/tasks/completed/v0.21.0/agent-chatroom-list/verification-report.md`
- UIスクリーンショット: `docs/src/tasks/completed/v0.21.0/agent-chatroom-list/screenshots/`
