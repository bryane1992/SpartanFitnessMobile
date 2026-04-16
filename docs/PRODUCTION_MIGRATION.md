# GritOS — Production Migration Status

## Current Architecture

```
Mobile App (React Native / Expo SDK 54)
  ├── Auth: Supabase Auth (email/password, JWT tokens)
  ├── Token storage: expo-secure-store (encrypted on device)
  ├── Local DB: SQLite (workout data, exercises, plan)
  ├── AI calls: Supabase Edge Function proxy (API key server-side)
  └── Units: Imperial/Metric toggle (stored AsyncStorage, converts at display)

Supabase (Backend)
  ├── Auth: email/password signup, JWT issuance
  ├── Postgres: user_profiles, coach_messages, injuries, equipment, working_weights
  ├── Row Level Security: users can only access own data
  ├── Edge Function: claude-proxy (validates JWT, rate limits, forwards to Anthropic)
  └── Secrets: CLAUDE_API_KEY stored server-side

Distribution
  ├── iOS: EAS Build → TestFlight (live, beta testers invited)
  ├── Android: EAS Build → APK (preview profile)
  └── Dev: Expo Go (dev tools visible via __DEV__ guard)
```

---

## DONE

| Task | Status | Notes |
|------|--------|-------|
| Supabase project created + CLI linked | DONE | nyvanilszqnjdwmxnybd |
| Database schema deployed (Postgres) | DONE | user_profiles, coach_messages, injuries, equipment, working_weights |
| Row Level Security on all tables | DONE | Users can only see own data |
| Claude proxy Edge Function | DONE | Validates JWT, rate limits (free 10/wk, pro 100, elite unlimited) |
| API key removed from all client code | DONE | Zero `sk-ant-*` in source files |
| Auth screen (sign up / sign in) | DONE | Email + password, Supabase Auth SDK |
| Sign out button | DONE | Settings → Sign Out with confirmation |
| Secure token storage | DONE | expo-secure-store (was AsyncStorage) |
| All Claude calls through proxy | DONE | coachApi.js, aiPlanGenerator.js, planReviewer.js |
| Dev Tools hidden in production | DONE | `__DEV__` guard on entire dev section |
| App rebranded to GritOS | DONE | Name, slug, bundle ID, docs, icons |
| App icon (1024x1024) | DONE | assets/app-icon.png |
| EAS Build config | DONE | eas.json with Apple creds, remote versioning |
| First TestFlight build submitted | DONE | App Store Connect ID: 6762285446 |
| Beta testers invited | DONE | External testing group created |
| Console.log stripped in prod | DONE | babel-plugin-transform-remove-console |
| expo-doctor 17/17 passing | DONE | No warnings or errors |
| Imperial/Metric unit support | DONE | Toggle in Settings, converts at display time |
| Coach: undo system | DONE | Every action captures before-state, red UNDO button |
| Coach: injury auto-modify | DONE | Finds affected exercises, shows lighten/swap/skip buttons |
| Coach: swap days | DONE | swapWorkoutDays() swaps all content between two dates |
| Coach: clear injuries | DONE | clearAllInjuries() marks all as resolved |
| Coach: week schedule awareness | DONE | Sees full 7-day schedule, prevents bad adjacencies |
| Coach: date awareness | DONE | Knows today's date + tomorrow's workout |
| Coach: no markdown, no IDs | DONE | stripMarkdown() + system prompt rules |
| Coach: BW exercise handling | DONE | adjustReps not adjustWeight for pull-ups etc |
| WOD-day matching | DONE | Scoring system prevents squat WODs on chest day |
| Plan fallbacks removed | DONE | Fail fast on errors, no garbage plans |
| Autoregulation tested | DONE | 45/45 tests passing |
| Coach actions tested | DONE | 6/6 tests passing |
| Full plan suite | DONE | 4 profiles + 5 coach conversations, avg 7.0/10 |

---

## REMAINING

### Must-do before public launch

| Task | Effort | Notes |
|------|--------|-------|
| Sync user profile to Supabase on onboarding | Small | Currently only in AsyncStorage — needed for server-side features |
| Privacy policy URL | Small | Required for App Store. Host on a simple webpage |
| Apple beta review for external testers | Waiting | Submitted, 24-48 hr turnaround |
| Separate DB vs barbell weight entry | Medium | Beta feedback: one field for both doesn't make sense |
| Test proxy end-to-end in TestFlight | Manual | Verify Claude calls work through proxy in prod builds |

### Should-do before scaling

| Task | Effort | Notes |
|------|--------|-------|
| RevenueCat subscription integration | Medium | Proxy already has tier checking, needs payment flow |
| Apple Sign-In | Medium | Required if offering any social login option |
| Migrate local SQLite data to Supabase Postgres | Large | Currently all plan data is device-only |
| Error reporting (Sentry) | Small | Catch crashes in prod |
| Analytics (Mixpanel/PostHog) | Small | Track onboarding completion, plan generation, coach usage |
| Onboarding → Supabase profile sync | Small | Write profile to Postgres after onboarding completes |

### Nice-to-have / Post-launch

| Task | Effort | Notes |
|------|--------|-------|
| Move plan generator to server-side | Large | 6500+ lines of business logic to migrate |
| Multi-device sync | Large | Requires full Postgres migration |
| Push notifications | Medium | Workout reminders, coach messages |
| Social features | Large | Share workouts, leaderboards |
| Lifestyle adaptation | Medium | "I play soccer Sundays" → adjust plan permanently |
| Plan recompilation | Medium | Coach can rebuild a single week |

---

## Key Files

| File | Purpose |
|------|---------|
| `supabase/functions/claude-proxy/index.ts` | Edge Function — JWT auth, rate limit, forwards to Anthropic |
| `supabase/migrations/20260413_initial_schema.sql` | Postgres schema with RLS |
| `src/data/supabase.js` | Client — auth, token helpers |
| `src/screens/Auth.js` | Sign up / sign in screen |
| `src/utils/units.js` | Imperial/metric conversion utilities |
| `eas.json` | Build config — Apple creds, versioning |
| `app.config.js` | Expo config — Supabase URL, anon key, bundle ID |
| `.env` | Secrets (gitignored) — API keys, Supabase keys, Apple creds |

---

## Rate Limits (Edge Function)

| Tier | Messages/week | Plan generations |
|------|--------------|-----------------|
| free | 10 | Unlimited (for now) |
| pro | 100 | Unlimited |
| elite | Unlimited | Unlimited |

Tier is read from `user_profiles.subscription_tier` in Supabase. Default: free.
