# AGENTS.md — ahgs-nova-sfc

Enhanced frontend for the AHGS platform (dashboard / leaderboard / live feed / evolution / custom problems /
curve analysis / compare / my space). This directory is the **native Vue 3 Single-File-Component (SFC) edition**
built with Vite. Sibling directories `../ahgs-nova-vue/` (string-template edition) and `../ahgs-nova/`
(vanilla JS, archived) implement the same product; this edition is the preferred one for future work.

## Commands

```bash
npm install
npm run dev        # dev server, http://localhost:8925
npm run build      # outputs to dist/
npm run preview    # preview the production build
```

There is no test framework. Minimum verification bar for any change: `npm run build` passes and the affected
routes open with no console errors. For rendering/layout alignment work, compare DOMs via a mock API + headless
Chrome (see "Parity with the older editions" below).

The backend defaults to `http://10.201.186.15:8090` (`DEFAULT_API` in `src/lib/constants.js`). Without the real
backend, point localStorage key `nova_api_base` at your own mock (full CORS is fine) and fake the login state
with the `ahgs_token` / `ahgs_user` localStorage keys.

## Layout

```
src/
├── main.js               # entry: initRouter() + createApp
├── App.vue               # topbar / router outlet / settings popover / DrawerHost / LoginModal / Toasts
├── styles/style.css      # all styling (same theme kept in sync with ../ahgs-nova-vue/style.css)
├── lib/
│   ├── constants.js      # DEFAULT_API, LS, framework/status labels, EVO_DEFAULTS, PALETTE
│   ├── api.js            # api() fetch wrapper, ApiError, getToken/getStoredUser/apiBase
│   ├── store.js          # reactive store + global actions (toast/drawers/session/theme/viewVer)
│   ├── format.js         # fmtObj/fmtTokens/parseServerTime/fmtTime/fullName/isAscend, etc.
│   └── router.js         # hash router: VIEWS registry, route reactive, navHash
├── charts/               # declarative SVG chart components (LineChart/BarChart/DonutChart/Sparkline/HbarList)
├── components/           # shared components + drawers/ (three drawers + DrawerHost)
└── views/                # 8 route views (Dashboard/Leaderboard/Live/Evo/Cprob/Curve/Compare/Mine)
```

## Conventions

- **`<script setup>` SFCs only**; no runtime string templates, no global `Vue.global`, no `v-html`
  (charts always go through the `src/charts/` components).
- **Hash routing**: `#/name?query`. A new view must be added to both the `VIEWS` map in `lib/router.js`
  and the `navItems` list in `App.vue`; views receive query params via
  `defineProps({ params: URLSearchParams })`.
- **Global state** only through `lib/store.js`: read `store`, use the exported action functions
  (`toast()`, `openSubmissionDrawer()`, `setSession()`, ...). Operations that change global data
  (login/logout etc.) must bump `store.viewVer` to force the routed view to remount.
- **HTTP** always goes through `api()` from `lib/api.js`; never call `fetch` directly. Error messages are
  already localized — just display `e.message`.
- **Copy-to-clipboard** always goes through `copyText()` from `lib/format.js` (Clipboard API with an
  `execCommand` fallback — the site is served over plain HTTP, where `navigator.clipboard` is `undefined`);
  for buttons use `components/CopyButton.vue` (adds the「已复制 ✓」flash). Never call `navigator.clipboard`
  directly.
- **Time**: the server returns naive UTC strings; always parse with `parseServerTime()`, never `new Date(iso)`.
- **Optimization direction**: `ascend !== false` means lower fitness is better; always test via
  `isAscend(problemKey)`.
- UI copy is Simplified Chinese; class names kept identical to the older editions for continuity, but the
  old editions are frozen — `src/styles/style.css` is now standalone, do NOT sync changes to them.
- Empty/loading states: reuse `EmptyState.vue` and `.loading-row` + `.spinner`.

## Template pitfalls (they leak into the rendered DOM or break handlers)

- Keep text interpolation on the same line as its parent tag: `<div>{{ msg }}</div>`. Line breaks make Vue's
  whitespace condensing emit an extra leading-space text node.
- A `v-if` child inside `<template v-for>` renders `<!---->` comment anchors for missed iterations; prefer
  flattening into per-element `v-for` loops when possible.
- Only declared props are kept off the root element (e.g. `params`); undeclared ones appear in the DOM as
  `params=""` fallthrough attributes.
- **Never use non-whitelisted globals in template expressions** (e.g. `@click="navHash('curve', new
  URLSearchParams({ id }))"`): the compiler prefixes unknown identifiers with `_ctx.`, so the handler throws
  `TypeError: _ctx.URLSearchParams is not a constructor` at click time — silently in prod builds. Build query
  params in script helpers instead (see `navToCurve()` in `lib/router.js`).

## Parity with the older editions (regression verification)

All three editions render nearly identically; for major changes do a DOM-level comparison:
mock API on any port (full CORS; required endpoints include `/api/problems`, `/api/ranking/:key`,
`/api/submissions/recent`) plus
`chrome --headless=new --dump-dom http://localhost:<port>/index.html#/<route>` per route, then diff.
Normalization points: `data-v-*` attributes, spaces inside style attributes, the BarChart gradient `id`
(unique per instance in this edition), relative times ("N minutes ago" shifts across minutes), and the
brand label ("Vue SFC" in this edition).

## Known intentional differences (do not "fix" these)

- `#/mine` no longer reproduces the old edition's nested duplicate `v-for` defect in the per-track sections.
- Browser history calls in `CurveView` must use `window.history.replaceState` — a same-scope computed named
  `history` shadows the global.
- BarChart paints all bars first, then the tick labels (the old edition interleaved them); the elements never
  overlap, so the rendered result is identical.
