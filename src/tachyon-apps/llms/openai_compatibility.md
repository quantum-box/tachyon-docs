# OpenAI compatibility

```shell
❯ curl https://api.openai.com/v1/chat/completions \
              -H "Content-Type: application/json" \
              -H "Authorization: Bearer $OPENAI_API_KEY" \
              -d '{
        "model": "gpt-4o",
        "messages": [
          {
            "role": "developer",
            "content": "You are a helpful assistant."
          },
          {
            "role": "user",
            "content": "Hello!"
          }
        ],
        "stream": true
      }'
data: {"id":"chatcmpl-AmDBHwfFC4cfGbcVX4VBbeLZsV0CM","object":"chat.completion.chunk","created":1736053775,"model":"gpt-4o-2024-08-06","system_fingerprint":"fp_d28bcae782","choices":[{"index":0,"delta":{"role":"assistant","content":"","refusal":null},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AmDBHwfFC4cfGbcVX4VBbeLZsV0CM","object":"chat.completion.chunk","created":1736053775,"model":"gpt-4o-2024-08-06","system_fingerprint":"fp_d28bcae782","choices":[{"index":0,"delta":{"content":"Hello"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AmDBHwfFC4cfGbcVX4VBbeLZsV0CM","object":"chat.completion.chunk","created":1736053775,"model":"gpt-4o-2024-08-06","system_fingerprint":"fp_d28bcae782","choices":[{"index":0,"delta":{"content":"!"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AmDBHwfFC4cfGbcVX4VBbeLZsV0CM","object":"chat.completion.chunk","created":1736053775,"model":"gpt-4o-2024-08-06","system_fingerprint":"fp_d28bcae782","choices":[{"index":0,"delta":{"content":" How"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AmDBHwfFC4cfGbcVX4VBbeLZsV0CM","object":"chat.completion.chunk","created":1736053775,"model":"gpt-4o-2024-08-06","system_fingerprint":"fp_d28bcae782","choices":[{"index":0,"delta":{"content":" can"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AmDBHwfFC4cfGbcVX4VBbeLZsV0CM","object":"chat.completion.chunk","created":1736053775,"model":"gpt-4o-2024-08-06","system_fingerprint":"fp_d28bcae782","choices":[{"index":0,"delta":{"content":" I"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AmDBHwfFC4cfGbcVX4VBbeLZsV0CM","object":"chat.completion.chunk","created":1736053775,"model":"gpt-4o-2024-08-06","system_fingerprint":"fp_d28bcae782","choices":[{"index":0,"delta":{"content":" assist"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AmDBHwfFC4cfGbcVX4VBbeLZsV0CM","object":"chat.completion.chunk","created":1736053775,"model":"gpt-4o-2024-08-06","system_fingerprint":"fp_d28bcae782","choices":[{"index":0,"delta":{"content":" you"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AmDBHwfFC4cfGbcVX4VBbeLZsV0CM","object":"chat.completion.chunk","created":1736053775,"model":"gpt-4o-2024-08-06","system_fingerprint":"fp_d28bcae782","choices":[{"index":0,"delta":{"content":" today"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AmDBHwfFC4cfGbcVX4VBbeLZsV0CM","object":"chat.completion.chunk","created":1736053775,"model":"gpt-4o-2024-08-06","system_fingerprint":"fp_d28bcae782","choices":[{"index":0,"delta":{"content":"?"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AmDBHwfFC4cfGbcVX4VBbeLZsV0CM","object":"chat.completion.chunk","created":1736053775,"model":"gpt-4o-2024-08-06","system_fingerprint":"fp_d28bcae782","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"stop"}]}

data: [DONE]
```

