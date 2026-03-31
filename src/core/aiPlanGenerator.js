// AI Plan Generator v2 — Hybrid Architecture
// Claude makes programming decisions, code builds workouts deterministically
//
// Previous approach: Claude generated full workout templates → 30+ post-processing fixes
// New approach: Claude returns a plan CONFIG (day types, exercise priorities, WOD picks)
//              Code builds workouts using proven patterns from planGenerator.js

import Constants from 'expo-constants';
import { calculatePhases, getPhaseForWeek } from './phaseCalculator';
import { calculateWeight, calculateSetsReps, calculateRunParams, getBodyCompParams, getTempoForExercise, getMesocyclePhase, STIMULUS_TYPES } from './progressionRules';
import { getDatabase, savePlanDay, savePlanBlock, savePlanExercise, getExercisesByFilter, getWodsFromDb, updateBlockRunType } from '../data/database';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

function getApiKey() {
  return Constants.expoConfig?.extra?.claudeApiKey
    || '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';
}

// ═══════════════════════════════════════════════════════════════
// Day templates — proven structure from planGenerator.js
// Each template defines blocks with known durations and muscle groups
// ═══════════════════════════════════════════════════════════════

const DAY_TEMPLATES = {
  lower_power: {
    title: 'LOWER POWER',
    blocks: [
      { name: 'WARM-UP', type: 'MOVEMENT PREP', exerciseCount: 4, duration: '8 min', muscleGroups: ['full_body'], isWarmup: true },
      { name: 'MAIN LIFTS', type: 'COMPOUND', exerciseCount: 3, duration: '25 min', muscleGroups: ['legs', 'glutes'], compoundsOnly: true },
      { name: 'ACCESSORIES', type: 'SUPERSETS', exerciseCount: 3, duration: '12 min', muscleGroups: ['legs', 'glutes', 'arms'] },
    ],
  },
  upper_push_pull: {
    title: 'UPPER PUSH-PULL',
    blocks: [
      { name: 'WARM-UP', type: 'MOVEMENT PREP', exerciseCount: 4, duration: '8 min', muscleGroups: ['full_body'], isWarmup: true },
      { name: 'PUSH LIFTS', type: 'COMPOUND', exerciseCount: 2, duration: '15 min', muscleGroups: ['chest', 'shoulders'], compoundsOnly: true },
      { name: 'PULL LIFTS', type: 'COMPOUND', exerciseCount: 2, duration: '15 min', muscleGroups: ['back'], compoundsOnly: true },
      { name: 'ACCESSORIES', type: 'ISOLATION', exerciseCount: 3, duration: '10 min', muscleGroups: ['arms', 'shoulders'] },
    ],
  },
  sprint_conditioning: {
    title: 'SPRINT & CONDITIONING',
    blocks: [
      { name: 'WARM-UP', type: 'DYNAMIC PREP', exerciseCount: 4, duration: '8 min', muscleGroups: ['full_body'], isWarmup: true },
      { name: 'RUN', type: 'INTERVALS', exerciseCount: 3, duration: '25 min', muscleGroups: ['cardio'], hasGps: true, isRun: true },
      { name: 'WOD', type: 'AMRAP', exerciseCount: 4, duration: '12 min', muscleGroups: ['full_body'], isWod: true },
    ],
  },
  olympic_power: {
    title: 'OLYMPIC STRENGTH',
    blocks: [
      { name: 'WARM-UP', type: 'MOVEMENT PREP', exerciseCount: 4, duration: '8 min', muscleGroups: ['full_body'], isWarmup: true },
      { name: 'OLYMPIC LIFTS', type: 'COMPOUND', exerciseCount: 2, duration: '20 min', muscleGroups: ['full_body'], compoundsOnly: true, olympicOnly: true },
      { name: 'STRENGTH', type: 'COMPOUND', exerciseCount: 2, duration: '15 min', muscleGroups: ['legs', 'shoulders'], compoundsOnly: true },
      { name: 'CORE', type: 'FINISHER', exerciseCount: 3, duration: '8 min', muscleGroups: ['core'] },
    ],
  },
  endurance_metabolic: {
    title: 'ENDURANCE & METABOLIC',
    blocks: [
      { name: 'WARM-UP', type: 'PRE-RUN', exerciseCount: 3, duration: '8 min', muscleGroups: ['full_body'], isWarmup: true },
      { name: 'LONG RUN', type: 'LONG_RUN', exerciseCount: 3, duration: '30 min', muscleGroups: ['cardio'], hasGps: true, isRun: true },
      { name: 'WOD', type: 'FOR TIME', exerciseCount: 4, duration: '12 min', muscleGroups: ['full_body'], isWod: true },
    ],
  },
  strength: {
    title: 'FULL BODY STRENGTH',
    blocks: [
      { name: 'WARM-UP', type: 'MOVEMENT PREP', exerciseCount: 4, duration: '8 min', muscleGroups: ['full_body'], isWarmup: true },
      { name: 'MAIN LIFTS', type: 'COMPOUND', exerciseCount: 3, duration: '25 min', muscleGroups: ['chest', 'back', 'legs'], compoundsOnly: true },
      { name: 'ACCESSORIES', type: 'SUPERSETS', exerciseCount: 3, duration: '12 min', muscleGroups: ['arms', 'shoulders', 'back'] },
      { name: 'CORE FINISHER', type: 'CIRCUIT', exerciseCount: 3, duration: '8 min', muscleGroups: ['core'] },
    ],
  },
  wod_focus: {
    title: 'WOD DAY',
    blocks: [
      { name: 'WARM-UP', type: 'DYNAMIC PREP', exerciseCount: 4, duration: '8 min', muscleGroups: ['full_body'], isWarmup: true },
      { name: 'SKILL WORK', type: 'COMPOUND', exerciseCount: 2, duration: '15 min', muscleGroups: ['full_body', 'legs'], compoundsOnly: true },
      { name: 'WOD', type: 'AMRAP', exerciseCount: 4, duration: '15 min', muscleGroups: ['full_body'], isWod: true },
    ],
  },
  run_focus: {
    title: 'RUN DAY',
    blocks: [
      { name: 'WARM-UP', type: 'DYNAMIC ACTIVATION', exerciseCount: 4, duration: '8 min', muscleGroups: ['full_body', 'cardio'], isWarmup: true },
      { name: 'RUN', type: 'TEMPO', exerciseCount: 3, duration: '25 min', muscleGroups: ['cardio'], hasGps: true, isRun: true },
      { name: 'FUNCTIONAL CORE', type: 'OBSTACLE PREP', exerciseCount: 3, duration: '10 min', muscleGroups: ['core', 'full_body'] },
    ],
  },
  obstacle: {
    title: 'OBSTACLE TRAINING',
    blocks: [
      { name: 'WARM-UP', type: 'ACTIVATE', exerciseCount: 4, duration: '8 min', muscleGroups: ['full_body'], isWarmup: true },
      { name: 'STRENGTH CIRCUIT', type: 'FUNCTIONAL', exerciseCount: 4, duration: '20 min', muscleGroups: ['legs', 'back', 'full_body'], compoundsOnly: true },
      { name: 'OBSTACLE SKILLS', type: 'SPARTAN SPECIFIC', exerciseCount: 3, duration: '12 min', muscleGroups: ['full_body', 'back', 'arms'] },
    ],
  },
};

