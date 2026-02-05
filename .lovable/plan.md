
# Add AI Q&A Chatbot for Market Trends Analysis

## Overview
Add a floating chatbot button on the Market Trends page that opens a slide-out panel where users can ask questions about the analysis. The chatbot uses Grok (same model as market trend analysis) to provide contextual answers.

## Visual Design

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Market Trends Page                                          [💬 ASK] │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ Tabs: Overview | Trends | Products | Competition | Consumers    │ │
│ ├──────────────────────────────────────────────────────────────────┤ │
│ │                                                                  │ │
│ │  Analysis content...                                             │ │
│ │                                                                  │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│                                                    ┌────────────────┐│
│                                                    │ 💬 Ask About   ││
│                                                    │    Analysis    ││
│                                                    └────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

When chat opens (slide-out panel from right):
```text
┌─────────────────────────────────────────┬────────────────────────────┐
│ Market Trends Page                      │ 🤖 Market Insights AI     │
│                                         │────────────────────────────│
│                                         │ ┌────────────────────────┐ │
│                                         │ │ 🤖 Hello! I can answer │ │
│                                         │ │ questions about this   │ │
│                                         │ │ market analysis.       │ │
│                                         │ └────────────────────────┘ │
│                                         │                            │
│                                         │ ┌────────────────────────┐ │
│                                         │ │ 👤 What are the top    │ │
│                                         │ │ emerging trends?       │ │
│                                         │ └────────────────────────┘ │
│                                         │                            │
│                                         │ ┌────────────────────────┐ │
│                                         │ │ 🤖 Based on the        │ │
│                                         │ │ analysis, the top      │ │
│                                         │ │ trends are...          │ │
│                                         │ └────────────────────────┘ │
│                                         │────────────────────────────│
│                                         │ [Type your question...]   │ │
│                                         │                     [Send]│ │
└─────────────────────────────────────────┴────────────────────────────┘
```

## Implementation Steps

### 1. Create Edge Function: `ask-market-trends`
**New file**: `supabase/functions/ask-market-trends/index.ts`

- Accept `categoryId`, `question`, and `conversationHistory`
- Fetch the market trend analysis from database
- Build context from the analysis JSON
- Call Grok API with streaming enabled
- Stream responses back to client

Key features:
- Uses same Grok model (`grok-4-latest`) as market trends analysis
- Sends full analysis context for accurate answers
- Supports multi-turn conversation with history
- Streaming for real-time token display

### 2. Create Chat Component: `MarketTrendsChat`
**New file**: `src/components/market-trends/MarketTrendsChat.tsx`

Lighter-weight version of FormulaChat, focused on Q&A:
- Message list with user/assistant bubbles
- Streaming response display
- Markdown rendering for AI responses
- Auto-scroll to latest message
- Input field with send button
- Example question suggestions

### 3. Update Market Trends Page
**Modified file**: `src/pages/MarketTrend.tsx`

- Add floating action button when analysis is available
- Add Sheet component for chat panel
- Pass analysis context to chat component

### 4. Update Supabase Config
**Modified file**: `supabase/config.toml`

- Add new edge function configuration

## Technical Details

### Edge Function API Design

**Request:**
```typescript
{
  categoryId: string;
  question: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}
```

**Response:**
SSE stream with delta content tokens

### Chat Component Features

| Feature | Implementation |
|---------|----------------|
| Streaming | SSE parsing with token-by-token rendering |
| Markdown | ReactMarkdown with remark-gfm |
| History | Local state, not persisted to DB |
| Context | Full analysis JSON sent to edge function |
| Animations | Fade-in for messages, typing indicator |

### Suggested Questions (shown when chat opens)
- "What are the top growth opportunities in this market?"
- "Which brands are gaining market share?"
- "What do consumers complain about most?"
- "What innovations are emerging?"

## Files to Create/Modify

1. **New**: `supabase/functions/ask-market-trends/index.ts` - Edge function for Q&A
2. **New**: `src/components/market-trends/MarketTrendsChat.tsx` - Chat panel component
3. **Modified**: `src/pages/MarketTrend.tsx` - Add chat button and sheet
4. **Modified**: `supabase/config.toml` - Add edge function config

## Animations
- Floating button: pulse animation to draw attention
- Chat panel: slide-in from right (existing Sheet behavior)
- Messages: fade-in animation
- Streaming text: cursor blink effect
- Send button: scale on hover
