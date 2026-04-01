# Spartan Fitness Mobile — Agent Rules & Architecture

## Quick Context for New Agents

This is a **React Native fitness app** (Expo SDK 54, Expo Go) with:
- AI-powered plan generation (strategy-driven hybrid: Claude decides, code builds)
- 1500+ exercises from ExerciseDB API with GIF demos
- 200+ CrossFit WODs with score tracking and context-aware selection
- GPS run tracker with segment timelines
- Stats screen (week-over-week lift deltas, run progression, PRs)
- AI Coach (Claude Haiku) for real-time workout modification
- Race-specific training (Spartan Sprint/Super/Beast, 5K-marathon profiles)

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
  components/           — Reusable UI (ExerciseDetailModal, CoachChat, etc.)
  core/                 — Business logic
    aiPlanGenerator.js  — Hybrid AI plan generator (Claude strategy + deterministic build)
    planGenerator.js    — Non-AI deterministic plan generator (reference/fallback)
    progressionRules.js — Weight calc (working weights + phase intensity + floors), sets/reps, run params
    phaseCalculator.js  — Phase timeline calculation
    dayTemplates.js     — Composable day block builder (arm finisher, core, WOD, run on any day)
    raceRequirements.js — Race profiles (Spartan Sprint/Super/Beast, 5K-marathon)
    wodSelector.js      — Context-aware WOD filtering (equipment, phase, Spartan relevance)
    planValidator.js    — Post-generation validation (equipment, weights, progression, race distance)
  data/                 — Database, API clients, seed data
    database.js         — SQLite schema, migrations, all queries
    coachApi.js         — Claude Haiku coaching API client
    exerciseApi.js      — ExerciseDB API client
    exerciseSeed.js     — 120+ curated exercises (compounds, accessories, stretches)
    wodSeed.js          — 200+ CrossFit WODs with movements, schemes, equipment
    taxonomyMap.js      — ExerciseDB → local schema mapping
  store/                — Zustand stores (useWorkoutStore, usePerformanceStore)
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

## AI Plan Generator (v3 — Strategy-Driven Hybrid)

### Architecture: "AI Brain, Deterministic Hands"

```
Onboarding (8 steps) → userProfile saved to AsyncStorage
    ↓
Claude Haiku (1 API call, ~500 output tokens)
    → Returns program STRATEGY: movement patterns, priorities, equipment prefs
    → NOT exercise IDs or workout templates
    → Falls back to buildDefaultStrategy() if Claude fails
    ↓
Deterministic Builder (buildPlan)
    ├── dayTemplates.js: composable blocks from strategy config
    ├── selectExercises(): strategy-driven scoring
    │   ├── Pattern priority from strategy (e.g., pull_up:9 → +18 score)
    │   ├── Equipment preference (barbell first when available)
    │   ├── Race requirement boost (+15 for must-include movements)
    │   └── Day-level dedup (no repeats within a day)
    ├── progressionRules.js: weight from user's working weights
    │   ├── getUserBaseWeight() maps exercises to 8-10RM by movement pattern
    │   ├── Phase intensity (foundation 75%, build 85%, peak 95%)
    │   ├── Experience-aware floors (never below 50% of known capacity)
    │   └── Deload 70% on week 4 of each phase
    ├── wodSelector.js: context-aware WOD from seed data
    │   ├── Filters by equipment, difficulty, phase
    │   ├── Scores by Spartan relevance, pattern overlap, energy system
    │   └── Rotates across weeks (no repeats within a week)
    ├── raceRequirements.js: Spartan/race-specific must-include movements
    └── Run generation: distance from target race distance, peaks at 105%
    ↓
planValidator.js: catches equipment unused, weight too low, no pull-ups, etc.
    ↓
SQLite: plan_days → plan_blocks → plan_exercises
```

### Key Design Rules
1. **Claude picks movement PATTERNS** — code picks exercises
2. **User's working weights are truth** — not exercise seed defaults
3. **Equipment preference is strategy-driven** — barbell first when available
4. **Race requirements enforce must-include movements** and distance targets
5. **Day templates are composable** — arm finisher, core, WOD, run on any day
6. **WODs from seed data only** — 200+ real WODs, never freeform from Claude
7. **Validation catches failures** before save

## Claude AI Coach (LIVE)

- **Model**: Haiku 4.5 (fast, cheap)
- **API client**: `src/data/coachApi.js` with bundled API key
- **Chat UI**: `src/components/CoachChat.js` — bottom sheet, quick action chips, option cards
- **Entry point**: Floating "AI" button on workout screen
- **Response format**: JSON with `message` + `actions` + `options`
- **Actions**: swap, adjustWeight, adjustReps, flagInjury, removeExercise, addNote
- **Options**: presented for swaps/injuries so user can choose (not auto-executed)
- **Action normalization**: handles both `{type:"swap",...}` and `{"swap":{...}}` formats
- **Context per message**: user profile + equipment, workout state, injuries, swap alternatives

### Production Architecture (TODO)
Currently the API key is **bundled in the client**. Before shipping:
1. **Build a backend proxy** (Vercel/Railway) that holds the API key
2. **Client calls proxy**, proxy calls Anthropic. Key never leaves server.
3. **Gate behind subscription** — proxy checks user's Pro/Elite status
4. **Rate limit per user** — 3 msgs/week free, 25/week Pro, unlimited Elite
5. **Use RevenueCat** for subscription management

## Weight Calculation

The most critical system — produces all prescribed weights from user's onboarding data:

```
User's 8-10RM (onboarding) → × 1.3 = Estimated 1RM
  → × Phase Intensity (foundation 70%, build 80%, peak 90%, race_prep 75% of est1RM)
  → × Weekly Progression (+2%/week cumulative for compounds, +1% isolation)
  → × Deload (70% on week 4 of each phase)
  → Floor (never below 50% of known capacity)
  → Cap (never above equipment max)
```

**Example**: Bench 8-10RM = 110 lb → est1RM = 143 lb
- Week 1 (foundation): 143 × 0.70 = **100 lb** (starts near working weight)
- Week 5 (build): 143 × 0.80 × 1.08 = **125 lb**
- Week 9 (peak): 143 × 0.90 × 1.16 = **150 lb** (PR territory)

Related exercises scale via `getUserBaseWeight()` ratios (incline=0.80, DB=0.50/hand, curls=0.25, etc.)

### Live Autoregulation
When a user logs an actual weight >10% different from prescribed, `adjustFutureWeights()` updates all future unfinished instances of that exercise. No plan regeneration needed — works on the existing plan in real-time. Green toast confirms the adjustment.

## Elite Programming Principles

1. **Mesocycle periodization** — 12-week cycles: accumulation → intensification → realization
2. **Est1RM-based weights** — working weights × 1.3, phase intensity applied to that
3. **Race-specific training** — Spartan profiles with must-include movements (pull-ups, carries, dead hangs)
4. **Cumulative weekly progression** — +2%/week compounds, +1% isolation, not reset per phase
5. **Context-aware WODs** — filtered by equipment, phase difficulty, Spartan relevance
6. **Composable day structure** — arm finishers, core blocks, runs added based on strategy
7. **Pattern-matched warmups/cooldowns** — lower body day gets hip/hamstring stretches, not shoulder work
8. **Seed exercise preference** — curated exercises get +15 scoring boost over ExerciseDB

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
