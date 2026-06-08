# Game Settings: Handover-Popup & Permanent Reveal Toggles

## Problem

Zwei Verhaltensweisen sind aktuell fest verdrahtet, sollen aber per Spieler-Präferenz abschaltbar sein:

1. **Handover-Popup** — bei jedem Seitenwechsel erscheint `HandoffModal` mit 3s-Auto-Confirm-Timer und manuellen Buttons. Manche Spieler wollen den zügigeren Fluss ohne Klick/Warten.
2. **Permanente Rank-Sichtbarkeit** — sobald eine Figur in einen Kampf verwickelt war (`revealed = true`), zeigt das Backend ihren Rank für immer für beide Seiten (`square_view` in `state.rs`). Manche Spieler wollen die "Hardcore"-Variante, bei der man sich aufgedeckte Ränge selbst merken muss — wie am echten Brett, wo niemand ein Gedächtnisprotokoll führt.

Beide sollen über ein neues Settings-Overlay umschaltbar sein, persistiert über Sessions hinweg.

## Architektur-Entscheidung: Frontend-only

Beide Toggles werden **rein clientseitig** umgesetzt — kein Eingriff in den Rust-Backend-State:

- Das Spiel ist Hotseat (ein Bildschirm, beide Boards werden lokal gerendert) — es gibt keine Vertrauensgrenze, die ein serverseitiges Filtern rechtfertigen würde. Die Daten kommen ohnehin vollständig an beide Panels.
- Backend-seitiges Gating würde neue Tauri-Commands, AppState-Erweiterung und Synchronisation erfordern — Mehraufwand ohne funktionalen Gewinn.

Verworfene Alternative: Setting im `AppState` ablegen und `square_view` (state.rs:366) serverseitig filtern lassen. Mehr bewegliche Teile, kein zusätzlicher Nutzen bei einer Single-Machine-Hotseat-App.

## State & Persistierung

Neuer Hook `useSettings()` (`src/useSettings.ts`):

```ts
type Settings = {
  handoffPopupEnabled: boolean;
  permanentRevealEnabled: boolean;
};
```

- Liest/schreibt aus `localStorage` unter Key `stratego-settings` (JSON).
- Default bei fehlendem/kaputtem Eintrag: **beide `true`** — entspricht dem heutigen Verhalten, Spieler schaltet bewusst auf "Hardcore" um.
- Liefert `{ settings, setHandoffPopupEnabled, setPermanentRevealEnabled }`.
- Schreibt bei jeder Änderung synchron zurück nach `localStorage`.

## UI: Zahnrad-Button + Settings-Overlay

- Neuer `SettingsButton`: ⚙-Icon, `position: fixed`, mittig oben über dem `app__divider` platziert — von beiden Spielerhälften gleich erreichbar, unabhängig vom aktuellen Zug.
- Klick öffnet `SettingsPanel`-Overlay im selben visuellen Pattern wie `HandoffModal`:
  - `settings-overlay` (fixed, `inset: 0`, halbtransparenter Hintergrund — analog `handoff-overlay`)
  - `settings-modal` (zentrierter weißer Kasten, `border-radius: 12px` — analog `handoff-modal`)
  - Zwei `settings-toggle-row`-Zeilen: Checkbox + Label + kurze erklärende Unterzeile, je eine pro Toggle.
  - Schließen via X-Button oder Klick auf den Overlay-Hintergrund (nicht auf den Modal-Kasten selbst — Standard-Overlay-Stop-Propagation).
- Das Overlay pausiert das Spiel nicht — es liegt rein über der UI, Boardklicks bleiben durch `interactive`-Logik der Panels gesteuert wie bisher.

## Verkabelung der Toggle-Wirkung

### Handover-Popup aus (`handoffPopupEnabled === false`)

- `App.tsx` rendert `HandoffModal` nur noch, wenn `handoffPopupEnabled === true`.
- Stattdessen: ein `useEffect` in `App`, das bei Übergang `pending_handoff: null → Side` (und `handoffPopupEnabled === false`) sofort `api.confirmHandoff()` aufruft — kein Timer, kein Klick. Der Cursor-Jump (`cursor::jump_to_side`, läuft als Teil des Backend-Commands) bleibt dadurch unverändert erhalten.
- Der bestehende Combat-Banner-Gate (`{!activeCombat && <HandoffModal .../>}`) entfällt für den Fall `handoffPopupEnabled === false` automatisch, weil gar kein Modal gerendert wird — der `useEffect` feuert unabhängig vom Banner-Status. *(Reihenfolge: Banner zeigt zuerst die Kampf-Animation, `pending_handoff` steht parallel schon — Auto-Confirm während des Banners stört nicht, da das Board ohnehin durch `pending_handoff !== null` gesperrt ist.)*

### Permanent-Reveal aus (`permanentRevealEnabled === false`)

- Das Flag wird durchgereicht: `App` → `BoardPanel` → `Square` → `Piece`.
- Maskierungsregel in `Piece` (oder einer kleinen Helper-Funktion direkt davor): eine gegnerische Figur (`!own`) mit `rank !== null`, die **nicht** Teil des aktuell laufenden `combat`-Banners auf diesem Quadrat ist, wird **exakt** wie eine nie aufgedeckte Figur gerendert — gleiche Klasse `piece--hidden piece--{owner}`, gleicher Title `"Verdeckte gegnerische Figur"`. Kein Unterschied erkennbar zwischen "nie aufgedeckt" und "aufgedeckt, aber Toggle aus" — volle Authentizität, der Spieler kann sich nicht auf einen UI-Unterschied verlassen.
- Der Live-Combat-Banner (`CombatBanner`/`CombatResult`) bleibt unverändert: zeigt kurz beide vollen Ränge, wie bisher — er ist ein gemeinsames, gleichzeitiges Ereignis für beide Seiten und kein "permanentes Wissen" im eigentlichen Sinn.
- Die Maskierung ist rein eine Render-Entscheidung in `Piece`/`Square` — `BoardView` selbst bleibt unverändert (Backend liefert weiterhin `rank: Some(...)` für revealte Figuren).

## Styling

Neue CSS-Klassen in `App.css`, eng am bestehenden `handoff-*`-Pattern orientiert:

- `.settings-button` — fixed, mittig oben, kreisförmig, Icon zentriert
- `.settings-overlay` — analog `.handoff-overlay`
- `.settings-modal` — analog `.handoff-modal`
- `.settings-toggle-row` — Flex-Zeile: Checkbox, Label, Unterzeile
- `.settings-modal__close` — X-Button oben rechts im Modal

## Out of Scope

- Keine weiteren Settings über die zwei genannten Toggles hinaus.
- Keine Server-/Account-Synchronisation der Einstellungen — rein lokal pro Gerät (`localStorage`).
- Kein Eingriff in `revealed`-Flag oder `square_view` im Backend.
