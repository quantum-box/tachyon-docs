# Linear Sync

## 概要

Library のリポジトリと Linear Issues を同期し、`ext_linear` プロパティで
紐付けを管理する。初回の一括取り込み（Initial Sync）、手動同期
（On-demand Pull）、Webhook による自動同期を提供する。

## 基本方針

- **Webhook URL は provider 単位で 1 つ**: Linear OAuth App は Webhook URL が
  1 つしか設定できないため、Library 側は `/webhooks/linear` に固定する。
- **Organization ID でルーティング**: Linear の
  `organizationId` を起点に tenant/repo を解決する。
- **署名検証**: `Linear-Signature` ヘッダーを HMAC で検証し、
  Provider Config に保存した Signing Secret を使用する。

## 設定とシークレット管理

Provider Config には以下を保存する（値は例示しない）。

- OAuth Client ID / Client Secret
- Webhook Signing Secret

Webhook URL / OAuth Redirect URL の組み立てには `LIBRARY_API_BASE_URL`
（例: `https://example.com`）を利用する。

## データモデル

### ext_linear プロパティ

Linear 同期を有効化すると `ext_linear` が自動生成される。

```yaml
property_definition:
  name: ext_linear
  type: json
  is_system: true
  is_readonly: false
  schema:
    issue_id: string
    issue_url: string
    identifier: string
    sync_enabled: boolean
    last_synced_at: datetime
    version_external: string
    version_local: string
```

### 同期関連テーブル

- `sync_states`: Linear issue ↔ Library data の対応表
- `sync_operations`: 同期履歴（初回/手動/自動）
- `webhook_events`: 受信イベントの監査ログ

## 同期フロー

### Initial Sync

1. `startInitialSync` を実行
2. Linear API で issues を取得
3. Library data を作成し `ext_linear` を更新
4. `sync_states` / `sync_operations` を記録

### On-demand Pull

1. データ詳細の「Pull from Linear」から `triggerSync`
2. Linear API で対象 issue を取得
3. 競合判定（version）後に data を更新

### Webhook 同期

1. Linear Webhook を `/webhooks/linear` で受信
2. `Linear-Signature` を Signing Secret で検証
3. `organizationId` から tenant/repo を解決
4. `sync_states` を参照し対象 data を更新
5. `ext_linear.last_synced_at` を更新

## UI

- Settings > Extensions > Linear
  - Connect Linear（OAuth）
  - Enable Sync（Webhook Endpoint 作成）
  - Initial Sync / Property Mapping
- Data 詳細
  - Pull from Linear ボタン
  - 自動リフレッシュ（約 15 秒間隔）
  - `last_synced_at` の更新表示

## 運用メモ

- Webhook URL は `/webhooks/linear` に固定する。
- Signing Secret は初回設定後に再表示しない。
- Sync 履歴は `sync_operations` で追跡する。
