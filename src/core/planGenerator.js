// Plan Generator
// Orchestrates full multi-week plan creation from user preferences

import { calculatePhases, getPhaseForWeek } from './phaseCalculator';
import { calculateWeight, calculateSetsReps, calculateRunParams, getBodyCompParams } from './progressionRules';
import { getExercisesByFilter, savePlanDay, savePlanBlock, savePlanExercise, getDatabase, updateBlockRunType } from '../data/database';

// Day templates define the structure of each workout type
const DAY_TEMPLATES = {
  strength: {
    emoji: '',
    titlesByPhase: {
      foundation: 'GARAGE WARRIOR',
      build: 'MASS MONDAY',
      peak: 'PEAK POWER',
      race_prep: 'SHARP & READY',
    },
    blocks: [
      { name: 'WARM-UP', type: 'MOVEMENT PREP', exerciseCount: 4, duration: '8 min', muscleGroups: ['full_body'], isWarmup: true },
      { name: 'MAIN LIFTS', type: 'COMPOUND', exerciseCount: 3, duration: '25 min', muscleGroups: ['chest', 'back', 'legs'], compoundsOnly: true },
      { name: 'ACCESSORIES', type: 'SUPERSETS', exerciseCount: 3, duration: '12 min', muscleGroups: ['arms', 'shoulders', 'back'] },
      { name: 'CORE FINISHER', type: 'CIRCUIT', exerciseCount: 4, duration: '8 min', muscleGroups: ['core'], isAmrap: true },
    ],
  },
  wod: {
    emoji: '',
    titlesByPhase: {
      foundation: 'WOD WARRIOR',
      build: 'METCON MAYHEM',
      peak: 'BEAST MODE',
      race_prep: 'RACE READY WOD',
    },
    blocks: [
      { name: 'WARM-UP', type: 'DYNAMIC PREP', exerciseCount: 4, duration: '8 min', muscleGroups: ['full_body'], isWarmup: true },
      { name: 'SKILL WORK', type: 'MOVEMENT PRACTICE', exerciseCount: 2, duration: '15 min', muscleGroups: ['full_body', 'legs'], compoundsOnly: true },
      { name: 'WOD', type: 'AMRAP', exerciseCount: 4, duration: '12-20 min', muscleGroups: ['full_body', 'chest', 'legs', 'core'], isAmrap: true },
    ],
  },
  run: {
    emoji: '',
    titlesByPhase: {
      foundation: 'ROAD WORK',
      build: 'SPEED WORK',
      peak: 'RACE PACE',
      race_prep: 'RACE REHEARSAL',
    },
    blocks: [
      { name: 'WARM-UP', type: 'DYNAMIC ACTIVATION', exerciseCount: 4, duration: '8 min', muscleGroups: ['full_body', 'cardio'], isWarmup: true },
      { name: 'RUN', type: 'SPARTAN 10K BUILDER', exerciseCount: 4, duration: '25-40 min', muscleGroups: ['cardio'], hasGps: true, isRun: true },
      { name: 'FUNCTIONAL CORE', type: 'OBSTACLE PREP', exerciseCount: 4, duration: '15 min', muscleGroups: ['core', 'full_body'] },
    ],
  },
  obstacle: {
    emoji: '',
    titlesByPhase: {
      foundation: 'LEGS & GUNS',
      build: 'HEAVY CARRY',
      peak: 'OBSTACLE CRUSHER',
      race_prep: 'OBSTACLE READY',
    },
    blocks: [
      { name: 'WARM-UP', type: 'ACTIVATE', exerciseCount: 4, duration: '8 min', muscleGroups: ['full_body'], isWarmup: true },
      { name: 'STRENGTH CIRCUIT', type: 'FUNCTIONAL POWER', exerciseCount: 4, duration: '20 min', muscleGroups: ['legs', 'back', 'full_body'], compoundsOnly: true },
      { name: 'OBSTACLE TRAINING', type: 'SPARTAN SPECIFIC', exerciseCount: 4, duration: '15 min', muscleGroups: ['full_body', 'back', 'arms'] },
    ],
  },
  long_run: {
    emoji: '',
    titlesByPhase: {
      foundation: 'DISTANCE DAY',
      build: 'LONG HAUL',
      peak: 'DISTANCE PR',
      race_prep: 'FINAL LONG',
    },
    blocks: [
      { name: 'WARM-UP', type: 'PRE-RUN', exerciseCount: 3, duration: '8 min', muscleGroups: ['full_body', 'cardio'], isWarmup: true },
      { name: 'OBSTACLE RUN', type: 'ENDURANCE', exerciseCount: 5, duration: '30-55 min', muscleGroups: ['cardio'], hasGps: true, isRun: true },
      { name: 'GRIP & CARRY', type: 'SPARTAN SPECIFIC', exerciseCount: 3, duration: '12 min', muscleGroups: ['back', 'arms', 'full_body'] },
    ],
  },
  upper_push: {
    emoji: '',
    titlesByPhase: {
      foundation: 'PUSH DAY',
      build: 'PUSH POWER',
      peak: 'MAX PUSH',
      race_prep: 'PUSH MAINTAIN',
    },
    blocks: [
      { name: 'WARM-UP', type: 'MOVEMENT PREP', exerciseCount: 4, duration: '8 min', muscleGroups: ['full_body'], isWarmup: true },
      { name: 'PUSH LIFTS', type: 'COMPOUND', exerciseCount: 3, duration: '20 min', muscleGroups: ['chest', 'shoulders'], compoundsOnly: true },
      { name: 'PUSH ACCESSORIES', type: 'ISOLATION', exerciseCount: 3, duration: '12 min', muscleGroups: ['chest', 'shoulders', 'arms'] },
      { name: 'CORE', type: 'FINISHER', exerciseCount: 3, duration: '8 min', muscleGroups: ['core'] },
    ],
  },
  upper_pull: {
    emoji: '',
    titlesByPhase: {
      foundation: 'PULL DAY',
      build: 'PULL POWER',
      peak: 'MAX PULL',
      race_prep: 'PULL MAINTAIN',
    },
    blocks: [
      { name: 'WARM-UP', type: 'MOVEMENT PREP', exerciseCount: 4, duration: '8 min', muscleGroups: ['full_body'], isWarmup: true },
      { name: 'PULL LIFTS', type: 'COMPOUND', exerciseCount: 3, duration: '20 min', muscleGroups: ['back'], compoundsOnly: true },
      { name: 'PULL ACCESSORIES', type: 'ISOLATION', exerciseCount: 3, duration: '12 min', muscleGroups: ['back', 'arms'] },
      { name: 'CORE', type: 'FINISHER', exerciseCount: 3, duration: '8 min', muscleGroups: ['core'] },
    ],
  },
  lower: {
    emoji: '',
    titlesByPhase: {
      foundation: 'LEG DAY',
      build: 'LEG POWER',
      peak: 'MAX LEGS',
      race_prep: 'LEG MAINTAIN',
    },
    blocks: [
      { name: 'WARM-UP', type: 'MOVEMENT PREP', exerciseCount: 4, duration: '8 min', muscleGroups: ['full_body'], isWarmup: true },
      { name: 'LEG LIFTS', type: 'COMPOUND', exerciseCount: 3, duration: '25 min', muscleGroups: ['legs', 'glutes'], compoundsOnly: true },
      { name: 'LEG ACCESSORIES', type: 'ISOLATION', exerciseCount: 3, duration: '12 min', muscleGroups: ['legs', 'glutes'] },
      { name: 'CORE', type: 'FINISHER', exerciseCount: 3, duration: '8 min', muscleGroups: ['core'] },
    ],
  },
  full_body_circuit: {
    emoji: '',
    titlesByPhase: {
      foundation: 'FULL SEND',
      build: 'TOTAL BODY',
      peak: 'ALL OUT',
      race_prep: 'FINAL CIRCUIT',
    },
    blocks: [
      { name: 'WARM-UP', type: 'DYNAMIC PREP', exerciseCount: 4, duration: '8 min', muscleGroups: ['full_body'], isWarmup: true },
      { name: 'CIRCUIT A', type: 'FULL BODY', exerciseCount: 4, duration: '15 min', muscleGroups: ['chest', 'back', 'legs', 'shoulders'], isAmrap: true },
      { name: 'CIRCUIT B', type: 'CONDITIONING', exerciseCount: 4, duration: '12 min', muscleGroups: ['full_body', 'core', 'cardio'], isAmrap: true },
    ],
  },
};

