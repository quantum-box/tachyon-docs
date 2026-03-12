---
title: "AIメモリー権限制御のシード修正"
type: "bug"
emoji: "🧠"
topics:
  - llms
  - auth
  - yaml-seeder
published: true
targetFiles:
  - scripts/seeds/n1-seed/008-auth-policies.yaml
  - docs/src/tasks/in-progress/fix-ai-memory-manage-saved-memory-action/task.md
  - docs/src/tasks/in-progress/fix-ai-memory-manage-saved-memory-action/verification-report.md
github: https://github.com/quantum-box/tachyon-apps
---

# AIメモリー権限制御のシード修正

## 概要

Saved Memory 機能で `ai_memory:ManageSavedMemory` アクションのポリシーチェックが常に失敗し、ユーザーがメモリーを保存できない。DB に登録されているアクション名が `llms:ai_memory:ManageSavedMemory` という誤った形式になっているため、Usecase から参照される `ai_memory:ManageSavedMemory` と一致しない。`yaml-seeder` の定義を修正し、正しいフルネームで投入できるようにする。

## 背景・目的

- Saved Memory 実装時に `context: llms` の下へ新アクションを追加したが、`name` に `ai_memory:...` を含めてしまい、結果として `context:name` 形式が崩れている。
- Auth サービスは `context:name` による一意検索を行うため、アクション自体が存在しない扱いとなり 404 を返す。
- 正しいアクション名をシードし直すことで、Saved Memory CRUD の Policy チェックが通るようにする。

## 詳細仕様

### 機能要件

1. `yaml-seeder` の定義を更新し、`context: ai_memory`、`name: ManageSavedMemory` に分離する。
2. Resource Pattern も `trn:ai_memory:saved_memory:*` に合わせる。
3. 既存の Owner ポリシー (`pol_01hjryxys...`) に紐づく Action ID は同じまま維持し、Upsert で差し替え可能にする。

### 非機能要件

- 既存環境で `yaml-seeder apply scripts/seeds/n1-seed` を再実行するだけで反映できる形式にする。
- 他のアクション定義やポリシーに副作用を与えない。

## 実装方針

- 既存のアクション ID `act_01llmsaimemorymanage001` を変更せず、`context`/`name`/`resource_pattern` の値のみ修正する。
- `policy_actions` 側は ID を参照しているため追加の変更は不要。
- ドキュメント上で再シード手順を明記し、必要であれば `docs/src/tasks/...` に進捗を残す。

## タスク分解

1. ✅ `008-auth-policies.yaml` のアクション定義を修正（context/name/resource）。
2. ✅ 影響範囲確認と `policy_actions` の整合性チェック。
3. 🔄 `yaml-seeder` 再投入手順を taskdoc に追記し、必要なら verification-report を更新。
4. 📝 Saved Memory API が NotFound を返さないことを確認（ログ/テスト）。

## テスト計画

- `yaml-seeder apply dev scripts/seeds/n1-seed/008-auth-policies.yaml` 実行後に Saved Memory エンドポイントへアクセスし、Policy チェックが通ることを確認。
- 再現用として `LLMS` Usecase のユニットテストに依存していないため、Docker 環境での手動動作確認を行う。

## リスクと対策

| リスク | 影響度 | 対策 |
| --- | --- | --- |
| 既存 DB に残る古い `llms:` 名のまま | 中 | `yaml-seeder` を再実行するよう周知、`mode: upsert` で自動更新 |
| 新しい `ai_memory` context が他から未参照 | 低 | 今回は Saved Memory 専用。将来の追加アクションのベースとする |

## スケジュール

- 即日対応。修正→シード更新→挙動確認までを本作業で完了する。

## 完了条件

- [ ] `yaml-seeder` の対象ファイルが修正されている。
- [ ] ローカルで再シード後、Saved Memory API が NotFound を返さないことを確認した記録がある。
- [ ] Taskdoc/verification-report を更新済み。

## 実装メモ

- 2026-01-19: `scripts/seeds/n1-seed/008-auth-policies.yaml` の `act_01llmsaimemorymanage001` を `context=ai_memory`、`name=ManageSavedMemory`、`resource_pattern=trn:ai_memory:saved_memory:*` へ修正済み。`policy_actions` は ID 参照のため変更不要。
- 要再現手順: `yaml-seeder apply dev scripts/seeds/n1-seed/008-auth-policies.yaml` を実行して新しいアクション定義を投入後、Saved Memory API を再度呼び出す。
- 2026-01-20: Saved Memory の `saved_memory_bio` ツール実行時に AgentChat の選択モデル（未指定の場合は `anthropic/claude-sonnet-4.5`）を `LLMModelOption` として渡すように変更し、AgentChat と同じプロバイダー鍵で OpenAI/Anthropic へ接続するよう統一。
