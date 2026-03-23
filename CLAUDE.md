# Spartan Fitness Mobile — Agent Rules & Architecture

## Quick Context for New Agents

This is a **React Native fitness app** (Expo SDK 54, Expo Go) with:
- Personalized workout plans with elite programming logic
- 1500+ exercises from ExerciseDB API with GIF demos
- 200+ CrossFit WODs with score tracking
- GPS run tracker with segment timelines
- Performance tracker (PRs, history, weekly progress)
- **Planned**: Claude Sonnet AI Coach for real-time workout modification

**Key docs**: `COACHING_SPEC.md` (elite programming logic, AI coach spec, subscription tiers), `TODO.md` (UI polish blueprint)

---

## Expo & Dependencies

- **Expo SDK 54** — must remain **Expo Go** compatible (no custom dev builds)
- Use `npx expo install <package>` — never `npm install`
- Run `npx expo-doctor` after adding packages
- No native modules outside Expo Go

## Project Structure

```
App.js                  — Entry point, navigation (bottom tabs + stack)
src/
  screens/              — All screens (TodayWorkout, RunTracker, PerformanceTracker, etc.)
  components/           — Reusable UI (ExerciseDetailModal, ExerciseCard, etc.)
  core/                 — Business logic (planGenerator, progressionRules, phaseCalculator)
  data/                 — Database, API clients, seed data
    database.js         — SQLite schema, migrations, all queries
    exerciseApi.js      — ExerciseDB API client
    exerciseSeed.js     — 116 curated Spartan exercises (seed data)
    wodSeed.js          — CrossFit WOD library
    taxonomyMap.js      — ExerciseDB → local schema mapping
  store/                — Zustand stores (useWorkoutStore, usePerformanceStore)
  theme/                — (planned) Centralized design tokens
```

## Tech Stack

- React Native via Expo (SDK 54)
- React Navigation (bottom tabs + stack)
- Zustand for state management
- AsyncStorage for local persistence
- expo-sqlite for structured data
- expo-location for GPS/run tracking
- ExerciseDB API for exercise catalog
- Anthropic API — Haiku 4.5 (coach + plan gen), Sonnet 4.6 (elite analysis)

## Navigation

```
Stack Navigator
├── Onboarding
├── Main (Bottom Tabs)
│   ├── Workout — TodayWorkout (daily view, day navigation)
│   ├── Track — RunTracker (GPS, segments, auto-match plan)
│   ├── Stats — PerformanceTracker (PRs, runs, gains, weekly progress)
│   ├── Plan — ProgressionPlan (week/day overview, phase timeline)
│   └── Settings — Profile, actions, library links
├── ExerciseLibrary — API-powered search/filter/browse
└── WodLibrary — CrossFit WODs with score logging
```

## Code Style

- Dark theme: background `#0A0A0A`, accent `#FF4136`, success `#01FF70`
- Functional components with hooks only
- **NO emojis in UI** — use text or icon libraries
- Stylish, bold, visually engaging — not plain or minimal
- All text rendered in `<Text>` components (React Native strict mode)
- Use `String()` for any DB values rendered in JSX

## Database Schema (expo-sqlite)

### Core Tables
- **exercises** — 1600+ exercises (116 seed + ExerciseDB). Fields: id, name, muscle_group, category, style_tags, equipment_required, default_sets/reps/weight, is_compound, difficulty, source, gif_url, instructions, target_muscles, body_parts, api_id
- **exercise_alternatives** — bidirectional swap mappings
- **plan_days** — daily workout entries with phase, title, focus, color, is_rest_day, is_completed
- **plan_blocks** — workout blocks within a day (warmup, main lifts, WOD, etc.)
- **plan_exercises** — exercises within blocks with sets, reps, weight, rest, actual_weight, actual_reps, notes, is_completed
- **workout_history** — archived completed workout snapshots

### Tracking Tables
- **run_history** — completed GPS runs (date, run_type, time, distance, pace, splits JSON)
- **wod_history** — WOD completion scores (wod_id, date, score, score_type, rx, notes)

### Planned Tables (for AI Coach & elite programming)
- **coach_messages** — AI conversation history per session
- **injuries** — body part flags with severity and recovery status
- **user_equipment** — detailed equipment profile (specific weights, limitations)
- **session_rpe** — per-set RPE/RIR feedback for autoregulation
- **mesocycles** — macrocycle/phase tracking with stimulus intent per day

## ExerciseDB API

- **Base URL**: `https://exercisedb-api.vercel.app/api/v1`
- **No auth** — free, open API
- **Rate limit**: ~100 requests/min, handle 429 with 3s+ delay and exponential backoff
- **Max page size**: 100
- Endpoints: `/exercises?search=&bodyPart=&equipment=&limit=&offset=`, `/exercises/{id}`, `/bodyparts`, `/equipments`, `/muscles`
- Cache locally in SQLite after sync. App works offline after first sync.
- GIFs load on-demand via Image component (not pre-downloaded)

## Claude AI Coach (LIVE)

- **Models**: Haiku 4.5 for coach chat + plan generation (fast, cheap), Sonnet 4.6 reserved for Elite tier deep analysis
- **API client**: `src/data/coachApi.js` with bundled API key
- **Chat UI**: `src/components/CoachChat.js` — bottom sheet, quick action chips, action cards
- **Entry point**: Floating "AI" button on workout screen
- **Response format**: JSON with `message` + `actions` (swap, adjustWeight, flagInjury, etc.)
- **Context per message**: user profile + equipment, workout state, injuries, last 6 messages
- **Full spec**: See `COACHING_SPEC.md`

### Production Architecture (TODO)
Currently the API key is **bundled in the client** (`src/data/coachApi.js`). Before shipping to consumers:
1. **Build a backend proxy** (e.g., Vercel serverless function or Railway) that holds the API key
2. **Client calls your proxy**, proxy calls Anthropic. Key never leaves your server.
3. **Gate behind subscription** — proxy checks user's Pro/Elite status before forwarding to Claude
4. **Rate limit per user** — 3 msgs/week free, 25/week Pro, unlimited Elite
5. **Use RevenueCat** for subscription management (App Store + Google Play billing)

## Elite Programming Principles

The workout programming engine should follow these principles (see `COACHING_SPEC.md` for details):
1. **Stimulus intent** per session (strength/hypertrophy/power/conditioning/skill)
2. **Tempo prescriptions** on compound lifts (4-digit: eccentric-pause-concentric-pause)
3. **Energy system training** across the week (phosphocreatine/glycolytic/oxidative)
4. **RPE autoregulation** — post-set feedback adjusts recommendations
5. **Mesocycle periodization** — 12-week cycles: accumulation → intensification → realization
6. **Intelligent sequencing** — power before strength, compound before isolation, no back-to-back grip-intensive
7. **Specific warmups** — prime exact movement patterns for the session

## Environment

- `.env` contains `EXPO_TOKEN` (EAS builds) and `CLAUDE_TOKEN` (Anthropic API) — **never commit this file**
- `.env` is in `.gitignore`
- `eas.json` configured for iOS and Android builds
- GitHub repo: `bryane1992/SpartanFitnessMobile` (private)

## WOD Library

- Seed data in `src/data/wodSeed.js`
- Categories: Girls, Hero, Benchmark, AMRAP, For Time, EMOM, Chipper
- Each WOD: id, name, category, type, movements[], scheme, rxWeight, difficulty, estimatedTime, tips
- **Equipment requirements should be listed per WOD** for scaling to user's gear
- Score tracking in `wod_history` table (time, rounds+reps, total reps, RX flag)
- Goal: 200+ WODs covering the full CrossFit benchmark library
