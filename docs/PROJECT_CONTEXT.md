---
name: Spartan Fitness project context
description: Mobile fitness app — v3 strategy-driven plan gen, est1RM weights, race profiles, AI coach
type: project
---

Spartan Fitness Mobile is a React Native app (Expo SDK 54, Expo Go compatible) for Spartan race and general fitness training.

**Current features (as of 2026-04-01):**
- 8-step onboarding: goals, body metrics, working weights (8-10RM), equipment + details, schedule, styles, notes
- v3 AI plan generator: Claude returns strategy (patterns/priorities), code builds deterministically
- Weight calc from estimated 1RM (working weight × 1.3), phase intensity, cumulative weekly progression
- Composable day templates: arm finisher, core, WOD, run configurable per day
- Race profiles: Spartan Sprint/Super/Beast, 5K-marathon with must-include movements
- Context-aware WOD selection: derives metadata at runtime, filters by equipment/phase/Spartan relevance
- Plan validator: catches equipment unused, weight sanity, missing movements
- AI Coach (Claude Haiku): swaps, weight adjustments, injury flagging with option cards
- ExerciseDB API: 1500+ exercises with GIFs, seed exercises (+15 scoring boost)
- 200+ CrossFit WODs from seed data
- GPS Run Tracker with segment timeline
- Stats screen: week-over-week lift deltas, run progression, all-time PRs
- Plan export includes full onboarding profile for debugging
- Autoregulation: logging actual weight >10% different from prescribed adjusts all future weeks live

**Architecture:** Strategy-driven hybrid. Claude picks movement patterns, code builds workouts. Weight starts near user's 8-10RM in foundation, progresses beyond it by peak. See CLAUDE.md for full pipeline.

**Why:** Bryan wants professional-grade Spartan Super training. Programming quality is #1.
**How to apply:** Expo Go compatible, no emojis, dark theme. Working weights × 1.3 = est1RM. Barbell preferred when available. Seed exercises strongly preferred over ExerciseDB.
