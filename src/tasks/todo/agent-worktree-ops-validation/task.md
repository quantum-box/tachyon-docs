---
title: "Worktree分離の運用検証と残課題対応"
type: "tech"
emoji: "🧪"
topics:
  - AgentAPI
  - ToolJobs
  - Worktree
  - Docker
  - AWS
published: true
targetFiles:
  - packages/agents
  - packages/llms
  - compose.yml
  - cluster/n1-aws
  - docs/src/tachyon-apps/agents/worktree-management.md
github: https://github.com/quantum-box/tachyon-apps
---

# Worktree分離の運用検証と残課題対応

## 概要

Worktree分離機能の運用検証（フルマネージド/BYO）と、Docker開発環境で発生するWorktree制限・hot reload問題を解消する。

## 背景・目的

- Worktree機能は実装済みだが、フルマネージド/BYOのE2E検証が未完了
- Dockerでホストworktreeをマウントすると `.git` の参照問題でWorktree作成に失敗する
- hot reloadが再発する可能性があり、運用に耐える設定が必要

## 詳細仕様

### 機能要件

1. **フルマネージドE2E検証**
   - Lambda → SQS → ECS Worker の一連フローを検証
   - Worktree作成/編集/クリーンアップ/Callbackまでを確認

2. **BYO Worker E2E検証**
   - Lambda → SQS → ローカルWorkerでの実行を検証
   - `docker run` 実行時にSQS接続できること

3. **Docker Worktree制限の解消**
   - Host Mountで `.git` がファイルになるケースへの対処
   - 例: メインリポジトリのマウント / コンテナ内clone / 明示的モード切替

4. **hot reload問題の再発防止**
   - Workerが編集する作業ディレクトリと開発サーバの監視対象を分離

### 非機能要件

- 既存のWorktree機能を壊さないこと
- 検証結果をドキュメントに記録すること

### 仕様のYAML定義

```yaml
acceptance:
  full_managed:
    - lambda_to_sqs_to_ecs: true
    - worktree_created: true
    - callback_received: true
  byo_worker:
    - docker_run_with_api_key: true
    - sqs_connected: true
  docker_dev:
    - worktree_create_success: true
    - hot_reload_not_triggered: true
```

## 実装方針

- Docker開発環境の構成見直し（マウント方法/clone方針）
- Worker起動モードの明示化または自動判定の整理
- 検証ログを `verification-report.md` に集約

## タスク分解

- [ ] フルマネージドE2E検証（Lambda→SQS→ECS）
- [ ] BYO Worker E2E検証（Lambda→SQS→ローカル）
- [ ] Docker Worktree制限への対処（Host Mount時の失敗回避）
- [ ] hot reload問題の解消確認
- [ ] 結果ドキュメント化

## テスト計画

- Docker/ECS環境でのE2E検証
- Worktree作成/削除のログ確認
- UI（Worktrees/Workers）表示の最終確認

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 本番環境でのみ再現する問題 | 高 | 本番相当のE2E検証を実施 |
| docker開発環境での再発 | 中 | マウント方針を明文化し再発防止 |

## スケジュール

- 2026-01: 検証と制限解消

## 完了条件

- フルマネージド/BYOのE2E検証が完了
- Docker開発環境でWorktreeが作成できる
- hot reload問題が解消されている
- 検証レポートを作成済み
