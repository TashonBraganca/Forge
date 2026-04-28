# FORGE — LLM Fine-Tuning Studio
# COMPLETE FRONTEND UI REDESIGN PROMPT v2.0
# For: AI Model (Claude/GPT) | Stack: Next.js 16, TypeScript, Tailwind CSS v4, Framer Motion, Zustand

---

## YOUR ROLE

You are a **world-class UI/UX engineer** and **visual designer** with 15 years of experience building premium developer tools. You have deep expertise in:
- Modern dashboard design (Linear, Raycast, Vercel, LM Studio)
- Rich data visualization (D3-quality charts, SVG animations)
- Micro-interactions and motion design
- Dark-mode-first aesthetic systems

You are redesigning the entire frontend of **Forge** — a local LLM fine-tuning studio. The app already has a working Next.js 16 codebase with Zustand stores, API client, and route structure. **Your job is to make it visually stunning.**

---

## DESIGN IDENTITY: "Molten Forge"

The visual identity is a **blacksmith's forge** — dark, warm, alive. Not brutalist. Not generic AI purple. Not cold or sterile. Think of it like:

> A premium tool forged in fire. Warm amber light emanates from the bottom of the viewport like a furnace. The interface is dark but never dead — subtle ember particles float upward, orange halos pulse behind key elements, and every interaction has weight and intention.

