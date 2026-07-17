# 3D Board Tilt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Ctrl+mouse-drag to tilt both board panels in 3D; pieces show CSS extrusion when tilted; clicks disabled above 30° tilt angle.

**Architecture:** New `useTilt` hook holds `{rotX, rotY}` state via `window` mouse event listeners. `App.tsx` applies CSS custom properties `--tilt-x`/`--tilt-y` to the `app__panels` wrapper; both `.board-grid` elements read them via CSS `transform`. `BoardPanel` gets an `isTiltLocked` prop that guards `handleClick`.

**Tech Stack:** React 19, TypeScript, CSS custom properties, CSS 3D transforms (`perspective`, `rotateX/Y`). No new dependencies.

---

## File Map

| File | Change |
|---|---|
| `src/useTilt.ts` | **Create** — hook: state, window listeners, isTiltLocked |
| `src/App.tsx` | **Modify** — consume `useTilt`, apply CSS vars + classes to `app__panels` |
| `src/components/BoardPanel.tsx` | **Modify** — add `isTiltLocked` prop, guard in `handleClick` |
| `src/App.css` | **Modify** — `.board-panel` perspective, `.board-grid` 3D transform, piece extrusion, lock cursor |

---

### Task 1: Create `src/useTilt.ts`

**Files:**
- Create: `src/useTilt.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useEffect, useRef, useState } from "react";

const SENSITIVITY = 0.3; // degrees per pixel
const MAX_ANGLE = 45;    // clamp for each axis
const LOCK_ANGLE = 30;   // √(rotX²+rotY²) threshold

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface TiltState {
  rotX: number;
  rotY: number;
  isActive: boolean;
  isTiltLocked: boolean;
}

export function useTilt(): TiltState {
  const [rotX, setRotX] = useState(0);
  const [rotY, setRotY] = useState(0);
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      dragging.current = true;
      lastPos.current = { x: e.clientX, y: e.clientY };
    }

    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };
      setRotX((prev) => clamp(prev + dy * SENSITIVITY, -MAX_ANGLE, MAX_ANGLE));
      setRotY((prev) => clamp(prev + dx * SENSITIVITY, -MAX_ANGLE, MAX_ANGLE));
    }

    function onMouseUp() {
      dragging.current = false;
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Control") dragging.current = false;
    }

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const isActive = rotX !== 0 || rotY !== 0;
  const isTiltLocked = Math.sqrt(rotX ** 2 + rotY ** 2) > LOCK_ANGLE;

  return { rotX, rotY, isActive, isTiltLocked };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/useTilt.ts
git commit -m "feat: add useTilt hook for Ctrl+drag 3D board rotation"
```

---

### Task 2: Add 3D CSS to `App.css`

**Files:**
- Modify: `src/App.css`

The `.board-panel` rule starts at line 51. `.board-grid` is at line 96. Append new rules after the existing piece styles (after line ~192).

- [ ] **Step 1: Add `perspective` to `.board-panel`**

In `App.css`, find the `.board-panel` block (line 51) and add `perspective`:

```css
.board-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  flex: 1;
  padding: 16px 12px 12px;
  perspective: 1200px;        /* ← add this line */
}
```

- [ ] **Step 2: Add 3D transform to `.board-grid`**

In `App.css`, find the `.board-grid` block (line 96) and add transform lines:

```css
.board-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 auto;
  width: min(100%, 700px);
  aspect-ratio: 1;
  transform: rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg));  /* ← add */
  transform-style: preserve-3d;                                            /* ← add */
}
```

- [ ] **Step 3: Add piece extrusion and lock styles**

Append at the end of `App.css`:

```css
/* ── 3D Tilt ──────────────────────────────────────────────────────── */

.board-tilt-active .piece--blue.piece--revealed {
  box-shadow: 0 6px 0 #1d4ed8, 0 10px 16px rgba(0, 0, 0, 0.6);
}

.board-tilt-active .piece--red.piece--revealed {
  box-shadow: 0 6px 0 #991b1b, 0 10px 16px rgba(0, 0, 0, 0.6);
}

.board-tilt-active .piece--blue.piece--hidden {
  box-shadow: 0 6px 0 #1e3a8a, 0 10px 16px rgba(0, 0, 0, 0.6);
}

.board-tilt-active .piece--red.piece--hidden {
  box-shadow: 0 6px 0 #7f1d1d, 0 10px 16px rgba(0, 0, 0, 0.6);
}

.board-tilt-locked .square--clickable {
  cursor: not-allowed;
}

.board-tilt-locked .square--clickable:hover {
  outline: none;
}
```

Note: `pointer-events: none` on `.square--clickable` would also block the `onClick` at DOM level, but since `handleClick` is guarded by the `isTiltLocked` prop (Task 3), the CSS-only guard is for cursor feedback. Keeping them consistent is fine.

