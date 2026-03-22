# Spartan Fitness Mobile — Polish & Professional UI Blueprint

> **Purpose**: Implementation guide for Claude Code to transform Spartan Fitness from functional to professional-grade. Each section is a self-contained task with acceptance criteria. Work through them in priority order.

---

## Bug Fix: Track Run GPS Segment Visibility

**Priority: Immediate**

When running, the GPS tracker should clearly show ALL segments of the run so the user knows what they're doing at each point. Currently the workout plan shows the segments (warm-up, intervals, cool-down) but the actual run tracker screen doesn't make it obvious which segment is active, what's coming next, or how the segments relate to the planned workout.

**Fix needed**:
- Show a segment timeline/list on the running screen so the user can see all segments at a glance
- Highlight the current segment clearly
- Show upcoming segments dimmed below the active one
- Match segment names/durations to what the workout plan describes

---

## Tech Constraints (Do Not Violate)

- Expo SDK 54, must remain Expo Go compatible
- No custom dev builds / no native modules outside Expo Go
- Use `npx expo install` for all packages
- Dark theme: background `#0A0A0A`, accent `#FF4136`
- NO emojis anywhere in UI — use Lucide icons or text
- Zustand for state, AsyncStorage for persistence, expo-sqlite for structured data
- ExerciseDB API: `https://exercisedb-api.vercel.app/api/v1` (no auth)

---

## Priority 1: Core Polish (Do These First)

### 1.1 — Design System & Theme Foundation

**File**: `src/theme/index.js`

Create a centralized theme file that every component imports. No hardcoded colors or sizes anywhere else.

```js
export const theme = {
  colors: {
    bg: '#0A0A0A',
    bgElevated: '#111111',
    bgCard: '#161616',
    bgCardHover: '#1C1C1C',
    accent: '#FF4136',
    accentDim: '#CC342B',
    accentGlow: 'rgba(255, 65, 54, 0.15)',
    textPrimary: '#FFFFFF',
    textSecondary: '#999999',
    textMuted: '#555555',
    border: '#222222',
    borderAccent: '#FF4136',
    success: '#2ECC40',
    warning: '#FF851B',
    danger: '#FF4136',
  },
  spacing: {
    xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
  },
  radius: {
    sm: 6, md: 10, lg: 16, xl: 24, full: 999,
  },
  fontSize: {
    xs: 11, sm: 13, md: 15, lg: 18, xl: 22, xxl: 28, hero: 36,
  },
  fontWeight: {
    normal: '400', medium: '500', semibold: '600', bold: '700', black: '900',
  },
};
```

**Acceptance criteria**: Every screen and component imports from `theme`. Zero hardcoded color strings outside this file.

---

### 1.2 — Typography System

**File**: `src/components/Typography.js`

Create reusable text components: `<Heading>`, `<Subheading>`, `<Body>`, `<Caption>`, `<Label>`. Each wraps `Text` with correct theme size, weight, color, and letterSpacing. `Label` is uppercase with wide tracking. All accept a `color` override prop.

**Acceptance criteria**: No raw `<Text style={{fontSize: ...}}>` anywhere in screen files.

---

### 1.3 — Exercise GIF Card (Signature Component)

**File**: `src/components/ExerciseCard.js`

Dark card with: animated GIF (4:3 aspect ratio, gradient overlay), exercise name, pill badges for muscles/equipment, left border accent. Scale animation on press.

**Variants**: `compact` (horizontal for lists), `full` (vertical for browse), `active` (large GIF + rep counter for workouts).

**GIF handling**: Skeleton placeholder while loading, static placeholder on failure.

**Acceptance criteria**: One component used everywhere exercises appear. Loads gracefully. Animates on press.

---

### 1.4 — Skeleton Loading States

**File**: `src/components/Skeleton.js`

Animated shimmer skeleton placeholders using `react-native-reanimated`. Preset layouts: `SkeletonExerciseCard`, `SkeletonWorkoutRow`, `SkeletonStatBlock`.

**Acceptance criteria**: No plain spinners or empty space while loading.

---

### 1.5 — Haptic Feedback

**File**: `src/utils/haptics.js`

`expo-haptics` wrapper: `light` (button press), `medium` (complete set), `heavy` (complete workout), `success` (PR), `warning` (delete), `select` (picker scroll).

**Acceptance criteria**: Every interactive element has appropriate haptic feedback.

---

## Priority 2: Workout Experience

### 2.1 — Active Workout Screen

**File**: `src/screens/ActiveWorkoutScreen.js`

Normal bottom tabs stay visible. Persistent workout banner above tab bar on ALL screens (timer + exercise name + Resume). The workout screen shows: elapsed timer, exercise GIF (active variant), set/rep target, large tap targets for logging. Swipe between exercises. "Finish Workout" at bottom.

**Persistent Banner** (`src/components/ActiveWorkoutBanner.js`): Rendered at app layout level, visible when `workoutStore.activeWorkout` exists. Height ~56px. Tap navigates to workout. Swipe down to minimize.

**Acceptance criteria**: User can browse app while workout runs. Timer persists. Return is one tap. Large touch targets.

---

### 2.2 — Set Logging UX

**File**: `src/components/SetLogger.js`

