# Bakuure Docker Compose 動作確認レポート

実施日: 2026-01-10（再確認）
実施者: @codex

## 環境情報
- ブラウザ: Chromium (Playwright)
- 画面サイズ: 1710x951 (DPR 2)
- 対象URL:
  - http://localhost:3000
  - http://localhost:3001
- バックエンド接続先: http://localhost:14001 (必要に応じて更新)

## 動作確認結果

### ✅ 基本動作
- [x] Bakuure UI の初期画面が表示される
  - スクリーンショット: ./screenshots/bakuure-ui-2026-01-10.png
- [x] Bakuure Admin UI の初期画面が表示される
  - スクリーンショット: ./screenshots/bakuure-admin-ui-2026-01-10.png
- [x] bakuure-api の `/health` が応答する（`docker compose exec -T bakuure-api curl -fsS http://localhost:14001/health`）
- [x] 主要画面で API エラーが表示されない

### ✅ 追加の画面遷移
- [x] `/pricing` が表示される
- [x] `/usecase` が表示される
- [x] `/contact` が表示される
- [x] `/product/simulator` が表示される
  - スクリーンショット: ./screenshots/bakuure-ui-product-simulator-2026-01-10.png
- [x] Admin UI の「Sign in with Tachyon」クリックで認証画面へ遷移する（`https://auth-pool.n1.tachy.one/...`）
- [x] Admin UI で `bakuure-sandbox` を選択してログイン後の画面に遷移する
  - スクリーンショット: ./screenshots/bakuure-admin-ui-library-products-2026-01-10.png
- [x] Admin UI の `/home` が表示される
- [x] Admin UI の `/orders` が表示される
- [x] Admin UI の `/imports` が表示される
- [x] Admin UI の `/analytics` が表示される
- [x] Admin UI の `/settings` が表示される

### ❌ エラーケース
- [ ] 該当なし / 必要に応じて追加

## 発見した問題
該当なし

## 解消済み
- Bakuure UI 初期表示時の 404 は `/favicon.ico` 未配置が原因だったため、favicon 追加で解消。
- `/usecase` の Next/Image 警告は `fill`/`sizes` 指定と `objectFit` 移行で解消。
- `/favicon.ico` は 200 応答を確認（`curl http://localhost:3000/favicon.ico`）。
- `/product/simulator` が表示されることを再確認（スクリーンショット: ./screenshots/bakuure-ui-product-simulator-verified-2026-01-10.png）。

## 改善提案
- なし（必要があれば追記）