// Map workout style + day count to day template assignments
const STYLE_SCHEDULES = {
  crossfit: {
    3: ['strength', 'wod', 'long_run'],
    4: ['strength', 'run', 'wod', 'long_run'],
    5: ['strength', 'run', 'wod', 'obstacle', 'long_run'],
    6: ['strength', 'run', 'wod', 'obstacle', 'long_run', 'full_body_circuit'],
  },
  traditional: {
    3: ['upper_push', 'lower', 'upper_pull'],
    4: ['upper_push', 'run', 'upper_pull', 'lower'],
    5: ['upper_push', 'run', 'upper_pull', 'lower', 'long_run'],
    6: ['upper_push', 'run', 'upper_pull', 'lower', 'long_run', 'full_body_circuit'],
  },
  bodyweight: {
    3: ['full_body_circuit', 'run', 'wod'],
    4: ['full_body_circuit', 'run', 'wod', 'obstacle'],
    5: ['full_body_circuit', 'run', 'wod', 'obstacle', 'long_run'],
    6: ['full_body_circuit', 'run', 'wod', 'obstacle', 'long_run', 'strength'],
  },
  hybrid: {
    3: ['strength', 'wod', 'long_run'],
    4: ['strength', 'run', 'wod', 'long_run'],
    5: ['strength', 'run', 'wod', 'obstacle', 'long_run'],
    6: ['strength', 'run', 'wod', 'obstacle', 'long_run', 'full_body_circuit'],
  },
};

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

