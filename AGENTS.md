# AGENTS.md

## Cursor Cloud specific instructions

### Overview

**Movu** is a React Native / Expo gym workout tracking app (TypeScript). It connects to gym equipment via BLE sensors and NFC tags. Backend uses a hosted Supabase instance (auth + PostgreSQL). See `app.json` for Supabase URL and anon key under `expo.extra`.

### Running the app (web mode)

In the Cloud VM, run the web version since native builds require physical devices:

```
npx expo start --web --port 8081
```

Then open `http://localhost:8081` in Chrome. The app will show the onboarding flow on first visit. BLE/NFC features are native-only and will not work on web — auth, workout planning, and history viewing work fine on web.

### Type checking

No ESLint or Prettier is configured. Use TypeScript compiler for type checking:

```
npx tsc --noEmit
```

Note: the codebase has pre-existing TS errors (e.g. `expo-file-system` API mismatches, BLE listener types). These do not block the Metro bundler or runtime.

### Key caveats

- `npx expo export --platform web` fails due to `unstable_settings.initialRouteName` being `"index"` in `app/_layout.tsx` while no root-level `index.tsx` exists. The dev server (`expo start --web`) works fine despite this.
- The Supabase instance is a shared cloud service at `oakjonsxvupulmcgmrfp.supabase.co`. Account creation may hit email rate limits. Existing accounts can log in normally.
- Package manager is **npm** (lockfile: `package-lock.json`).