- [ ] **Step 4: Commit**

```bash
git add src/App.css
git commit -m "feat: add CSS 3D board tilt and piece extrusion styles"
```

---

### Task 3: Wire `useTilt` into `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import `useTilt` and `CSSProperties`**

Add to the imports at the top of `src/App.tsx`:

```typescript
import { type CSSProperties, useEffect, useState } from "react";
import { useTilt } from "./useTilt";
```

(Replace the existing `import { useEffect, useState } from "react";` line.)

- [ ] **Step 2: Call the hook and apply to `app__panels`**

In `App.tsx`, add the `useTilt()` call after the existing hooks (line ~14):

```typescript
const { rotX, rotY, isActive, isTiltLocked } = useTilt();
```

Then update the `app__panels` div (line 46) to carry CSS vars and tilt classes:

```tsx
<div
  className={[
    "app__panels",
    isActive ? "board-tilt-active" : "",
    isTiltLocked ? "board-tilt-locked" : "",
  ]
    .filter(Boolean)
    .join(" ")}
  style={
    {
      "--tilt-x": `${rotX}deg`,
      "--tilt-y": `${rotY}deg`,
    } as CSSProperties
  }
>
```

- [ ] **Step 3: Pass `isTiltLocked` to both `BoardPanel` instances**

Both `<BoardPanel>` calls (lines ~47–63) need the new prop:

```tsx
<BoardPanel
  side="Blue"
  view={blueView}
  status={status}
  combat={activeCombat}
  permanentRevealEnabled={settings.permanentRevealEnabled}
  onOpenSettings={() => setSettingsOpen(true)}
  isTiltLocked={isTiltLocked}
/>
<div className="app__divider" title="Hier den Pappkarton aufkleben" />
<BoardPanel
  side="Red"
  view={redView}
  status={status}
  combat={activeCombat}
  permanentRevealEnabled={settings.permanentRevealEnabled}
  onOpenSettings={() => setSettingsOpen(true)}
  isTiltLocked={isTiltLocked}
/>
```

- [ ] **Step 4: Build check**

```bash
pnpm build
```

Expected: zero TypeScript errors. If `BoardPanel` props mismatch, fix in Task 4 first, then re-run.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire useTilt into App, apply CSS vars to app__panels"
```

---

### Task 4: Update `BoardPanel.tsx`

**Files:**
- Modify: `src/components/BoardPanel.tsx`

- [ ] **Step 1: Add `isTiltLocked` to the `Props` type**

In `BoardPanel.tsx`, find the `type Props` block (line 27) and add the new field:

```typescript
type Props = {
  side: Side;
  view: BoardView;
  status: StatusDto;
  combat: CombatResult | null;
  permanentRevealEnabled: boolean;
  onOpenSettings: () => void;
  isTiltLocked: boolean;
};
```

- [ ] **Step 2: Destructure `isTiltLocked` in the component signature**

Line 125 — update the destructure:

```typescript
export function BoardPanel({ side, view, status, combat, permanentRevealEnabled, onOpenSettings, isTiltLocked }: Props) {
```

- [ ] **Step 3: Guard `handleClick`**

Line 196 — add tilt lock guard as first check in `handleClick`:

```typescript
function handleClick(pos: Pos, square: SquareView) {
  if (isTiltLocked) return;
  if (!interactive) return;
  // ... rest unchanged
```

- [ ] **Step 4: Build check**

```bash
pnpm build
```

Expected: zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/BoardPanel.tsx
git commit -m "feat: disable board clicks when tilt angle exceeds 30 degrees"
```

---

### Task 5: Manual Verification

- [ ] **Step 1: Start the app**

```bash
pnpm tauri dev
```

- [ ] **Step 2: Verify tilt interaction**

  1. Hold `Ctrl` and drag mouse across a board panel → both boards tilt in X and Y axes simultaneously
  2. Release `Ctrl` → tilt angle stays frozen
  3. Hold `Ctrl` again and drag → angle changes from the frozen position

- [ ] **Step 3: Verify piece extrusion**

  1. While board is flat (0°/0°) → pieces have no box-shadow
  2. Tilt slightly → pieces show coloured bottom shadow (blue pieces: dark blue shadow, red pieces: dark red shadow)

- [ ] **Step 4: Verify click lock**

  1. Drag to a clearly steep angle (>30°) → `cursor: not-allowed` appears on board squares
  2. Click a piece → nothing happens (no selection, no move)
  3. Drag back below 30° → clicks work again normally

- [ ] **Step 5: Verify existing gameplay unaffected**

  1. Start a new game (Settings → Neue Partie)
  2. Complete setup for both sides without touching tilt
  3. Make several moves → normal gameplay works, no regressions in combat/handoff flow
