# Agent App

Agent App は Better Auth + Cognito 認証を使用したエージェントチャットアプリケーションです。

## 概要

- **認証**: Better Auth + Amazon Cognito
- **チャット機能**: Tachyon Agent API (SSE ストリーミング)
- **ポート**: 5020

## 機能

- [Agent Chat](./agent-chat.md) - Tachyon Agent API を使ったリアルタイムチャット機能

## 技術スタック

- Next.js 16 (App Router)
- Better Auth 1.4
- TypeScript 5
- Tailwind CSS 3
- OpenAPI 型自動生成 (`openapi-typescript`)

## 起動方法

```bash
yarn workspace agent-app dev
# http://localhost:5020
```
