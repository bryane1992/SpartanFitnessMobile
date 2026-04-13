# GritOS — Agent Rules & Architecture

## Quick Context for New Agents

This is a **React Native fitness app** (Expo SDK 54, Expo Go) with:
- AI-powered plan generation (v5: Claude picks from filtered menus, code builds everything)
- 196 curated seed exercises + 1500+ from ExerciseDB API with GIF demos
- 261 verified CrossFit WODs (SugarWOD-sourced) with score tracking
- GPS run tracker with segment timelines
- Stats screen (week-over-week lift deltas, run progression, PRs)
- AI Coach (Claude Haiku) for real-time workout modification
- AI Plan Reviewer (auto-rates generated plans for quality)
- Race-specific training (Spartan Sprint/Super/Beast, 5K-marathon profiles)
- Activity Logger (custom workouts, WOD logging, AI freetext)

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
    aiPlanGenerator.js  — v5 AI plan generator (Claude picks from menu + deterministic build)
    planGenerator.js    — Non-AI deterministic plan generator (reference/fallback)
    progressionRules.js — Weight calc (est1RM, phase intensity, sex/exp scaling, equipment caps)
    phaseCalculator.js  — Phase timeline (race-aware, short-plan handling, deload scheduling)
    dayTemplates.js     — Split configs (upper/lower, PPL, full body, sport-specific)
    archetypes.js       — User archetype detection (overweight_beginner, obstacle_racer, etc.)
    menuBuilder.js      — Exercise/WOD menu filtering (equipment, ability, difficulty)
    raceRequirements.js — Race profiles (Spartan Sprint/Super/Beast, 5K-marathon)
    wodSelector.js      — Context-aware WOD filtering (equipment, phase, Spartan relevance)
    planValidator.js    — Post-generation validation (11 checks)
    planReviewer.js     — AI plan reviewer (Claude Haiku rates generated plans)
    abilityFilter.js    — Bodyweight pull/barbell ability checks
    testProfiles.js     — Test profiles for plan generation (Spartan, bodybuilder, beginner, etc.)
  data/                 — Database, API clients, seed data
    database.js         — SQLite schema, migrations, all queries
    coachApi.js         — Claude Haiku coaching API client
    exerciseApi.js      — ExerciseDB API client
    exerciseSeed.js     — 196 curated exercises (compounds, accessories, rehab, stretches)
    wodSeed.js          — WOD metadata + movement pattern analysis
    sugarWodData.js     — 261 verified WODs from SugarWOD API
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
- ExerciseDB API for exercise catalog (RapidAPI, 720p GIFs)
- Anthropic API — Haiku 4.5 (coach + plan gen + reviewer)

## Navigation

```
Stack Navigator
├── Onboarding
├── Main (Bottom Tabs)
│   ├── Workout — TodayWorkout (daily view, day navigation)
│   ├── Track — ActivityLogger (exercises, WODs, AI freetext)
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
- **exercises** — 1600+ exercises (196 seed + ExerciseDB). Fields: id, name, muscle_group, category, style_tags, equipment_required, default_sets/reps/weight, is_compound, difficulty, source, gif_url, instructions, target_muscles, body_parts, api_id
- **exercise_alternatives** — bidirectional swap mappings
- **plan_days** — daily workout entries with phase, title, focus, color, is_rest_day, is_completed
- **plan_blocks** — workout blocks within a day (warmup, main lifts, WOD, finisher, etc.)
- **plan_exercises** — exercises within blocks with sets, reps, weight, rest, actual_weight, actual_reps, notes, is_completed
- **workout_history** — archived completed workout snapshots
- **custom_sessions** + **custom_entries** — activity logger data

### Tracking Tables
- **run_history** — completed GPS runs (date, run_type, time, distance, pace, splits JSON)
- **wod_history** — WOD completion scores (wod_id, date, score, score_type, rx, notes)

## ExerciseDB API

- **Base URL**: `https://exercisedb-api.vercel.app/api/v1`
- **No auth** — free, open API
- **Rate limit**: ~100 requests/min, handle 429 with 3s+ delay and exponential backoff
- **Max page size**: 100
- Endpoints: `/exercises?search=&bodyPart=&equipment=&limit=&offset=`, `/exercises/{id}`, `/bodyparts`, `/equipments`, `/muscles`
- Cache locally in SQLite after sync. App works offline after first sync.
- GIFs load on-demand via Image component (not pre-downloaded)

