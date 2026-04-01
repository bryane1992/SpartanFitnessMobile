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
import { generatePlan } from '../core/planGenerator';
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
  lastAdjustment: null, // { exerciseName, newWeight, count } — for toast display

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
    const { selectedDate } = get();
    set({ isLoading: true });
    try {
      const workout = await getWorkoutForDate(selectedDate);
      set({ todayWorkout: workout, isLoading: false });
    } catch (e) {
      console.error('Error loading workout:', e);
      set({ isLoading: false });
    }
  },

  loadWorkoutForDate: async (date) => {
    set({ selectedDate: date, isLoading: true });
    try {
      const workout = await getWorkoutForDate(date);
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
        await dbCompleteExercise(planExerciseId, null, null);
      }
    } catch (e) {
      console.error('Error toggling exercise:', e);
      await get().loadTodayWorkout(); // Revert on failure
    }
  },

  updateExerciseLog: async (planExerciseId, actualReps, actualWeight, notes) => {
    try {
      await dbUpdateExerciseLog(planExerciseId, actualReps, actualWeight, notes);

      // Autoregulation: if user logged a weight, compare to prescribed and adjust future weeks
      if (actualWeight) {
        const workout = get().todayWorkout;
        if (workout?.blocks) {
          for (const block of workout.blocks) {
            const exercise = (block.exercises || []).find(e => e.id === planExerciseId);
            if (exercise) {
              const prescribed = parseFloat(exercise.weight);
              const actual = parseFloat(actualWeight);
              if (!isNaN(prescribed) && !isNaN(actual) && prescribed > 0 && actual > 0) {
                const diff = (actual - prescribed) / prescribed;
                if (Math.abs(diff) > 0.10) {
                  // >10% difference — adjust future weeks
                  // Apply the actual weight as the new baseline, rounded to nearest 5
                  const newWeight = `${Math.round(actual / 5) * 5} lb`;
                  const adjusted = await dbAdjustFutureWeights(exercise.exercise_id, newWeight);
                  if (adjusted > 0) {
                    set({ lastAdjustment: { exerciseName: exercise.name, newWeight, count: adjusted } });
                    // Clear the toast after 4 seconds
                    setTimeout(() => set({ lastAdjustment: null }), 4000);
                  }
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

  saveAmrapRounds: async (planBlockId, rounds) => {
    try {
      await dbSaveAmrapRounds(planBlockId, rounds);
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

      let result;
      try {
        // Try AI-powered generation first
        if (onStatus) onStatus('Connecting to AI coach...');
        result = await generateAIPlan(userProfile, onStatus);
      } catch (aiError) {
        // Fall back to algorithmic generation
        console.warn('[Plan] AI generation failed, falling back to algorithmic:', aiError.message);
        if (onStatus) onStatus('Building plan with training engine...');
        result = await generatePlan(userProfile);
      }

      // Save plan metadata
      await AsyncStorage.setItem('planMeta', JSON.stringify(result));

      set({
        currentPlanId: result.planId,
        planStartDate: result.startDate,
        planEndDate: result.eventDate,
        planPhases: result.phases,
        totalWeeks: result.totalWeeks,
        isGenerating: false,
        selectedDate: new Date().toISOString().split('T')[0],
      });

      // Load today's workout
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