Row per set: `Set 1 [weight] x [reps] [check]`. Pre-filled from last workout. Quick-adjust +5/-5 buttons. Completed sets highlighted. Swipe left to undo. "+ Add Set" at bottom.

**Acceptance criteria**: Logging a set takes at most 3 taps.

---

### 2.3 — Rest Timer

**File**: `src/components/RestTimer.js`

Slides up after set completion. Large countdown, circular progress ring, Skip/+30s/-30s buttons. Haptic at zero. Default times by exercise type.

**Acceptance criteria**: Auto-starts on set completion. Adjustable. Haptic fires at zero.

---

### 2.4 — Workout Complete Summary

**File**: `src/screens/WorkoutSummaryScreen.js`

Animated stats: Duration, Total Volume, Sets, Exercises. Animated count-up numbers. PR highlights with gold badge. Exercise breakdown list. "Save & Close" with haptic.

**Acceptance criteria**: Stats animate. PRs highlighted. Feels rewarding.

---

## Priority 3: Onboarding & First Impression

### 3.1 — Splash Screen & App Icon

Bold splash: `#0A0A0A` bg, "SPARTAN" large white text, thin `#FF4136` line. App icon: Spartan helmet or "S" in `#FF4136` on dark bg.

---

### 3.2 — Onboarding Flow (3 Screens)

Swipeable pages: Training Style (multi-select cards), Experience Level (single-select), Goal (multi-select). Dot indicators. "Get Started" on last page. Completes in under 30 seconds.

---

## Priority 4: Progress & Motivation

### 4.1 — Muscle Heat Map

**File**: `src/components/MuscleHeatMap.js`

SVG body outline (front + back) via `react-native-svg`. Muscle groups colored by sets this week (0=dark, 9+=full red). Tap muscle for tooltip detail. Home screen placement.

---

### 4.2 — Weekly Training Heat Calendar

**File**: `src/components/WeeklyHeatMap.js`

GitHub-style 12-week grid. Color by workout intensity. Current streak counter. Tap day for summary.

---

### 4.3 — Progress Charts

**File**: `src/components/ProgressChart.js`

Line charts for strength progression. `react-native-svg` custom lines. Gradient fill. Tappable data points. Time range selector (1mo/3mo/6mo/1yr/all).

---

## Priority 5: Animations & Micro-interactions

### 5.1 — Screen Transitions

Staggered fade-up for list items (50ms delay each). Spring overshoot on screen entry. Cross-fade tab switching. Custom pull-to-refresh.

---

### 5.2 — Interactive Button Component

**File**: `src/components/Button.js`

Variants: `primary` (filled accent), `secondary` (border), `ghost` (text only), `danger`. Scale 0.96 on press with spring. Haptic on press. Disabled/loading states.

---

### 5.3 — Animated Number Counter

**File**: `src/components/AnimatedNumber.js`

Count-up from 0 to final value over ~800ms with ease-out. For stats and summaries.

---

## Priority 6: Data & Offline

### 6.1 — ExerciseDB SQLite Cache

Already partially implemented. Enhance with: 7-day background refresh, full-text search index, subtle "Offline" indicator.

---

### 6.2 — Workout History Database

Enhance existing schema with per-set tracking, duration, and real-time PR detection during workouts.

---

## Priority 7: Empty States & Error Handling

### 7.1 — Empty States for Every Screen

Centered icon + bold heading + subtext + CTA button. No blank screens ever.

---

### 7.2 — Error Boundaries & Toast Notifications

`ErrorBoundary` wrapping each screen. `Toast` component: slides from top, auto-dismiss 3s, variants (success/error/info/pr).

---

## Priority 8: Wearable Integration (Apple Watch + Wear OS)

> **IMPORTANT**: Requires migrating from Expo Go to custom dev client (EAS Build). Tackle AFTER all other priorities.

### 8.1 — Migration to Custom Dev Client
Install `expo-dev-client`, `npx expo prebuild`, build via EAS.

### 8.2 — Apple Watch via HealthKit
`@kingstinct/react-native-healthkit`. Read HR/calories/steps, write workouts to Health app.

### 8.3 — Android via Health Connect
`react-native-health-connect`. Mirror iOS features.

### 8.4 — Unified Health Data Layer
`src/data/healthService.js` — platform abstraction so UI doesn't care about iOS vs Android.

### 8.5 — Future: Standalone Watch App (Out of Scope)
Requires native SwiftUI/Compose. Document as v2.

---

## Implementation Notes

1. **Install order**: `npx expo install expo-haptics react-native-reanimated react-native-svg`
2. **Work bottom-up**: Theme > Typography > Button > Skeleton > ExerciseCard > then screens
3. **Test as you go**: Verify each component renders before moving on
4. **Run `npx expo-doctor`** after adding packages
5. **Don't refactor everything at once** — update screens incrementally to new design system
6. **Prioritize workout flow**: active workout > set logging > rest timer > summary
7. **GIF performance**: Virtualized lists, only load visible GIFs
8. **SVG body map**: Use open-source anatomical outlines, stylized is fine
9. **Wearables are Priority 8 for a reason** — get app polished first
10. **Active Workout Banner**: Layout-level component wrapping tab navigator, driven by Zustand state