// Valid day type keys for Claude to choose from
const VALID_DAY_TYPES = Object.keys(DAY_TEMPLATES);

// ═══════════════════════════════════════════════════════════════
// Safe warmup exercises — never loaded, never runs
// ═══════════════════════════════════════════════════════════════

const WARMUP_IDS = [
  'easy_jog', 'dynamic_stretching', 'push_up_to_t', 'air_squats',
  'lunge_matrix', 'a_skips', 'pvc_pass_throughs', 'samson_stretch',
  'bear_crawl', 'cossack_squats', 'high_knees', 'strides',
  'arm_circles', 'inchworm',
];

// Safe cooldown exercises
const COOLDOWN_EXERCISES = [
  { id: 'hip_flexor_stretch', name: 'Hip Flexor Stretch', sets: '1', reps: '60s each', weight: 'BW' },
  { id: 'pigeon_pose', name: 'Pigeon Pose', sets: '1', reps: '60s each', weight: 'BW' },
  { id: 'shoulder_stretch', name: 'Shoulder Stretch', sets: '1', reps: '45s each', weight: 'BW' },
  { id: 'hamstring_stretch', name: 'Hamstring Stretch', sets: '1', reps: '45s each', weight: 'BW' },
  { id: 'thoracic_rotation', name: 'Thoracic Rotation', sets: '1', reps: '30s each', weight: 'BW' },
];

// ═══════════════════════════════════════════════════════════════
// Claude prompt — asks for plan CONFIG, not workout templates
// Single API call, small response (~500 tokens vs ~4000 per phase)
// ═══════════════════════════════════════════════════════════════

const CONFIG_PROMPT = `You are an elite strength & conditioning coach. Design a training CONFIGURATION (not full workouts — the app builds those).

Return valid JSON with this exact structure:
{
  "planName": "descriptive program name",
  "weeklySchedule": [
    { "day": 0, "type": "<day_type>", "focus": "brief focus description" }
  ],
  "exercisePriorities": {
    "primary_squat": "exercise_id",
    "primary_hinge": "exercise_id",
    "primary_push": "exercise_id",
    "primary_pull": "exercise_id",
    "primary_olympic": "exercise_id or null",
    "accessories": ["exercise_id", "exercise_id", ...]
  },
  "wodSelections": {
    "accumulation": ["wod_id", "wod_id", "wod_id"],
    "intensification": ["wod_id", "wod_id", "wod_id"],
    "realization": ["wod_id", "wod_id", "wod_id"]
  },
  "runPlan": {
    "weeklyRunDays": [day_indices_that_have_runs],
    "longRunDay": day_index_for_long_run
  },
  "programNotes": "coaching notes about the program design",
  "restDayAdvice": "recovery guidance"
}

VALID day types: ${VALID_DAY_TYPES.join(', ')}

RULES:
- weeklySchedule must have exactly N entries (matching training days/week)
- Each day type should appear at most twice per week
- For endurance/race goals: include at least 2 run days (sprint_conditioning, endurance_metabolic, or run_focus)
- For strength goals: prioritize lower_power, upper_push_pull, olympic_power
- exercisePriorities must use exercise IDs from the AVAILABLE list
- wodSelections must use WOD IDs from the AVAILABLE list
- Pick WODs that match user's equipment — don't pick WODs requiring gear they don't have
- Accumulation WODs: longer, beginner-friendly (AMRAPs, bodyweight)
- Intensification WODs: moderate, mixed modality
- Realization WODs: short, intense, competition-style
- JSON only, no other text`;

