# State machines in «میز خدا» (Mafia host app)

A map of the state machines in the code, for people and agents.
Read this before touching game flow, and update it when you add a state.

## 1. App screen — `src/App.tsx` (`activeScreen`)

`HOME → GAME_CREATOR → PLAYING`, `HOME → PLAYING` (join / resume), `PLAYING → HOME`, `GAME_CREATOR → HOME`.
A join link (`?room=…`) jumps straight to `PLAYING`.

## 2. View mode — `src/App.tsx` (`viewMode`)

`HOST | PLAYER | DUAL`. Independent of the screen; only meaningful while `PLAYING`.

## 3. Game phase — `src/types/mafia.ts` (`GamePhase`, stored in `room.phase`)

This is the one explicit machine. It changes only through `dispatchAction('SET_PHASE', { phase, dayNumber? })`.

Normal order:

`LOBBY → RULES_REVIEW → ROLE_DEAL → INTRO_DAY → INTRO_NIGHT →`
`[ DAY_DISCUSSION → DAY_ACCUSATION → DAY_DEFENSE → DAY_VOTING → DAY_LAST_WORDS → NIGHT ]` repeated `→ GAME_OVER`

The host (God) may jump to any phase on purpose; the code does not reject out-of-order jumps.
Do not add transition guards without asking: free jumps are a host feature, not a bug.

## 4. Sync — `src/App.tsx` (`isOnline`, `isSyncing`, `connectionError`, `latencyMs`)

Four separate values describing one connection: effectively `online-idle | syncing | offline-local | error`.
When the backend call fails, `dispatchAction` applies the same action locally (optimistic fallback),
so every action type must be handled in **both** places: the server and the fallback block in `App.tsx`.

## 5. Modals — `src/App.tsx`

About 25 independent `isXOpen` booleans. Nothing stops two being open together.
When adding a modal, close the one that opened it; do not add a 26th flag if an existing modal can host the content.

## Safety note

This repo has no automated tests. Any change to `dispatchAction` or phase handling should come with a test first.
