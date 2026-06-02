import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getWorkoutForDate,
  getPlanOverview,
  completeExercise as dbCompleteExercise,
  uncompleteExercise as dbUncompleteExercise,
  updateExerciseLog as dbUpdateExerciseLog,
  saveAmrapRounds as dbSaveAmrapRounds,
  completeDay as dbCompleteDay,
  swapExercise as dbSwapExercise,
  adjustFutureWeights as dbAdjustFutureWeights,
  deletePlan,
} from '../data/database';
import { generateAIPlan } from '../core/aiPlanGenerator';

const useWorkoutStore = create((set, get) => ({
  // Plan metadata
  currentPlanId: null,
  planStartDate: null,
  planEndDate: null,
  planPhases: [],
  totalWeeks: 0,

  // Today's view
  todayWorkout: null,
  selectedDate: new Date().toISOString().split('T')[0],
  lastAdjustment: null, // { exerciseName, newWeight, count } — for success toast
  pendingAdjustment: null, // { exerciseName, exerciseId, prescribed, actual, ratio, direction, pctDiff } — for user prompt
  adjustedExercises: {}, // { exerciseId: true } — already adjusted this session
  dismissedExercises: {}, // { exerciseId: true } — user said "keep as is"
  lastAdjustmentRatio: {}, // { exerciseId: ratio } — track what we last adjusted to
  _lastCheckedWeights: {}, // { planExerciseId: weight } — prevent duplicate checks on same weight

  // Plan overview
  planDays: [],

  // UI state
  expandedBlocks: {},
  isGenerating: false,
  isLoading: false,

  // ─── Actions ────────────────────────────────────────────

  loadPlanMeta: async () => {
    try {
      const meta = await AsyncStorage.getItem('planMeta');
      if (meta) {
        const parsed = JSON.parse(meta);
        set({
          currentPlanId: parsed.planId,
          planStartDate: parsed.startDate,
          planEndDate: parsed.eventDate,
          planPhases: parsed.phases,
          totalWeeks: parsed.totalWeeks,
        });
        return true;
      }
      return false;
    } catch (e) {
      console.error('Error loading plan meta:', e);
      return false;
    }
  },

  loadTodayWorkout: async () => {
    let { selectedDate, currentPlanId } = get();
    if (!currentPlanId) {
      await get().loadPlanMeta();
      currentPlanId = get().currentPlanId;
    }
    set({ isLoading: true });
    try {
      const workout = await getWorkoutForDate(selectedDate, currentPlanId);
      set({ todayWorkout: workout, isLoading: false });
    } catch (e) {
      console.error('Error loading workout:', e);
      set({ isLoading: false });
    }
  },

  loadWorkoutForDate: async (date) => {
    let { currentPlanId } = get();
    if (!currentPlanId) {
      await get().loadPlanMeta();
      currentPlanId = get().currentPlanId;
    }
    set({ selectedDate: date, isLoading: true, _lastCheckedWeights: {}, adjustedExercises: {}, dismissedExercises: {} });
    try {
      const workout = await getWorkoutForDate(date, currentPlanId);
      set({ todayWorkout: workout, isLoading: false });
    } catch (e) {
      console.error('Error loading workout:', e);
      set({ isLoading: false });
    }
  },

  loadPlanOverview: async () => {
    const { currentPlanId } = get();
    if (!currentPlanId) return;
    try {
      const days = await getPlanOverview(currentPlanId);
      set({ planDays: days });
    } catch (e) {
      console.error('Error loading plan overview:', e);
    }
  },

  toggleBlock: (blockIndex) => {
    set(state => ({
      expandedBlocks: {
        ...state.expandedBlocks,
        [blockIndex]: !state.expandedBlocks[blockIndex],
      },
    }));
  },

  toggleExercise: async (planExerciseId, isCurrentlyCompleted) => {
    // Optimistic update — toggle in state immediately, no full reload
    set(state => {
      const workout = state.todayWorkout;
      if (!workout?.blocks) return state;
      const updatedBlocks = workout.blocks.map(block => ({
        ...block,
        exercises: (block.exercises || []).map(ex =>
          ex.id === planExerciseId ? { ...ex, is_completed: isCurrentlyCompleted ? 0 : 1 } : ex
        ),
      }));
      return { todayWorkout: { ...workout, blocks: updatedBlocks } };
    });

    // Persist to DB in background
    try {
      if (isCurrentlyCompleted) {
        await dbUncompleteExercise(planExerciseId);
      } else {
        // Use already-entered actual weight if available, otherwise fall back to prescribed
        // so every completed exercise shows up in PRs and history
        const workout = get().todayWorkout;
        let actualWeight = null;
        let actualReps = null;
        if (workout?.blocks) {
          for (const block of workout.blocks) {
            const ex = (block.exercises || []).find(e => e.id === planExerciseId);
            if (ex) {
              const isBW = /^(BW|bodyweight|assisted|band)/i.test(String(ex.weight || ''));
              actualWeight = ex.actual_weight || (!isBW ? ex.weight : null);
              actualReps = ex.actual_reps || null;
              break;
            }
          }
        }
        await dbCompleteExercise(planExerciseId, actualWeight, actualReps);
      }
    } catch (e) {
      console.error('Error toggling exercise:', e);
      await get().loadTodayWorkout(); // Revert on failure
    }
  },

  updateExerciseLog: async (planExerciseId, actualReps, actualWeight, notes) => {
    try {
      await dbUpdateExerciseLog(planExerciseId, actualReps, actualWeight, notes);

      // Sync to Zustand state so toggleExercise reads the correct actual values
      set(state => {
        const workout = state.todayWorkout;
        if (!workout?.blocks) return state;
        return {
          todayWorkout: {
            ...workout,
            blocks: workout.blocks.map(block => ({
              ...block,
              exercises: (block.exercises || []).map(ex =>
                ex.id === planExerciseId
                  ? { ...ex, actual_weight: actualWeight ?? ex.actual_weight, actual_reps: actualReps ?? ex.actual_reps }
                  : ex
              ),
            })),
          },
        };
      });

      // Autoregulation: detect significant weight difference and prompt user
      // Rules:
      // - Only check when weight actually changed (not on reps-only updates)
      // - Don't ask if user dismissed this exercise ("keep as is")
      // - Don't ask if already adjusted, UNLESS new weight is even higher
      const lastCheckedWeight = get()._lastCheckedWeights?.[planExerciseId];
      const weightChanged = actualWeight && String(actualWeight).trim() && String(actualWeight) !== String(lastCheckedWeight);
      if (weightChanged) {
        set({ _lastCheckedWeights: { ...get()._lastCheckedWeights, [planExerciseId]: actualWeight } });
        const workout = get().todayWorkout;
        const { dismissedExercises, adjustedExercises } = get();
        if (workout?.blocks) {
          for (const block of workout.blocks) {
            const exercise = (block.exercises || []).find(e => e.id === planExerciseId);
            if (exercise) {
              const exId = exercise.exercise_id;
              // User said "keep as is" — never ask again this session
              if (dismissedExercises[exId]) break;

              // Skip autoregulation for bodyweight exercises (weight = "BW", "Assisted", etc.)
              const weightStr = String(exercise.weight || '').trim();
              const isBW = !weightStr || /^(BW|bodyweight|assisted|band)/i.test(weightStr);
              if (isBW) break;

              const prescribed = parseFloat(exercise.weight);
              const actual = parseFloat(actualWeight);
              console.log(`[Autoregulation] ${exId}: prescribed=${prescribed}, actual=${actual}, diff=${prescribed > 0 ? Math.round(((actual-prescribed)/prescribed)*100) : '?'}%`);
              if (!isNaN(prescribed) && !isNaN(actual) && prescribed > 0 && actual > 0) {
                const diff = (actual - prescribed) / prescribed;
                // Only autoregulate UPWARD (user exceeded prescription).
                // Downward adjustments are too risky — a wrong prescription or one-off fatigue
                // would silently drop weights across the entire plan. Users can ask Coach Charlie
                // to adjust if they genuinely need a lighter program.
                if (diff > 0.10) {
                  // Already adjusted — only re-prompt if weight went even HIGHER
                  if (adjustedExercises[exId]) {
                    const lastRatio = get().lastAdjustmentRatio?.[exId] || 1;
                    const newRatio = actual / prescribed;
                    if (newRatio <= lastRatio) break;
                  }

                  const ratio = actual / prescribed;
                  set({
                    pendingAdjustment: {
                      exerciseName: exercise.name,
                      exerciseId: exId,
                      prescribed: `${prescribed} lb`,
                      actual: `${Math.round(actual / 5) * 5} lb`,
                      ratio,
                      direction: 'higher',
                      pctDiff: Math.round(diff * 100),
                    },
                  });
                }
              }
              break;
            }
          }
        }
      }
    } catch (e) {
      console.error('Error updating exercise log:', e);
    }
  },

  confirmAdjustment: async () => {
    const pending = get().pendingAdjustment;
    if (!pending) return;
    try {
      const adjusted = await dbAdjustFutureWeights(pending.exerciseId, pending.ratio);
      set({
        pendingAdjustment: null,
        adjustedExercises: { ...get().adjustedExercises, [pending.exerciseId]: true },
        lastAdjustmentRatio: { ...get().lastAdjustmentRatio, [pending.exerciseId]: pending.ratio },
        lastAdjustment: { exerciseName: pending.exerciseName, newWeight: pending.actual, count: adjusted },
      });
      setTimeout(() => set({ lastAdjustment: null }), 4000);
    } catch (e) {
      console.error('Error adjusting future weights:', e);
      set({ pendingAdjustment: null });
    }
  },

  dismissAdjustment: () => {
    const pending = get().pendingAdjustment;
    if (pending) {
      set({ pendingAdjustment: null, dismissedExercises: { ...get().dismissedExercises, [pending.exerciseId]: true } });
    } else {
      set({ pendingAdjustment: null });
    }
  },

  saveAmrapRounds: async (planBlockId, rounds, elapsed = null) => {
    try {
      await dbSaveAmrapRounds(planBlockId, rounds, elapsed);
    } catch (e) {
      console.error('Error saving AMRAP rounds:', e);
    }
  },

  completeExercise: async (planExerciseId, actualWeight, actualReps) => {
    try {
      await dbCompleteExercise(planExerciseId, actualWeight, actualReps);
      await get().loadTodayWorkout(); // refresh
    } catch (e) {
      console.error('Error completing exercise:', e);
    }
  },

  completeDay: async (planDayId) => {
    try {
      await dbCompleteDay(planDayId);
      await get().loadTodayWorkout();
    } catch (e) {
      console.error('Error completing day:', e);
    }
  },

  swapExercise: async (planExerciseId, newExerciseId, oldExerciseId) => {
    try {
      await dbSwapExercise(planExerciseId, newExerciseId, oldExerciseId);
      await get().loadTodayWorkout(); // refresh
    } catch (e) {
      console.error('Error swapping exercise:', e);
    }
  },

  generateNewPlan: async (userProfile, onStatus) => {
    set({ isGenerating: true });
    try {
      // Delete old plan if exists
      const { currentPlanId } = get();
      if (currentPlanId) {
        await deletePlan(currentPlanId);
      }

      if (onStatus) onStatus('Connecting to AI coach...');
      const result = await generateAIPlan(userProfile, onStatus);
      console.log('[Plan] AI generation succeeded:', result.planName);

      // Save plan metadata
      await AsyncStorage.setItem('planMeta', JSON.stringify(result));

      set({
        currentPlanId: result.planId,
        planStartDate: result.startDate,
        planEndDate: result.eventDate,
        planPhases: result.phases,
        totalWeeks: result.totalWeeks,
        isGenerating: false,
        selectedDate: result.startDate,
      });

      // Load the first day's workout
      await get().loadTodayWorkout();
      await get().loadPlanOverview();

      return result;
    } catch (e) {
      console.error('Error generating plan:', e);
      set({ isGenerating: false });
      throw e;
    }
  },

  resetStore: () => {
    set({
      currentPlanId: null,
      planStartDate: null,
      planEndDate: null,
      planPhases: [],
      totalWeeks: 0,
      todayWorkout: null,
      selectedDate: new Date().toISOString().split('T')[0],
      planDays: [],
      expandedBlocks: {},
      isGenerating: false,
      isLoading: false,
    });
  },
}));

export default useWorkoutStore;