## AI Plan Generator (v5 — Constrained AI Selection)

### Architecture: "Claude Picks from Menu, Code Builds Everything"

```
Onboarding (8 steps) → userProfile saved to AsyncStorage
    ↓
Archetype Detection (deterministic)
    → overweight_beginner, obstacle_racer, bodybuilder, endurance, etc.
    → Sets split model, equipment preference, conditioning style, WOD difficulty
    ↓
Menu Building (deterministic)
    ├── menuBuilder.js: filters exercises by equipment, ability, difficulty
    │   ├── Equipment mapping (user selections → exercise requirements)
    │   ├── Ability checks (bodyweight pull, barbell capability)
    │   ├── Difficulty filter (beginners can't get advanced exercises)
    │   ├── Style filter (traditional profiles exclude Olympic/CrossFit lifts)
    │   └── Basic barbell lifts kept for beginners WITH machine access
    └── WOD menu: filtered by tier, movements, equipment, ability
    ↓
Claude Haiku (1 API call, ~4000 output tokens)
    → Receives: athlete profile + exercise menu + WOD menu + day structure
    → Returns: exercise POOLS per day (compounds, accessories, arms, core) + WOD pool
    → All IDs validated against menu (invalid IDs stripped)
    → NO fallback — fails fast if Claude fails
    ↓
Deterministic Builder (buildPlanV5)
    ├── dayTemplates.js: split configs drive day structure
    │   ├── 4-day beginner: upper/lower split (Lower A/Upper A/Lower B/Upper B)
    │   ├── 3-day: full body each day
    │   ├── 5-day Spartan: Push/Legs/Sprint/Pull/Carry+Run
    │   ├── 6-day bodybuilder: Chest/Back Width/Legs Quad/Shoulders+Arms/Legs Posterior/Back Thickness
    │   └── Day reordering based on user notes ("no legs Monday")
    │
    ├── Pattern-balanced compound selection
    │   ├── Each primary pattern gets at least 1 exercise (no all-push on push+pull day)
    │   ├── Fallback patterns when none available (v_pull → h_pull for home gyms)
    │   ├── Anchor lift (1st pattern) stays consistent every week for visible progression
    │   ├── 2nd pattern rotates for variety
    │   ├── NEVER_MAIN_LIFT regex blocks isolation/warmup as compounds
    │   └── BW exercises blocked from main lifts when real equipment available
    │
    ├── progressionRules.js: weight calculation
    │   ├── getUserBaseWeight() maps exercises to 8-10RM by movement pattern (30+ mappings)
    │   ├── Sex + experience scaling for seed defaults (no working weights)
    │   │   ├── Female: upper body × 0.50, lower body × 0.70
    │   │   ├── Beginner: × 0.60, Intermediate: × 0.75, Advanced: × 1.0
    │   │   └── No double-dip with old expMult (disabled when sex provided)
    │   ├── Phase intensity: Foundation 0.78, Build 0.83, Peak 0.90, Race Prep 0.85
    │   ├── Weekly progression: beginner +2.5%, intermediate +1.5%, advanced +1%, elite +0.8%
    │   ├── Deload: weight × 0.75, 2 sets, reps ≥ 8 (skipped for plans ≤5 weeks)
    │   ├── Equipment ceiling enforcement (barbell max, DB max)
    │   ├── Near-cap strategy: tempo at 85% of cap, AMRAP last set at 100%
    │   │   └── Now checks BOTH barbell AND dumbbell max (was barbell-only)
    │   ├── Fine rounding: ≤25 lb rounds to nearest 2.5 lb (visible progression)
    │   └── Equipment minimums: barbell 45 lb, machine 10 lb, cable 5 lb, DB 5 lb
    │
    ├── WOD selection (for non-beginner archetypes)
    │   ├── Phase-tier filtering (standard/intermediate/hero by phase)
    │   ├── Duration cap (>20 min blocked)
    │   ├── Beginner pre-filter: removes Olympic/gymnastics/long WODs from pool entirely
    │   ├── Movement ability checks (pull-ups, running, Olympic lifts)
    │   ├── Repeat cap (max 2 uses per WOD across plan)
    │   ├── Recency window (no same WOD within 8 assignments)
    │   ├── Week-level dedup (no same WOD twice in one week)
    │   ├── Type diversity (vary AMRAP/For Time/EMOM within week)
    │   ├── Hero WOD cap (max 3 across entire plan)
    │   └── Fallback safety: last-resort still enforces duration + beginner movement filters
    │
    ├── Beginner finishers (overweight_beginner only, replaces WODs)
    │   ├── 8-min AMRAP circuits on alternating lower-body days
    │   ├── 3 rotating circuits: lower metabolic, core+KB, bodyweight
    │   ├── No push exercises (prevents push/pull ratio skew)
    │   ├── Skipped on deload weeks
    │   └── Accessories dropped on finisher days to stay within session time
    │
    ├── Core block
    │   ├── Category rotation: anti-extension, flexion, anti-rotation, rotation
    │   ├── Equipment-aware (pallof press needs bands, cable woodchop needs cables)
    │   ├── Session-scaled: 2 exercises × 2 sets for ≤60 min, 3 × 3 for 75+ min
    │   └── Capped at source: Claude picks AND auto-select respect session limit
    │
    ├── Session time enforcement
    │   ├── calculateBlockTimes(): day-type templates (WOD day, sprint day, carry+run, pure lifting)
    │   ├── ≤30 min: 2 main lifts, no accessories/arms/WOD, 3-min core
    │   ├── ≤45 min: 2 main lifts, no arms; WOD days drop accessories, non-WOD days keep 1 accessory
    │   ├── 60 min: standard blocks
    │   ├── 75+ min: 4 sets per exercise, longer rest
    │   ├── 90+ min: 4 sets, 90-120s rest, 3 main lifts on pure lifting days
    │   └── enforceSessionTime(): drops accessories → arms → WOD if still over budget
    │
    ├── Equipment phasing for beginners
    │   ├── overweight_beginner with DB/machine access: barbell restricted entire plan
    │   ├── overweight_beginner barbell-only: all equipment allowed (it's all they have)
    │   ├── Other beginners with alternatives: barbell unlocked at week 9
    │   └── expandPool blocks advanced exercises for beginners (thrusters, snatches, muscle-ups, etc.)
    │
    └── Movement niche dedup
        ├── Prevents same-niche doubles (machine shoulder press + arnold press on same day)
        ├── 20+ niche mappings: flat_push, incline_push, overhead_press, row, curl, etc.
        └── Compounds check, accessories dedup against compound niches
    ↓
planValidator.js: 11 post-generation checks
    ↓
planReviewer.js: AI rates plan 0-10 on 8 categories (auto-runs after generation)
    ↓
SQLite: plan_days → plan_blocks → plan_exercises
```