// ═══════════════════════════════════════════════════════════════
// Main generator
// ═══════════════════════════════════════════════════════════════

export async function generateAIPlan(userProfile, onStatus) {
  const apiKey = getApiKey();
  if (onStatus) onStatus('Analyzing your goals and equipment...');

  // Load exercise pool and WODs
  const exercisePool = await loadExercisePool(userProfile);
  const wodList = await getWodsFromDb();

  // Build the user context for Claude
  const userPrompt = buildUserPrompt(userProfile, exercisePool, wodList);

  if (onStatus) onStatus('Designing your program...');

  let config;
  try {
    config = await callClaudeForConfig(apiKey, userPrompt);
    config = validateAndFixConfig(config, userProfile, exercisePool, wodList);
  } catch (err) {
    console.warn('[AI Plan] Claude config failed, using smart defaults:', err.message);
    config = buildDefaultConfig(userProfile, exercisePool, wodList);
  }

  if (onStatus) onStatus('Building your workouts...');

  // Build the full plan deterministically from the config
  const result = await buildPlanFromConfig(config, userProfile, exercisePool, wodList, onStatus);
  return result;
}

// ═══════════════════════════════════════════════════════════════
// Claude API call — single call for plan config
// ═══════════════════════════════════════════════════════════════

async function callClaudeForConfig(apiKey, userPrompt) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: CONFIG_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json();
    const usage = data.usage;
    if (usage) console.log(`[AI Plan] Tokens in:${usage.input_tokens} out:${usage.output_tokens} stop:${data.stop_reason}`);

    let text = (data.content?.[0]?.text || '').trim();
    // Extract JSON from any surrounding prose
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      text = text.substring(jsonStart, jsonEnd + 1);
    }

    return JSON.parse(text);
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════
// Build user prompt with available exercises and WODs
// ═══════════════════════════════════════════════════════════════

