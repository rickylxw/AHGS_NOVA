# AGENTS.md

Enhanced web frontends for the AHGS platform (auto heuristic-generation system). This repo holds **three
parallel editions of the same product** — there is no backend code, no CI, and no test framework anywhere.

## Editions (which one to touch)

| Directory | Edition | Status |
| --- | --- | --- |
| `ahgs-nova-sfc/` | Vue 3 SFC + Vite (`.vue` files) | **preferred for all new work** — see `ahgs-nova-sfc/AGENTS.md` for architecture, conventions, and pitfalls |
| `ahgs-nova-vue/` | Vue 3, runtime bundled, string templates in `js/*.js` | legacy; historically synced with new features |
| `ahgs-nova/` | vanilla JS/HTML | archived, frozen — do not update |

Each subfolder has its own `AGENTS.md` with edition-specific commands, wiring, and gotchas.

All three talk to the same remote backend (default `http://10.201.186.15:8090`, set per-browser in
localStorage `nova_api_base`; CORS is enabled server-side). Nothing in this repo can run the backend.

## Commands

```bash
# ahgs-nova-sfc (the only one with a build step)
cd ahgs-nova-sfc && npm install
npm run dev          # dev server on :8925
npm run build        # dist/ output; this passing is the minimum verification bar

# ahgs-nova / ahgs-nova-vue: pure static, no build
python server.py [port]   # in either folder; serves the folder with no-cache headers
```

No test runner, lint, or typecheck config exists in the repo — don't look for one. Verify changes with
`npm run build` plus opening the affected routes; for rendering-parity work use the mock-API + headless
`chrome --dump-dom` DOM-diff method described in `ahgs-nova-sfc/AGENTS.md`.

## Cross-cutting facts that bite

- **Shared theme**: `ahgs-nova-sfc/src/styles/style.css`, `ahgs-nova-vue/style.css`, and `ahgs-nova/style.css`
  are the same theme kept as three copies. A style change must be applied to all three (or consciously
  limited to the SFC edition).
- **Shared HTTP contract** (all editions, same endpoints, same localStorage keys `ahgs_token` / `ahgs_user`):
  the backend returns **naive UTC timestamps** — always parse as UTC (SFC: `parseServerTime()`), never
  `new Date(iso)` directly.
  `ascend !== false` means *lower fitness is better* for a problem.
- **UI copy is Simplified Chinese**; **commit messages are short Chinese imperatives** (see `git log`).
- Feature parity across editions is expected except where documented as intentional (see "Known intentional
  differences" in `ahgs-nova-sfc/AGENTS.md`): the old `#/mine` duplicate-`v-for` bug, CurveView
  `window.history` shadowing, BarChart paint order.
