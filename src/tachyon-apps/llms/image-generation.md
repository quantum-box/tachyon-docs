# Image Generation

## Overview

LLMs context provides a unified image generation API that abstracts
multiple providers (OpenAI, Google AI, xAI) behind a single REST
endpoint. The feature follows the same billing pattern as
`CompletionChat`: estimate cost → check billing → generate →
consume credits.

## REST API

### `POST /v1/images/generations`

Generate images from a text prompt.

**Headers** (same as other LLMs endpoints):

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | `Bearer <token>` |
| `x-operator-id` | Yes | Operator tenant ID |
| `x-user-id` | No | User ID (defaults to seed user) |

**Request body**:

```json
{
  "prompt": "A futuristic city at sunset",
  "model": "gpt-image-1.5",
  "size": "1024x1024",
  "quality": "medium",
  "n": 1,
  "response_format": "url"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | Text description of the image |
| `model` | string | Yes | Model name (see supported models) |
| `size` | string | No | `1024x1024`, `1024x1536`, `1536x1024`, `auto` |
| `quality` | string | No | `low`, `medium`, `high` |
| `n` | u8 | No | Number of images (1-10, default 1) |
| `aspect_ratio` | string | No | e.g. `16:9` (provider-dependent) |
| `response_format` | string | No | `url` or `b64_json` |

**Response** (`200 OK`):

```json
{
  "images": [
    {
      "url": "https://...",
      "revised_prompt": "A futuristic city..."
    }
  ],
  "model": "gpt-image-1.5",
  "cost_nanodollars": 67000000
}
```

## Supported Models

### OpenAI

| Model | Quality tiers | Default cost |
|-------|---------------|-------------|
| `gpt-image-1.5` | low $0.040 / medium $0.067 / high $0.167 | $0.067 |
| `gpt-image-1` | low $0.011 / medium $0.042 / high $0.167 | $0.042 |
| `gpt-image-1-mini` | low $0.007 / medium $0.025 / high $0.100 | $0.025 |

### Google AI

| Model | Cost per image |
|-------|---------------|
| `gemini-3-pro-image-preview` | $0.039 |
| `gemini-2.5-flash-image` | $0.020 |
| `gemini-2.0-flash-exp-image-generation` | Free |

### xAI

| Model | Cost per image |
|-------|---------------|
| `grok-imagine-image` | $0.070 |
| `grok-2-image` | $0.070 |

## Billing Integration

Image generation uses the same billing pipeline as chat completions.

### Flow

```
1. Authorization check (llms:GenerateImage policy)
2. Resolve provider for the requested model
3. CatalogApp.calculate_image_generation_cost() → estimated cost
4. PaymentApp.check_billing() → verify balance
5. Provider.generate_image() → actual images
6. CatalogApp.calculate_image_generation_cost() → actual cost (by returned image count)
7. PaymentApp.consume_credits() → deduct balance
8. Return response with cost_nanodollars
```

### Cost Calculation

- **Per-image pricing**: Unlike token-based LLM pricing, image
  generation is charged per image.
- **Quality-based tiers**: OpenAI models have different rates for
  low/medium/high quality. When quality is not specified, the
  `base_cost_per_image` (medium) is used.
- **Multiplication by n**: Total cost = per-image cost × number of
  images generated.
- **Resource type**: `llms_image_generation`

### Architecture

```
PricingProvider trait
  └─ get_image_model_pricing()  ← default Ok(None)
       ├─ OpenAIPricingProvider  (quality tiers)
       ├─ GoogleAIPricingProvider
       └─ XaiPricingProvider

PricingRegistry
  └─ get_image_model_pricing(provider, model)

CatalogAppService trait
  └─ calculate_image_generation_cost()  ← default zero-cost
       └─ CatalogApp struct (override)
            └─ PricingRegistry → ImageModelPricing → ServiceCostBreakdown

GenerateImage usecase
  ├─ CatalogAppService  (cost calculation)
  └─ PaymentApp          (billing check & credit consumption)
```

### Key Types

- `ImageModelPricing` (`procurement_domain`): per-image cost +
  quality-specific cost map.
- `ServiceCostBreakdown` (`catalog`): standardised cost envelope
  used across all billing flows.

## Authorization

Action: `llms:GenerateImage`

Defined in `scripts/seeds/n1-seed/008-auth-policies.yaml` and
included in `AdminPolicy` and `LLMsFullAccess`.

## Related Files

| File | Purpose |
|------|---------|
| `packages/llms/src/usecase/generate_image.rs` | Usecase with billing |
| `packages/llms/src/adapter/axum/image_generation_handler.rs` | REST handler |
| `packages/llms/src/registry/image_generation_registry.rs` | Provider registry |
| `packages/providers/llms_provider/src/image.rs` | Provider trait |
| `packages/providers/openai/src/image.rs` | OpenAI provider |
| `packages/providers/google_ai/src/image.rs` | Google AI provider |
| `packages/providers/xai/src/image.rs` | xAI provider |
| `packages/procurement/domain/src/pricing_provider.rs` | `ImageModelPricing` type |
| `packages/catalog/src/app.rs` | `calculate_image_generation_cost` |
| `apps/tachyon-api/tests/scenarios/image_generation_rest.yaml` | Scenario test |

## Future Work (Phase 2+)

- Image storage (S3/R2) and signed URL generation
- Image editing API (inpainting, image-to-image)
- Additional providers (FLUX.2, Ideogram 3.0)
- Chat context integration (generate images from conversation)
- Tachyon UI for image generation
