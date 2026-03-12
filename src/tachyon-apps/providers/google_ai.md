# Google AI

## Tool Support

### Overview
Google AI (Gemini) のツール機能をサポートし、LLMに特定の機能を実行させることができます。

### Requirements
- ツール（関数）の定義と実行をサポート
- システムプロンプトとツール定義の組み合わせをサポート
- ツールの実行結果をLLMに返却し、結果を解釈させることが可能

### Specification

#### Tool Definition
```typescript
interface Tool {
  functionDeclarations: FunctionDeclaration[];
}

interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, {
      type: string;
      description?: string;
    }>;
    required: string[];
  };
}
```

#### Tool Configuration
```typescript
interface ToolConfig {
  functionCallingConfig: {
    mode: "ANY" | "NONE";
  };
}
```

#### Request Example
```json
{
  "contents": [...],
  "systemInstruction": {
    "role": "user",
    "parts": [
      {
        "text": "System instruction here"
      }
    ]
  },
  "tools": [
    {
      "functionDeclarations": [
        {
          "name": "calculator",
          "description": "A simple calculator that can perform basic arithmetic operations",
          "parameters": {
            "type": "object",
            "properties": {
              "operation": {
                "type": "string"
              },
              "x": {
                "type": "integer"
              },
              "y": {
                "type": "integer"
              }
            },
            "required": ["operation", "x", "y"]
          }
        }
      ]
    }
  ],
  "toolConfig": {
    "functionCallingConfig": {
      "mode": "ANY"
    }
  }
}
```

#### Response Example
```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "functionCall": {
              "name": "find_theaters",
              "args": {
                "location": "North Seattle, WA",
                "movie": null
              }
            }
          }
        ],
        "role": "model"
      },
      "finishReason": "STOP",
      "index": 0,
      "safetyRatings": [
        {
          "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          "probability": "NEGLIGIBLE"
        },
        {
          "category": "HARM_CATEGORY_HARASSMENT",
          "probability": "NEGLIGIBLE"
        },
        {
          "category": "HARM_CATEGORY_HATE_SPEECH",
          "probability": "NEGLIGIBLE"
        },
        {
          "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
          "probability": "NEGLIGIBLE"
        }
      ]
    }
  ],
  "promptFeedback": {
    "safetyRatings": [
      {
        "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "probability": "NEGLIGIBLE"
      },
      {
        "category": "HARM_CATEGORY_HATE_SPEECH",
        "probability": "NEGLIGIBLE"
      },
      {
        "category": "HARM_CATEGORY_HARASSMENT",
        "probability": "NEGLIGIBLE"
      },
      {
        "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
        "probability": "NEGLIGIBLE"
      }
    ]
  }
}
```

### Implementation Plan ✅

1. リクエスト構造体の拡張 ✅
   - `ChatCompletionRequest`に以下のフィールドを追加
     - `tools: Vec<Tool>`
     - `tool_config: ToolConfig`
     - `system_instruction: Option<Content>`

2. レスポンス構造体の拡張 ✅
   - `Part`に`function_call: Option<FunctionCall>`を追加
   - `FunctionCall`構造体の追加
     ```rust
     struct FunctionCall {
         name: String,
         args: serde_json::Value,
     }
     ```

### Usage Example

```rust
let google_ai = GoogleAI::new(api_key);
let tools = vec![Tool {
    function_declarations: vec![
        FunctionDeclaration {
            name: "calculator",
            description: "Basic calculator",
            parameters: json!({
                "type": "object",
                "properties": {
                    "operation": { "type": "string" },
                    "x": { "type": "integer" },
                    "y": { "type": "integer" }
                },
                "required": ["operation", "x", "y"]
            })
        }
    ]
}];

let response = google_ai
    .send_chat_completion_request_with_tools(
        "gemini-pro",
        messages,
        tools,
        Some(system_instruction)
    )
    .await?;
```