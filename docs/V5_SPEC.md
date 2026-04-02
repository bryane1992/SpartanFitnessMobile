# Plan Generator v5 — Constrained AI Selection + Feedback Loop

See full spec in conversation history. This tracks implementation.

## Implementation Phases

### Phase 1: Tag the data [DONE]
- [x] Tag all WODs with tier, totalEstimatedReps, containsRunning, containsPullUps (getWodMetadata)
- [x] Tag all seed exercises with movementPattern (getMovementPattern)
- [x] 8 beginner WODs added
- [x] Machine/cable exercises added to seed

### Phase 2: Build the menu system [DONE]
- [x] buildExerciseMenu() — filters seed by equipment, ability, difficulty
- [x] buildWodMenu() — filters by tier, movements, equipment
- [x] formatExerciseMenu/formatWodMenu — token-efficient prompt format
- [x] buildFullExercisePool() — ExerciseDB for rotation expansion

### Phase 3: New Claude prompt [DONE]
- [x] Profile + archetype + menu prompt
- [x] Response schema (exercise POOLS + WOD pool + rationales)
- [x] Fallback to archetype defaults on failure
- [x] Creative workout names ("IRON CURTAIN", "THUNDER THIGHS")

### Phase 4: Wire builder [DONE]
- [x] Builder takes Claude's exercise pools
- [x] rotateExercises picks subsets from pools across weeks
- [x] expandPool fills from ExerciseDB with archetype equipment preference
- [x] Phase-progressive equipment for beginners (machines→DBs→barbell)
- [x] WOD rotation across weeks using (week * days + dayIndex)

### Phase 5: Three-layer exercise architecture [TODO]
- [ ] Curate seed to ~150-200 exercises from 11K ExerciseDB
- [ ] ExerciseDB used ONLY for GIF display, NOT generation
- [ ] Remove buildFullExercisePool() — expand only within curated seed
- [ ] Min 5 exercises per pattern per difficulty tier

### Phase 6: Feedback loop [TODO]
- [ ] plan_rationales SQLite table
- [ ] Store rationales after generation
- [ ] Include past rationales in regeneration prompts

## Testing Matrix
- [ ] Spartan racer (regression: must stay 10/10)
- [ ] 225 lb beginner female, fat loss, "can't run" (target: 9/10+)
- [ ] 150 lb intermediate female, half marathon, bodyweight only
- [ ] 180 lb advanced male, hypertrophy, full gym
- [ ] 160 lb beginner male, general fitness, dumbbells only
- [ ] 250 lb beginner male, fat loss, home gym, no working weights