// ═══════════════════════════════════════════════════════════════
// Main generator function
// ═══════════════════════════════════════════════════════════════

export async function generatePlan(userProfile) {
  const planId = generateUUID();
  // Start from next Monday so weeks align properly
  const startDate = getNextMonday();
  const eventDate = userProfile.eventDate || addWeeks(startDate, 16);

  const phaseData = calculatePhases(startDate, eventDate);
  const { totalWeeks, phases } = phaseData;

  const style = userProfile.workoutStyle || 'hybrid';
  const daysPerWeek = userProfile.trainingDaysPerWeek || 5;
  const trainingDays = userProfile.trainingDays || [0, 1, 2, 3, 4]; // default Mon-Fri
  const schedule = STYLE_SCHEDULES[style]?.[daysPerWeek] || STYLE_SCHEDULES.hybrid[daysPerWeek];

  // Preload exercise pool
  const exercisePool = await loadExercisePool(userProfile);

  // Track recently used exercises for variety
  const recentlyUsed = new Set();

  for (let week = 1; week <= totalWeeks; week++) {
    const phase = getPhaseForWeek(phases, week);
    if (!phase) continue;

    const weekStartDate = addDays(startDate, (week - 1) * 7);

    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      const date = addDays(weekStartDate, dayOfWeek);
      const trainingDayIndex = trainingDays.indexOf(dayOfWeek);
      const isTrainingDay = trainingDayIndex !== -1;

      if (!isTrainingDay) {
        // Rest day
        await savePlanDay({
          planId,
          date,
          dayOfWeek,
          weekNumber: week,
          phase: phase.phase,
          title: 'REST DAY',
          focus: 'Recovery & mobility',
          color: '#333',
          emoji: '',
          isRestDay: true,
        });
        continue;
      }

      // Get template for this training day
      const templateKey = schedule[trainingDayIndex % schedule.length];
      const template = DAY_TEMPLATES[templateKey];
      if (!template) continue;

      const title = template.titlesByPhase[phase.phase] || template.titlesByPhase.build;
      const dayEmoji = template.emoji;

      // Create the day
      const dayId = await savePlanDay({
        planId,
        date,
        dayOfWeek,
        weekNumber: week,
        phase: phase.phase,
        title: title,
        focus: phase.name + ' • Week ' + week,
        color: phase.color,
        emoji: '',
        isRestDay: false,
      });

      // Create blocks and exercises
      for (let blockIdx = 0; blockIdx < template.blocks.length; blockIdx++) {
        const blockTemplate = template.blocks[blockIdx];

        const blockId = await savePlanBlock({
          planDayId: dayId,
          sortOrder: blockIdx,
          name: blockTemplate.name,
          type: blockTemplate.type,
          timeCap: blockTemplate.duration,
          isAmrap: blockTemplate.isAmrap || false,
          hasGps: blockTemplate.hasGps || false,
        });

        // Select exercises for this block
        let exercises;
        if (blockTemplate.isRun) {
          const runType = pickRunType(templateKey, week, phase.phase, userProfile.experience);
          // Store the run type in the block type field for RunTracker auto-match
          await updateBlockRunType(blockId, runType);
          exercises = generateRunExercises(week, phase.phase, totalWeeks, exercisePool, runType, userProfile.experience);
        } else if (blockTemplate.isWarmup) {
          exercises = selectWarmupExercises(blockTemplate, exercisePool);
        } else {
          exercises = selectExercises(
            blockTemplate,
            exercisePool,
            recentlyUsed,
            week,
            phase.phase,
            userProfile
          );
        }

        for (let exIdx = 0; exIdx < exercises.length; exIdx++) {
          const ex = exercises[exIdx];
          await savePlanExercise({
            planBlockId: blockId,
            exerciseId: ex.id,
            sortOrder: exIdx,
            sets: ex.sets,
            reps: ex.reps,
            weight: ex.weight,
            rest: ex.rest || null,
            notes: ex.notes || null,
          });
          recentlyUsed.add(ex.id);
        }
      }
    }

    // Clear recently used every 2 weeks for variety
    if (week % 2 === 0) recentlyUsed.clear();
  }

  return { planId, totalWeeks, phases, startDate, eventDate };
}

