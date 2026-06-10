# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A hot-seat Stratego desktop game (Tauri 2 + React 19 + TypeScript + Vite). One borderless-fullscreen window is split into two mirrored halves — Blue left, Red right — and the two players sit side by side with a physical cardboard divider taped to the screen's centre line so neither can see the other's half. UI text is German.

## Commands

Use **pnpm**, never npm/yarn (user preference; ignore the `npm run dev` string in `src-tauri/tauri.conf.json` — Tauri invokes it internally).

- `pnpm tauri dev` — run the app (Vite dev server on port 1420 + Rust backend)
- `pnpm tauri build` — production build/bundle
- `pnpm build` — `tsc && vite build`; use this for a TypeScript type-check
- `cd src-tauri; cargo test` — Rust tests (game rules tests live in `src-tauri/src/game/rules.rs`)
- `cd src-tauri; cargo test rules` — run just the rules test module
- There is no JS test runner and no linter configured.

## Architecture

**All game logic lives in Rust; the frontend is a dumb view.** The backend decides what each player may see — never implement visibility/hiding logic in React.

### Backend (`src-tauri/src/`)

- `game/` — pure game logic, no Tauri types:
  - `piece.rs` — `Side`, `Rank` (strength table, per-rank counts, `is_static` for Bomb/Flag)
  - `board.rs` — 10×10 `Board`, lake cells, home rows (Red rows 0–3, Blue rows 6–9)
  - `rules.rs` — stateless validation: `validate_move` (orthogonal single step; Scout slides rook-style any distance over empty squares), `validate_placement`, `resolve_combat` (special cases: Spy attacking Marshal wins, Miner attacking Bomb wins, Flag capture ends game), `has_legal_move`
  - `state.rs` — `GameState`: phase machine `SetupBlue → SetupRed → Playing(side) → GameOver(winner)`, plus the handoff/undo mechanism and `square_view` (per-viewer visibility filter: own pieces show rank, revealed pieces show rank to all, other opponent pieces show as hidden card-back, and during setup the opponent's pieces are *completely invisible*)
- `commands.rs` — thin `#[tauri::command]` wrappers over `Mutex<GameState>` (`AppState`). Every successful mutation emits the `state-changed` event; combats additionally emit `combat-resolved` with a `CombatResultDto`.
- `cursor.rs` — uses `enigo` to physically jump the OS mouse cursor to the centre of the half that gains control after a handoff (so a player doesn't reach across the divider).
- `lib.rs` — registers commands and forces the window borderless-fullscreen in `setup` so the panel divider lands exactly on the physical screen centre (required by both the cardboard divider and the cursor-jump math).

### The handoff mechanism (core invariant)

Turn-ending actions (`make_move`, `finish_setup`) do **not** switch phase directly. They:
1. snapshot the board into `undo_snapshot`,
2. queue the next phase in `pending_transition`,
3. set `pending_handoff = Some(acting_side)` (and `pending_attack` if the move was a capture).

While a handoff is pending, every other mutating command is rejected (`HandoffPending`). The frontend shows a popup: "Übergeben" → `confirm_handoff` (applies phase, clears snapshot, jumps cursor) or "Ich überlege noch einmal" → `cancel_handoff` (restores the snapshot; **refused after an attack**, since revealed combat can't be taken back). Game-ending moves skip the handoff entirely.

### Frontend (`src/`)

- `api.ts` — typed wrappers around `invoke` and the two events; `types.ts` mirrors the Rust DTOs (serde uses `tag: "kind"` for `SquareView`/`PhaseDto` enums).
- `useGame.ts` — single source of truth: fetches status + **both** board views on every `state-changed` event. Both `BoardPanel`s are always rendered; secrecy is purely the backend's `square_view` filter.
- `useSettings.ts` — two display preferences persisted in `localStorage` (`handoffPopupEnabled`, `permanentRevealEnabled`). When the handoff popup is disabled, `App.tsx` auto-calls `confirmHandoff` the instant one becomes pending.
- `App.tsx` holds the handoff modal back while a combat banner is showing. `COMBAT_BANNER_DURATION_MS` in `useGame.ts` must stay in sync with the `combat-banner-pop` animation in `App.css`.

### Adding a new command

Add the method on `GameState`, wrap it in `commands.rs` (call `notify(&window)` on success), register it in `lib.rs`'s `generate_handler!`, then add the typed wrapper in `src/api.ts`.
