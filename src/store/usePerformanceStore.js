import { create } from 'zustand';
import {
  getWorkoutStats,
  getRunStats,
  getRunHistory,
  getBiggestStrengthGains,
  getWeeklyProgress,
  getWeekOverWeekLifts,
  getRunProgression,
  getWodProgression,
  getWodStats,
  getCustomSessions,
  getWeeklyActivitySummary,
  getUnifiedPersonalRecords,
  getUnifiedExerciseHistory,
  getMuscleGroupVolume,
  searchExercises as dbSearchExercises,
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
  weekOverWeekLifts: [],
  runProgression: [],
  wodProgression: [],
  wodStats: { totalPlanWods: 0, totalLibraryWods: 0, bestAmrap: null, recentScores: [] },

  // Custom workout data
  customSessions: [],
  weeklySummary: { planSessions: 0, customSessions: 0, customCardioMinutes: 0 },
  muscleGroupVolume: { plan: [], custom: [] },

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
      const [workoutStats, runStats, prs, runs, gains, weekly, liftDeltas, runProg,
             wodProg, wodSt, custom, weeklySumm, muscleVol] = await Promise.all([
        getWorkoutStats(),
        getRunStats(),
        getUnifiedPersonalRecords().catch(() => []),
        getRunHistory(10),
        getBiggestStrengthGains(),
        getWeeklyProgress(),
        getWeekOverWeekLifts().catch(() => []),
        getRunProgression().catch(() => []),
        getWodProgression().catch(() => []),
        getWodStats().catch(() => ({ totalPlanWods: 0, totalLibraryWods: 0, bestAmrap: null, recentScores: [] })),
        getCustomSessions(10).catch(() => []),
        getWeeklyActivitySummary().catch(() => ({ planSessions: 0, customSessions: 0, customCardioMinutes: 0 })),
        getMuscleGroupVolume(8).catch(() => ({ plan: [], custom: [] })),
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
        weekOverWeekLifts: liftDeltas,
        runProgression: runProg,
        wodProgression: wodProg,
        wodStats: wodSt,
        customSessions: custom,
        weeklySummary: weeklySumm,
        muscleGroupVolume: muscleVol,
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

  // Unified exercise history — plan + custom merged
  loadExerciseHistory: async (exerciseId) => {
    set({ isLoadingExercise: true, selectedExerciseId: exerciseId });
    try {
      const history = await getUnifiedExerciseHistory(exerciseId);
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
