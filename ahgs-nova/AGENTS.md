# AGENTS.md — ahgs-nova (ARCHIVED)

Vanilla JS/HTML edition of AHGS NOVA. **Frozen — do not update.** New work goes to `../ahgs-nova-sfc/` only;
`../ahgs-nova-vue/` is archived as well. Keep this folder purely as a rendering/behavior
reference.

## Run

```bash
python server.py [port]   # static file server, no build, no dependencies
```

## Layout (script load order matters)

`index.html` loads `charts.js` → `app.js` → `views.js` → `views2.js` as plain globals, then calls `boot()`:

- `app.js` — config (`DEFAULT_API`, `LS`), global `state`, hash router (`data-nav` links + `getRoute()`
  lazy view lookup so later-defined view functions resolve), session helpers, per-view polling `timers`.
- `views.js` / `views2.js` — `viewXxx()` functions returning HTML strings injected via `innerHTML`.
- `charts.js` — chart SVG string builders.

## If a change is ever forced here

- Escape all server data with `esc()` before interpolating into HTML strings.
- Server timestamps are naive UTC (append `Z` before parsing); `ascend !== false` means lower fitness is
  better.
- UI copy is Simplified Chinese; `style.css` is one shared theme across all three editions.