### Core Aesthetic Rules
1. **Background**: Pure black (#000000) with a living radial gradient glow at the bottom (warm amber/orange)
2. **Surfaces**: Cards use `rgba(15,14,12,0.85)` with 10-12px border-radius, subtle `rgba(255,85,0,0.06)` borders
3. **No brutalism**: Everything has rounded corners (8-12px). Surfaces have depth. Cards feel like glass over the forge.
4. **Color palette**:
   - Accent: `#FF5500` (forge orange)
   - Accent Hot: `#FF8C00` (bright amber)
   - Accent Glow: `#FFE4B5` (moccasin — used for text gradients at peak heat)
   - Accent Deep: `#CC3300` (deep ember red — gradient start)
   - Surface: `rgba(15,14,12,0.85)` — warm dark, never pure gray
   - Text Primary: `#FFFFFF` at 100% — fully readable, WCAG AAA
   - Text Secondary: `#CCCCCC` — body text, descriptions
   - Text Muted: `#888888` — labels, hints
   - Text Faint: `#555555` — disabled, decorative labels
   - Success: `#22C55E`
   - Error: `#EF4444`
   - Warning: `#F59E0B`
5. **Typography**:
   - Display/Headings: `Space Grotesk` — bold, tight tracking
   - Mono/Data/Labels: `JetBrains Mono` — crisp, code-like
   - Body: `Inter` or `Space Grotesk` regular
6. **Ember Particles**: 20-25 tiny orange dots float upward from bottom with CSS `@keyframes`. Generated client-side only (useEffect) to avoid SSR hydration mismatch. Each particle has randomized position, size (1-2.5px), animation duration (4-8s), and delay.
7. **Forge Glow**: Two overlapping radial gradients at the bottom of the viewport — a broad warm glow + a tighter bright core. This is the "furnace" beneath the interface.

---

## APP STRUCTURE

```
/ (redirects to /train)
/train     — The main training dashboard (80% of the UX)
/hub       — Model browser (Ollama + HuggingFace)
/models    — Previously trained/forged models with graphs
/playground — Chat with your models
```

**No sidebar.** Navigation is a 48px fixed header with centered nav tabs.

---

## SECTION 1: HEADER (48px, fixed, all pages)

```
┌─────────────────────────────────────────────────────────────────────┐
│  FORGE (gradient text)     HUB   TRAIN   MODELS   PLAYGROUND     ● STATUS │
└─────────────────────────────────────────────────────────────────────┘
```

- **"FORGE"** wordmark: `Space Grotesk`, 18px, bold. Text uses `linear-gradient(135deg, #FFE4B5, #FF5500)` with `-webkit-background-clip: text`. Should feel like molten metal.
- **Nav tabs**: `JetBrains Mono`, 11px, `letter-spacing: 0.12em`. Active tab = `#FF5500`, inactive = `#666`. Hover: smooth color transition.
- **Status indicator**: Right side. 6px dot + text. Pulsing orange when training, green when complete, dim when idle. The dot should have `box-shadow: 0 0 8px #FF5500` when active.
- **Background**: Solid `#000000`. Bottom border: `1px solid rgba(255,85,0,0.06)`.
- **Z-index**: 50 (above embers).

---

## SECTION 2: TRAIN PAGE — The Hero Dashboard

This is the most important page. It has TWO states managed by a Zustand store:

### State A: IDLE (Configure + Start)

The idle state should feel like a **landing page** for the forge — inviting, dramatic, with clear purpose.

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                           ┌────────┐                                │
│                           │ 🔥 icon│ (or stylized forge SVG)       │
│                           └────────┘                                │
│                                                                     │
│              FORGE YOUR MODEL                                       │
│    Fine-tune any LLM on your own hardware.                         │
│    Select a base model, configure, and strike.                     │
│                                                                     │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐    │
│  │    SELECT MODEL           │  │    CONFIGURATION              │    │
│  │                           │  │                               │    │
│  │  ● llama3.2:3b       3B  │  │  Method         QLoRA        │    │
│  │    mistral:7b         7B  │  │  LoRA Rank      16           │    │
│  │    phi3:mini        3.8B  │  │  Alpha           32           │    │
│  │    codellama:13b     13B  │  │  Epochs           3           │    │
│  │    gemma2:9b          9B  │  │  Learning Rate   2e-4        │    │
│  │    deepseek-r1:7b     7B  │  │  Batch Size       4           │    │
│  │    qwen2.5:7b         7B  │  │  Seq Length     2048          │    │
│  │    llama3.1:8b        8B  │  │  Dataset    alpaca_52k.jsonl │    │
│  │                           │  │                               │    │
│  └──────────────────────────┘  └──────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              STRIKE — BEGIN FORGING                          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### Hero Section Details:
- **Title "FORGE YOUR MODEL"**: `Space Grotesk`, 36-42px, bold. Apply the molten gradient: `linear-gradient(135deg, #FFE4B5, #FF8C00, #FF5500)` with `-webkit-background-clip: text`. Add `filter: drop-shadow(0 0 20px rgba(255,85,0,0.3))` for the halo.
- **Subtitle**: `Space Grotesk`, 15px, regular, color `#888`. Two lines max. Clean and informative.
- **Layout**: Everything centered. Max-width: `768px`. The two cards sit side-by-side in a 2-column grid with 20px gap.

#### Model Picker Card:
- Card surface with 10px radius, warm border
- Each model row: 44px height, `JetBrains Mono` 13px
- Selected model: `background: rgba(255,85,0,0.08)`, `border: 1px solid rgba(255,85,0,0.2)`, left indicator dot glows
- Unselected: transparent, hover shows subtle `rgba(255,255,255,0.02)` fill
- Param badge: right-aligned, `background: rgba(255,255,255,0.03)`, `border-radius: 4px`, small padding

#### Config Card:
- Same card surface
- Each row: key-value pair, key in `#888`, value in `#FF8C00`
- Values should be editable (input fields styled as plain text, border-bottom on focus)
- Rows have subtle background alternation `rgba(255,255,255,0.01)`

#### Strike Button:
- Full width, 54px height, 10px radius
- **Enabled**: `linear-gradient(135deg, #CC3300, #FF5500, #FF8C00)`, text `#000`, `box-shadow: 0 4px 30px rgba(255,85,0,0.25)`, active scale 0.998
- **Disabled**: `rgba(30,30,28,0.8)`, text `#444`, no shadow
- Text: `Space Grotesk`, 13px, bold, `letter-spacing: 0.15em`

### State B: TRAINING (Live Dashboard)

When training starts, the idle view animates out and the live dashboard animates in using `framer-motion` `AnimatePresence` with `mode="wait"`.

```
┌─────────────────────────────────────────────────────────────────────┐
│ ● FORGING · llama3.2:3b                              QLORA        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────────────────────┐  ┌──────┐ ┌──────┐             │
│  │                                │  │ LOSS │ │ EPOCH│             │
│  │          (halo glow)           │  │      │ │      │             │
│  │           ██ 34 ██             │  │0.7823│ │ 2/3  │             │
│  │            ██ % ██             │  │      │ │      │             │
│  │                                │  ├──────┤ ├──────┤             │
│  │  ░░░░░░░░░▓▓▓▓▓▓▓░░░░░░░░░░  │  │GPU °C│ │ VRAM │             │
│  │     (molten progress bar)      │  │ 72°C │ │ 84%  │             │
│  │                FORGED          │  │      │ │      │             │
│  └────────────────────────────────┘  └──────┘ └──────┘             │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  TEMPERING CURVE — LOSS OVER TIME                           │    │
│  │  ╲                                                          │    │
│  │   ╲                                                         │    │
│  │    ╲__                                                      │    │
│  │       ╲___                                                  │    │
│  │           ╲_____                                            │    │
│  │                 ╲_________                                  │    │
│  │  (gradient fill underneath, ember dots floating)            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌───────────────────────────────┐  ┌─────────────────────────┐    │
│  │  OUTPUT LOG                    │  │  FURNACE STATUS          │    │
│  │                                │  │                          │    │
│  │  > 12:34:05 [INFO] Loading... │  │  GPU CORE ████████░ 92% │    │
│  │  > 12:34:12 [METRICS] loss=.. │  │  VRAM     ███████░░ 84% │    │
│  │  > 12:34:18 [INFO] Step 102.. │  │  CPU      ███░░░░░░ 32% │    │
│  │  █ (blinking cursor)          │  │  RAM      ████░░░░░ 41% │    │
│  └───────────────────────────────┘  └─────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              HALT TRAINING            (red outline btn)     │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

#### Top Row: Progress Hero + Stats Grid

**Progress Hero (left, larger)**:
- Card with centered content
- **Behind the number**: A radial gradient halo `rgba(255,85,0,0.08)`, 250px diameter, blurred 40px. This is the "furnace glow" behind the number.
- **Progress Number**: `Space Grotesk`, **88px**, bold. Apply the full molten gradient: `linear-gradient(180deg, #FFE4B5 0%, #FF8C00 40%, #FF5500 70%, #CC3300 100%)`. `filter: drop-shadow(0 0 25px rgba(255,85,0,0.35))`.
- **"%" suffix**: Same font, 24px, color `#555`
- **Progress Bar**: Below the number. Max-width 320px, centered. 4px height. Track = `rgba(255,255,255,0.04)`. Fill = `linear-gradient(90deg, #CC3300, #FF5500, #FF8C00, #FFE4B5)` with `box-shadow: 0 0 14px rgba(255,85,0,0.5)`. Animate width with `motion.div`.
- **Hot tip**: A 10px blurred radial dot at the leading edge of the progress bar, creating a "molten tip" effect.
- **"FORGED" label**: Below bar, `JetBrains Mono`, 10px, `#555`, `letter-spacing: 0.15em`

**Stats Grid (right, 2x2)**:
- Four small cards: LOSS, EPOCH, GPU TEMP, VRAM
- Each card: centered, `Space Grotesk` 28px bold for value, `JetBrains Mono` 9px for label
- GPU Temp turns `#EF4444` above 80°C
- All values animate with `motion.div`

#### Loss Curve (full width):
- Raw SVG, no chart library
- Smooth cubic bezier interpolation between data points
- **Stroke**: `linear-gradient` from `#CC3300` -> `#FF5500` -> `#FF8C00`, 2px width, round caps
- **Glow**: `filter: drop-shadow(0 0 4px rgba(255,85,0,0.5))` on the path
- **Fill**: `linearGradient` from `rgba(255,85,0,0.2)` at top to transparent at bottom
- **Ember dots**: 8-10 tiny circles (0.6-1.5px) scattered within the chart area, using `ember-glow` animation
- **Grid lines**: 3 horizontal lines at 25%, 50%, 75% height, `rgba(255,85,0,0.04)`
- **Draw-in animation**: On first render, use `strokeDasharray` + `strokeDashoffset` animation
- **Container**: Card surface, 180px height, 8px border-radius

#### Terminal Log:
- Card with inner scrollable area (`overflow-y: auto`, 160-180px height)
- Inner area: `rgba(0,0,0,0.3)` background, 6px radius, 12px padding
- Each line: `JetBrains Mono` 11px, `line-height: 18px`
- Timestamp in `#444`, type tag colored (INFO `#666`, METRICS `#FF8C00`, ERROR `#EF4444`, WARN `#F59E0B`)
- Auto-scroll to bottom on new entries (`useEffect` with `scrollRef`)
- Blinking cursor: 5x12px orange block with `cursor-blink 1s step-end infinite`

#### Hardware Panel:
- Card with 4 horizontal meters (GPU CORE, VRAM, CPU, RAM)
- Label + value on one line, bar below
- Bar: 3px height, track `rgba(255,255,255,0.04)`, 2px radius
- GPU/VRAM bars use `#FF5500`/`#FF8C00` with subtle `box-shadow` glow
- CPU/RAM bars use `#666`
- Width animates with `motion.div`

#### Halt Button:
- Full width, 52px, 10px radius
- `background: transparent`, `border: 1px solid rgba(239,68,68,0.4)`, `color: #EF4444`
- Hover: `background: rgba(239,68,68,0.06)`

---

## SECTION 3: HUB PAGE

Model browser. Shows locally installed Ollama models + ability to search HuggingFace.

- **Title**: "Model Hub", `Space Grotesk` 22px bold, `#fff`
- **Search bar**: Full width card (10px radius, warm surface), 44px height, search icon + placeholder text
- **Filter chips**: Row of small pill buttons (6px radius). Active = orange border + text, inactive = subtle border + gray text
- **Model rows**: Each model is a card-row (10px radius, warm surface). Click to expand.
  - Row shows: Name (mono 13px, `#ddd`), Params (display 13px bold, `#777`), Format (mono 11px, `#555`), Size (mono 11px, `#666`), Status icon + label
  - Status: Downloaded = green check, Downloading = spinning loader, Available = download icon
  - Expanded: Description + DOWNLOAD button (gradient orange)
- **Stagger animation**: Each row fades in with 30ms stagger delay

---

## SECTION 4: MODELS PAGE (Previously Forged)

This page displays all previously fine-tuned models with rich visualizations. **Inspired by LM Studio's model management.**

- **Title**: "Forged Models", `Space Grotesk` 22px bold
- **Model Cards**: Each forged model gets a full card with:
  - Model name (`JetBrains Mono` 14px, `#eee`)
  - Base model + method + date as small badges
  - **Inline Sparkline**: A tiny 120x36px SVG loss curve showing the training trajectory. Smooth bezier. Orange gradient stroke with glow. Fill beneath.
  - **Final Loss**: Large `Space Grotesk` 22px bold in `#FF8C00`
- **Click to expand**: Right side panel slides in with:
  - Full-size loss curve (300x120px)
  - Training details (base model, method, final loss, date)
  - Action buttons: TEST, EXPORT, DELETE
- **Demo data**: Show 3 sample forged models when no real data exists
- **Empty state**: Centered text "No forged models yet. Train one to see it here." with dim styling

---

## SECTION 5: PLAYGROUND PAGE

Chat interface for testing your models.

- **Top bar**: 48px, model selector dropdown + temperature + settings icon
- **Chat area**: Full height minus header and input bar. Scrollable.
- **Empty state**: Big gradient "Playground" title (like the hero), subtitle "Chat with your forged models"
- **User messages**: Left orange bar (2px, glowing) + text
- **Assistant messages**: Card surface (10px radius, subtle border)
- **Typing indicator**: Blinking orange cursor block
- **Input bar**: Bottom, 56px. Clean input + styled send button (orange on active, gray when empty)

---

## SECTION 6: ANIMATIONS & INTERACTIONS

### Keyframes (define in globals.css):
```css
@keyframes ember-drift { from { transform: translateY(0) translateX(0); opacity: 0; } 10% { opacity: 1; } to { transform: translateY(calc(var(--drift-y) * -1)) translateX(var(--drift-x)); opacity: 0; } }
@keyframes ember-glow { 0%, 100% { opacity: 0.2; } 50% { opacity: 0.8; } }
@keyframes pulse-dot { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.7; } }
@keyframes cursor-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
@keyframes draw-path { to { stroke-dashoffset: 0; } }
```

### Framer Motion:
- Page transitions: `AnimatePresence mode="wait"`, opacity + subtle Y shift (8-12px)
- Card entrances: Stagger children with 50ms delay
- Progress bar: `motion.div` with `transition={{ duration: 0.8 }}`
- Expand panels: `motion.div` with `height: 0 -> auto`, `opacity: 0 -> 1`

---

## SECTION 7: EMBER BACKGROUND (Client Component)

**CRITICAL: Must be client-only to avoid SSR hydration mismatch.**

```tsx
'use client';
import { useEffect, useState } from 'react';

export default function EmberBackground() {
  const [embers, setEmbers] = useState([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only generate on client
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const generated = Array.from({ length: 22 }, ...); // randomized params
    setEmbers(generated);
    setVisible(true);
  }, []);

  if (!visible) return null;
  // ... render embers + glow divs
}
```

Do NOT use `useMemo` or inline `Math.random()` for ember generation — this causes SSR/client mismatch.

---

## SECTION 8: STATE MANAGEMENT (Zustand)

Already implemented. The stores live at:
- `src/store/training.ts` — Training state machine (idle -> preparing -> training -> completed)
- `src/store/models.ts` — Hub models, fine-tuned models, chat

The stores connect to a FastAPI backend at `http://localhost:8421` via `src/lib/api.ts`. When the backend is offline, they fall back to simulation mode with randomized data.

**Do not modify the store logic.** Only modify the UI components that consume the stores.

---

## SECTION 9: FILE STRUCTURE

```
src/
├── app/
│   ├── globals.css           <- Design system, variables, keyframes
│   ├── layout.tsx            <- Root layout with header + embers
│   ├── page.tsx              <- Redirect to /train
│   ├── train/page.tsx        <- Renders TrainView
│   ├── hub/page.tsx          <- Model browser
│   ├── models/page.tsx       <- Forged models gallery
│   └── playground/page.tsx   <- Chat interface
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── EmberBackground.tsx
│   │   └── BackendInit.tsx   <- Invisible, checks backend on mount
│   └── train/
│       └── TrainView.tsx     <- Main training state machine
├── store/
│   ├── training.ts
│   └── models.ts
├── lib/
│   ├── api.ts                <- Backend client with console logging
│   ├── mock-data.ts          <- Fallback data
│   └── utils.ts
└── types/
    └── index.ts
```

---

## SECTION 10: ANTI-PATTERNS (DO NOT DO THESE)

1. **No sidebar.** This app has zero sidebars. Navigation is header tabs only.
2. **No purple/blue AI gradients.** The palette is warm: orange, amber, moccasin.
3. **No 0px border-radius.** Everything has 6-12px rounded corners.
4. **No pure gray surfaces.** All dark surfaces have a warm undertone (use `12, 11, 10` not `20, 20, 20`).
5. **No Math.random() in SSR-rendered components.** Embers MUST be generated in `useEffect`.
6. **No chart libraries.** Loss curves are raw SVG with hand-crafted paths.
7. **No generic empty states.** Every page should feel alive, even without data.
8. **No low-contrast text.** All readable text must be `#888` minimum. Labels can be `#555`.
9. **No placeholder images.** If you need visuals, use SVG illustrations or the ember particle system.
10. **No brutalist flat design.** Every surface should have depth — gradient backgrounds, subtle borders, glows.

---

## SECTION 11: QUALITY CHECKLIST

Before considering the UI complete, verify:

- [ ] "FORGE" wordmark uses molten gradient text
- [ ] Ember particles float upward from bottom, no hydration errors
- [ ] Bottom forge glow is visible and warm
- [ ] Train idle state has hero title + subtitle centered
- [ ] Model picker has glowing dot on selected model
- [ ] Config values are displayed in amber `#FF8C00`
- [ ] Strike button has gradient + glow shadow when enabled
- [ ] Training progress number is 88px+ with molten gradient
- [ ] Progress bar has "hot tip" glow at leading edge
- [ ] Loss curve draws in on first render with stroke-dash animation
- [ ] Loss curve has fill gradient + floating ember dots
- [ ] Terminal log auto-scrolls with blinking cursor
- [ ] Hardware meters animate smoothly
- [ ] Models page shows sparkline charts per model
- [ ] Hub page search actually filters the model list
- [ ] Playground has gradient empty state title
- [ ] All text meets minimum contrast requirements
- [ ] `npm run build` passes with zero errors
- [ ] No hydration mismatch warnings in console

---

## DEPENDENCIES

```json
{
  "framer-motion": "^11.x",
  "zustand": "^5.x",
  "lucide-react": "^0.x",
  "@tanstack/react-query": "^5.x"
}
```

---

## HOW TO START

1. Read the existing code in `src/store/training.ts` and `src/store/models.ts` to understand the data shape
2. Start with `globals.css` — define all CSS variables, font imports, keyframe animations
3. Build `EmberBackground.tsx` (client-only, useEffect for particle generation)
4. Build `Header.tsx` with gradient wordmark
5. Build `TrainView.tsx` as a single component with both idle and training states
6. Build remaining pages: hub, models, playground
7. Run `npm run build` — fix any TypeScript errors
8. Visually verify each page for warmth, depth, and contrast