function buildUserPrompt(userProfile, exercisePool, wodList) {
  const p = [];
  p.push(`PROFILE: ${userProfile.experience || 'intermediate'} level`);
  p.push(`GOALS: ${(userProfile.goals || [userProfile.goal]).join(', ')}`);
  p.push(`DAYS/WEEK: ${userProfile.trainingDaysPerWeek || 5}`);
  p.push(`TIME: ${userProfile.sessionDuration || 60} min`);

  if (userProfile.workingWeights) {
    const ww = userProfile.workingWeights;
    p.push(`WORKING WEIGHTS (8-10RM): Squat ${ww.squat || '?'}, Bench ${ww.bench || '?'}, Deadlift ${ww.deadlift || '?'}, OHP ${ww.overhead_press || '?'}, Row ${ww.row || '?'}`);
  }

  if (userProfile.equipment?.length) p.push(`EQUIPMENT: ${userProfile.equipment.join(', ')}`);
  if (userProfile.exclusions?.length) p.push(`EXCLUSIONS: ${userProfile.exclusions.join(', ')}`);
  if (userProfile.additionalNotes) p.push(`NOTES: ${userProfile.additionalNotes}`);

  // Available exercise IDs (seed exercises only, for brevity)
  const seedExercises = exercisePool.all.filter(e => e.source === 'seed' || !e.source);
  p.push(`\nAVAILABLE EXERCISE IDS:\n${seedExercises.map(e => `${e.id} (${e.name}, ${e.muscle_group}, ${e.category})`).join('\n')}`);

  // Available WOD IDs with equipment requirements
  const wodSummary = wodList.map(w => {
    const equip = w.equipment?.join(', ') || 'none';
    return `${w.id}: ${w.name} (${w.type}, ${w.difficulty}, ${w.estimatedTime}, equip: ${equip})`;
  });
  p.push(`\nAVAILABLE WOD IDS:\n${wodSummary.join('\n')}`);

  return p.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// Validate and fix Claude's config
// ═══════════════════════════════════════════════════════════════

function validateAndFixConfig(config, userProfile, exercisePool, wodList) {
  const daysPerWeek = userProfile.trainingDaysPerWeek || 5;

  // Validate weeklySchedule
  if (!config.weeklySchedule || !Array.isArray(config.weeklySchedule)) {
    throw new Error('Missing weeklySchedule');
  }
  // Ensure correct number of days
  if (config.weeklySchedule.length !== daysPerWeek) {
    config.weeklySchedule = config.weeklySchedule.slice(0, daysPerWeek);
    while (config.weeklySchedule.length < daysPerWeek) {
      config.weeklySchedule.push({ day: config.weeklySchedule.length, type: 'strength', focus: 'Full body' });
    }
  }
  // Validate day types
  for (const day of config.weeklySchedule) {
    if (!VALID_DAY_TYPES.includes(day.type)) {
      day.type = 'strength'; // Safe fallback
    }
  }

  // Validate exercise priorities — ensure IDs exist in pool
  if (!config.exercisePriorities) config.exercisePriorities = {};
  const allIds = new Set(exercisePool.all.map(e => e.id));
  for (const [key, val] of Object.entries(config.exercisePriorities)) {
    if (key === 'accessories' && Array.isArray(val)) {
      config.exercisePriorities.accessories = val.filter(id => allIds.has(id));
    } else if (val && !allIds.has(val)) {
      config.exercisePriorities[key] = null;
    }
  }

  // Validate WOD selections — ensure IDs exist
  const wodIds = new Set(wodList.map(w => w.id));
  if (!config.wodSelections) config.wodSelections = {};
  for (const phase of ['accumulation', 'intensification', 'realization']) {
    if (!config.wodSelections[phase] || !Array.isArray(config.wodSelections[phase])) {
      config.wodSelections[phase] = [];
    }
    config.wodSelections[phase] = config.wodSelections[phase].filter(id => wodIds.has(id));
    // Ensure at least 3 WODs per phase
    while (config.wodSelections[phase].length < 3) {
      const available = wodList.filter(w => !config.wodSelections[phase].includes(w.id));
      if (available.length === 0) break;
      config.wodSelections[phase].push(available[Math.floor(Math.random() * available.length)].id);
    }
  }

  // Validate run plan
  if (!config.runPlan) config.runPlan = { weeklyRunDays: [], longRunDay: null };

  return config;
}

// ═══════════════════════════════════════════════════════════════
// Default config — used when Claude fails
// ═══════════════════════════════════════════════════════════════

function buildDefaultConfig(userProfile, exercisePool, wodList) {
  const daysPerWeek = userProfile.trainingDaysPerWeek || 5;
  const goals = userProfile.goals || [userProfile.goal || 'balanced'];
  const hasEndurance = goals.some(g => ['endurance', 'athletic'].includes(g))
    || /spartan|race|run/i.test(userProfile.additionalNotes || '');

  // Default schedules by day count
  const SCHEDULES = {
    3: hasEndurance
      ? ['lower_power', 'upper_push_pull', 'endurance_metabolic']
      : ['lower_power', 'upper_push_pull', 'strength'],
    4: hasEndurance
      ? ['lower_power', 'upper_push_pull', 'sprint_conditioning', 'endurance_metabolic']
      : ['lower_power', 'upper_push_pull', 'olympic_power', 'strength'],
    5: hasEndurance
      ? ['lower_power', 'upper_push_pull', 'sprint_conditioning', 'olympic_power', 'endurance_metabolic']
      : ['lower_power', 'upper_push_pull', 'olympic_power', 'strength', 'wod_focus'],
    6: ['lower_power', 'upper_push_pull', 'sprint_conditioning', 'olympic_power', 'endurance_metabolic', 'wod_focus'],
  };

  const schedule = SCHEDULES[daysPerWeek] || SCHEDULES[5];

  // Filter WODs by user equipment
  const userEquip = new Set((userProfile.equipment || []).map(e => e.toLowerCase()));
  const compatibleWods = wodList.filter(w => {
    if (!w.equipment || w.equipment.length === 0) return true;
    return w.equipment.every(eq => userEquip.has(eq) || eq === 'none');
  });
  const fallbackWods = compatibleWods.length > 0 ? compatibleWods : wodList;

  const easyWods = fallbackWods.filter(w => w.difficulty === 'beginner' || w.difficulty === 'intermediate');
  const hardWods = fallbackWods.filter(w => w.difficulty === 'intermediate' || w.difficulty === 'advanced');
  const peakWods = fallbackWods.filter(w => w.difficulty === 'advanced' || w.difficulty === 'elite');

  const pickN = (arr, n) => {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n).map(w => w.id);
  };

  return {
    planName: `${userProfile.experience || 'Intermediate'} ${hasEndurance ? 'Spartan' : 'Strength'} Program`,
    weeklySchedule: schedule.map((type, i) => ({ day: i, type, focus: DAY_TEMPLATES[type]?.title || type })),
    exercisePriorities: {
      primary_squat: 'back_squat',
      primary_hinge: 'deadlift',
      primary_push: 'bench_press',
      primary_pull: 'barbell_row',
      primary_olympic: 'power_clean',
      accessories: ['face_pulls', 'db_curl', 'lateral_raise', 'tricep_pushdown', 'db_walking_lunges'],
    },
    wodSelections: {
      accumulation: pickN(easyWods.length >= 3 ? easyWods : fallbackWods, 3),
      intensification: pickN(hardWods.length >= 3 ? hardWods : fallbackWods, 3),
      realization: pickN(peakWods.length >= 3 ? peakWods : fallbackWods, 3),
    },
    runPlan: {
      weeklyRunDays: schedule.reduce((days, type, i) => {
        if (/run|sprint|endurance/.test(type)) days.push(i);
        return days;
      }, []),
      longRunDay: schedule.indexOf('endurance_metabolic'),
    },
    programNotes: 'Auto-generated program based on your profile.',
    restDayAdvice: 'Light walking, foam rolling, mobility work.',
  };
}

// ═══════════════════════════════════════════════════════════════
// Build the full plan deterministically from config
// ═══════════════════════════════════════════════════════════════

