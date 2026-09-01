# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product

**freshflip** is an inventory app for kitchens and restaurants. Its differentiator: recipe recommendations driven by expiration — the app ranks recipes by how much soon-to-expire food they rescue, so food gets flipped into meals instead of wasted.

## Commands

Runtime is **Bun** (not Node) — the server uses `bun:sqlite` and `Bun.spawn`.

- `bun install` — install deps
- `bun test` (or `bun test server`) — run the engine test suite (`server/engine.test.ts`); filter one test with `bun test -t "FEFO"`
- `bun run dev` — API server (port 8790, `--watch`) + Vite dev server (port 5173, proxies `/api`) together via `dev.ts`
- `bun run build` — build web app to `dist/web`
- `bun start` — production server on 8790; serves the API and, when `dist/web` exists, the built SPA
- `bun run seed` — wipe inventory + cook log, reseed demo data (`server/seed.ts --reset`)
- Typecheck: `bunx tsc -p tsconfig.json` (server/shared) and `bunx tsc -p web/tsconfig.json` (web) — there is no lint setup

## Architecture

Three layers share one type vocabulary: `shared/types.ts` is imported by both server and web — change API shapes there first.

**Server** (`server/`, Hono + SQLite at `data/freshflip.sqlite`, override with `FRESHFLIP_DB`):

- `db.ts` — schema (created on open), row→type mappers, queries. Inventory rows are mapped with *computed* freshness fields (`daysLeft`, `status`, `urgency`) relative to "today"; nothing freshness-related is stored.
- `freshness.ts` — the freshness model: status thresholds (critical ≤1d, soon ≤3d, watch ≤7d) and `urgencyFor` (1.0 = expires today, linear fade to 0 across `FLIP_WINDOW_DAYS` = 10; expired ⇒ 0 — expired food is never cooked, only flagged).
- `units.ts` — honest unit conversion: within mass/volume dimensions only; different count-like units (loaf vs slice) return `null` ("can't honestly say") rather than guessing. This null propagates to UI as "quantity unverified" and to cooking as `notAdjusted`.
- `recommend.ts` — scoring: per matched ingredient take the urgency of its most-at-risk lot, sum (optional ingredients ×0.5), multiply by coverage² (coverage = matched required / total required). Ready-to-cook is about required-ingredient *presence*, not quantity — running short flags but doesn't block.
- `consume.ts` — `cook()` decrements inventory **FEFO** (first-expire-first-out), deletes emptied lots, refuses unit-incompatible decrements (reports them), logs rescued-count to `cook_log`.
- `seed.ts` / `catalog.ts` / `recipes.ts` — ~110-ingredient shelf-life catalog, 24 recipes, demo inventory with expiries relative to today. Recipe ingredient names must match catalog names exactly; `seedRecipes` throws on a dangling reference (covered by a test). Server auto-seeds on boot when inventory is empty.
- `index.ts` — routes. Adding an unknown ingredient via POST /api/inventory auto-creates a catalog entry (category "other"). Expiry auto-fills from `acquiredOn + shelfLife[storage]` when not given.

**Web** (`web/src/`, React + Vite, no router lib — hash tabs in `App.tsx`): `App.tsx` fetches all data in parallel and passes a single `AppData` + `refresh()` down; mutations go through `api.ts` then `refresh()`. Views: `Dashboard` (use-first rail + ranked flips), `Inventory` (add form with catalog autocomplete + table), `Recipes`, `RecipeDetail` (overlay with cook action).

## Conventions

- Recipes mark pantry staples (salt, oil) and garnishes `optional: true` — they never count against coverage or block cooking. Keep that when adding recipes.
- Dates are date-only ISO strings (`YYYY-MM-DD`); day math lives in `freshness.ts` — don't do raw `Date` arithmetic elsewhere.
- The UI's design rule: **color means time remaining, nothing else** (the day-dot system). Status colors are defined once in `web/src/styles.css` tokens; don't introduce color for other meanings.
- Tests build throwaway DBs via `openDb(":memory:")` + seed helpers — follow `engine.test.ts` fixtures for new engine tests.
