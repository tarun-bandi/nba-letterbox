# AGENTS.md

## Cursor Cloud specific instructions

### Overview

NBA Letterbox is an Expo SDK 54 / React Native app (web + mobile) with a Supabase backend. See `README.md` for product details and `CLAUDE.md` for workflow rules.

### Running the app

- **Web dev server:** `npx expo start --web --port 8081`
- The app requires Supabase credentials in `.env` (see `.env.example`). Without real credentials the app renders the login/signup UI but auth calls will fail.
- Use `--legacy-peer-deps` for all `npm install` commands (already configured in `.npmrc`).

### Type checking

- `npx tsc --noEmit` — many Supabase `never`-type errors are pre-existing and expected (per `CLAUDE.md`). The Deno edge-function in `supabase/functions/` also produces type errors under Node's TS — ignore those.

### Node version

- Node 20 is required (`.nvmrc`). Use `nvm use 20` if the default differs.

### No lint or test commands

- This repo has no ESLint config, no test framework, and no automated tests. Type checking with `tsc` is the primary static analysis.

### Supabase migrations

- Apply with `supabase db push` (requires Supabase CLI and project credentials).
