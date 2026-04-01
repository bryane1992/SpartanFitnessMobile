---
name: Plan Generator v3 Architecture
description: Full pipeline — strategy-driven AI, est1RM weights, autoregulation, composable templates, race profiles
type: feedback
---

## Architecture: Strategy → Build → Validate → Save → Autoregulate

### Weight Calculation (CRITICAL — most iterated piece)

```
User reports 8-10RM (e.g., bench = 110 lb)
    ↓
Estimated 1RM = working weight × 1.3 (e.g., 110 × 1.3 = 143 lb)
    ↓
Phase intensity as % of est1RM:
  foundation: 70% → 143 × 0.70 = 100 lb (starts near working weight)
  build:      80% → 143 × 0.80 = 115 lb
  peak:       90% → 143 × 0.90 = 130 lb
  race_prep:  75% → 143 × 0.75 = 107 lb
    ↓
Weekly progression: +2% per week cumulative (compounds), +1% isolation
    ↓
Deload: × 0.70 on week 4 of each phase
    ↓
Floor: never below 50% of known capacity
    ↓
Cap: never above equipment max
    ↓
AUTOREGULATION: if user logs actual_weight >10% different from prescribed,
  adjustFutureWeights() updates all future unfinished instances of that exercise
```

### Autoregulation (Live Weight Adaptation)

```
User completes exercise → logs actual weight (e.g., 125 lb vs 80 lb prescribed)
    ↓
useWorkoutStore.updateExerciseLog() detects >10% difference
    ↓
database.adjustFutureWeights(exerciseId, '125 lb')
    → UPDATE plan_exercises SET weight = '125 lb'
      WHERE exercise_id = ? AND is_completed = 0 AND date > today
    ↓
Green toast: "Romanian Deadlift adjusted to 125 lb for 8 future workouts"
    → Auto-dismisses after 4 seconds
```

**Design:** No RPE input UI (keeps workout flow fast). Uses actual_weight vs prescribed as the signal — if you log heavier, you get heavier going forward. 10% threshold prevents rounding noise. Only touches future unfinished exercises. Works on existing plans without regeneration.

### Movement Pattern Ratios (getUserBaseWeight)
- Direct: bench=1.0, squat=1.0, deadlift=1.0, OHP=1.0, row=1.0
- Bench family: incline=0.80, DB bench=0.50/hand, fly=0.30, curls=0.25
- Squat family: front squat=0.80, goblet=0.55, lunges=0.40/leg
- DL family: sumo=0.95, RDL=0.65, KB swing=0.35
- Olympic: power clean=0.60×DL, snatch=0.50×DL

### Claude's Role (1 API call, ~1000 tokens out)
Returns a **program strategy** — movement patterns and priorities, NOT exercise IDs.
- Day configs with movement patterns (squat, hinge, horizontal_push, etc.)
- Pattern priorities scored 1-10
- Equipment preferences for compounds
- Falls back to `buildDefaultStrategy()` if Claude fails

### Deterministic Builder
1. `dayTemplates.js` → composable blocks from strategy (arm finisher guaranteed when requested, core, WOD, run)
2. `selectExercises()` → scores by pattern priority, equipment pref, race reqs, seed bonus (+20), dedup
3. **Hard constraints:** barbell in compound blocks when available, pull-ups on pull days, carries on carry days
4. `calculateWeight()` → est1RM × phase intensity × weekly progression, with floors and caps
5. `wodSelector.js` → context-aware filtering with equipment-scaled weights
6. `raceRequirements.js` → Spartan/race profiles with must-include movements
7. `generateRunExercises()` → distance from target race, peaks at 110%, long runs unscaled by experience
8. `planValidator.js` → catches equipment unused, weight too low, missing movements
9. Race prep: fixed 3 sets compound / 2 isolation, bypasses mesocycle cycling, labeled TAPER

### Exercise Pool
- Style filter REMOVED — all exercises loaded regardless of workout style
- Equipment filter still applies (user's gear)
- Seed exercises get +20 scoring boost over ExerciseDB exercises
- Obscure ExerciseDB: -100 for gendered labels, version numbers, >40 chars, >5 words, behind-neck
- Duplicates by name (case variants) collapsed to highest-scored version
- Barbell exercises get +12 when user has barbell equipment
- Olympic lifts excluded by name when user has olympic_lift exclusion
- WOD movement mapping: ordered array (specific before generic), "Front Squats" → front_squat

### Block Priority Order in Day Templates
1. Warmup (8 min) — always
2. Primary compounds (25 min) — always
3. **Run (20-30 min)** — reserved before accessories
4. **WOD (8-12 min)** — reserved before accessories
5. **Arm finisher (8 min)** — guaranteed when requested (not gated by time)
6. Accessories (10 min) — if time remains
7. Core (8 min) — if time remains
8. Cooldown (5 min) — pattern-matched stretches

### Strategy Validation
- Min 2 run days enforced for endurance/Spartan goals
- Exactly 1 long_run day guaranteed (last training day)
- Min 2 WOD days enforced
- WOD weights scaled to user equipment (barbell max, KB snap to available)

### Key Files
| File | Purpose |
|------|---------|
| `aiPlanGenerator.js` | Strategy prompt + deterministic builder + hard constraints |
| `dayTemplates.js` | Composable block builder with priority ordering |
| `raceRequirements.js` | Race profiles (Spartan Sprint/Super/Beast, 5K-marathon) |
| `wodSelector.js` | Context-aware WOD filtering with derived metadata |
| `planValidator.js` | Post-generation validation |
| `progressionRules.js` | Weight calc (est1RM), sets/reps, run params, adjustWeightByRpe |
| `database.js` | SQLite, queries, adjustFutureWeights, export with profile |
| `useWorkoutStore.js` | Autoregulation trigger in updateExerciseLog |

### Design Rules
1. **Working weights are 8-10RM** — multiply by 1.3 for est1RM, apply phase % to that
2. **Week 1 should be near working weight** — not 75% of it
3. **Weekly progression is cumulative** — not reset per phase
4. **Seed exercises strongly preferred** — +20 over ExerciseDB, -100 for junk
5. **No style filtering** — all exercises available, scoring handles selection
6. **Hard constraints > scoring** — barbell/pullup/carry enforced after scoring
7. **Autoregulation is live** — no regeneration needed, adjusts on actual_weight log
8. **Export includes onboarding profile** — for debugging weight/exercise issues
9. **WOD weights scaled** — never prescribe more than user's equipment can handle
10. **Long runs reach race distance** — 110% of target, experience doesn't scale long runs
