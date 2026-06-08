# WINNER-Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a clear, dismissible overlay announcing the winning team when the game reaches `GameOver` (e.g. after a flag capture), since this transition currently only shows a small status-line text.

**Architecture:** New `WinnerScreen` component, rendered alongside the existing `HandoffModal` in `App.tsx`. It reads `status.phase` (already typed as `{ kind: "GameOver"; winner: Side }`), tracks a local `dismissed` flag, and resets that flag via `useEffect` whenever the phase leaves `GameOver`. Styling follows the existing `.handoff-overlay` / `.handoff-modal` pattern in `App.css`, with a team-colored accent border (`--blue` / `--red` modifier classes).

**Tech Stack:** React 19 + TypeScript (existing), no new dependencies. No backend change — `winner: Side` is already present in the `GameOver` phase DTO ([types.ts:75](../../../src/types.ts#L75)).

> **Note on testing:** This codebase has no automated test setup (no vitest/jest in [package.json](../../../package.json), no `*.test.ts` files). Verification here is manual: run the Tauri app, temporarily force a `GameOver` status to visually confirm the overlay, then revert the temporary override. This mirrors how `HandoffModal` would be checked.
>
> **Note on git:** This directory is not a git repository (`git status` → "not a git repository"). Skip all commit steps — just check off each step as completed.

---

### Task 1: Create the `WinnerScreen` component

**Files:**
- Create: `src/components/WinnerScreen.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useState } from "react";
import type { Side, StatusDto } from "../types";

type Props = {
  status: StatusDto;
};

const TEAM_NAME: Record<Side, string> = { Blue: "Blau", Red: "Rot" };

export function WinnerScreen({ status }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const isGameOver = status.phase.kind === "GameOver";

  useEffect(() => {
    if (!isGameOver) setDismissed(false);
  }, [isGameOver]);

  if (status.phase.kind !== "GameOver" || dismissed) return null;

  const winner = status.phase.winner;

  return (
    <div className="winner-overlay">
      <div className={`winner-modal winner-modal--${winner.toLowerCase()}`}>
        <p className="winner-modal__emoji">🏆🚩</p>
        <h2>Team {TEAM_NAME[winner]} gewinnt!</h2>
        <button type="button" className="winner-modal__dismiss" onClick={() => setDismissed(true)}>
          Board ansehen
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors mentioning `WinnerScreen.tsx` (pre-existing unrelated errors, if any, are not your concern here)

---

### Task 2: Render `WinnerScreen` in `App`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the import**

In [App.tsx:1-3](../../../src/App.tsx#L1-L3), add a new import line alongside the existing component imports:

```tsx
import { BoardPanel } from "./components/BoardPanel";
import { HandoffModal } from "./components/HandoffModal";
import { WinnerScreen } from "./components/WinnerScreen";
import { useGame } from "./useGame";
```

- [ ] **Step 2: Render it next to `HandoffModal`**

Replace [App.tsx:24](../../../src/App.tsx#L24):

```tsx
      <HandoffModal status={status} />
```

with:

```tsx
      <HandoffModal status={status} />
      <WinnerScreen status={status} />
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors mentioning `App.tsx` or `WinnerScreen`

---

### Task 3: Add overlay styles

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Append the winner-overlay styles**

After the `.handoff-modal__cancel` block ending at [App.css:305](../../../src/App.css#L305), add:

```css

.winner-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 15, 15, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
}

.winner-modal {
  background: #fff;
  border-radius: 12px;
  padding: 2rem 2.5rem;
  max-width: 28rem;
  text-align: center;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  border-top: 6px solid transparent;
}

.winner-modal--blue {
  border-top-color: #2451c4;
}

.winner-modal--red {
  border-top-color: #c42424;
}

.winner-modal__emoji {
  font-size: 2.5rem;
  margin: 0 0 0.5rem;
}

.winner-modal h2 {
  margin: 0 0 1.25rem;
}

.winner-modal__dismiss {
  padding: 0.6rem 1.4rem;
  border-radius: 8px;
  border: 1px solid transparent;
  font-weight: 600;
  background: #f0f0f0;
  border-color: #ccc;
  color: #333;
}
```

- [ ] **Step 2: Verify the dev server still starts cleanly**

Run: `pnpm tauri dev`
Expected: app launches without CSS/build errors (leave it running for Task 4)

---

### Task 4: Manually verify the overlay for both winners

Since there's no quick path to a real flag capture and no reset command, temporarily force the `GameOver` status to check the overlay, then revert.

**Files:**
- Temporarily modify, then revert: `src/App.tsx`

- [ ] **Step 1: Temporarily force a `GameOver` status for Blue**

In [App.tsx](../../../src/App.tsx#L7), change:

```tsx
  const { status, blueView, redView } = useGame();
```

to:

```tsx
  const { status: realStatus, blueView, redView } = useGame();
  const status = realStatus && { ...realStatus, phase: { kind: "GameOver" as const, winner: "Blue" as const } };
```

- [ ] **Step 2: Observe the overlay (Blue)**

With `pnpm tauri dev` running (from Task 3, Step 2), reload the app window. Confirm:
- Overlay appears centered with dark backdrop
- Modal has a **blue** top border, 🏆🚩 emoji, heading "Team Blau gewinnt!"
- "Board ansehen" button dismisses the overlay and reveals the board underneath
- Reloading the window brings the overlay back (because `dismissed` resets on mount)

- [ ] **Step 3: Switch the hardcoded winner to Red and re-check**

Change `"Blue" as const` to `"Red" as const` in the snippet from Step 1, reload, and confirm:
- Modal now has a **red** top border and heading "Team Rot gewinnt!"

- [ ] **Step 4: Revert the temporary override**

Change [App.tsx](../../../src/App.tsx#L7) back to its original form:

```tsx
  const { status, blueView, redView } = useGame();
```

- [ ] **Step 5: Final compile check**

Run: `pnpm exec tsc --noEmit`
Expected: clean — confirms the temporary override was fully removed and nothing else broke
