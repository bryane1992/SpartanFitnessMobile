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
  deletePlan,
} from '../data/database';
import { generatePlan } from '../core/planGenerator';

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
    try {
      if (isCurrentlyCompleted) {
        await dbUncompleteExercise(planExerciseId);
      } else {
        await dbCompleteExercise(planExerciseId, null, null);
      }
      await get().loadTodayWorkout();
    } catch (e) {
      console.error('Error toggling exercise:', e);
    }
  },

  updateExerciseLog: async (planExerciseId, actualReps, actualWeight, notes) => {
    try {
      await dbUpdateExerciseLog(planExerciseId, actualReps, actualWeight, notes);
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

  generateNewPlan: async (userProfile) => {
    set({ isGenerating: true });
    try {
      // Delete old plan if exists
      const { currentPlanId } = get();
      if (currentPlanId) {
        await deletePlan(currentPlanId);
      }

      // Generate new plan
      const result = await generatePlan(userProfile);

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
