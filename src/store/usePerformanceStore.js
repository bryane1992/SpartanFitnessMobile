import { create } from 'zustand';
import {
  getWorkoutStats,
  getRunStats,
  getPersonalRecords,
  getRunHistory,
  getBiggestStrengthGains,
  getWeeklyProgress,
  searchExercises as dbSearchExercises,
  getExerciseHistory as dbGetExerciseHistory,
} from '../data/database';

const usePerformanceStore = create((set, get) => ({
  // Quick stats
  completedWorkouts: 0,
  totalWorkouts: 0,
  completionRate: 0,
  exercisesLogged: 0,
  totalRuns: 0,
  totalRunDistance: 0,

  // Data
  personalRecords: [],
  runHistory: [],
  biggestGains: [],
  weeklyProgress: [],

  // Exercise search
  exerciseSearchResults: [],
  selectedExerciseId: null,
  selectedExerciseHistory: [],

  // Loading
  isLoading: false,
  isLoadingExercise: false,

  loadDashboard: async () => {
    set({ isLoading: true });
    try {
      const [workoutStats, runStats, prs, runs, gains, weekly] = await Promise.all([
        getWorkoutStats(),
        getRunStats(),
        getPersonalRecords(),
        getRunHistory(10),
        getBiggestStrengthGains(),
        getWeeklyProgress(),
      ]);

      set({
        completedWorkouts: workoutStats.completedWorkouts,
        totalWorkouts: workoutStats.totalWorkouts,
        completionRate: workoutStats.completionRate,
        exercisesLogged: workoutStats.exercisesLogged,
        totalRuns: runStats.totalRuns,
        totalRunDistance: runStats.totalDistance,
        personalRecords: prs,
        runHistory: runs,
        biggestGains: gains,
        weeklyProgress: weekly,
        isLoading: false,
      });
    } catch (e) {
      console.error('Error loading dashboard:', e);
      set({ isLoading: false });
    }
  },

  searchExercises: async (query) => {
    if (!query || query.length < 2) {
      set({ exerciseSearchResults: [] });
      return;
    }
    try {
      const results = await dbSearchExercises(query);
      set({ exerciseSearchResults: results });
    } catch (e) {
      console.error('Error searching exercises:', e);
    }
  },

  loadExerciseHistory: async (exerciseId) => {
    set({ isLoadingExercise: true, selectedExerciseId: exerciseId });
    try {
      const history = await dbGetExerciseHistory(exerciseId);
      set({ selectedExerciseHistory: history, isLoadingExercise: false });
    } catch (e) {
      console.error('Error loading exercise history:', e);
      set({ isLoadingExercise: false });
    }
  },

  clearExerciseHistory: () => {
    set({ selectedExerciseId: null, selectedExerciseHistory: [], exerciseSearchResults: [] });
  },
}));

export default usePerformanceStore;
