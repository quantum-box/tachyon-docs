# ECS Deploy Optimization Verification Report

実施日: 2026-02-22
実施者: @codex

## 対象
- `.github/workflows/tachyon-api-release.yml`
- `apps/tachyon-api/Dockerfile`

## 検証項目
- [x] GitHub Actions workflow の構文妥当性
- [ ] Build and push image 所要時間の改善確認
- [ ] Wait for service stability を別ジョブで実行できること
- [ ] Docker build の cache mount 有効化確認

## 結果
- `python3` で YAML パース確認: `workflow-yaml-ok`
- 実ラン検証（所要時間比較・ジョブ成功確認）は未実施。
- `deploy_to_ecs=false` 実行時に `Wait for service stability` が skip されることを確認。
- build-only 実行は AWS OIDC 権限不足で失敗:
  - `Could not assume role with OIDC: Not authorized to perform sts:AssumeRoleWithWebIdentity`
  - `aws sts get-caller-identity` もローカル資格情報なしで実行不可。
- `main` 実行 `22273414530` で build は 832秒時点まで進んだが失敗:
  - `cargo build --release --locked -p tachyon-api` で `Cargo.lock needs to be updated`
  - 原因: `tachyon-sdk = { path = \"../../sdk/rust\" }` の入力が Docker builder に不足
  - 対応: `apps/tachyon-api/Dockerfile` に `COPY sdk/rust sdk/rust` を追加
- `main` 実行 `22273942810` で build は 1519秒で失敗:
  - `SQLX_OFFLINE=true` で `.sqlx` キャッシュ不足エラー
  - 原因: builder の対象コピーから `.sqlx` が漏れていた
  - 対応: `apps/tachyon-api/Dockerfile` に `COPY .sqlx .sqlx` を追加
- `main` 実行 `22274348186` で build は 1655秒で成功:
  - `Build and push image`: 1655秒（27分35秒）
  - 旧ベースライン（1830-1886秒）比で約9.6%〜12.2%短縮
  - `Wait for service stability` は 5分timeout で失敗
  - 失敗時の通知ステップで local action 参照エラー（checkout不足）も発生
  - 対応: `wait-for-service-stability` ジョブに checkout追加、job output受け渡しを修正

## 次回実行時に見る指標
- `Build and push image` の秒数（改善前: 約1830-1886秒）
- `wait-for-service-stability` ジョブの成否と所要時間
- buildx cache export 所要時間の短縮有無