async function buildPlanFromConfig(config, userProfile, exercisePool, wodList, onStatus) {
  const planId = generateUUID();
  const startDate = getNextMonday();
  const eventDate = userProfile.eventDate || addWeeks(startDate, 16);
  const { totalWeeks, phases } = calculatePhases(startDate, eventDate);
  const trainingDays = userProfile.trainingDays || Array.from({ length: userProfile.trainingDaysPerWeek || 5 }, (_, i) => i);

  // Index WODs by ID for fast lookup
  const wodById = {};
  for (const w of wodList) wodById[w.id] = w;

  // Track recently used exercises for variety
  const recentlyUsed = new Set();
  const planIssues = [];

  for (let week = 1; week <= totalWeeks; week++) {
    const phase = getPhaseForWeek(phases, week);
    if (!phase) continue;
    const weekStartDate = addDays(startDate, (week - 1) * 7);
    const mesoPhase = getMesocyclePhase(week);
    const stimulus = STIMULUS_TYPES[mesoPhase.defaultStimulus];

    // Determine phaseKey for WOD selection
    const weeksFromEnd = totalWeeks - week;
    let phaseKey;
    if (weeksFromEnd < 3 && totalWeeks > 12) {
      phaseKey = 'realization'; // race prep uses peak WODs
    } else {
      const cw = ((week - 1) % 12) + 1;
      phaseKey = cw <= 4 ? 'accumulation' : cw <= 8 ? 'intensification' : 'realization';
    }

    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      const date = addDays(weekStartDate, dayOfWeek);
      const trainingDayIndex = trainingDays.indexOf(dayOfWeek);

      if (trainingDayIndex === -1) {
        await savePlanDay({
          planId, date, dayOfWeek, weekNumber: week,
          phase: phase.phase, title: 'REST DAY',
          focus: config.restDayAdvice || 'Recovery & mobility',
          color: '#333', emoji: '', isRestDay: true,
        });
        continue;
      }

      // Get the day config from Claude's schedule
      const dayConfig = config.weeklySchedule[trainingDayIndex % config.weeklySchedule.length];
      const template = DAY_TEMPLATES[dayConfig.type] || DAY_TEMPLATES.strength;

      const dayId = await savePlanDay({
        planId, date, dayOfWeek, weekNumber: week,
        phase: phase.phase,
        title: `${template.title}`,
        focus: `${mesoPhase.label} • ${stimulus.label} • Week ${week}`,
        color: phase.color, emoji: '', isRestDay: false,
      });

      // Track exercises used today — no duplicates across blocks in same day
      const usedToday = new Set();

      // Build each block
      for (let blockIdx = 0; blockIdx < template.blocks.length; blockIdx++) {
        const blockTemplate = template.blocks[blockIdx];

        const blockId = await savePlanBlock({
          planDayId: dayId, sortOrder: blockIdx,
          name: blockTemplate.name, type: blockTemplate.type,
          timeCap: blockTemplate.duration,
          isAmrap: blockTemplate.isWod || false,
          hasGps: blockTemplate.hasGps || false,
        });

        let exercises;
        if (blockTemplate.isRun) {
          // ── Run block: use proven run generation ──
          const runType = pickRunType(dayConfig.type, week, phase.phase, userProfile.experience);
          await updateBlockRunType(blockId, runType);
          exercises = generateRunExercises(week, phase.phase, totalWeeks, exercisePool, runType, userProfile.experience);
        } else if (blockTemplate.isWarmup) {
          // ── Warmup: safe hardcoded exercises ──
          exercises = selectWarmupExercises(blockTemplate, exercisePool);
        } else if (blockTemplate.isWod) {
          // ── WOD: pull directly from seed data ──
          exercises = selectWodExercises(blockTemplate, config.wodSelections, phaseKey, week, wodById, userProfile);
        } else {
          // ── Lifts/accessories: scored selection + progressionRules ──
          exercises = selectExercises(blockTemplate, exercisePool, recentlyUsed, week, phase.phase, userProfile, config.exercisePriorities, usedToday);
        }

        // Save exercises and track for day-level dedup
        for (let exIdx = 0; exIdx < exercises.length; exIdx++) {
          const ex = exercises[exIdx];
          await savePlanExercise({
            planBlockId: blockId, exerciseId: ex.id, sortOrder: exIdx,
            sets: ex.sets, reps: ex.reps, weight: ex.weight,
            rest: ex.rest || null, notes: ex.notes || null,
          });
          recentlyUsed.add(ex.id);
          usedToday.add(ex.id);
        }
      }

      // Add cooldown for 60+ min sessions
      const sessionMin = parseInt(userProfile.sessionDuration) || 60;
      if (sessionMin >= 60) {
        const cooldownBlockId = await savePlanBlock({
          planDayId: dayId, sortOrder: template.blocks.length,
          name: 'COOLDOWN', type: 'MOBILITY', timeCap: '6 min',
          isAmrap: false, hasGps: false,
        });
        for (let ci = 0; ci < COOLDOWN_EXERCISES.length; ci++) {
          const ce = COOLDOWN_EXERCISES[ci];
          await savePlanExercise({
            planBlockId: cooldownBlockId, exerciseId: ce.id, sortOrder: ci,
            sets: `${ce.sets}x${ce.reps}`, reps: ce.reps, weight: ce.weight,
            rest: null, notes: null,
          });
        }
      }
    }

    if (week % 2 === 0) recentlyUsed.clear();
    if (onStatus && week % 4 === 0) onStatus(`Week ${week}/${totalWeeks}...`);
  }

  if (planIssues.length > 0) {
    console.warn(`[AI Plan] ${planIssues.length} issues found:`);
    for (const issue of planIssues) console.warn(`  ${issue}`);
  } else {
    console.log('[AI Plan] No validation issues found');
  }

  return {
    planId, totalWeeks, phases, startDate, eventDate,
    planName: config.planName || 'AI Training Program',
    programNotes: config.programNotes || '',
    issues: planIssues,
  };
}

