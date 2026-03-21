# Share Card & Graph View — Design Spec

## Feature 1: Share Card

### Goal

Generate a shareable image from a single memory card, for social sharing (Twitter, WeChat, etc).

### Entry Points

1. **Web UI** — share button on expanded card → generates image → download
2. **CLI** — `memex share <slug>` → writes PNG to stdout or file

### Visual Layout (flomo-style)

```
┌─────────────────────────────────┐
│  "    (quote mark)    author    │
│                       date     │
│                                │
│  Card body content rendered    │
│  as markdown...                │
│                                │
│  [[link1]] [[link2]]           │
│                                │
│  ─────────────────────────────  │
│  18 CARDS · 34 DAYS    memex   │
└─────────────────────────────────┘
```

### Themes

4 selectable themes matching the app: forest (light green), sonoma (light gray), sunset (warm), midnight (dark). Defaults to current app theme. User can switch via buttons before generating.

### Implementation

- Web UI: render card to an offscreen `<canvas>`, then `canvas.toBlob()` → download
- CLI: use the same render logic via a headless approach (generate self-contained HTML, screenshot with Playwright, or use canvas in Node)
- The share card renderer is a pure function: `(cardData, theme, stats) → canvas` — reusable component

### Card Data Input

```typescript
interface ShareCardData {
  title: string;
  body: string;         // raw markdown body
  created: string;      // YYYY-MM-DD
  source: string;       // retro | organize | manual
  links: string[];      // [[link]] slugs
  stats: {
    totalCards: number;
    totalDays: number;
  };
}
```

---

## Feature 2: Graph View

### Goal

Visualize the bidirectional link network. Purpose: discover unexpected connections, find orphans, understand knowledge structure.

### Entry Point

Sidebar button in web UI, switches the main content area from timeline to graph view.

### Initial State

- All nodes with at least 1 connection are visible
- Force-directed layout runs at startup, auto-stops when settled (nodes don't drift)
- Hub nodes (≥4 edges) are green and larger, regular nodes are blue
- Background: dark (#0a0a0f), static particles, sci-fi aesthetic (ReactBits-inspired)
- Orphan count shown as badge: "N orphan cards"

### Interaction

| Action | Behavior |
|--------|----------|
| **Click node** | Camera smoothly pans to center on node. Node pulses + enlarges. Connected edges highlight with traveling dots. Unconnected nodes/edges dim. Popover appears near node. |
| **Click popover chip** | Close current popover → camera flies to target node → new popover opens |
| **Click empty area** | Deselect, hide popover, restore all nodes to default state |
| **Drag canvas** | Pan (instant, no lerp) |
| **Scroll** | Zoom in/out (smooth lerp) |
| **Drag node** | Reposition node, physics re-settles on release |
| **Search** | Filter nodes visually (non-matches dim), camera pans to first match |
| **Double-click node** | Switch back to timeline view, scroll to and expand that card |

### Popover (near-node detail)

Floating card appears above/below the selected node (auto-positioned to avoid edges):

```
┌──────────────────────────┐
│ JWT revocation needs...  │
│ RETRO · 2026-03-19       │
│                          │
│ Stateless tokens can't   │
│ be revoked...            │
│                          │
│ [[stateless-auth]]       │
│ [[redis-session-store]]  │
└──────────────────────────┘
        ▼ (arrow pointing to node)
```

### Transitions (all state changes are lerped, no sudden jumps)

- **Camera**: smooth pan via `lerp(current, target, 0.1)` per frame
- **Node select**: size animates 1x → 1.3x, glow fades in, double pulse ring
- **Edge highlight**: alpha fades from base to active, traveling dot fades in
- **Dim/undim**: alpha transitions smoothly for non-selected elements

### Physics

- Force-directed: center gravity + node repulsion + edge spring attraction
- Runs at init, auto-stops when total velocity < threshold for 30 frames
- Re-kicks on node drag release
- No continuous animation when idle (only selected-node pulse ring animates)

### Data Source

Uses existing `/api/cards` and `/api/links` endpoints. No new backend needed.

---

## Architecture

### New Files

```
src/commands/serve-ui.html    — add graph view + share card (inline, same file)
src/commands/share.ts         — CLI share command
```

### serve-ui.html Changes

- Add "Graph" button in sidebar (below categories)
- Add graph canvas + popover markup (hidden by default)
- Add share button to expanded card view
- Add share card renderer (canvas-based)
- Toggle between timeline/graph modes

### CLI

```bash
memex share <slug>                    # generate PNG, write to stdout
memex share <slug> -o card.png        # write to file
memex share <slug> --theme midnight   # specific theme
```

## Out of Scope

- 3D graph / WebGL
- Real-time collaboration
- Graph layout persistence (positions recalculate each load)
- Animated background particles (static only)
- Export graph as image
