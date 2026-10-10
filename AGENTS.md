# AGENTS.md

Enhanced web frontends for the AHGS platform (auto heuristic-generation system). This repo holds **three
parallel editions of the same product** — no CI, no test framework (the self-hosted backend and the Next
edition frontend moved to their own monorepo on 2026-10-10, see the table).

## Editions (which one to touch)

| Directory | Edition | Status |
| --- | --- | --- |
| `ahgs-nova-next/` | Vue 3 + Vite + vue-router + pinia (Next edition) | **moved to the [`ahgs-nova-next` monorepo](https://github.com/rickylxw/ahgs-nova-next) on 2026-10-09** — was never committed here, so no history moved |
| `ahgs-nova-sfc/` | Vue 3 SFC + Vite (`.vue` files) | maintained classic edition (compat endpoints only) — see `ahgs-nova-sfc/AGENTS.md` for architecture, conventions, and pitfalls |
| `ahgs-nova-vue/` | Vue 3, runtime bundled, string templates in `js/*.js` | **archived, frozen — do not update** |
| `ahgs-nova/` | vanilla JS/HTML | **archived, frozen — do not update** |
| `ahgs-nova-be/` | FastAPI backend (standalone), own pytest suite | **moved to the [`ahgs-nova-next` monorepo](https://github.com/rickylxw/ahgs-nova-next) as `ahgs-nova-be/` on 2026-10-10** — was never committed here |

Each subfolder has its own `AGENTS.md` with edition-specific commands, wiring, and gotchas.

All three talk to the same remote backend (default `http://10.201.186.15:8090`, set per-browser in
localStorage `nova_api_base`; CORS is enabled server-side). Nothing in this repo can run the backend.

## Commands

```bash
# ahgs-nova-next + ahgs-nova-be: moved to the ahgs-nova-next monorepo — commands live there

# ahgs-nova-sfc (classic maintained edition)
cd ahgs-nova-sfc && npm install
npm run dev          # dev server on :8925
npm run build        # dist/ output; this passing is the minimum verification bar
```

# ahgs-nova / ahgs-nova-vue: pure static, no build
python server.py [port]   # in either folder; serves the folder with no-cache headers
```

No test runner, lint, or typecheck config exists in the repo — don't look for one. Verify changes with
`npm run build` plus opening the affected routes; for rendering-parity work use the mock-API + headless
`chrome --dump-dom` DOM-diff method described in `ahgs-nova-sfc/AGENTS.md`.

## Cross-cutting facts that bite

- **Shared theme**: `ahgs-nova-sfc/src/styles/style.css`, `ahgs-nova-vue/style.css`, and `ahgs-nova/style.css`
  are the same theme kept as copies (the fourth copy moved out with `ahgs-nova-next`, whose AGENTS.md
  declares it standalone — do not sync back). A style change must be applied to all of them (or consciously
  limited to one edition).
- **Shared HTTP contract**: all editions speak the same compat endpoints with the same semantics (naive-UTC
  timestamps — always parse as UTC, never `new Date(iso)`; `ascend !== false` means *lower fitness is better*).
  `ahgs-nova-sfc` keeps the classic localStorage keys (`ahgs_token` / `ahgs_user` / `nova_api_base`);
  `ahgs-nova-next` namespaces its own keys with a `next_` prefix (`next_official_token`, `next_nova_access`, …)
  so the two editions never clobber each other — they are meant to run side by side.
- **UI copy is Simplified Chinese**; **commit messages are short Chinese imperatives** (see `git log`).
- Feature parity across editions is expected except where documented as intentional (see "Known intentional
  differences" in `ahgs-nova-sfc/AGENTS.md`): the old `#/mine` duplicate-`v-for` bug, CurveView
  `window.history` shadowing, BarChart paint order.
- 对战玩法(Arena):游戏规格 / 契约约束 / 新增游戏指引统一见 ahgs-nova-next monorepo 仓库根的
  `ARENA_GAMES.md`(本仓库副本已随迁)。内置游戏实现于同仓库
  `ahgs-nova-be/app/arenas/`(双人赛制走 `Arena.run_round_robin`,多人同局经 `GameRecord.ranking`
  走 `ratings.apply_ranking` 名次组 ELO);前端按目录字段(`board_shape`/`pieces`/`cell_classes`/
  `player_marks`/`labels`/`starter_code`)协商回放渲染,消费方为同仓库 `ahgs-nova-next/src/views/ArenaView.vue`。
