# AGENTS.md

## Project Context

This is a Base44 app repository. Treat it as user-owned application code, keep changes focused on the user's request, and preserve existing project conventions.

Start with `README.md` for local setup and the deploy flow, and read `CLAUDE.md` for the dated standard-compliance record (what was audited, what could not be verified). Sommel follows the ACACIA portfolio standard (`jospabloh/acacia-app-standard`).

## Base44 References

- CLI overview: https://docs.base44.com/developers/references/cli/get-started/overview.md
- Agent skills: https://docs.base44.com/developers/backend/overview/skills.md

If your agent supports Agent Skills, install or update Base44 skills before Base44-specific work:

```bash
npx skills add base44/skills
```

## Key Files

- `src/`: frontend application source.
- `src/api/base44Client.js`: frontend Base44 SDK client.
- `vite.config.js`: Vite config and Base44 Vite plugin setup.
- `.env.local`: local-only environment values; never commit secrets.

## Working Notes

- Use `base44 dev` as the default local development command when you need the local Base44 backend. It can run the backend and frontend together.
- When docs or code mention the frontend being started automatically, that usually means the Base44 project config includes `site.serveCommand`, for example `"serveCommand": "npm run dev"` in `base44/config.jsonc`.
- Use `npm run dev` only for frontend-only work against the hosted Base44 backend.
- Use the existing npm scripts for deploy and validation (below). Do not hand-run `npx base44 ... --app-id <id>`: the CLI takes its source from the current directory and its target from the id, and nothing checks that they match.
- Reuse the existing SDK client and Vite plugin patterns before adding new Base44 integration paths.
- Run the relevant checks from `package.json` before finishing code changes.

## Deploy (module 11)

- **Real flow:** merge to `main` -> Base44 syncs code and entity schemas from GitHub `main` on its own -> the change is published through the Base44 API -> verify by content. Merging is not publishing.
- **Verify by content, never by hash or by the CLI saying `unchanged`.** Frontend: grep the served bundle at `https://sommel.acaciaco.com.mx` for a string only the new code has. Functions: call an action only the new code has; `unknown action` means the old code is still served. Schemas: re-read with `list_entity_schemas` and compare with `base44/entities/*.jsonc`.
- **The npm scripts are the exception path, not the normal one:** `npm run deploy`, `deploy:site`, `deploy:entities` (destructive, asks you to type `Sommel`), `functions:audit`. They read the app id from `base44.app.json` and refuse `--app-id`. Never pass it.
- **Budget:** Base44 cuts at 50 functions; this repo caps at `maxFunctions: 40` (`base44.app.json`), enforced by `npm run validate:functions` (part of `npm run lint`). One `entry.ts` = one endpoint; add actions as handlers under an existing router instead of new endpoints. Map: `docs/BACKEND_FUNCTION_LIMIT_REORG.md`. Run `npm run functions:audit` before removing any function.
- Do not deploy during a bar's service hours.

## Guardrails

- Every write goes through a Safe function; the client never writes entities. The tenant always comes from the server-side `ctx`, never from the request body.
- `_guard.ts` and `_guard_logic.ts` in each function are generated from `scripts/templates/`. Edit the template and run `npm run generate:guards`; `npm run check:guards` fails on drift.
- Security locks (field and entity `rls` in `base44/entities/*.jsonc`) carry their rationale in a deployed description and are pinned by `scripts/lib/locks-rules.mjs`. State the mechanism first; do not loosen a lock to fix a symptom. See `docs/locks-audit.md`.
- Never read, print or commit secret values. Names and status only, in `docs/secrets.md`.
- Deno tests import nothing external (`deno.land`, `jsr.io` are unreachable in the dev sandbox). Run: `deno test --allow-env --allow-read=base44/entities base44/tests/`.
- User-facing text is Spanish with no em dashes; comments and identifiers are English; theme tokens only.
- Mission Control (`jospabloh/acacia-mission-control`) writes `WineBar.billing_status`. The app itself never runs a lifecycle cron.
