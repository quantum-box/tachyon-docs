# AWS Bedrock Provider

## Overview

AWS Bedrock provider enables using Claude models through AWS Bedrock service. This allows organizations that prefer AWS infrastructure to leverage Claude's capabilities while maintaining their existing AWS authentication and billing setup.

## Supported Models

| User Alias | Full Bedrock Model ID | Context Length |
|------------|----------------------|----------------|
| `bedrock/claude-4-5-sonnet` | `global.anthropic.claude-sonnet-4-5-20250929-v1:0` | 200,000 tokens |
| `bedrock/claude-4-5-haiku` | `global.anthropic.claude-haiku-4-5-20251001-v1:0` | 200,000 tokens |
| `bedrock/claude-sonnet` | Latest Sonnet (alias) | 200,000 tokens |
| `bedrock/claude-haiku` | Latest Haiku (alias) | 200,000 tokens |
| `bedrock/sonnet` | Latest Sonnet (short alias) | 200,000 tokens |
| `bedrock/haiku` | Latest Haiku (short alias) | 200,000 tokens |

## Model Alias Resolution

The Bedrock provider supports user-friendly model aliases that are automatically resolved to full Bedrock model IDs:

```rust
// packages/providers/aws/src/bedrock/models.rs
pub fn resolve_model_alias(model_name: &str) -> String {
    match model_name.to_lowercase().as_str() {
        // Claude 4.5 Sonnet aliases
        "claude-4-5-sonnet" | "claude-sonnet-4-5" | "claude-sonnet" | "sonnet"
            => CLAUDE_4_5_SONNET.to_string(),
        // Claude 4.5 Haiku aliases
        "claude-4-5-haiku" | "claude-haiku-4-5" | "claude-haiku" | "haiku"
            => CLAUDE_4_5_HAIKU.to_string(),
        // Full model ID passthrough
        _ => model_name.to_string(),
    }
}
```

## Usage

### Agent API

```bash
curl -X POST http://localhost:50054/v1/llms/chatrooms/{id}/agent/execute \
  -H "Authorization: Bearer dummy-token" \
  -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Hello, world!",
    "model": "bedrock/claude-4-5-sonnet",
    "auto_approve": true,
    "max_requests": 1
  }'
```

### Chat Completion API

```bash
curl -X POST http://localhost:50054/v1/llms/chatrooms/{id}/chat/completions \
  -H "Authorization: Bearer dummy-token" \
  -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "bedrock/claude-4-5-sonnet",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "stream": true
  }'
```

## Pricing

Bedrock models use the same NanoDollar pricing as the direct Anthropic API equivalents:

| Model | Input Price | Output Price |
|-------|-------------|--------------|
| Claude 4.5 Sonnet | $0.000003/token (3,000 nanodollars) | $0.000015/token (15,000 nanodollars) |
| Claude 4.5 Haiku | $0.000001/token (1,000 nanodollars) | $0.000005/token (5,000 nanodollars) |

## Configuration

### AWS Credentials

The Bedrock provider uses the default AWS credential chain. Ensure appropriate credentials are configured:

1. Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
2. AWS credentials file (`~/.aws/credentials`)
3. IAM role (for EC2/ECS/Lambda)

### Required IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-*"
      ]
    }
  ]
}
```

## Implementation Details

### Streaming Support

The Bedrock provider implements `ChatStreamProviderV2` trait for SSE streaming responses:

```rust
// packages/providers/aws/src/bedrock/stream_v2.rs
impl ChatStreamProviderV2 for BedrockClient {
    async fn chat_stream_v2(
        &self,
        messages: Vec<Message>,
        model: &str,
        config: StreamConfig,
    ) -> Result<impl Stream<Item = StreamEvent>> {
        let resolved_model = resolve_model_alias(model);
        // ... streaming implementation
    }
}
```

### Provider Selection

When a model name starts with `bedrock/`, the `model_provider_selector` routes the request to the Bedrock provider:

```rust
// packages/llms/src/usecase/model_provider_selector.rs
match model_name {
    m if m.starts_with("bedrock/") => Provider::Bedrock,
    m if m.starts_with("anthropic.claude") => Provider::Bedrock,
    m if m.starts_with("claude") => Provider::Anthropic,
    // ...
}
```

## Related Files

- `packages/providers/aws/src/bedrock/models.rs` - Model definitions and alias resolution
- `packages/providers/aws/src/bedrock/stream_v2.rs` - Streaming implementation
- `packages/catalog/src/usecase/find_product_by_name.rs` - Price mapping
- `apps/tachyon-api/src/di.rs` - Provider registration

## See Also

- [Agent API Overview](../llms/agent-api/overview.md)
- [Model Specifications](../llms/model.md)
- [Anthropic Provider](./anthropic.md)
