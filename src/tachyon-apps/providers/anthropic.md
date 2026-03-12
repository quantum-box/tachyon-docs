# Anthropic

## Parameters

#### tool_choice

- `auto`: ツールを使用するかどうかを自動的に選択します。コメントも一緒に入ってきます。
- `none`: ツールを使用しません。
- `any`: ツールを使用します。

## Example

```shell
curl https://api.anthropic.com/v1/messages \
          -H "content-type: application/json" \
          -H "x-api-key: $ANTHROPIC_API_KEY" \
          -H "anthropic-version: 2023-06-01" \
          -d '{
        "model": "claude-sonnet-4-5-20250929",
        "max_tokens": 1024,
        "tools": [
          {
            "name": "get_weather",
            "description": "Get the current weather in a given location",
            "input_schema": {
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
        ],
        "tool_choice": {"type": "auto"},
        "messages": [
            {
                "role": "user",
                "content": "こんにちは。"
            },
            {
                "role": "assistant",
                "content": "こんにちは。"
            },
            {
                "role": "user",
                "content": "東京の天気は？"
            }
        ],
        "stream": true
      }'
```

```shell
event: message_start
data: {"type":"message_start","message":{"id":"msg_01KYFSvrgBMGZFWxcuaseYTR","type":"message","role":"assistant","model":"claude-sonnet-4-5-20250929","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":420,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":1}}        }

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}      }

event: ping
data: {"type": "ping"}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"東京の天気について確認して"}    }

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"みましょう。"}      }

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_01R9MTMMGTGpyj7A2PtS2NeH","name":"get_weather","input":{}}      }

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":""} }

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"locati"}    }

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"on"}         }

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\": \"Tokyo, "}               }

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"Japan\"}"}          }

event: content_block_stop
data: {"type":"content_block_stop","index":1               }

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":71}         }

event: message_stop
data: {"type":"message_stop"             }
```
