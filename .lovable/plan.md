
# Unified Widget/Bubble Chatbot for Market Trends and Strategy Brief

## Overview
Create a consistent floating bubble chatbot experience across both the Market Trends and Strategy Brief pages. Both will use the same visual pattern: a pulsing floating action button in the bottom-right corner that opens a slide-out chat panel.

## Current State vs. Proposed State

```text
CURRENT STATE:
┌─────────────────────────────────────────────────────────────────────┐
│ Market Trends Page         │ Strategy Brief Page                   │
├─────────────────────────────────────────────────────────────────────┤
│ - Floating bubble button   │ - Header button only ("Modify with AI")│
│ - Pulsing animation        │ - No floating button                  │
│ - Sheet panel opens        │ - Sheet panel opens                   │
└─────────────────────────────────────────────────────────────────────┘

PROPOSED STATE:
┌─────────────────────────────────────────────────────────────────────┐
│ Market Trends Page         │ Strategy Brief Page                   │
├─────────────────────────────────────────────────────────────────────┤
│ - Floating bubble button   │ - Floating bubble button              │
│ - Pulsing animation        │ - Pulsing animation                   │
│ - Consistent styling       │ - Consistent styling                  │
│ - Same 50% width panel     │ - Same 50% width panel (already)      │
└─────────────────────────────────────────────────────────────────────┘
```

## Visual Design

Floating bubble for both pages:
```text
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  Page content...                                                     │
│                                                                      │
│                                                                      │
│                                                    ┌────────────────┐│
│                                                    │   💬           ││
│                                                    │  (pulsing)     ││
│                                                    └────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
                                                           ↑
                                                    Fixed position
                                                    bottom-6 right-6
                                                    Rounded full
                                                    Shadow + pulse
```

## Implementation Steps

### 1. Create Reusable FloatingChatButton Component
**New file**: `src/components/ui/floating-chat-button.tsx`

A reusable component that:
- Renders a fixed-position circular button with pulsing animation
- Shows only when content is available (controlled by `show` prop)
- Uses consistent styling across pages
- Can be customized with icon and tooltip

### 2. Update Strategy Brief Page
**Modified file**: `src/pages/StrategyBrief.tsx`

- Import and use the FloatingChatButton component
- Keep the existing header "Modify with AI" button for quick access
- Add floating bubble for consistent UX with Market Trends

### 3. Update Market Trends Page (minor cleanup)
**Modified file**: `src/pages/MarketTrend.tsx`

- Extract floating button to use the reusable component
- Keep the header "Ask AI" button for consistency

## Technical Details

### FloatingChatButton Component

```typescript
interface FloatingChatButtonProps {
  onClick: () => void;
  show: boolean;
  icon?: React.ReactNode;  // Defaults to MessageCircle
  tooltip?: string;        // Optional tooltip text
  pulse?: boolean;         // Enable/disable pulse animation
}
```

### Component Features

| Feature | Implementation |
|---------|----------------|
| Position | Fixed bottom-6 right-6 |
| Shape | Rounded full (circular) |
| Size | h-14 w-14 (56x56px) |
| Animation | Pulsing ring with animate-ping |
| Hover | Scale up icon |
| Z-index | z-50 for overlay |
| Shadow | shadow-lg for depth |

### Consistency Between Pages

| Aspect | Market Trends | Strategy Brief |
|--------|---------------|----------------|
| Floating button | Yes | Yes (adding) |
| Button position | bottom-6 right-6 | bottom-6 right-6 |
| Pulse animation | Yes | Yes |
| Panel width | 450px | 50vw (keep as is) |
| Header button | "Ask AI" | "Modify with AI" |

## Files to Create/Modify

1. **New**: `src/components/ui/floating-chat-button.tsx` - Reusable floating button
2. **Modified**: `src/pages/StrategyBrief.tsx` - Add floating bubble
3. **Modified**: `src/pages/MarketTrend.tsx` - Use reusable component

## Print Considerations

The floating button will be hidden during print using the existing `print:hidden` utility class pattern.
