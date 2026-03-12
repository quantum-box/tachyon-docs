# モックサーバー

このドキュメントでは、Server-Sent Events (SSE)のモックサーバーの実装と使用方法について説明します。

## 概要

開発時にLLMプロバイダーのAPIをモックする必要がある場合、SSEのモックサーバーを使用します。
これにより、実際のAPIを使用せずにストリーミングレスポンスをシミュレートすることができます。

## 実装例

### Anthropic Claude API モック

以下は、Anthropic Claude APIのレスポンスをモックする例です。

```rust
use axum::{
    response::sse::{Event, KeepAlive, Sse},
    routing::post,
    Router,
};
use futures::stream::{self, Stream};
use std::{convert::Infallible, time::Duration};
use tokio_stream::StreamExt;

async fn mock_anthropic_stream() -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let events = vec![
        Event::default()
            .event("message_start")
            .data(r#"{"type":"message_start","message":{"id":"msg_01JUz6KFPAQJzWtUWB7DsMXS","type":"message","role":"assistant","model":"claude-sonnet-4-5-20250929","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":8,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":1}}}"#),
        Event::default()
            .event("content_block_start")
            .data(r#"{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}"#),
        Event::default()
            .event("content_block_delta")
            .data(r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}"#),
        Event::default()
            .event("content_block_delta")
            .data(r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"! How can I help"}}"#),
        Event::default()
            .event("content_block_delta")
            .data(r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" you today?"}}"#),
        Event::default()
            .event("content_block_stop")
            .data(r#"{"type":"content_block_stop","index":0}"#),
        Event::default()
            .event("message_delta")
            .data(r#"{"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":12}}"#),
        Event::default()
            .event("message_stop")
            .data(r#"{"type":"message_stop"}"#),
    ];

    let stream = stream::iter(events)
        .map(Ok)
        .throttle(Duration::from_millis(100));

    Sse::new(stream).keep_alive(KeepAlive::default())
}

pub fn create_mock_router() -> Router {
    Router::new().route("/v1/messages", post(mock_anthropic_stream))
}
```

## 使用方法

1. モックサーバーを起動します：

```rust
let app = create_mock_router();
let listener = tokio::net::TcpListener::bind("127.0.0.1:3000").await.unwrap();
axum::serve(listener, app).await.unwrap();
```

2. クライアントからリクエストを送信：

```bash
curl http://localhost:3000/v1/messages \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --header "x-api-key: dummy-key" \
     --data '{
       "model": "claude-sonnet-4-5-20250929",
       "messages": [{"role": "user", "content": "Hello"}],
       "max_tokens": 256,
       "stream": true
     }'
```

## インテグレーションテストでの使用

インテグレーションテストでモックサーバーを使用する場合、以下のようなヘルパー関数を実装することをお勧めします：

```rust
use std::net::SocketAddr;
use tokio::net::TcpListener;

pub struct MockServer {
    pub address: SocketAddr,
}

impl MockServer {
    pub async fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        
        let app = create_mock_router();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        Self { address }
    }

    pub fn url(&self) -> String {
        format!("http://{}", self.address)
    }
}

// テストでの使用例
#[tokio::test]
async fn test_with_mock_server() {
    // モックサーバーを起動
    let server = MockServer::start().await;
    
    // テストクライアントの設定
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/v1/messages", server.url()))
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .header("x-api-key", "dummy-key")
        .json(&serde_json::json!({
            "model": "claude-sonnet-4-5-20250929",
            "messages": [{"role": "user", "content": "Hello"}],
            "max_tokens": 256,
            "stream": true
        }))
        .send()
        .await
        .unwrap();

    assert!(response.status().is_success());
    
    // レスポンスのストリームを処理
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.unwrap();
        // チャンクの検証処理
    }
}
```

このアプローチの利点：

1. ランダムな空きポートを使用するため、ポートの競合を避けられます
2. テストごとに独立したサーバーインスタンスを起動できます
3. テストの並行実行が可能です
4. サーバーのアドレスを動的に取得できます

## 注意事項

- モックサーバーは開発環境でのみ使用してください
- 実際のAPIレスポンスの形式に合わせてイベントデータを調整してください
- スロットリングの間隔は必要に応じて調整可能です
- インテグレーションテストでは、テストケースに応じて異なるレスポンスを返せるように、モックサーバーを設計することをお勧めします