### Key Design Rules
1. **Claude picks exercise IDs from a pre-filtered menu** — can't hallucinate exercises
2. **User's working weights are truth** — seed defaults only when no working weights
3. **Seed defaults scale by sex + experience** — not one-size-fits-all
4. **Pattern-balanced compound selection** — every primary pattern gets representation
5. **Anchor lift system** — first compound stays consistent for visible weight progression
6. **Equipment ceiling awareness** — tempo/AMRAP notes at cap, not silent plateau
7. **WODs from SugarWOD seed only** — 261 verified benchmarks, never AI-generated
8. **Beginners get finishers, not WODs** — safe metabolic circuits, not Cindy/Fran
9. **Validation + AI review** catches failures before save

### Phase Calculator

Adapts phase structure to plan length and race status:

| Duration | With Race | Without Race |
|----------|-----------|-------------|
| 4-5 weeks | Peak → Race Prep | Foundation only |
| 6-7 weeks | Foundation → Peak → Race Prep | Foundation → Build |
| 8-11 weeks | Foundation → Build → Peak → Race Prep | Foundation → Build → Peak |
| 12+ weeks | Foundation → Build → Peak → Race Prep | Foundation → Build → Peak |

- Deload every 4 weeks (skipped for plans ≤5 weeks)
- Non-race plans never get race_prep phase

### Archetype System

Detected from profile (BMI, experience, goals, equipment):

| Archetype | Split | Conditioning | Barbell | WODs |
|-----------|-------|-------------|---------|------|
| overweight_beginner | upper/lower 4-day | finishers only | restricted (DB/machine pref) | disabled |
| obstacle_racer | sport-specific 5-day | WODs + runs | full access | enabled |
| bodybuilder | PPL 6-day | none | full access | disabled |
| endurance | run-focused | runs | limited | disabled |
| general_fitness | full body 3-5 day | circuits | phased | enabled |