```shell
❯ curl http://localhost:50054/v1/llms/chat/completions \
                    -H "Content-Type: application/json" \
                    -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m" \
                    -H "Authorization: Bearer dummy-token" \
                    -d '{
          "model": "gpt-4o",
          "messages": [
            {
              "role": "system",
              "content": "You are a helpful assistant."
            },
            {
              "role": "user",
              "content": "Hello!"
            }
          ],
          "stream": true
        }'
data: {"id":"chatcmpl-AmDQFTBZfFmmyUaHy26BWGK1pNRkX","object":"chat.completion.chunk","created":1736054703,"model":"gpt-4o-2024-08-06","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":"","role":"assistant","refusal":null,"function_call":null,"tool_calls":null},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AmDQFTBZfFmmyUaHy26BWGK1pNRkX","object":"chat.completion.chunk","created":1736054703,"model":"gpt-4o-2024-08-06","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":"Hello","role":null,"refusal":null,"function_call":null,"tool_calls":null},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AmDQFTBZfFmmyUaHy26BWGK1pNRkX","object":"chat.completion.chunk","created":1736054703,"model":"gpt-4o-2024-08-06","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":"!","role":null,"refusal":null,"function_call":null,"tool_calls":null},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AmDQFTBZfFmmyUaHy26BWGK1pNRkX","object":"chat.completion.chunk","created":1736054703,"model":"gpt-4o-2024-08-06","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" How","role":null,"refusal":null,"function_call":null,"tool_calls":null},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AmDQFTBZfFmmyUaHy26BWGK1pNRkX","object":"chat.completion.chunk","created":1736054703,"model":"gpt-4o-2024-08-06","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" can","role":null,"refusal":null,"function_call":null,"tool_calls":null},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AmDQFTBZfFmmyUaHy26BWGK1pNRkX","object":"chat.completion.chunk","created":1736054703,"model":"gpt-4o-2024-08-06","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" I","role":null,"refusal":null,"function_call":null,"tool_calls":null},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AmDQFTBZfFmmyUaHy26BWGK1pNRkX","object":"chat.completion.chunk","created":1736054703,"model":"gpt-4o-2024-08-06","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" assist","role":null,"refusal":null,"function_call":null,"tool_calls":null},"logprobs":null,"finish_reason":null}]}

data: [DONE]
```

## OpenAI Function Calling

```shell
curl https://api.openai.com/v1/chat/completions \
-H "Content-Type: application/json" \
-H "Authorization: Bearer $OPENAI_API_KEY" \
-d '{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "user",
      "content": "What is the weather like in San Francisco?"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_current_weather",
        "description": "Get the current weather in a given location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "The city and state, e.g. San Francisco, CA"
            }
          },
          "required": ["location"]
        }
      }
    }
  ],
  "tool_choice": "auto",
  "stream": true
}'
```

```shell
data: {"id":"chatcmpl-AqGU5ObC4sONpXjNiJ4rZKZrxAgfl","object":"chat.completion.chunk","created":1737019785,"model":"gpt-4o-2024-08-06","service_tier":"default","system_fingerprint":"fp_4691090a87","choices":[{"index":0,"delta":{"role":"assistant","content":null,"tool_calls":[{"index":0,"id":"call_QOiCJz5LleFUehtb9r8bYy6P","type":"function","function":{"name":"get_current_weather","arguments":""}}],"refusal":null},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AqGU5ObC4sONpXjNiJ4rZKZrxAgfl","object":"chat.completion.chunk","created":1737019785,"model":"gpt-4o-2024-08-06","service_tier":"default","system_fingerprint":"fp_4691090a87","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\""}}]},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AqGU5ObC4sONpXjNiJ4rZKZrxAgfl","object":"chat.completion.chunk","created":1737019785,"model":"gpt-4o-2024-08-06","service_tier":"default","system_fingerprint":"fp_4691090a87","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"location"}}]},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AqGU5ObC4sONpXjNiJ4rZKZrxAgfl","object":"chat.completion.chunk","created":1737019785,"model":"gpt-4o-2024-08-06","service_tier":"default","system_fingerprint":"fp_4691090a87","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\":\""}}]},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AqGU5ObC4sONpXjNiJ4rZKZrxAgfl","object":"chat.completion.chunk","created":1737019785,"model":"gpt-4o-2024-08-06","service_tier":"default","system_fingerprint":"fp_4691090a87","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"San"}}]},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AqGU5ObC4sONpXjNiJ4rZKZrxAgfl","object":"chat.completion.chunk","created":1737019785,"model":"gpt-4o-2024-08-06","service_tier":"default","system_fingerprint":"fp_4691090a87","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" Francisco"}}]},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AqGU5ObC4sONpXjNiJ4rZKZrxAgfl","object":"chat.completion.chunk","created":1737019785,"model":"gpt-4o-2024-08-06","service_tier":"default","system_fingerprint":"fp_4691090a87","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":","}}]},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AqGU5ObC4sONpXjNiJ4rZKZrxAgfl","object":"chat.completion.chunk","created":1737019785,"model":"gpt-4o-2024-08-06","service_tier":"default","system_fingerprint":"fp_4691090a87","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" CA"}}]},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AqGU5ObC4sONpXjNiJ4rZKZrxAgfl","object":"chat.completion.chunk","created":1737019785,"model":"gpt-4o-2024-08-06","service_tier":"default","system_fingerprint":"fp_4691090a87","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"}"}}]},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-AqGU5ObC4sONpXjNiJ4rZKZrxAgfl","object":"chat.completion.chunk","created":1737019785,"model":"gpt-4o-2024-08-06","service_tier":"default","system_fingerprint":"fp_4691090a87","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"tool_calls"}]}

data: [DONE]
```
