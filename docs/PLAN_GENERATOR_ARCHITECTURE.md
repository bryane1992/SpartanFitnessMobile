---
name: Plan Generator v5 Architecture (Final)
description: Constrained AI selection — Claude picks from filtered menus, builder handles math, rationales stored, coach integrated
type: feedback
---

## v5 Architecture: Constrained Selection + Feedback Loop (IMPLEMENTED)

### Pipeline
```
userProfile → detectArchetype() (6 types, deterministic)
    → overweight_beginner | obstacle_racer | hypertrophy | fat_loss | endurance | general
    ↓
buildExerciseMenu() + buildWodMenu() (deterministic, pre-Claude)
    → ~50-60 exercises from 155 curated seed (equipment/ability/difficulty filtered)
    → ~10-15 WODs from tiered pool (beginner/intermediate/advanced)
    ↓
Claude Haiku (1 API call, ~2000-2500 tokens total)
    → Receives: profile + archetype + filtered menu
    → Returns: exercise POOLS per day + WOD pool + creative names + rationales
    → Can ONLY pick from the menu — no hallucination possible
    ↓
Deterministic builder
    → rotateExercises() picks subsets from pools, rotating across weeks
    → expandPool() fills gaps from seed, respecting archetype equipment preference
    → Phase-progressive equipment for beginners (machines→DB→barbell)
    → Weight calc: est1RM × phase intensity × weekly progression
    → Arm blaster + core fallbacks guaranteed when requested
    → WOD rotation: (week * daysPerWeek + dayIndex) % wodPool.length
    ↓
savePlanRationales() → SQLite (for coach and regeneration)
```

### Weight Calculation
```
User's 8-10RM × 1.3 = Estimated 1RM
  × Phase intensity (foundation 70%, build 80%, peak 90%, race_prep 75%)
  × Weekly progression (+2%/week compounds, +1% isolation, cumulative)
  × Deload (70% on week 4)
  → Floor: equipment minimums (machine=10, cable=5, barbell=45, KB=15)
  → Floor: 50% of known capacity
  → Cap: equipment max
```

### Archetype Defaults
| Archetype | Split | Equip Pref | Periodization | Arms | Max Sets |
|-----------|-------|-----------|---------------|------|---------|
| overweight_beginner | full_body_3-4x | machine→cable→DB | cycling (no taper) | if goals include strength | 3 |
| obstacle_racer | sport_specific_5x | BB→BW→KB | race (with taper) | 4x/week | 3-4 |
| hypertrophy | PPL | BB→cable→DB | accumulation blocks | every session | 4 |
| fat_loss | full_body_4x | mixed | cycling | 2x/week | 3 |
| endurance | run_focused | BW→DB | base→tempo→speed | optional | 3 |
| general | full_body_3x | mixed | linear | 2x/week | 3 |

### Exercise Pool (155 curated seed)
- NO ExerciseDB at generation time — seed only
- ExerciseDB used for GIF display at UI time
- getMovementPattern() maps all 155 exercises
- Equipment requirements enforced (sled requires 'sled', wall_balls require 'wall_ball')
- Ability filter: ab wheel, jump squats, pike push-ups, toes to bar penalized for beginners
- Beginner barbell blocked when machines available

### Phase-Progressive Equipment (beginners)
- Weeks 1-4: machine, cable, bodyweight ONLY
- Weeks 5-8: add dumbbell, kettlebell
- Weeks 9+: add barbell

### WOD System
- 168 WODs tagged with tier via getWodMetadata()
- 22 beginner WODs (real circuits, not single-exercise)
- Ascending EMOM / "death by" auto-detected as advanced
- Volume-based difficulty: 200+ reps = advanced, 100+ = intermediate boost
- Filtered by ability (no pull-ups for heavy beginners, no running for "can't run")

### Coach Integration
- plan_rationales table stores Claude's reasoning
- Coach context includes archetype + rationales
- Coach can explain "why am I doing Leg Press?" from stored rationale
- Remaining: coach swap pool should use filtered menu (currently uses full DB)

### Autoregulation
- User logs actual weight → if >10% different from prescribed, prompt to adjust
- adjustFutureWeights() scales all future weeks by ratio (progressive, not flat)
- User confirms before adjustment

### Per-Set Tracking
- Comma-separated reps (10,9,9,7) with per-set input rows
- Rep drop-off detection triggers coach suggestion after all sets logged
- Compounds: offer rep reduction OR weight reduction
- Isolation: offer weight reduction
- Stats show per-set history with green (hit target) / red (missed)

### Key Files
| File | Purpose |
|------|---------|
| aiPlanGenerator.js | v5 pipeline: menu → Claude → builder |
| menuBuilder.js | Exercise + WOD menu filtering |
| archetypes.js | 6 archetype detection + defaults |
| abilityFilter.js | Exercise ability scoring |
| beginnerPool.js | Beginner exercise allowlist |
| dayTemplates.js | Composable day blocks + splits |
| raceRequirements.js | Race profiles |
| progressionRules.js | Weight calc, sets/reps, equipment minimums |
| wodSeed.js + getWodMetadata | WOD tiering |
| exerciseSeed.js + getMovementPattern | 155 exercises with patterns |
| planValidator.js | Post-generation validation |
| database.js | plan_rationales table |
| coachApi.js | Coach context includes rationales |
| testProfiles.js | 7 test profiles for validation |
