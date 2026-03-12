---
title: "主要AIモデルの料金（nanodollar単位）"
type: "reference"
emoji: "💰"
---

# 主要AIモデルの料金（nanodollar単位）

## 変換基準
- 1 USD = 1,000,000,000 nanodollars
- 最小単位: 1 nanodollar = $0.000000001

## モデル別料金表

### OpenAI Models
| モデル | Input (USD/token) | Input (nanodollars) | Output (USD/token) | Output (nanodollars) |
|--------|-------------------|---------------------|-------------------|---------------------|
| GPT-4.1 | $0.000002 | 2,000 | $0.000008 | 8,000 |
| GPT-4.1 mini | $0.00000004 | 40 | $0.00000016 | 160 |
| GPT-4.1 nano | $0.00000001 | 10 | $0.00000004 | 40 |

### Anthropic Models
| モデル | Input (USD/token) | Input (nanodollars) | Output (USD/token) | Output (nanodollars) |
|--------|-------------------|---------------------|-------------------|---------------------|
| Claude Opus 4 | $0.000015 | 15,000 | $0.000075 | 75,000 |
| Claude Sonnet 4 | $0.000003 | 3,000 | $0.000015 | 15,000 |
| Claude 3.5 Sonnet | $0.000003 | 3,000 | $0.000015 | 15,000 |
| Claude 3.5 Haiku | $0.00000008 | 80 | $0.0000004 | 400 |
| Claude 3 Haiku | $0.000000025 | 25 | $0.000000125 | 125 |

### Google Models
| モデル | Input (USD/token) | Input (nanodollars) | Output (USD/token) | Output (nanodollars) |
|--------|-------------------|---------------------|-------------------|---------------------|
| Gemini 2.5 Pro | $0.00000125 | 1,250 | $0.00001 | 10,000 |
| Gemini 2.5 Flash | $0.00000001 | 10 | $0.00000004 | 40 |
| **Gemini 2.5 Flash-Lite** | **$0.0000001** | **100** | **$0.0000004** | **400** |
| **Gemini 2.0 Flash-Lite** | **$0.000000075** | **75** | **$0.0000003** | **300** |
| Gemini 1.5 Flash | $0.0000000075 | 7.5 → 8 | $0.00000003 | 30 |
| Gemini 1.5 Flash-8B | $0.00000000375 | 3.75 → 4 | $0.000000015 | 15 |

## 料金計算例

### 100万トークンの処理
```
Claude Sonnet 4:
- Input: 1,000,000 × 3,000 = 3,000,000,000 nanodollars = $3.00
- Output: 1,000,000 × 15,000 = 15,000,000,000 nanodollars = $15.00

Gemini Flash-Lite:
- Input: 1,000,000 × 100 = 100,000,000 nanodollars = $0.10
- Output: 1,000,000 × 400 = 400,000,000 nanodollars = $0.40
```

### ツール使用料金
| ツール | 現在（クレジット） | USD | nanodollars |
|--------|------------------|-----|-------------|
| MCP Search | 50クレジット | $0.50 | 500,000,000 |
| MCP File Read | 20クレジット | $0.20 | 200,000,000 |
| MCP File Write | 30クレジット | $0.30 | 300,000,000 |
| MCP Execute | 40クレジット | $0.40 | 400,000,000 |
| Web Search | 50クレジット | $0.50 | 500,000,000 |

## 精度の問題と対応

### 小数点の切り上げが必要なモデル
- Gemini 1.5 Flash: 7.5 → 8 nanodollars (input)
- Gemini 1.5 Flash-8B: 3.75 → 4 nanodollars (input)

### nanodollar採用のメリット
1. **Gemini Flash-Liteも整数で表現可能**: 75～400 nanodollars
2. **将来の価格下落にも対応**: 現在の1/10の価格でも表現可能
3. **整数演算で高速・正確**: 浮動小数点の誤差なし

## 移行時の変換計算

### クレジットからの変換
```
1クレジット = $0.01 = 10,000,000 nanodollars

例：
- 1000クレジット = $10 = 10,000,000,000 nanodollars
- 0.001クレジット = $0.00001 = 10,000 nanodollars
```

### 内部単位からの変換
```
Catalog内部単位: 1内部単位 = 0.001クレジット = $0.00001 = 10,000 nanodollars
Payment内部単位: 1内部単位 = 0.1クレジット = $0.001 = 1,000,000 nanodollars

例：
- Catalog: 5内部単位 = 50,000 nanodollars
- Payment: 5内部単位 = 5,000,000 nanodollars
```