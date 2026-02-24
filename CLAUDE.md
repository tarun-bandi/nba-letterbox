# NBA Letterbox — Claude Instructions

## Workflow Rules
- **Always use `supabase db push`** (via CLI) to apply migrations — never ask which method to use.
- **Always make a git commit** after completing work. Don't wait to be asked.
- Use `--legacy-peer-deps` for npm install due to peer dep conflicts.

## Stack
- Expo SDK 54, Expo Router v6, React Native 0.81.5
- Supabase (auth + database + storage), TanStack Query v5, Zustand v5
- NativeWind v4 + Tailwind CSS v3

## Known Issues
- Pre-existing Supabase `never` type errors in tsc — ignore these.
