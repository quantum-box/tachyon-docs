---
title: "CI費用削減: ランナー戦略の再評価（中長期）"
type: tech
emoji: "🏗️"
topics:
  - GitHub Actions
  - CI/CD
  - Infrastructure
  - Cost Optimization
published: true
targetFiles:
  - .github/workflows/
---

# CI費用削減: ランナー戦略の再評価

## 概要

GitHub Actionsのランナー戦略を実行データに基づいて再評価し、コスト効率の最適なランナー構成を決定する中長期施策。現在はGitHub Hosted無料枠を使うために一時的にBlacksmithから切り替え中であり、無料枠の制限を超過した場合の対応方針を策定する。

## 背景・目的

### 現在のランナー状況

**重要**: 現在、一時的にGitHub Hosted無料枠を活用するためBlacksmithから切り替え中。

```yaml
runners:
  ubuntu-latest:
    usage: Rust CI全ジョブ、check-changes等
    cost: $0.008/分 (GitHub-hosted 2-core)
    note: 無料枠 2,000分/月（private repo）

  blacksmith-8vcpu-ubuntu-2404-arm:
    usage: フロントCI一部、Chromatic、claude.yml
    cost: ~$0.016/分
    note: 一部ワークフローでまだ使用中の可能性あり

  blacksmith-4vcpu-ubuntu-2404:
    usage: cms_ci, claude-code-review
    cost: ~$0.008/分
```

### 月間実行分数の概算（実データベース、ランナー別）

**GitHub Hosted (`ubuntu-latest`) で実行されるジョブ:**

| カテゴリ | 1回の合計ジョブ時間 | 月間実行回数（概算） | 月間分数 |
|---------|------------------|-------------------|---------|
| Rust CI (PR) | 186分 | 30回 | 5,580分 |
| Rust CI (main push) | 215分 | 30回 | 6,450分 |
| check-changes (各WF) | ~1分 | 多数 | ~200分 |
| **GitHub Hosted 合計** | | | **~12,230分** |

**Blacksmith (`blacksmith-8vcpu-*`, `blacksmith-4vcpu-*`) で実行されるジョブ:**

| カテゴリ | 1回の合計ジョブ時間 | 月間実行回数（概算） | 月間分数 |
|---------|------------------|-------------------|---------|
| フロントCI 主要ジョブ (7WF) | ~30分 | 30回 | 900分 |
| Chromatic 主要ジョブ (4WF) | ~20分 | 20回 | 400分 |
| 他 | - | - | ~300分 |
| **Blacksmith 合計** | | | **~1,600分** |

**GitHub Hosted無料枠: 2,000分/月 → Rust CIだけで大幅に超過**

※ フロントCI / Chromatic の主要ジョブは Blacksmith ランナーで動いており、GitHub Hosted無料枠には影響しない。
※ quick-wins施策（concurrency追加・ドラフトPRスキップ・yarn.lockフィルタ）は主にフロントCI/Chromaticの重複実行を削減するものであり、GitHub Hosted（Rust CI）の分数には大きく影響しない。Rust CIは既にconcurrency設定済みのため。

### 無料枠超過時のコスト（GitHub Hosted分のみ）

GitHub Hosted無料枠を超過した場合:
- Linux 2-core: $0.008/分
- 超過分 10,230分 × $0.008 = **約$82/月**

Blacksmith分のコスト（別途）:
- 無料枠 3,000分/月、超過分なし（約1,600分/月 < 3,000分/月）
- → **Blacksmithのジョブは現在無料枠内で収まっている**

## 詳細仕様

### 判断フロー

```
1. quick-wins施策を実施
   ↓
2. 月間実行分数を再測定
   ↓
3. 無料枠内に収まるか？
   ├─ YES → GitHub Hosted維持（追加コストゼロ）
   └─ NO → 超過コスト vs 代替プロバイダーのコストを比較
            ├─ 超過分が少額（~$50/月以下） → GitHub Hosted維持が最もシンプル
            └─ 超過分が高額 → 代替プロバイダー検討
```

### 代替ランナープロバイダーの比較

```yaml
providers:
  github_hosted:
    linux_2core: $0.008/分
    linux_arm64_2core: $0.005/分
    free_tier: 2,000分/月 (private repo)
    notes: "2026年1月に最大39%値下げ済み。追加運用負荷なし"

  blacksmith:  # 以前使用
    linux_2vcpu: $0.004/分
    free_tier: 3,000分/月
    notes: "GitHubの約50%、Docker layer cache対応。切り替え実績あり"

  ubicloud:
    linux_2vcpu: $0.0008/分
    notes: "最安クラス、Blacksmithの約1/5"

  runs_on:
    license: 年300ユーロ
    compute: AWS実費（EC2スポット活用で大幅削減可能）
    notes: "自前AWSアカウントで動作"

  depot:
    base: $20/月 (2万分含む)
    overage: $0.004/分
    notes: "10倍高速キャッシュ"

  actuated:
    base: $250/月 (5並列、分数無制限)
    notes: "Firecracker microVM、自前ベアメタル必要"
```

