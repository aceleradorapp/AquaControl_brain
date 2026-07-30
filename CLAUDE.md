# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

AquaControl_Brain is the central webservice for the AquaControl aquarium automation ecosystem —
a Node.js/Express/SQLite backend (`server/`) + a React/Vite dashboard (`client/`). It's the
intermediary between three sibling ESP32 firmware projects in the same `aquario/` folder:
`AquaControl_Hardware` (16-channel relay board, plain GPIO — see its own `01-espc-geral/11_*`/`12_*`
specs), `AquaControl_sensor` (7 real sensors — DS18B20 water temp ×3, DHT11 air temp+humidity,
YF-S201 flow, analog pH, SW-520D tilt — see `01-espc-geral/16_spec_AquaControl_sensor.md`), and
`AquaControl_OS` (the CYD touchscreen Display). None of the ESP32s talk to each other directly —
the Brain polls Hardware for relay state (proxied to the dashboard, no longer forwarded to the
Display's main screen as of 16-espc), polls the Sensor module for real telemetry and pushes a
user-selected subset (at most 6, chosen/ordered in the "Sensores no Display" widget) to the
Display, and handles the Display's QR code library and Modo Panico. See
`01-espc-geral/09_display_webservice.md` for the handshake/QR/Panico architecture and
`01-espc-geral/16_widget_sensores_display.md` for the sensor telemetry pipeline (real-time push,
smart diffing, and the `historico_sensores` table for future reports).

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
fonts, cyan/blue neon theme by default (`src/styles/theme.css` — override the CSS variables
there to reskin everything at once, e.g. `.dashboard--panico` in `theme.css` retints the whole
app red for Modo Panico purely by overriding variables, no component needs to know panic mode
exists). **22-espc**: this same mechanism now also backs 5 selectable alternate themes
(`.dashboard--tema-abissal`, `-ambar`, `-escuro`, `-vivido`, `-claro` — the last one being the
only light theme — chosen in Configuracoes Globais -> Sistema & Plataforma, persisted
client-side in `localStorage`) — `.dashboard--panico`'s block must stay declared AFTER all
theme blocks in `theme.css` so panic mode still wins when both classes are present on the same
element at once (same specificity, cascade order decides). **Theme/panic classes live on
`document.body`, not the inner `.dashboard` div** — every modal (`ModalHud.jsx`) renders via
`createPortal(..., document.body)`, which breaks real DOM ancestry (CSS variables cascade by
DOM ancestry, not React tree), so a class scoped to the inner div never reached portaled modal
content; `Dashboard.jsx` mirrors the theme/panic classes onto `document.body` via `useEffect`
specifically to fix this. See `01-espc-geral/22_temas_visuais.md`.

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

- **No routing library**: the client has no `react-router` (or equivalent) — every "screen" is a
  modal (`ModalHud`), including full-page-feeling ones like `EsquematicoInterativo` (`largura="cheia"`),
  `ModalCentralRelatorios` (Central de Relatorios e Analises, 17-espc), `ModalConfiguracoes`
  (Configuracoes Globais do Sistema, 19-espc), `ModalCentralDiagnostico` (Central de
  Diagnostico, 23-espc — a radial SVG "mission control" diagram that deliberately reuses every
  other existing modal as its click-through destinations rather than duplicating them; see
  `01-espc-geral/23_central_diagnostico.md`) and `ModalDocumentacao` (Documentacao Tecnica,
  26-espc). Follow this pattern for any new full-screen feature rather than introducing a
  router just for one view.
- **`ModalDocumentacao` (26-espc, see `01-espc-geral/26_documentacao_sistema_painel_web.md`)**
  is the one modal that deliberately does NOT use the Sci-Fi theme — everything under its
  `.documentacao-paper` wrapper (`styles/documentacao.css`) is hardcoded light/paper-styled
  (white background, dark text), independent of the active theme/panic classes on
  `document.body`, because the point of this page is technical reference/printing, not the
  HUD aesthetic. Structured content (per-module GPIO pinouts, project directory trees,
  onboarding steps) lives in `client/src/utils/documentacaoDados.js`, not hardcoded in the
  component — keep that file in sync if a pin/IP changes in any of the ESP32 firmwares,
  nothing validates it automatically. The pinout diagrams (`DiagramaPinagemESP32.jsx`) are a
  hand-rolled SVG, same idiom as `EsquematicoInterativo.jsx`/`DiagramaCentral.jsx` — no new
  diagram library. **PDF export is `window.print()` + `@media print` CSS**, same choice and
  same technique already used by the Central de Relatorios (`relatorios.css`, 17-espc,
  `.relatorio-imprimivel`): `body * { visibility: hidden; }` then make only
  `.documentacao-paper` (and its descendants) visible again via `position: absolute` — instead
  of resetting the shared `.modal-hud`/`.modal-hud__corpo` ancestor chain, which every other
  modal in the app also uses and would risk side effects there.
- **Background services use recursive `setTimeout`, not `setInterval`, when their interval is
  user-configurable** (`statusModulosService.js`, `sensoresTelemetriaService.js`, 19-espc) — each
  cycle re-reads the configured value from `configuracoes_gerais` before scheduling the next one,
  so a change in Configuracoes Globais takes effect on the next cycle without a server restart.
  Services with a fixed, non-configurable interval (e.g. `telemetriaDisplayService.js`) still use
  plain `setInterval`.
- **Not every "configuration" a feature request asks for has a real backend to back it** — see
  `01-espc-geral/19_configuracoes_globais.md` for the pattern followed there: every settings-page
  field is explicitly labeled as REAL (changes actual behavior), PREFERENCE-ONLY (persisted but not
  yet enforced anywhere), READ-ONLY/INFORMATIONAL, or OMITTED (no fake fields for capabilities that
  don't exist, e.g. authentication — this project has none by design, LAN-only tool).

## Dependencies

- **Server**: `express`, `cors`, `dotenv`. That's it — no ORM (raw SQL via `node:sqlite`), no auth
  (LAN-only tool, not exposed to the internet).
- **Client**: `react`/`react-dom` 18, `vite` 5, `framer-motion` (list enter/exit animations,
  panel transitions), `recharts` (temperature graphs, plus bar/pie/reference-area charts in the
  Central de Relatorios, 17-espc), `@dnd-kit/*` (drag-and-drop: widget layout, sensor
  reordering), `lucide-react` (all icons). No PDF-generation library (`jsPDF`/`html2canvas`) —
  the Central de Relatorios' PDF export is deliberately just `window.print()` + an
  `@media print` stylesheet, to avoid growing the bundle for something the browser already does
  natively.

## Notes for future work

- Comments and identifiers are in Portuguese, matching the sibling ESP32 firmware projects — keep
  that convention when editing.
- Read the relevant `01-espc-geral/NN_*.md` spec before changing any contract shared with
  `AquaControl_Hardware` or `AquaControl_OS` — they're built/flashed independently, so a mismatch
  isn't caught at compile time, only at runtime.
