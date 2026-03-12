---
title: "Realtime Voice MVP (OpenAI Realtime 一本構成)"
type: "feature"
emoji: "🎙️"
topics:
  - Realtime
  - Voice
  - OpenAI
  - WebRTC
  - Tool Jobs
published: true
targetFiles:
  - apps/tachyon/src
  - apps/tachyon-api/src
  - packages/llms/src
  - docs/src/tachyon-apps/llms
github: "https://github.com/quantum-box/tachyon-apps"
---

# Realtime Voice MVP (OpenAI Realtime 一本構成)

## 概要

tachyon-apps にコンシューマー向けの低遅延音声会話機能を追加する。まずは OpenAI Realtime を単一プロバイダとして採用し、MVP を短期間で実装・検証する。

## 背景・目的

- ログインなしユーザー向けチャット体験を拡張し、音声での会話体験を提供したい。
- 初期段階は実装複雑度を抑え、1プロバイダ構成で PMF 検証を優先したい。
- 将来的に ElevenLabs 等の TTS 分離構成へ拡張できる設計にしたい。

## 詳細仕様

### 機能要件

1. ブラウザから音声入力を受け付け、OpenAI Realtime と双方向ストリーミング会話を行える。
2. ユーザーが発話中に割り込み（barge-in）できる。
3. 音声会話セッションの開始/終了を UI から制御できる。
4. 最低限の利用制限（匿名ユーザー向けレート制限）を適用できる。
5. セッション単位の監査ログ（開始・終了・エラー）を保存する。

### 非機能要件

- 初回音声応答までの目標遅延: 1.0 秒以内（MVP目標）
- セッション切断時の自動リカバリ導線（再接続ボタン）
- APIキーはサーバー側で秘匿し、クライアントに長期秘密情報を渡さない

### 仕様のYAML定義

```yaml
realtime_voice_mvp:
  provider: openai_realtime
  transport:
    primary: websocket
    optional: webrtc
  auth:
    client_exposes_api_key: false
    session_token_ttl_sec: 120
  limits:
    anonymous:
      max_sessions_per_hour: 20
      max_minutes_per_day: 30
  observability:
    store_events:
      - session_started
      - session_ended
      - first_audio_latency_ms
      - error_code
  ux:
    barge_in: true
    reconnect_button: true
```

## 実装方針

### アーキテクチャ設計

- `apps/tachyon`:
  - 音声入力UI（開始/停止/再接続）
  - 再生バッファ制御
  - 状態管理（idle/connecting/streaming/error）
- `apps/tachyon-api`:
  - Realtime セッショントークン発行エンドポイント
  - 匿名ユーザー向けレート制限
  - 監査イベント記録
- `packages/llms`:
  - Realtime セッション抽象化（将来プロバイダ追加を想定）

### 技術選定

- OpenAI Realtime API（MVPの唯一プロバイダ）
- フロントは既存 tachyon UI スタックを利用
- サーバ側は既存認証/マルチテナンシー文脈を維持しつつ anonymous policy を追加

## タスク分解

### フェーズ1: 設計・API定義 🔄
- [ ] セッション作成API（匿名可）仕様確定
- [ ] クライアント状態遷移図の作成
- [ ] 監査ログ項目と保存先の確定

### フェーズ2: バックエンド実装 📝
- [ ] Realtime セッショントークン発行実装
- [ ] 匿名レート制限実装（IP + anonymous_id）
- [ ] 監査イベント保存実装

### フェーズ3: フロント実装 📝
- [ ] 音声会話UI（開始/停止/再接続）
- [ ] ストリーミング再生・割り込み対応
- [ ] エラー状態表示（権限拒否/ネットワーク断）

### フェーズ4: 検証・品質確認 📝
- [ ] 手動E2E（Chrome）
- [ ] 異常系（マイク拒否、切断、429）
- [ ] レイテンシ計測（初回音声応答）

## テスト計画

- APIテスト: セッション作成成功/失敗、レート制限到達
- UIテスト: 音声開始停止、再接続、割り込み
- 負荷テスト（軽量）: 同時匿名セッションの制限動作確認

## リスクと対策

| リスク | 影響度 | 対策 |
|---|---|---|
| ブラウザ音声API差分 | 中 | Chrome優先でMVP確定、Safariは後続対応 |
| ネットワーク不安定で体験劣化 | 高 | 再接続導線、タイムアウト・リトライ実装 |
| 匿名利用での濫用 | 高 | IP + anonymous_id の二重レート制御 |
| 将来のプロバイダ追加で設計崩壊 | 中 | provider interface を先に切る |

## 参考資料

- OpenAI Realtime API Docs
- 既存 Tool Job / Streaming 実装 (`packages/llms`, `packages/streaming`)
- 本タスクに紐づく会話メモ（2026-02-22）

## 完了条件

- [ ] 匿名ユーザーがログインなしで音声会話を開始できる
- [ ] バックエンドがセッショントークンを安全に発行できる
- [ ] 主要異常系（マイク拒否・切断・制限超過）をUIで扱える
- [ ] 動作確認レポートが作成されている
- [ ] 仕様ドキュメント草案（正式版の入口）が作成されている
