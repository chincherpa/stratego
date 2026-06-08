# WINNER-Screen Design

**Datum:** 2026-06-08
**Quelle:** [ideas.md:10](../../../ideas.md#L10) — "erobern der flagge wird nicht kenntlich gemacht. füge WINNER-screen hinzu"

## Problem

Wenn die Flagge erobert wird, geht das Spiel in `GameOver { winner }` über (Backend setzt das bereits, siehe [types.ts:75](../../../src/types.ts#L75)). Sichtbar ist das aktuell nur als kleine Statuszeile im Panel ("Gewonnen! 🎉" / "Verloren.", siehe [BoardPanel.tsx:207](../../../src/components/BoardPanel.tsx#L207)) — kein deutliches Sieger-Signal.

## Lösung

Neue Overlay-Komponente `WinnerScreen.tsx`, die bei `GameOver` einen deutlichen Sieger-Bildschirm zeigt — analog zum bestehenden `HandoffModal`.

### Architektur

- Komponente `src/components/WinnerScreen.tsx`, Props: `{ status: StatusDto }`
- Gerendert parallel zu `HandoffModal` in [App.tsx:24](../../../src/App.tsx#L24)
- Kein Backend-Change nötig — `winner: Side` liegt bereits im `GameOver`-Phase-DTO vor

### Verhalten

- Sichtbar wenn `status.phase.kind === "GameOver"` UND nicht lokal dismissed
- Lokaler State `dismissed` (`useState<boolean>`)
- `useEffect` setzt `dismissed` zurück auf `false`, sobald `phase.kind !== "GameOver"` — Overlay erscheint bei künftigen Partien wieder (auch wenn aktuell kein Reset-Pfad existiert, hält das die Komponente robust für später)
- Schließen-Button ("Board ansehen") setzt `dismissed = true`, gibt Blick aufs finale Board frei

### Inhalt & Styling

- Overlay-Struktur analog `.handoff-overlay` / `.handoff-modal` ([App.css:258](../../../src/App.css#L258))
- Modal-Akzentfarbe je nach Sieger-Team: `.winner-modal--blue` (Blau-Akzent `#2451c4`, passend zu `.handoff-modal__confirm`) / `.winner-modal--red` (Rot-Akzent)
- Titel: "Team {Blau/Rot} gewinnt!"
- Emojis: 🏆🚩 (Trophy + Flagge, da Flaggeneroberung der Auslöser ist)
- Ein Button: "Board ansehen" → schließt Overlay

### Out of Scope

- Kein Neustart-/Reset-Button (kein Backend-Command vorhanden, größerer Scope)
- Keine Eingangs-Animation/Konfetti (laut Nutzerentscheidung schlichter Stil)
- Kampf-/Draw-Animationen ([ideas.md:12](../../../ideas.md#L12)) — separates Thema, nicht Teil dieser Spec

## Testing

- Manuell: Spiel bis Flaggeneroberung durchspielen (oder Backend-State manipulieren), prüfen dass Overlay mit korrektem Team + Farbe erscheint, Schließen-Button funktioniert und Board sichtbar bleibt