// ═══════════════════════════════════════════════════════════════
// Exercise Selection
// ═══════════════════════════════════════════════════════════════

async function loadExercisePool(userProfile) {
  // Support multiple styles: merge exercises from all selected styles
  const styles = userProfile.workoutStyles || [userProfile.workoutStyle || 'hybrid'];
  const exerciseMap = new Map();

  for (const style of styles) {
    const exercises = await getExercisesByFilter({
      style,
      exclusions: userProfile.exclusions || [],
      equipment: userProfile.equipment || [],
      difficulty: userProfile.experience || 'intermediate',
    });
    for (const ex of exercises) {
      exerciseMap.set(ex.id, ex); // dedup by id
    }
  }

  const allExercises = Array.from(exerciseMap.values());

  // Index by muscle group
  const byMuscle = {};
  for (const ex of allExercises) {
    if (!byMuscle[ex.muscle_group]) byMuscle[ex.muscle_group] = [];
    byMuscle[ex.muscle_group].push(ex);
  }

  return { all: allExercises, byMuscle };
}

function selectExercises(blockTemplate, pool, recentlyUsed, weekNumber, phase, userProfile) {
  const { muscleGroups, exerciseCount, compoundsOnly } = blockTemplate;
  const bodyCompGoal = userProfile.bodyCompGoal || 'maintain';
  const bodyCompParams = getBodyCompParams(bodyCompGoal);
  const candidates = [];

  for (const mg of muscleGroups) {
    const exercises = pool.byMuscle[mg] || [];
    candidates.push(...exercises);
  }

  // Score and sort
  const scored = candidates.map(ex => {
    let score = Math.random() * 5; // base randomness for variety
    if (compoundsOnly && ex.is_compound) score += 15;
    if (compoundsOnly && !ex.is_compound) score -= 20;
    if (recentlyUsed.has(ex.id)) score -= 10;
    if (ex.is_compound && (phase === 'build' || phase === 'peak')) score += 5;
    // Spartan-specific bonus
    if (ex.category === 'bodyweight' && ex.muscle_group === 'full_body') score += 3;
    return { exercise: ex, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Pick top N unique exercises
  const selected = [];
  const usedIds = new Set();
  for (const item of scored) {
    if (usedIds.has(item.exercise.id)) continue;
    if (selected.length >= exerciseCount) break;
    usedIds.add(item.exercise.id);

    const ex = item.exercise;
    const { sets, reps } = calculateSetsReps(ex, weekNumber, phase, bodyCompGoal);
    const weight = calculateWeight(ex, weekNumber, phase, bodyCompGoal, userProfile.experience);

    selected.push({
      id: ex.id,
      sets: `${sets}x${reps}`,
      reps: reps,
      weight: weight,
      rest: bodyCompParams.restSeconds,
      notes: null,
    });
  }

  return selected;
}

function selectWarmupExercises(blockTemplate, pool) {
  const warmupIds = [
    'easy_jog', 'dynamic_stretching', 'push_up_to_t', 'air_squats',
    'lunge_matrix', 'a_skips', 'pvc_pass_throughs', 'samson_stretch',
    'bear_crawl', 'cossack_squats', 'high_knees', 'strides',
  ];

  const available = warmupIds
    .map(id => pool.all.find(e => e.id === id))
    .filter(Boolean);

  // Shuffle and pick
  const shuffled = available.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, blockTemplate.exerciseCount).map(ex => {
    const s = ex.default_sets?.toString() || '1';
    const r = ex.default_reps || '10';
    return {
      id: ex.id,
      sets: `${s} x ${r}`,
      reps: r,
      weight: ex.default_weight || 'BW',
      rest: null,
      notes: null,
    };
  });
}

// Pick a run type based on template, phase, week, and experience
function pickRunType(templateKey, weekNumber, phase, experience) {
  // Long run days always get LONG_RUN or EASY
  if (templateKey === 'long_run') {
    if (phase === 'race_prep') return 'EASY';
    return 'LONG_RUN';
  }

  // Short run days: vary by phase and week for variety
  const RUN_ROTATION = {
    foundation: ['EASY', 'INTERVALS', 'EASY', 'FARTLEK'],
    build: ['TEMPO', 'INTERVALS', 'FARTLEK', 'TEMPO'],
    peak: ['INTERVALS', 'RACE_PACE', 'TEMPO', 'INTERVALS'],
    race_prep: ['EASY', 'TEMPO', 'EASY', 'EASY'],
  };

  const rotation = RUN_ROTATION[phase] || RUN_ROTATION.foundation;
  const idx = (weekNumber - 1) % rotation.length;
  let runType = rotation[idx];

  // Beginners get easier runs in early phases
  if (experience === 'beginner' && phase === 'foundation') {
    runType = 'EASY';
  }

  return runType;
}

function generateRunExercises(weekNumber, phase, totalWeeks, pool, runType, experience) {
  const runParams = calculateRunParams(weekNumber, phase, totalWeeks);
  const expMultiplier = experience === 'beginner' ? 0.7 :
                        experience === 'intermediate' ? 0.85 :
                        experience === 'advanced' ? 1.0 : 1.1;

  // Scale distance by experience
  const rawDist = parseFloat(runParams.distance);
  const scaledDist = Math.round(rawDist * expMultiplier * 10) / 10;
  const distance = `${scaledDist} mi`;

  const longRunMin = `${Math.round(scaledDist * 9)}-${Math.round(scaledDist * 11)} min`;

  const runExercises = [
    { id: 'easy_jog', sets: '1 x 5 min', reps: '5 min', weight: 'Build pace', rest: null, notes: 'Warm into it' },
  ];

  const scaledIntervals = Math.max(2, Math.round(runParams.intervals * expMultiplier));

  switch (runType) {
    case 'INTERVALS':
      runExercises.push({
        id: 'interval_run',
        sets: `${scaledIntervals} rounds`,
        reps: phase === 'peak' ? '90s hard / 60s easy' : '2 min hard / 1 min easy',
        weight: phase === 'peak' ? 'Race pace' : '80-85% effort',
        rest: null, notes: `Target: ${distance}`,
      });
      break;
    case 'TEMPO':
      runExercises.push({
        id: 'tempo_run', sets: '20-25 min',
        reps: '20-25 min',
        weight: runParams.paceType + ' pace',
        rest: null, notes: `Target: ${distance}`,
      });
      break;
    case 'FARTLEK':
      runExercises.push({
        id: 'tempo_run', sets: '25 min variable',
        reps: '25 min variable',
        weight: 'Alternate fast/easy every 2-3 min',
        rest: null, notes: `Target: ${distance}`,
      });
      break;
    case 'LONG_RUN':
      runExercises.push({
        id: 'easy_run', sets: longRunMin,
        reps: longRunMin,
        weight: 'Conversational pace',
        rest: null, notes: `Target: ${distance}`,
      });
      break;
    case 'RACE_PACE':
      runExercises.push({
        id: 'interval_run', sets: '25 min',
        reps: '25 min',
        weight: 'Goal race pace',
        rest: null, notes: `Target: ${distance} at race effort`,
      });
      break;
    case 'EASY':
    default:
      runExercises.push({
        id: 'easy_run', sets: '20-30 min',
        reps: '20-30 min',
        weight: 'Easy conversational pace',
        rest: null, notes: `Target: ${distance}`,
      });
      break;
  }

  runExercises.push(
    { id: 'easy_jog', sets: '1 x 5 min', reps: '5 min', weight: 'Cool down', rest: null, notes: 'Easy jog to finish' },
  );

  // Add strides for non-easy runs
  if (runType !== 'EASY' && runType !== 'LONG_RUN') {
    const strides = pool.all.find(e => e.id === 'strides');
    if (strides) {
      runExercises.splice(1, 0, { id: 'strides', sets: '3 x 50m', reps: '50m', weight: '80% speed', rest: null, notes: 'Pre-run strides' });
    }
  }

  return runExercises;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function generateUUID() {
  return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}

function addDays(dateStr, days) {
  // Use UTC noon to avoid timezone boundary issues
  const date = new Date(dateStr + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

function addWeeks(dateStr, weeks) {
  return addDays(dateStr, weeks * 7);
}

function getNextMonday() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  now.setDate(now.getDate() + daysUntilMonday);
  // Format local date directly to avoid UTC shift
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
