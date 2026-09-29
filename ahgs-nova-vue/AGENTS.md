# AGENTS.md — ahgs-nova-vue (legacy edition)

> ⚠️ **ARCHIVED / 已归档冻结**：本版本不再维护、不再同步任何新功能或样式，请只在 `../ahgs-nova-sfc/` 中做改动。本文件仅作历史参考。

Vue 3 edition using the bundled runtime `vue.global.prod.js` (includes the template compiler) with
**component templates as JS strings** — no npm, no build step. Preferred target for feature work is
`../ahgs-nova-sfc/`; this folder is historically kept in sync. `../ahgs-nova/` is frozen.

## Run

```bash
python server.py [port]   # serves this folder; page fetches the remote AHGS API directly (CORS is on)
```

## Wiring (load order in index.html is fixed)

`vue.global.prod.js` → `js/utils.js` → `js/store.js` → `js/charts.js` → `js/components.js` →
`js/views-rank.js` → `js/views-curve.js` → `js/views-compare.js` → `js/views-evo.js` → `js/views-mine.js` →
`js/app.js`. Everything is a window global:

- `utils.js` — constants (`DEFAULT_API`, `LS`, `FW_LABEL`, `STATUS_LABEL`), formatters
  (`fmtObj`/`fmtTokens`/`parseServerTime`/`fmtTime`), `api()` fetch wrapper.
- `store.js` — reactive `store` (`problems`, `route`, `user`, `drawer`, `loginModal`, `toasts`), plus the
  `ROUTE_COMPS` registry that view files populate and `getRouteComp()` lookup.
- `charts.js` — chart SVG **string builders** (`lineChartSVG`, `barChartSVG`, `donutSVG`, `sparklineSVG`)
  rendered through `v-html`.
- `views-*.js` — option-object components whose `template:` is a string; each file ends with
  `ROUTE_COMPS.<name> = <View>`.
- `app.js` — mounts the root App (topbar/router/drawers/toasts), registers shared components
  (`FwBadge`, `SrcBadge`, `Medal`, `Avatar`, `UserCell`, `EmptyState`), and exposes helpers via
  `app.config.globalProperties` — that is why template strings can call `fmtObj`, `navHash`,
  `openSubmissionDrawer`, `getToken`, etc. without imports.

## Conventions

- New routes: register the component into `ROUTE_COMPS` and add the nav entry in `app.js`. Views receive
  query params via `props: ["params"]` (a `URLSearchParams`).
- Shared backend contract: server timestamps are naive UTC (always `parseServerTime()`), `ascend !== false`
  means lower fitness is better, login state lives in localStorage `ahgs_token` / `ahgs_user`
  (`nova_api_base` overrides the API base).
- UI copy is Simplified Chinese; commit messages are short Chinese imperatives.
- `style.css` is one shared theme across the three editions — sync any style change with
  `../ahgs-nova-sfc/src/styles/style.css` and `../ahgs-nova/style.css`.
- No test/lint/build tooling: verify by serving and exercising the affected routes.

## Known defects (already fixed in the SFC edition — do not copy from here)

- views-mine.js: the per-track records section has a duplicated nested `v-for` container, rendering each
  track section twice. If touching that block, collapse it to a single `v-for`.
- views-curve.js: `loadSource()` calls `history.replaceState(...)`, but a same-scope computed named
  `history` shadows the global — selecting a run from the dropdown throws. Use
  `window.history.replaceState`.
- Templates that call `new URLSearchParams(...)` inline (e.g. the 曲线/分析 buttons in views-mine.js,
  views-rank.js) throw `TypeError: _ctx.URLSearchParams is not a constructor` at click time — the template
  compiler prefixes the identifier with `_ctx.`. Move query-param construction into script helpers
  (pattern: `navToCurve()` in `../ahgs-nova-sfc/src/lib/router.js`).
