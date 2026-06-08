# Game Settings (Handover-Popup & Permanent-Reveal Toggles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a settings overlay (gear button, top-center) with two persisted toggles: one to skip the handover-confirmation popup (auto-confirm instead), one to stop showing permanently-revealed enemy ranks (mask them back to hidden card-backs once the combat banner ends).

**Architecture:** Pure frontend change, no backend touch. A new `useSettings` hook reads/writes two booleans to `localStorage` (default both `true`, matching today's behavior). A new `SettingsPanel` component renders the gear button + overlay, styled like the existing `HandoffModal`/`WinnerScreen` overlays. `App` wires the settings into existing components: gates `HandoffModal` rendering and adds an auto-confirm `useEffect` for the popup toggle; threads a `permanentRevealEnabled` flag down through `BoardPanel` → `Square` → `Piece` for the reveal toggle, which masks revealed-but-not-currently-animating enemy pieces back to the hidden card-back look.

**Tech Stack:** React 19 + TypeScript (existing), `localStorage` for persistence, no new dependencies.

> **Note on testing:** This codebase has no automated frontend test setup (no vitest/jest in [package.json](../../../package.json), no `*.test.ts` files — only Rust unit tests in `src-tauri/src/game/rules.rs`). Verification here is manual: run the Tauri dev app and click through both toggles, mirroring how `HandoffModal`/`WinnerScreen` were checked (see [2026-06-08-winner-screen.md](2026-06-08-winner-screen.md)).
>
> **Note on git:** This directory is not a git repository (`git status` → "not a git repository"). Skip all commit steps — just check off each step as completed.
>
> **Note on package manager:** Use `pnpm`, not `npm`/`yarn`.

---

### Task 1: Create the `useSettings` hook

**Files:**
- Create: `src/useSettings.ts`

- [ ] **Step 1: Write the hook**

```ts
import { useEffect, useState } from "react";

export type Settings = {
  handoffPopupEnabled: boolean;
  permanentRevealEnabled: boolean;
};

const STORAGE_KEY = "stratego-settings";

const DEFAULT_SETTINGS: Settings = {
  handoffPopupEnabled: true,
  permanentRevealEnabled: true,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      handoffPopupEnabled:
        typeof parsed.handoffPopupEnabled === "boolean" ? parsed.handoffPopupEnabled : DEFAULT_SETTINGS.handoffPopupEnabled,
      permanentRevealEnabled:
        typeof parsed.permanentRevealEnabled === "boolean"
          ? parsed.permanentRevealEnabled
          : DEFAULT_SETTINGS.permanentRevealEnabled,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Two player-facing display preferences, persisted in `localStorage` so they
 * survive app restarts. Both default to `true` — today's behavior — so a
 * player has to deliberately opt into the "leaner"/"hardcore" variants.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  return {
    settings,
    setHandoffPopupEnabled: (value: boolean) => setSettings((s) => ({ ...s, handoffPopupEnabled: value })),
    setPermanentRevealEnabled: (value: boolean) => setSettings((s) => ({ ...s, permanentRevealEnabled: value })),
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors mentioning `useSettings.ts`

---

### Task 2: Create the `SettingsPanel` component (gear button + overlay)

**Files:**
- Create: `src/components/SettingsPanel.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from "react";

type Props = {
  handoffPopupEnabled: boolean;
  permanentRevealEnabled: boolean;
  onToggleHandoffPopup: (next: boolean) => void;
  onTogglePermanentReveal: (next: boolean) => void;
};

export function SettingsPanel({
  handoffPopupEnabled,
  permanentRevealEnabled,
  onToggleHandoffPopup,
  onTogglePermanentReveal,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="settings-button" title="Einstellungen" onClick={() => setOpen(true)}>
        ⚙
      </button>
      {open && (
        <div className="settings-overlay" onClick={() => setOpen(false)}>
          <div className="settings-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="settings-modal__close"
              aria-label="Einstellungen schließen"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <h3>Einstellungen</h3>
            <label className="settings-toggle-row">
              <input
                type="checkbox"
                checked={handoffPopupEnabled}
                onChange={(event) => onToggleHandoffPopup(event.target.checked)}
              />
              <span>
                <strong>Übergabe-Popup anzeigen</strong>
                <small>Bei jedem Seitenwechsel erst bestätigen, statt sofort zu übergeben.</small>
              </span>
            </label>
            <label className="settings-toggle-row">
              <input
                type="checkbox"
                checked={permanentRevealEnabled}
                onChange={(event) => onTogglePermanentReveal(event.target.checked)}
              />
              <span>
                <strong>Aufgedeckte Ränge dauerhaft zeigen</strong>
                <small>
                  Figuren, die im Kampf waren, bleiben für beide sichtbar. Aus = wie am echten Brett — Rang selbst
                  merken.
                </small>
              </span>
            </label>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors mentioning `SettingsPanel.tsx`

---

### Task 3: Add settings styles

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Append the settings styles to the end of the file**

The file currently ends at [App.css:471](../../../src/App.css#L471) with the `.winner-modal__dismiss` block. Append after it:

```css

.settings-button {
  position: fixed;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  border: 1px solid #ccc;
  background: #fff;
  font-size: 1.3rem;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  z-index: 40;
}

.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 15, 15, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 70;
}

.settings-modal {
  position: relative;
  background: #fff;
  border-radius: 12px;
  padding: 2rem 2.5rem;
  max-width: 28rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
}

.settings-modal h3 {
  margin-top: 0;
}

.settings-modal__close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: 1px solid transparent;
  background: #f0f0f0;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  color: #333;
}

.settings-toggle-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-top: 1.25rem;
  cursor: pointer;
}

.settings-toggle-row input {
  margin-top: 0.25rem;
}

.settings-toggle-row span {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.settings-toggle-row small {
  color: #666;
}
```

- [ ] **Step 2: Verify the dev server still starts cleanly**

Run: `pnpm tauri dev`
Expected: app launches without CSS/build errors (leave it running for later manual checks)

---

### Task 4: Mask permanently-revealed enemy pieces when the toggle is off

**Files:**
- Modify: `src/components/Piece.tsx`
- Modify: `src/components/Square.tsx`
- Modify: `src/components/BoardPanel.tsx`

- [ ] **Step 1: Add a `forceHidden` prop to `Piece`**

Replace the full contents of [Piece.tsx](../../../src/components/Piece.tsx):

```tsx
import { RANK_LABEL, type Rank, type Side } from "../types";

type Props = {
  owner: Side;
  rank: Rank | null;
  /** True when this square belongs to the panel's own side. */
  own: boolean;
  /** Render as a hidden card-back even though `rank` is known — used to mask
   * permanently-revealed enemy pieces when that display setting is off. */
  forceHidden?: boolean;
};

export function Piece({ owner, rank, own, forceHidden }: Props) {
  if (rank === null || forceHidden) {
    return (
      <div className={`piece piece--hidden piece--${owner.toLowerCase()}`} title="Verdeckte gegnerische Figur" />
    );
  }
  return (
    <div
      className={`piece piece--revealed piece--${owner.toLowerCase()} ${own ? "piece--own" : "piece--enemy"}`}
      title={rank}
    >
      {RANK_LABEL[rank]}
    </div>
  );
}
```

- [ ] **Step 2: Compute masking in `Square` and pass it down**

In [Square.tsx](../../../src/components/Square.tsx), replace the full contents:

```tsx
import { CombatBanner } from "./CombatBanner";
import { Piece } from "./Piece";
import type { CombatResult, SquareView, Side } from "../types";

type Props = {
  square: SquareView;
  /** The side this panel belongs to — determines whether a piece on this square is "ours". */
  panelSide: Side;
  selected: boolean;
  legalTarget: boolean;
  clickable: boolean;
  /** Set only on the square where a clash just resolved, for the brief animation window. */
  combat?: CombatResult | null;
  /** When false, enemy pieces that were revealed by past combat are masked
   * back to the hidden card-back look — except the square currently showing
   * the combat banner, which always reveals both ranks regardless. */
  permanentRevealEnabled: boolean;
  onClick: () => void;
};

export function Square({
  square,
  panelSide,
  selected,
  legalTarget,
  clickable,
  combat,
  permanentRevealEnabled,
  onClick,
}: Props) {
  const classes = ["square"];
  if (square.kind === "Lake") classes.push("square--lake");
  if (square.kind === "Empty") classes.push("square--empty");
  if (square.kind === "Piece") classes.push("square--piece");
  if (selected) classes.push("square--selected");
  if (legalTarget) classes.push("square--legal-target");
  if (clickable) classes.push("square--clickable");

  const maskRevealed =
    !permanentRevealEnabled &&
    square.kind === "Piece" &&
    square.owner !== panelSide &&
    square.rank !== null &&
    !combat;

  return (
    <div className={classes.join(" ")} onClick={clickable ? onClick : undefined}>
      {square.kind === "Piece" && (
        <Piece owner={square.owner} rank={square.rank} own={square.owner === panelSide} forceHidden={maskRevealed} />
      )}
      {combat && <CombatBanner result={combat} />}
    </div>
  );
}
```

- [ ] **Step 3: Thread `permanentRevealEnabled` through `BoardPanel`**

In [BoardPanel.tsx:26-33](../../../src/components/BoardPanel.tsx#L26-L33), add the new prop to the `Props` type:

```tsx
type Props = {
  side: Side;
  view: BoardView;
  status: StatusDto;
  /** Clash currently animating (shared from useGame so both panels — and
   * App's handoff gate — agree on when the banner is up). */
  combat: CombatResult | null;
  /** Display preference: when false, mask permanently-revealed enemy pieces
   * back to hidden card-backs (outside the live combat-banner square). */
  permanentRevealEnabled: boolean;
};
```

In [BoardPanel.tsx:90](../../../src/components/BoardPanel.tsx#L90), add the prop to the destructured function signature:

```tsx
export function BoardPanel({ side, view, status, combat, permanentRevealEnabled }: Props) {
```

In [BoardPanel.tsx:207-217](../../../src/components/BoardPanel.tsx#L207-L217), pass it on to `Square`:

```tsx
        <Square
          key={`${pos.row}-${pos.col}`}
          square={square}
          panelSide={side}
          selected={highlightedFrom !== null && samePos(highlightedFrom, pos)}
          legalTarget={targets.some((t) => samePos(t, pos))}
          clickable={interactive}
          combat={combat && combat.row === pos.row && combat.col === pos.col ? combat : null}
          permanentRevealEnabled={permanentRevealEnabled}
          onClick={() => handleClick(pos, square)}
        />,
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors mentioning `Piece.tsx`, `Square.tsx`, or `BoardPanel.tsx`

---

### Task 5: Wire `useSettings` + `SettingsPanel` into `App`, gate the handover popup

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update the imports**

Replace [App.tsx:1-5](../../../src/App.tsx#L1-L5):

```tsx
import { BoardPanel } from "./components/BoardPanel";
import { HandoffModal } from "./components/HandoffModal";
import { WinnerScreen } from "./components/WinnerScreen";
import { useGame } from "./useGame";
import "./App.css";
```

with:

```tsx
import { useEffect } from "react";
import { api } from "./api";
import { BoardPanel } from "./components/BoardPanel";
import { HandoffModal } from "./components/HandoffModal";
import { SettingsPanel } from "./components/SettingsPanel";
import { WinnerScreen } from "./components/WinnerScreen";
import { useGame } from "./useGame";
import { useSettings } from "./useSettings";
import "./App.css";
```

- [ ] **Step 2: Add the settings hook and the auto-confirm effect**

Replace [App.tsx:7-8](../../../src/App.tsx#L7-L8):

```tsx
function App() {
  const { status, blueView, redView, activeCombat } = useGame();
```

with:

```tsx
function App() {
  const { status, blueView, redView, activeCombat } = useGame();
  const { settings, setHandoffPopupEnabled, setPermanentRevealEnabled } = useSettings();

  // When the handover popup is disabled, skip the confirmation step entirely —
  // confirm the instant a handoff becomes pending, same as if the player had
  // clicked through immediately (cursor still jumps via the backend command).
  useEffect(() => {
    if (settings.handoffPopupEnabled) return;
    if (status?.pending_handoff) {
      api.confirmHandoff();
    }
  }, [settings.handoffPopupEnabled, status?.pending_handoff]);
```

- [ ] **Step 3: Render `SettingsPanel`, gate `HandoffModal`, pass the reveal flag down**

Replace [App.tsx:18-31](../../../src/App.tsx#L18-L31):

```tsx
  return (
    <main className="app">
      <div className="app__panels">
        <BoardPanel side="Blue" view={blueView} status={status} combat={activeCombat} />
        <div className="app__divider" title="Hier den Pappkarton aufkleben" />
        <BoardPanel side="Red" view={redView} status={status} combat={activeCombat} />
      </div>
      {/* Held back until the clash banner finishes — otherwise the popup,
          which appears the instant `pending_handoff` is set, covers it. */}
      {!activeCombat && <HandoffModal status={status} />}
      <WinnerScreen status={status} />
    </main>
  );
```

with:

```tsx
  return (
    <main className="app">
      <SettingsPanel
        handoffPopupEnabled={settings.handoffPopupEnabled}
        permanentRevealEnabled={settings.permanentRevealEnabled}
        onToggleHandoffPopup={setHandoffPopupEnabled}
        onTogglePermanentReveal={setPermanentRevealEnabled}
      />
      <div className="app__panels">
        <BoardPanel
          side="Blue"
          view={blueView}
          status={status}
          combat={activeCombat}
          permanentRevealEnabled={settings.permanentRevealEnabled}
        />
        <div className="app__divider" title="Hier den Pappkarton aufkleben" />
        <BoardPanel
          side="Red"
          view={redView}
          status={status}
          combat={activeCombat}
          permanentRevealEnabled={settings.permanentRevealEnabled}
        />
      </div>
      {/* Held back until the clash banner finishes — otherwise the popup,
          which appears the instant `pending_handoff` is set, covers it.
          Also gated on the setting: when disabled, the effect above
          auto-confirms instead of ever showing this modal. */}
      {!activeCombat && settings.handoffPopupEnabled && <HandoffModal status={status} />}
      <WinnerScreen status={status} />
    </main>
  );
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors mentioning `App.tsx`, `SettingsPanel`, or `useSettings`

---

### Task 6: Manually verify both toggles end-to-end

With `pnpm tauri dev` running (from Task 3, Step 2 — restart it if it was stopped), reload the app window between checks so `useSettings` re-reads `localStorage` from a clean slate where noted.

- [ ] **Step 1: Open the settings overlay**

Click the ⚙ button at the top-center of the window. Confirm:
- Overlay appears centered with a dark backdrop, both toggle rows checked (defaults are `true`)
- Clicking the backdrop closes it; reopening and clicking the × button also closes it
- Clicking inside the white modal box does **not** close it

- [ ] **Step 2: Turn the handover popup off and confirm auto-confirm behavior**

With the overlay open, uncheck "Übergabe-Popup anzeigen", close the overlay. Place pieces during setup (or use the "Rest zufällig verteilen" button on both sides) and click "Aufstellung abschließen" on the first side. Confirm:
- No handoff modal appears
- Control passes to the other side immediately (board on the other side becomes interactive right away, the cursor jumps across)
- This keeps working for every subsequent handoff (e.g. after a move ends a turn)

- [ ] **Step 3: Turn the handover popup back on**

Re-open settings, re-check "Übergabe-Popup anzeigen". Trigger another handoff (e.g. make a move). Confirm the modal reappears with its usual 3-second auto-confirm countdown and manual buttons — i.e. today's original behavior is intact.

- [ ] **Step 4: Turn permanent-reveal off and check masking**

Re-open settings, uncheck "Aufgedeckte Ränge dauerhaft zeigen", close the overlay. Play moves until at least one combat has resolved (a piece survives and is now `revealed`). Confirm:
- During the ~1.6s combat banner, both ranks are shown as usual (banner is unaffected by the toggle)
- Once the banner disappears, the surviving enemy piece on that square renders as a plain hidden card-back (`piece--hidden`) — same look and `title="Verdeckte gegnerische Figur"` as a never-revealed enemy piece, indistinguishable from it
- Your own revealed pieces are unaffected (still show their rank, since `square.owner === panelSide`)

- [ ] **Step 5: Turn permanent-reveal back on**

Re-open settings, re-check "Aufgedeckte Ränge dauerhaft zeigen". Confirm previously-revealed enemy pieces immediately show their rank again on both panels (no reload needed — it's a pure render-time decision driven by the `revealed` flag the backend already sends).

- [ ] **Step 6: Verify persistence across a reload**

With both toggles left in a non-default state (e.g. both off), reload the app window. Confirm the ⚙ overlay still shows both checkboxes unchecked — i.e. `localStorage` round-trips correctly. Then re-check both (back to defaults) for a clean state going forward.

- [ ] **Step 7: Final compile check**

Run: `pnpm exec tsc --noEmit`
Expected: clean — confirms nothing was left in a broken state after manual testing