// ═══════════════════════════════════════════════════════════════
// Exercise selection — from planGenerator.js, enhanced with AI priorities
// ═══════════════════════════════════════════════════════════════

async function loadExercisePool(userProfile) {
  const styles = userProfile.workoutStyles || [userProfile.workoutStyle || 'hybrid'];
  const exerciseMap = new Map();
  for (const style of styles) {
    const exercises = await getExercisesByFilter({
      style, exclusions: userProfile.exclusions || [],
      equipment: userProfile.equipment || [],
      difficulty: userProfile.experience || 'intermediate',
    });
    for (const ex of exercises) exerciseMap.set(ex.id, ex);
  }
  const allExercises = Array.from(exerciseMap.values());
  const byMuscle = {};
  for (const ex of allExercises) {
    if (!byMuscle[ex.muscle_group]) byMuscle[ex.muscle_group] = [];
    byMuscle[ex.muscle_group].push(ex);
  }
  return { all: allExercises, byMuscle };
}

function selectExercises(blockTemplate, pool, recentlyUsed, weekNumber, phase, userProfile, priorities = {}, usedToday = new Set()) {
  const { muscleGroups, exerciseCount, compoundsOnly, olympicOnly } = blockTemplate;
  const bodyCompGoal = userProfile.bodyCompGoal || 'maintain';
  const bodyCompParams = getBodyCompParams(bodyCompGoal);
  const candidates = [];

  for (const mg of muscleGroups) {
    const exercises = pool.byMuscle[mg] || [];
    candidates.push(...exercises);
  }

  // Priority exercise IDs from Claude's config
  const priorityIds = new Set();
  if (priorities.primary_squat) priorityIds.add(priorities.primary_squat);
  if (priorities.primary_hinge) priorityIds.add(priorities.primary_hinge);
  if (priorities.primary_push) priorityIds.add(priorities.primary_push);
  if (priorities.primary_pull) priorityIds.add(priorities.primary_pull);
  if (priorities.primary_olympic) priorityIds.add(priorities.primary_olympic);
  if (priorities.accessories) priorities.accessories.forEach(id => priorityIds.add(id));

  const scored = candidates.map(ex => {
    let score = Math.random() * 5;
    if (compoundsOnly && ex.is_compound) score += 15;
    if (compoundsOnly && !ex.is_compound) score -= 20;
    if (olympicOnly && /clean|snatch|jerk/i.test(ex.name)) score += 20;
    if (olympicOnly && !/clean|snatch|jerk|push.*press/i.test(ex.name)) score -= 15;
    if (usedToday.has(ex.id)) score -= 100; // Never repeat within same day
    if (recentlyUsed.has(ex.id)) score -= 10;
    if (ex.is_compound && (phase === 'build' || phase === 'peak')) score += 5;
    if (ex.category === 'bodyweight' && ex.muscle_group === 'full_body') score += 3;
    if (ex.source === 'seed' || !ex.source) score += 8;
    // AI priority boost — Claude's preferred exercises get a big bonus
    if (priorityIds.has(ex.id)) score += 25;
    return { exercise: ex, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected = [];
  const usedIds = new Set();
  for (const item of scored) {
    if (usedIds.has(item.exercise.id)) continue;
    if (selected.length >= exerciseCount) break;
    usedIds.add(item.exercise.id);

    const ex = item.exercise;
    const { sets, reps } = calculateSetsReps(ex, weekNumber, phase, bodyCompGoal);
    const weight = calculateWeight(ex, weekNumber, phase, bodyCompGoal, userProfile.experience, userProfile.equipmentDetails);
    const tempo = getTempoForExercise(ex, weekNumber);

    let notes = null;
    if (tempo) notes = `Tempo: ${tempo}`;

    selected.push({
      id: ex.id,
      sets: `${sets}x${reps}`,
      reps: `${reps}`,
      weight: weight,
      rest: bodyCompParams.restSeconds,
      notes,
    });
  }

  return selected;
}

function selectWarmupExercises(blockTemplate, pool) {
  const available = WARMUP_IDS
    .map(id => pool.all.find(e => e.id === id))
    .filter(Boolean);

  const shuffled = available.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, blockTemplate.exerciseCount).map(ex => {
    const s = ex.default_sets?.toString() || '1';
    const r = ex.default_reps || '10';
    return {
      id: ex.id,
      sets: `${s}x${r}`,
      reps: r,
      weight: ex.default_weight || 'BW',
      rest: null, notes: null,
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// WOD selection — pulls directly from seed data, never freeform
// ═══════════════════════════════════════════════════════════════

function selectWodExercises(blockTemplate, wodSelections, phaseKey, week, wodById, userProfile) {
  const phaseWods = wodSelections[phaseKey] || wodSelections.accumulation || [];
  if (phaseWods.length === 0) {
    // Fallback: bodyweight circuit
    return [
      { id: 'air_squats', sets: '1x15', reps: '15', weight: 'BW', rest: null, notes: 'AMRAP round' },
      { id: 'push_ups', sets: '1x10', reps: '10', weight: 'BW', rest: null, notes: null },
      { id: 'sit_ups', sets: '1x15', reps: '15', weight: 'BW', rest: null, notes: null },
      { id: 'burpees', sets: '1x5', reps: '5', weight: 'BW', rest: null, notes: null },
    ];
  }

  // Rotate through WODs by week
  const wodId = phaseWods[(week - 1) % phaseWods.length];
  const wod = wodById[wodId];
  if (!wod) {
    return [
      { id: 'burpees', sets: '1x10', reps: '10', weight: 'BW', rest: null, notes: 'Default WOD' },
      { id: 'air_squats', sets: '1x15', reps: '15', weight: 'BW', rest: null, notes: null },
      { id: 'push_ups', sets: '1x10', reps: '10', weight: 'BW', rest: null, notes: null },
    ];
  }

  // Parse WOD movements into exercises
  // "15 Pull-Ups" → { name: "Pull-Ups", reps: "15" }
  // "400m Run" → { name: "Run", reps: "400m" }
  // "Thrusters (95/65 lb)" → { name: "Thrusters", reps: from scheme, weight: "95/65 lb" }
  const exercises = [];
  const scheme = parseScheme(wod.scheme);

  for (let i = 0; i < wod.movements.length; i++) {
    const movement = wod.movements[i];
    const parsed = parseWodMovement(movement, scheme, i);

    // Map movement name to exercise ID
    const exerciseId = fuzzyMatchWodMovement(parsed.name);

    exercises.push({
      id: exerciseId,
      sets: `1x${parsed.reps}`,
      reps: parsed.reps,
      weight: parsed.weight || wod.rxWeight || 'BW',
      rest: null,
      notes: i === 0 ? `${wod.name} — ${wod.type}${wod.timeCap ? ` (${wod.timeCap})` : ''}: ${wod.description}` : null,
    });
  }

  return exercises;
}

function parseScheme(scheme) {
  if (!scheme) return [];
  // "21-15-9" → [21, 15, 9]
  // "50-40-30-20-10" → [50, 40, 30, 20, 10]
  // "5 rounds" → [5]
  // "AMRAP 20" → []
  const nums = scheme.match(/\d+/g);
  return nums ? nums.map(Number) : [];
}

function parseWodMovement(movement, scheme, index) {
  // "15 Pull-Ups" → { name: "Pull-Ups", reps: "15", weight: null }
  const repNameMatch = movement.match(/^(\d+)\s+(.+)$/);
  if (repNameMatch) {
    const name = repNameMatch[2].replace(/\s*\([^)]+\)/, '').trim();
    const weightMatch = movement.match(/\(([^)]+)\)/);
    return { name, reps: repNameMatch[1], weight: weightMatch ? weightMatch[1] : null };
  }

  // "400m Run" → { name: "Run", reps: "400m", weight: null }
  const distMatch = movement.match(/^(\d+\s*m)\s+(.+)$/i);
  if (distMatch) {
    return { name: distMatch[2].trim(), reps: distMatch[1], weight: null };
  }

  // "Thrusters (95/65 lb)" → { name: "Thrusters", reps: from scheme, weight: "95/65 lb" }
  const nameOnly = movement.replace(/\s*\([^)]+\)/, '').trim();
  const weightMatch = movement.match(/\(([^)]+)\)/);
  const reps = scheme.length > 0 ? scheme.join('-') : '10';

  return { name: nameOnly, reps, weight: weightMatch ? weightMatch[1] : null };
}

// Simple mapping of WOD movement names to exercise IDs
function fuzzyMatchWodMovement(name) {
  const n = name.toLowerCase().replace(/[^a-z\s]/g, '').trim();
  const MAP = {
    'pull ups': 'pull_ups', 'pullups': 'pull_ups', 'chest to bar': 'pull_ups',
    'push ups': 'push_ups', 'pushups': 'push_ups',
    'air squats': 'air_squats', 'squats': 'air_squats',
    'burpees': 'burpees', 'burpee': 'burpees',
    'sit ups': 'sit_ups', 'situps': 'sit_ups',
    'thrusters': 'barbell_thrusters', 'thruster': 'barbell_thrusters',
    'deadlifts': 'deadlift', 'deadlift': 'deadlift',
    'cleans': 'power_clean', 'clean': 'power_clean', 'squat cleans': 'power_clean',
    'clean jerk': 'clean_and_jerk', 'clean  jerk': 'clean_and_jerk',
    'snatch': 'snatch', 'snatches': 'snatch', 'squat snatches': 'snatch',
    'push jerk': 'push_jerk', 'push jerks': 'push_jerk', 'jerk': 'push_jerk',
    'overhead squats': 'front_squat', 'overhead squat': 'front_squat',
    'box jumps': 'box_jumps', 'box jump': 'box_jumps',
    'kb swings': 'kb_swings', 'kettlebell swings': 'kb_swings',
    'wall balls': 'wall_balls', 'wall ball': 'wall_balls',
    'double unders': 'jump_rope', 'doubleunders': 'jump_rope',
    'ring dips': 'dips', 'dips': 'dips',
    'muscle ups': 'muscle_ups', 'muscleups': 'muscle_ups',
    'handstand push ups': 'handstand_push_ups', 'hspu': 'handstand_push_ups',
    'pistol squats': 'pistol_squats', 'pistol': 'pistol_squats',
    'run': 'easy_run', 'running': 'easy_run', 'mile run': 'easy_run',
    'row': 'burpees', 'rowing': 'burpees', // Most people don't have rowers
    'push press': 'push_jerk',
    'back extensions': 'back_extension',
    'step ups': 'step_ups', 'box step ups': 'step_ups',
    'farmer walk': 'farmer_walks', 'farmer carry': 'farmer_walks',
  };

  for (const [key, id] of Object.entries(MAP)) {
    if (n.includes(key)) return id;
  }
  return 'burpees'; // Safe fallback
}

// ═══════════════════════════════════════════════════════════════
// Run generation — from planGenerator.js, proven reliable
// ═══════════════════════════════════════════════════════════════

function pickRunType(dayType, weekNumber, phase, experience) {
  if (dayType === 'endurance_metabolic') {
    return phase === 'race_prep' ? 'EASY' : 'LONG_RUN';
  }

  const RUN_ROTATION = {
    foundation: ['EASY', 'INTERVALS', 'EASY', 'FARTLEK'],
    build: ['TEMPO', 'INTERVALS', 'FARTLEK', 'TEMPO'],
    peak: ['INTERVALS', 'RACE_PACE', 'TEMPO', 'INTERVALS'],
    race_prep: ['EASY', 'TEMPO', 'EASY', 'EASY'],
  };

  const rotation = RUN_ROTATION[phase] || RUN_ROTATION.foundation;
  let runType = rotation[(weekNumber - 1) % rotation.length];

  if (experience === 'beginner' && phase === 'foundation') {
    runType = 'EASY';
  }

  return runType;
}

function generateRunExercises(weekNumber, phase, totalWeeks, pool, runType, experience) {
  const runParams = calculateRunParams(weekNumber, phase, totalWeeks);
  const expMult = experience === 'beginner' ? 0.7
    : experience === 'intermediate' ? 0.85
    : experience === 'advanced' ? 1.0 : 1.1;

  const rawDist = parseFloat(runParams.distance);
  // Round to nearest 0.5 mi for easy measuring (1.4 → 1.5, 2.3 → 2.5, 3.7 → 3.5)
  const scaledDist = Math.round(rawDist * expMult * 2) / 2;
  const distance = `${scaledDist} mi`;
  const longRunMin = `${Math.round(scaledDist * 9)}-${Math.round(scaledDist * 11)} min`;

  const exercises = [
    { id: 'easy_jog', sets: '5 min', reps: '5 min', weight: 'Build pace', rest: null, notes: 'Warm into it' },
  ];

  const scaledIntervals = Math.max(2, Math.round(runParams.intervals * expMult));

  switch (runType) {
    case 'INTERVALS':
      exercises.push({
        id: 'interval_run',
        sets: `${scaledIntervals} rounds`,
        reps: phase === 'peak' ? '90s hard / 60s easy' : '2 min hard / 1 min easy',
        weight: phase === 'peak' ? 'Race pace' : '80-85% effort',
        rest: null, notes: `Target: ${distance}`,
      });
      break;
    case 'TEMPO':
      exercises.push({
        id: 'tempo_run', sets: `${distance}`,
        reps: distance,
        weight: runParams.paceType + ' pace',
        rest: null, notes: `Target: ${distance}`,
      });
      break;
    case 'FARTLEK':
      exercises.push({
        id: 'tempo_run', sets: '25 min variable',
        reps: '25 min variable',
        weight: 'Alternate fast/easy every 2-3 min',
        rest: null, notes: `Target: ${distance}`,
      });
      break;
    case 'LONG_RUN':
      exercises.push({
        id: 'easy_run', sets: distance,
        reps: distance,
        weight: 'Conversational pace',
        rest: null, notes: `Target: ${distance} (${longRunMin})`,
      });
      break;
    case 'RACE_PACE':
      exercises.push({
        id: 'interval_run', sets: distance,
        reps: distance,
        weight: 'Goal race pace',
        rest: null, notes: `Target: ${distance} at race effort`,
      });
      break;
    case 'EASY':
    default:
      exercises.push({
        id: 'easy_run', sets: distance,
        reps: distance,
        weight: 'Easy conversational pace',
        rest: null, notes: `Target: ${distance}`,
      });
      break;
  }

  exercises.push(
    { id: 'easy_jog', sets: '5 min', reps: '5 min', weight: 'Cool down', rest: null, notes: 'Easy jog to finish' },
  );

  return exercises;
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
  const date = new Date(dateStr + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

function addWeeks(dateStr, weeks) {
  return addDays(dateStr, weeks * 7);
}

function getNextMonday() {
  const now = new Date();
  const day = now.getDay();
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  now.setDate(now.getDate() + daysUntilMonday);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
