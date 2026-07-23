# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

AquaControl_Brain is the central webservice for the AquaControl aquarium automation ecosystem —
a Node.js/Express/SQLite backend (`server/`) + a React/Vite dashboard (`client/`). It's the
intermediary between two sibling ESP32 firmware projects in the same `aquario/` folder:
`AquaControl_Hardware` (16-channel relay board, plain GPIO — see its own `01-espc-geral/11_*`/`12_*`
specs) and `AquaControl_OS` (the CYD touchscreen Display). Neither ESP32 talks to the other
directly anymore — the Brain polls Hardware for relay state and pushes it to the Display, proxies
relay commands from the dashboard to Hardware, and handles the Display's QR code library and Modo
Panico. See `01-espc-geral/09_display_webservice.md` for that architecture.

**All work in this ecosystem is driven by numbered spec files in `../01-espc-geral/`** — read the
relevant one before implementing a feature; they're the source of truth for contracts/behavior,
more authoritative than this summary if they diverge.

## Run / build

```
cd server && npm start        # backend, port 5000 by default (see server/src/config/env.js)
cd server && npm run dev      # backend with nodemon (auto-restart on file change)
cd client && npm run dev      # Vite dev server, port 5173, proxies /api to :5000
cd client && npm run build    # production build (dist/)
```

No test suite, no lint config, in either half of this project.

## Backend (`server/`)

- **Database**: SQLite via Node's built-in `node:sqlite` (`DatabaseSync`), not `better-sqlite3`
  (native compilation failed on the dev machine — no working Python/node-gyp toolchain). API is
  near-identical (`db.prepare(sql).all()/.get()/.run()`), but there's no `db.transaction()` helper
  — multi-statement writes use manual `db.exec('BEGIN')` / `COMMIT` / `ROLLBACK` (see
  `qrcodesController.js:ativarQrcode` or `temasController.js:criarTema` for the pattern).
- **Migrations** (`server/src/database/migrate.js`): idempotent `CREATE TABLE IF NOT EXISTS` +
  ad-hoc `ALTER TABLE ... ADD COLUMN` (guarded by a `colunaExiste()` check) run automatically every
  boot via `db.js` — no manual migration step needed, `npm run migrate` just re-applies the same
  idempotent script standalone if you want to run it without booting the server.
- **Layering**: `routes/*.js` (thin, just wires HTTP verb+path to a controller function) →
  `controllers/*.js` (parses request, calls services, shapes the HTTP response) →
  `services/*.js` (the actual logic/DB queries, reusable across controllers). When two controllers
  need the same "talk to the ESP and apply a safety rule" logic (e.g. both direct relay clicks and
  Temas application need to zero out disabled ports), put it in a service and have both controllers
  call it — see `services/relesService.js:aplicarRelesNoModulo`, shared by
  `relesController.js:acionarReles` and `temasController.js:aplicarTema`.
- **Response convention for "talks to an ESP" endpoints**: always HTTP 200, with a
  `{ disponivel: true/false, motivo?, ...}` body — never 502/503 for "the ESP didn't respond".
  Reason: the browser logs any 4xx/5xx fetch response as a red console error automatically, even
  inside a try/catch, and "ESP unreachable" is a normal/expected state during bench work, not a
  programming bug. 404 is still used for "this ID doesn't exist in our own DB" — that's a real
  client-usage error, not a hardware-availability one.

## Frontend (`client/`)

Sci-Fi HUD dashboard (`01-espc-geral/05_dashboard_futurista_react.md`): Orbitron/Share Tech Mono
fonts, cyan/blue neon theme (`src/styles/theme.css` — override the CSS variables there to reskin
everything at once, e.g. `.dashboard--panico` in `theme.css` retints the whole app red for Modo
Panico purely by overriding variables, no component needs to know panic mode exists).

- **`Dashboard.jsx`** owns essentially all state (modules, relay state, port mapping, temas,
  widget visibility, logs, panic mode) and passes it down as props — components underneath are
  mostly presentational. When adding a new piece of shared state that two sibling widgets both
  need (e.g. port mapping needed by both Central do Aquário and the 16CH matrix), lift it into
  `Dashboard.jsx` rather than having each widget fetch its own copy.
- **`useEffect` dependency gotcha**: several pieces of state (`modulos`, and therefore
  `moduloAtuador = modulos.find(...)`) are refreshed by a periodic poll (`buscarModulos`, every 8s).
  Each poll produces a **new object reference** even when the data is identical (fresh
  `JSON.parse`). Any `useEffect` that depends on the whole `moduloAtuador` object (instead of
  `moduloAtuador?.id`) will re-fire every 8s — this caused a real bug once (`ModalMapeamentoPortas`
  re-fetched and wiped out whatever the user was mid-typing in a port name field). **Always depend
  on `?.id`, never the object itself**, for anything derived from `modulos`.
- **Widget visibility vs. the Menu of Actions**: dashboard cards can be shown/hidden via
  "Layout / Widgets" (persisted to `localStorage`). Some of those cards are the *only* way to open
  a configuration modal (e.g. the gear icon inside "Central do Aquário" opens Port Mapping). If a
  user hides that widget, the modal becomes unreachable — which is why `MenuAcoes` exists: a
  hamburger-icon button in the header, always visible regardless of widget visibility, listing
  quick actions that open the same modals directly.

  **Convention (see `01-espc-geral/14_menu_de_acoes.md`): any new feature that opens a
  configuration/action modal (not a passive display-only widget) MUST get an entry added to the
  `itensMenu` array in `Dashboard.jsx`.** The modal's own open/close state must live in
  `Dashboard.jsx` (not inside the widget that also opens it), so both the widget's own button and
  the Menu control the same modal instance — see `PainelTemas.jsx` (`onAbrirCriarTema` prop) vs.
  the old pattern of a widget owning its own modal state.
- **Custom tooltips**: native `title=""` attributes render an inconsistent, unstyled browser
  tooltip that clashes with the HUD look. Where a tooltip matters (e.g. relay names in the 16CH
  matrix), use the `.hud-tooltip` CSS class + `data-tooltip="..."` attribute (see `hud.css`) instead
  of `title`— pure CSS `::after` popup styled to match the theme, only rendered when
  `data-tooltip` is non-empty.

## Dependencies

- **Server**: `express`, `cors`, `dotenv`. That's it — no ORM (raw SQL via `node:sqlite`), no auth
  (LAN-only tool, not exposed to the internet).
- **Client**: `react`/`react-dom` 18, `vite` 5, `framer-motion` (list enter/exit animations,
  panel transitions), `recharts` (temperature graphs), `lucide-react` (all icons).

## Notes for future work

- Comments and identifiers are in Portuguese, matching the sibling ESP32 firmware projects — keep
  that convention when editing.
- Read the relevant `01-espc-geral/NN_*.md` spec before changing any contract shared with
  `AquaControl_Hardware` or `AquaControl_OS` — they're built/flashed independently, so a mismatch
  isn't caught at compile time, only at runtime.