### 月間コスト試算（Rust CI = GitHub Hosted分のみ）

Rust CIのみがコスト問題の主因。フロントCI/ChromaticはBlacksmith無料枠内。

quick-wins施策（concurrency追加等）はRust CIには大きく影響しないため（既にconcurrency設定済み）、Rust CIの月間分数は約12,230分のまま。workflow-consolidation施策（DB不要ジョブ分離・テスト統合）による削減は別途見込める。

**現状ベース（GitHub Hosted 約12,230分）:**

| プロバイダ | Rust CI月額概算 | 備考 |
|-----------|----------------|------|
| GitHub-hosted（無料枠+超過） | ~$82 | 超過分10,230分 × $0.008 |
| Blacksmith全面移行（3,000分無料+超過） | ~$45 | 既存1,600 + 12,230 = 13,830分、超過10,830分 × $0.004 |
| Ubicloud | ~$10 | 12,230分 × $0.0008 |
| Depot | $20 | 2万分含むので超過なし |

**workflow-consolidation施策後（推定削減18-30分/PR、月間約10,000-11,000分）:**

| プロバイダ | Rust CI月額概算 | 備考 |
|-----------|----------------|------|
| GitHub-hosted（無料枠+超過） | ~$64-72 | 超過分8,000-9,000分 × $0.008 |
| Blacksmith全面移行 | ~$35-38 | 既存1,600 + 10,500分 = 12,100分、超過9,100分 × $0.004 |
| Ubicloud | ~$8 | 10,500分 × $0.0008 |
| Depot | $20 | 2万分含むので超過なし |

## 実装方針

### 前提条件
- **quick-wins施策（別タスク）を先に実施する**。ランナー移行はその後の実行分数を見て判断する
- workflow-consolidation施策（別タスク）もさらに実行分数を削減する

### 評価フェーズ
1. quick-wins施策後の月間実行分数を1-2週間測定
2. GitHub Usage Reportで正確なコストを把握
3. 無料枠超過コストが問題になるレベルかを判断

### 移行判断基準

| 超過コスト | 判断 |
|-----------|------|
| ~$50/月以下 | GitHub Hosted維持（運用シンプル優先） |
| $50-100/月 | Blacksmith復帰 or Depot検討 |
| $100/月以上 | Ubicloud or Depot へ移行 |

### 移行フェーズ（必要な場合のみ）
1. 軽量ワークフロー（lint/format等）から移行開始
2. 重量ワークフロー（Rust CI）を段階的に移行
3. 本番デプロイ系ワークフローは最後に移行

### 検討すべき観点
- ランナーの安定性・可用性
- キャッシュの互換性（rust-cache, yarn cache）
- Docker layer cacheの対応状況
- ARM対応の可否
- サポート体制とSLA
- セキュリティ（シークレットの安全性）
- Blacksmithは過去に使用実績あり → 復帰のハードルは低い

## タスク分解

### フェーズ1: 実行分数の測定 📝
- [ ] quick-wins施策の実施完了を確認
- [ ] GitHub Usage Reportから月間実行分数を取得
- [ ] ワークフロー別のコスト内訳を算出
- [ ] 無料枠超過の程度を把握

### フェーズ2: 判断と計画策定 📝
- [ ] 超過コストが問題レベルかを判断
- [ ] 問題レベルの場合、候補プロバイダーの絞り込み
- [ ] 1-2ワークフローでPoC実施（必要な場合）
- [ ] 移行計画の策定

### フェーズ3: 移行実施（必要な場合のみ） 📝
- [ ] 選定プロバイダーへの段階的移行
- [ ] 移行前後のコスト・パフォーマンス比較
- [ ] 全ワークフローの移行完了

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| quick-wins で十分に削減され移行不要になる | - | それが最良の結果。この計画書は参考資料として維持 |
| 新ランナーの不安定性 | 高 | 段階的移行で影響範囲を限定。問題時はGitHub Hostedにフォールバック |
| キャッシュ互換性の問題 | 中 | PoCで事前検証。Blacksmith復帰なら実績あり |
| プロバイダーの事業継続リスク | 中 | GitHub Hostedへのフォールバック手順を常に用意 |

## 完了条件

- [ ] quick-wins施策後の月間CI実行分数を数値で把握している
- [ ] 無料枠超過コストの程度を把握し、移行要否を判断している
- [ ] （移行が必要な場合）移行先プロバイダーが決定し、PoCを完了している
- [ ] （移行が必要な場合）全ワークフローが新ランナーで正常に動作している
- [ ] 最終的なコスト構造が明確になっている
