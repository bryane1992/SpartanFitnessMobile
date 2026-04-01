---
name: Plan Generator v3 Architecture
description: Full pipeline — strategy-driven AI, est1RM-based weights, composable templates, validation, race profiles
type: feedback
---

## Architecture: Strategy → Build → Validate → Save

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
```

**Movement pattern ratios** (getUserBaseWeight):
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
1. `dayTemplates.js` → composable blocks from strategy (arm finisher, core, WOD, run on any day)
2. `selectExercises()` → scores by pattern priority, equipment pref, race reqs, seed bonus (+15), dedup
3. `calculateWeight()` → est1RM × phase intensity × weekly progression, with floors and caps
4. `wodSelector.js` → context-aware filtering (equipment, phase, Spartan relevance, pattern overlap)
5. `raceRequirements.js` → Spartan/race profiles with must-include movements
6. `generateRunExercises()` → distance from target race, peaks at 105%, rounds to 0.5 mi
7. `planValidator.js` → catches equipment unused, weight too low, missing movements

### Exercise Pool
- Style filter REMOVED — all exercises loaded regardless of workout style
- Equipment filter still applies (user's gear)
- Seed exercises get +15 scoring boost over ExerciseDB exercises
- Obscure ExerciseDB variations get -15 penalty
- Duplicates by name (case variants) collapsed to highest-scored version
- Barbell exercises get +12 when user has barbell equipment

### Key Files
| File | Purpose |
|------|---------|
| `aiPlanGenerator.js` | Strategy prompt + deterministic builder |
| `dayTemplates.js` | Composable block builder |
| `raceRequirements.js` | Race profiles (Spartan Sprint/Super/Beast, 5K-marathon) |
| `wodSelector.js` | Context-aware WOD filtering with derived metadata |
| `planValidator.js` | Post-generation validation |
| `progressionRules.js` | Weight calc (est1RM), sets/reps, run params |
| `database.js` | SQLite, queries, export (includes onboarding profile in export) |

### Design Rules
1. **Working weights are 8-10RM** — multiply by 1.3 for est1RM, apply phase % to that
2. **Week 1 should be near working weight** — not 75% of it
3. **Weekly progression is cumulative** — not reset per phase
4. **Seed exercises strongly preferred** — +15 over ExerciseDB exercises
5. **No style filtering** — all exercises available, scoring handles selection
6. **Export includes onboarding profile** — for debugging weight/exercise issues
