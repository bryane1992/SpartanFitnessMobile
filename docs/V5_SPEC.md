# Plan Generator v5 — Constrained AI Selection + Feedback Loop

See full spec in conversation history. This tracks implementation.

## Implementation Phases

### Phase 1: Tag the data
- [ ] Tag all WODs with tier, totalEstimatedReps, containsRunning, containsPullUps
- [ ] Tag all seed exercises with movementPattern
- [ ] Ensure seed has minimum coverage per pattern (see spec for targets)

### Phase 2: Build the menu system
- [ ] buildExerciseMenu() — filters seed by equipment, ability, difficulty
- [ ] buildWodMenu() — filters by tier, movements, equipment
- [ ] Test menus for each archetype

### Phase 3: New Claude prompt
- [ ] Profile + archetype + menu prompt
- [ ] Response schema (exercise IDs + WOD IDs + rationales)
- [ ] Fallback to archetype defaults on failure

### Phase 4: Wire builder
- [ ] Builder takes Claude's exercise IDs instead of selectExercises()
- [ ] Builder takes Claude's WOD pool instead of wodSelector()
- [ ] Delete: selectExercises(), ExerciseDB generation calls

### Phase 5: Feedback loop
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
