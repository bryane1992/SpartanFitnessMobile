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

### Phase 5: Three-layer exercise architecture [DONE]
- [x] Curated seed: 155 exercises with getMovementPattern()
- [x] ExerciseDB used ONLY for GIF display, NOT generation
- [x] buildFullExercisePool() removed — expand within curated seed only
- [x] 5+ exercises per pattern per difficulty tier (gap-filled)
- [x] Equipment requirements on sled, wall balls
- [x] Ability filter: ab wheel, jump squats, pike push-ups, toes to bar
- [x] Equipment minimums: machine=10, cable=5, barbell=45, KB=15

### Phase 6: Feedback loop [DONE]
- [x] plan_rationales SQLite table
- [x] savePlanRationales() stores after generation
- [x] Coach reads rationales (getPlanRationales)
- [x] Coach context includes archetype + rationales
- [x] Coach swap pool filtered through archetype menu

### Phase 7: Polish [DONE]
- [x] Creative workout names from Claude
- [x] WOD rotation across weeks
- [x] Exercise rotation with expandPool (phase-progressive equipment)
- [x] Weekly exercise frequency cap (max 2 per exercise per week)
- [x] Arm blaster + core fallbacks guaranteed
- [x] wantArms triggers on get_stronger/build_muscle goals
- [x] Beginner WODs: 22 real circuits (not single-exercise)
- [x] Plan export shows clean format with logged data

## Testing Matrix
- [ ] Spartan racer (regression: must stay 10/10)
- [ ] 225 lb beginner female, fat loss, "can't run" (target: 9/10+)
- [ ] 150 lb intermediate female, half marathon, bodyweight only
- [ ] 180 lb advanced male, hypertrophy, full gym
- [ ] 160 lb beginner male, general fitness, dumbbells only
- [ ] 250 lb beginner male, fat loss, home gym, no working weights
