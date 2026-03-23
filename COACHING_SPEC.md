# Spartan Fitness — Elite Coaching Engine & AI Coach Spec

## Elite Programming Logic

### Stimulus Intent (not just exercises)
Each workout day must have a tagged intent:
- **strength** — heavy, low rep (3-5), long rest (3-5 min)
- **hypertrophy-mechanical** — moderate weight (70-80%), controlled tempo, moderate rest (60-90s)
- **hypertrophy-metabolic** — lighter weight, short rest (30-45s), pump/burn focus
- **power** — explosive, low rep (1-3), full recovery
- **conditioning** — sustained elevated HR, varied formats
- **skill/practice** — technique focus, light loads

Weekly plan ensures different stimuli across the week, not just different muscles.

### Tempo Prescriptions
4-digit code: eccentric-pause-concentric-pause (e.g., "3110" = 3s down, 1s hold, 1s up, 0 pause)
- Key lifts get prescribed tempos
- Before adding weight, slow the tempo (progression variable)

### Energy System Training
Deliberately train all three systems across the week:
- **Phosphocreatine** (5-15s) — sprints, heavy singles, box jumps
- **Glycolytic** (30s-2min) — AMRAPs, interval work, Tabata
- **Oxidative** (3+ min) — longer WODs, steady state, endurance runs

### Autoregulation (RPE/RIR)
Post-set prompt: "How did that feel?" → Too Easy / Just Right / Tough / Failed
- Adjusts next set or next session weight
- RPE 8 = 2 reps in reserve as default target
- Some days 225 is RPE 8, some days 205 is RPE 8

### Periodization (Mesocycle Structure)
12-week macrocycles with phases:
- **Weeks 1-4: Accumulation** — higher volume, moderate intensity, building work capacity
- **Weeks 5-8: Intensification** — lower volume, higher intensity, converting capacity to strength
- **Weeks 9-12: Realization/Peak** — low volume, high intensity, testing benchmarks
Each phase uses different rep ranges, set counts, exercise selections. Then test PRs and start new cycle.

### Intelligent Exercise Sequencing
Within a session, order matters:
1. Power/explosive FIRST
2. Compound strength SECOND
3. Isolation/accessories THIRD
4. Conditioning LAST
Never stack grip-intensive exercises back-to-back. Don't program box jumps after leg AMRAPs.

### Specific Warmups
Warmups prime exact movement patterns for the session:
- Overhead press day → band pull-aparts, shoulder dislocates, light presses, thoracic mobility
- Squat day → hip circles, goblet squats, ankle mobility
- Deadlift day → hip hinges, glute bridges, hamstring sweeps

---

## User Equipment Tracking

### Detailed Equipment Profile
Store specific equipment with weights/limitations:
```json
{
  "barbell": { "maxLoad": 110, "type": "standard" },
  "kettlebells": [53, 35, 25],
  "dumbbells": [],
  "pullUpBar": true,
  "bands": ["light", "medium"],
  "rower": false,
  "jumpRope": true
}
```

WODs and workouts automatically scale to available equipment and weight limits.

---

## AI Coach (Claude Sonnet 4.6)

### Model & Cost
- Claude Sonnet 4.6 via Anthropic API
- ~$0.01-0.04 per conversation (~$6/year per active user)
- System prompt cached via prompt caching

### Capabilities
| Capability | Example | Action |
|-----------|---------|--------|
| Swap exercises | "I don't have a barbell" | Replaces with equipment-appropriate alt |
| Handle injuries | "My shoulder hurts" | Swaps to safer movement, flags injury |
| Adjust difficulty | "That was too heavy" | Drops weight for remaining sets |
| Trim for time | "I only have 15 min" | Removes accessories, keeps compounds |
| Progress check | "How am I doing?" | Summarizes PRs, volume, weak points |
| Explain programming | "Why this exercise?" | Movement pattern rationale |
| Form cues | "How should I grip?" | Technique tips |
| Recovery guidance | "I'm sore, should I train?" | Adjusts intensity or suggests mods |

### Response Format
```json
{
  "message": "text shown to user (under 3 sentences)",
  "actions": [
    { "type": "swap", "exerciseId": "...", "newExerciseId": "..." },
    { "type": "adjustWeight", "exerciseId": "...", "newWeight": "185 lb" },
    { "type": "flagInjury", "bodyPart": "shoulder", "severity": "mild" }
  ]
}
```
Actions execute immediately with 10-second undo window.

### Context Per Message (~2,000-3,000 tokens)
- User profile (goal, experience, equipment detail)
- Current workout state
- Active injury flags
- Last 14 days training summary
- Available swap exercises
- Last 6 messages

### Injury Tracking
1. Exercise swapped to safer alternative
2. Body part flagged with severity (mild/moderate/severe)
3. Future workouts avoid stress on that area
4. User reports recovery later → gradually reintroduce

### UI
- Floating button on Active Workout + Weekly Plan
- Bottom sheet (60% height), workout visible behind
- Quick action chips: "Swap this", "Too heavy", "Too easy", "Short on time"
- Action cards inline showing changes with undo
- Chat history per workout session in SQLite

### Guardrails
- Never diagnoses injuries
- 20 messages per session hard cap
- 8-second API timeout with fallback
- All actions undoable

---

## Subscription Tiers

### Free — $0
- 3 workouts/week (rule engine, no AI)
- Full exercise library + GIFs
- Full logging + history
- 3 AI Coach messages/week
- Straight Sets + Supersets only
- Last 30 days progress
- No ads

### Pro — $9.99/mo or $69.99/year
- AI-assembled workouts (unlimited)
- All 8 workout formats
- 25 AI Coach messages/week
- Full history + charts
- Muscle heat map
- Injury tracking
- All progression models
- 3 plan regenerations/week

### Elite — $19.99/mo or $129.99/year
- Everything in Pro
- Unlimited AI Coach
- 12-week mesocycle programming
- Advanced analytics (est. 1RM, volume, weak points)
- Custom workout builder with AI
- HealthKit / Health Connect
- Priority AI responses

### Upgrade Triggers (contextual, never intrusive)
- Hit 3rd AI message → Pro prompt
- Try locked format → Pro prompt
- View progress >30 days → Pro prompt
- Complete week 4, mesocycle relevant → Elite prompt
- 25+ messages/week → Elite prompt

---

## Dependencies
- Anthropic API (Claude Sonnet 4.6)
- expo-sqlite (existing)
- Zustand (existing)
- expo-haptics
- RevenueCat or expo-in-app-purchases