### AI Plan Reviewer

Auto-runs after every plan generation. Uses Claude Haiku to evaluate:
- Split balance (push:pull ratio, leg frequency)
- Exercise selection (day-role compliance, difficulty match)
- Weight progression (start → mid → end, equipment ceiling awareness)
- Phase structure (correct order, deload frequency)
- Session time (exercise count vs stated duration)
- WOD quality (only if conditioning goals exist)
- Equipment compliance
- Goal alignment

Includes weekly split analysis, key lift progression chart, and 4 sample weeks.

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
  → × Phase Intensity (foundation 78%, build 83%, peak 90%, race_prep 85%)
  → × Weekly Progression (+2.5%/week beginner, +1.5% intermediate, +1% advanced)
  → × Deload (75% on week 4 of each phase, skipped for ≤5 week plans)
  → Floor (never below 50% of known capacity)
  → Cap (never above equipment max — barbell AND dumbbell checked)
  → Near-cap notes (tempo at 85% of cap, AMRAP last set at 100%)
  → Round (≤25 lb → nearest 2.5 lb, >25 lb → nearest 5 lb)
```

**When no working weights exist** (beginners):
```
Seed default × Sex scale (female: upper 0.50, lower 0.70; male: 1.0)
  × Experience scale (beginner 0.60, intermediate 0.75, advanced 1.0)
  → Then same phase/progression/deload pipeline
```

**Example**: Male beginner, no working weights, Leg Press seed = 180 lb
- Scale: 180 × 1.0 × 0.60 = 108 lb
- Foundation: 108 × 0.78 = 84 → **85 lb**
- Build wk5: 108 × 0.83 × 1.10 = 98.5 → **100 lb**
- Peak wk10: 108 × 0.90 × 1.225 = 119 → **120 lb**

Related exercises scale via `getUserBaseWeight()` ratios (incline=0.80, DB=0.50/hand, curls=0.25, etc.)

### Live Autoregulation
When a user logs an actual weight >10% different from prescribed, `adjustFutureWeights()` updates all future unfinished instances of that exercise. No plan regeneration needed — works on the existing plan in real-time. Green toast confirms the adjustment.

## Elite Programming Principles

1. **Mesocycle periodization** — Foundation → Build → Peak cycles with proper deloads
2. **Est1RM-based weights** — working weights × 1.3, phase intensity applied to that
3. **Race-specific training** — Spartan profiles with must-include movements (pull-ups, carries, dead hangs)
4. **Experience-scaled progression** — beginners gain faster (+2.5%/wk), advanced slower (+1%/wk)
5. **Context-aware WODs** — filtered by equipment, phase tier, beginner safety, duration cap
6. **Pattern-balanced compounds** — every primary pattern gets at least 1 exercise per day
7. **Anchor lift system** — primary compound stays consistent for visible progression tracking
8. **Pattern-matched warmups/cooldowns** — lower body day gets hip/hamstring stretches, not shoulder work
9. **Seed exercise preference** — curated exercises get +15 scoring boost over ExerciseDB
10. **Sex-aware weight scaling** — female lower body scales differently than upper body

## Environment

- `.env` contains `EXPO_TOKEN` (EAS builds) and `CLAUDE_TOKEN` (Anthropic API) — **never commit this file**
- `.env` is in `.gitignore`
- `eas.json` configured for iOS and Android builds
- GitHub repo: `bryane1992/SpartanFitnessMobile` (private)

## WOD Library

- Seed data sourced from **SugarWOD API** — 261 verified WODs in `src/data/sugarWodData.js`
- Categories: Girls, Heroes, Benchmark
- Types: AMRAP, For Time, EMOM, Chipper, Couplet, Triplet
- Each WOD: id, name, category, type, movements[], scheme, rxWeight, difficulty, estimatedTime, equipment[]
- **Beginner safety**: WODs with Olympic lifts, gymnastics, or >20 min duration pre-filtered out
- **Phase-tier system**: standard (Foundation), intermediate (Build), hero (Peak only)
- Score tracking in `wod_history` table (time, rounds+reps, total reps, RX flag)
- Rx weights extracted from movement descriptions (135/261 have rx)
