
# Add Animated Progress Indicator to Market Trends Navigation

## Overview
Add a modern animated progress indicator beside the "Market Trends" navigation item that shows the analysis status (processing, completed, or error) with smooth animations.

## Visual Design

The indicator will appear as a small badge/icon to the right of the "Market Trends" text:
- **Processing**: Animated spinning circle with pulsing glow effect
- **Completed**: Green checkmark with bounce-in animation
- **Error**: Red warning icon with subtle shake
- **No analysis**: No indicator shown

## Implementation Steps

### 1. Create MarketTrendStatusIndicator Component
**New file**: `src/components/layout/MarketTrendStatusIndicator.tsx`

A compact component that:
- Fetches market trend analysis status for the current category
- Displays appropriate animated icon based on status
- Uses existing tailwind animations (spinner-rotate, check-bounce, glow-pulse)

### 2. Update AppSidebar Component
**File**: `src/components/layout/AppSidebar.tsx`

- Import the new status indicator component
- Modify the NavItem component to accept an optional trailing element
- Add the status indicator specifically for the "Market Trends" menu item

### 3. Add New Animations
**File**: `tailwind.config.ts`

Add a new "pulse-ring" keyframe for the processing indicator's outer ring effect

## Technical Details

### Status Indicator States

```text
┌─────────────┬─────────────────────────────────────────────┐
│ Status      │ Visual                                      │
├─────────────┼─────────────────────────────────────────────┤
│ pending     │ Spinning loader with blue glow pulse        │
│ processing  │ Spinning loader with blue glow pulse        │
│ completed   │ Green checkmark with bounce animation       │
│ error       │ Red alert triangle with subtle shake        │
│ none        │ Hidden (no indicator)                       │
└─────────────┴─────────────────────────────────────────────┘
```

### Component Structure

```tsx
// MarketTrendStatusIndicator.tsx
- Uses supabase to query market_trend_analyses table
- Subscribes to real-time updates for live status changes
- Returns appropriate animated icon or null
```

### Sidebar Integration

The NavItem will be updated to render an optional trailing indicator:
```tsx
<NavItem item={item} isActive={...} href={...}>
  {item.title === "Market Trends" && <MarketTrendStatusIndicator />}
</NavItem>
```

## Animations Used

| Animation | Purpose |
|-----------|---------|
| `spinner-rotate` | Continuous rotation for loading state |
| `glow-pulse` | Pulsing glow around the spinner |
| `check-bounce` | Bounce effect when completed |
| `shake` | Subtle shake for error state |
| `fade-in` | Smooth appearance transition |

## Files Changed

1. **New**: `src/components/layout/MarketTrendStatusIndicator.tsx` - Status indicator component
2. **Modified**: `src/components/layout/AppSidebar.tsx` - Integrate indicator into nav
3. **Modified**: `tailwind.config.ts` - Add pulse-ring animation (if needed)
