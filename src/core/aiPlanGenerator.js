// AI Plan Generator v5 — Constrained AI Selection + Feedback Loop
// Claude picks exercises and WODs from a pre-filtered MENU
// Builder handles all math (weights, progression, periodization)
//
// Pipeline: detectArchetype → buildMenu → Claude picks → builder constructs

import Constants from 'expo-constants';
import { calculatePhases, getPhaseForWeek, isDeloadWeek } from './phaseCalculator';
import { calculateWeight, calculateSetsReps, calculateRunParams, getBodyCompParams, getMesocyclePhase, STIMULUS_TYPES } from './progressionRules';
import { savePlanDay, savePlanBlock, savePlanExercise, getExercisesByFilter, getWodsFromDb, updateBlockRunType, savePlanRationales } from '../data/database';
import { getRaceRequirements, getRaceExerciseRequirements, getRaceDistance } from './raceRequirements';
import { detectArchetype, adjustArchetypeForEquipment } from './archetypes';
import { buildExerciseMenu, buildWodMenu, formatExerciseMenu, formatWodMenu, buildFullExercisePool } from './menuBuilder';
import { seedExercises, getMovementPattern } from '../data/exerciseSeed';
import { buildDayBlocks, getDefaultDayConfigs } from './dayTemplates';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

function getApiKey() {
  return Constants.expoConfig?.extra?.claudeApiKey
    || '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';
}

// Warmup exercises — always safe
const WARMUP_IDS = [
  'dynamic_stretching', 'push_up_to_t', 'air_squats',
  'lunge_matrix', 'pvc_pass_throughs', 'samson_stretch',
  'bear_crawl', 'cossack_squats', 'high_knees',
  'arm_circles', 'inchworm',
];
const WARMUP_IDS_WITH_JOG = ['easy_jog', ...WARMUP_IDS, 'a_skips', 'strides'];

// ═══════════════════════════════════════════════════════════════
// v5 Claude Prompt — sends filtered menu, gets exercise IDs back
// ═══════════════════════════════════════════════════════════════

const V5_SYSTEM = `You are an elite S&C coach. You receive a filtered exercise menu and WOD menu. Pick EXERCISE POOLS for each training day — the app rotates through your picks across weeks for variety.

Return valid JSON:
{
  "planName": "descriptive name",
  "days": [
    {
      "dayIndex": 0,
      "title": "IRON CURTAIN",
      "compounds": ["bench_press", "floor_press", "incline_bench", "db_bench_press", "barbell_row", "cable_row"],
      "accessories": ["lat_pulldown", "cable_fly", "machine_row", "db_fly"],
      "arms": ["db_curl", "hammer_curl", "skull_crushers", "cable_tricep_pushdown"],
      "core": ["plank", "dead_bug", "mountain_climbers", "v_ups"],
      "rationale": "Why these exercises for this day"
    }
  ],
  "wodPool": ["wod_id1", "wod_id2", "wod_id3", "wod_id4", "wod_id5", "wod_id6", "wod_id7", "wod_id8"],
  "excludedRationale": "What was excluded and why",
  "progressionNotes": "Weight/progression guidance"
}

RULES:
- ONLY use exercise IDs from the EXERCISE MENU provided
- ONLY use WOD IDs from the WOD MENU provided
- Pick 4-6 compounds per day as a POOL (the app uses 2-3 per session, rotating across weeks for variety)
- Pick 3-4 accessories as a POOL (app uses 1-2 per session)
- Pick 3-4 arm exercises as a POOL if arm emphasis is requested
- Pick 2-4 core exercises as a POOL
- Pick 6-10 WODs for the wodPool — the app rotates through them across weeks so every week feels different
- Each day's compound pool should cover the required movement patterns with multiple options per pattern
- Consider the user's notes for constraints (injuries, can't run, etc.)
- "title" should be a FUN, CREATIVE workout name (e.g., "IRON CURTAIN", "GRIP & RIP", "THUNDER THIGHS", "GUN SHOW", "THE FURNACE")
- JSON only, no other text`;

// ═══════════════════════════════════════════════════════════════
// Main generator
// ═══════════════════════════════════════════════════════════════

export async function generateAIPlan(userProfile, onStatus) {
  const apiKey = getApiKey();
  if (onStatus) onStatus('Analyzing your goals...');

  // Step 1: Detect archetype (deterministic)
  let archetype = detectArchetype(userProfile);
  archetype = adjustArchetypeForEquipment(archetype, userProfile.equipment);
  console.log(`[AI Plan] Archetype: ${archetype.archetype} (${archetype.label})`);

  // Step 2: Build filtered menus (deterministic)
  let exerciseMenu, wodMenu;
  try {
    exerciseMenu = buildExerciseMenu(userProfile, archetype);
    wodMenu = buildWodMenu(userProfile, archetype);
    console.log(`[AI Plan] Exercise menu: ${exerciseMenu.length} exercises, WOD menu: ${wodMenu.length} WODs`);
    console.log(`[AI Plan] WOD menu IDs: ${wodMenu.map(w => `${w.id}(${w.tier})`).join(', ')}`);
  } catch (menuErr) {
    console.error('[AI Plan] Menu building failed:', menuErr.message);
    // Fallback: use all seed exercises without filtering
    exerciseMenu = seedExercises().map(ex => ({
      id: ex.id, name: ex.name, pattern: getMovementPattern(ex),
      equipment: ex.category, difficulty: ex.difficulty || 'intermediate',
    }));
    wodMenu = [];
  }

  // Step 3: Race requirements
  const raceReqs = getRaceRequirements(userProfile);
  const targetDistance = getRaceDistance(userProfile);

  // Step 4: Get day structure
  const goals = (userProfile.goals || [userProfile.goal || '']).map(g => g.toLowerCase());
  const equip = (userProfile.equipment || []).map(e => e.toLowerCase());
  const hasBarbell = equip.some(e => /barbell|squat.?rack/i.test(e));
  const hasSpartanGoal = !!raceReqs || goals.some(g => /spartan|obstacle|athletic/i.test(g));
  const daysPerWeek = userProfile.trainingDaysPerWeek || 5;
  const dayConfigs = getDefaultDayConfigs(daysPerWeek, goals, hasBarbell, hasSpartanGoal, archetype);

  // Step 5: Determine run eligibility
  const notes = (userProfile.additionalNotes || '').toLowerCase();
  const cantRun = /can'?t run|no running|don'?t run|unable to run|hate running|avoid running/i.test(notes);
  const excludesRunning = (userProfile.exclusions || []).includes('running');
  const hasExplicitRunGoal = /endurance|athletic|spartan|race|marathon|10k|5k/i.test(goals.join(' ') + ' ' + notes);
  const shouldHaveRuns = hasExplicitRunGoal && !cantRun && !excludesRunning;

  // Apply run constraints to day configs
  for (const day of dayConfigs) {
    if (!shouldHaveRuns && day.run) {
      day.run = null;
      if (!day.wod) day.wod = { type: 'CIRCUIT' };
    }
  }
  // Ensure long run for racers
  if (shouldHaveRuns) {
    if (!dayConfigs.some(d => d.run?.type === 'long_run')) {
      dayConfigs[dayConfigs.length - 1].run = { type: 'long_run', label: 'LONG RUN' };
    }
    if (dayConfigs.filter(d => d.run).length < 2) {
      const midIdx = Math.floor(daysPerWeek / 2);
      if (!dayConfigs[midIdx].run) dayConfigs[midIdx].run = { type: 'intervals', label: 'INTERVALS' };
    }
  }

  if (onStatus) onStatus('Designing your program...');

  // Step 6: Claude picks exercises from menu
  let claudeSelections;
  try {
    claudeSelections = await callClaudeV5(apiKey, userProfile, archetype, exerciseMenu, wodMenu, dayConfigs, raceReqs);
  } catch (err) {
    console.warn('[AI Plan] Claude call failed, using defaults:', err.message);
    claudeSelections = buildDefaultSelections(dayConfigs, exerciseMenu, wodMenu, archetype);
  }

  if (onStatus) onStatus('Building your workouts...');

  // Step 7: Build the plan using Claude's picks + curated seed for rotation
  // Seed only — no ExerciseDB at generation time (ExerciseDB is for GIF display)
  const result = await buildPlanV5(claudeSelections, dayConfigs, userProfile, exerciseMenu, wodMenu, targetDistance, shouldHaveRuns, archetype, onStatus);
  return result;
}

// ═══════════════════════════════════════════════════════════════
// Claude API — sends menu, gets exercise IDs back
// ═══════════════════════════════════════════════════════════════

async function callClaudeV5(apiKey, userProfile, archetype, exerciseMenu, wodMenu, dayConfigs, raceReqs) {
  const prompt = buildV5Prompt(userProfile, archetype, exerciseMenu, wodMenu, dayConfigs, raceReqs);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, system: V5_SYSTEM, messages: [{ role: 'user', content: prompt }] }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    const usage = data.usage;
    if (usage) console.log(`[AI Plan] Tokens in:${usage.input_tokens} out:${usage.output_tokens}`);
    let text = (data.content?.[0]?.text || '').trim();
    const s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s >= 0 && e > s) text = text.substring(s, e + 1);
    const parsed = JSON.parse(text);

    // Validate all IDs exist in the menu
    const validExIds = new Set(exerciseMenu.map(e => e.id));
    const validWodIds = new Set(wodMenu.map(w => w.id));
    for (const day of (parsed.days || [])) {
      day.compounds = (day.compounds || []).filter(id => validExIds.has(id));
      day.accessories = (day.accessories || []).filter(id => validExIds.has(id));
      day.arms = (day.arms || []).filter(id => validExIds.has(id));
      day.core = (day.core || []).filter(id => validExIds.has(id));
      if (day.wod && !validWodIds.has(day.wod)) day.wod = null;
    }
    parsed.wodPool = (parsed.wodPool || []).filter(id => validWodIds.has(id));

    console.log('[AI Plan] Claude selections:', JSON.stringify((parsed.days || []).map(d => ({ title: d.title, compounds: d.compounds, wod: d.wod, rationale: d.rationale?.slice(0, 80) }))));
    console.log('[AI Plan] WOD pool:', parsed.wodPool);
    if (parsed.excludedRationale) console.log('[AI Plan] Excluded:', parsed.excludedRationale.slice(0, 200));
    return parsed;
  } catch (err) { clearTimeout(timer); throw err; }
}

function buildV5Prompt(userProfile, archetype, exerciseMenu, wodMenu, dayConfigs, raceReqs) {
  const p = [];
  p.push(`ATHLETE: ${userProfile.experience || 'intermediate'} | ${userProfile.sex || '?'} | ${userProfile.weight || '?'} lb | BMI ${userProfile.bmi || '?'}`);
  p.push(`GOALS: ${(userProfile.goals || []).join(', ')}`);
  p.push(`DAYS: ${userProfile.trainingDaysPerWeek || 5}/week, ${userProfile.sessionDuration || 60} min`);
  p.push(`ARCHETYPE: ${archetype.archetype} (${archetype.label})`);
  p.push(`SPLIT: ${archetype.splitModel}`);
  p.push(`EQUIPMENT PREF: ${(archetype.equipmentPreference || []).slice(0, 3).join(' > ')}`);
  if (userProfile.bodyCompGoals?.length) p.push(`BODY COMP: ${userProfile.bodyCompGoals.join(', ')}`);
  if (userProfile.additionalNotes) p.push(`NOTES: ${userProfile.additionalNotes}`);
  if (raceReqs) p.push(`RACE: ${raceReqs.label} (${raceReqs.distance_miles} mi)`);

  // Day structure
  p.push(`\nDAY STRUCTURE (${dayConfigs.length} training days):`);
  for (let i = 0; i < dayConfigs.length; i++) {
    const d = dayConfigs[i];
    const parts = [`Day ${i + 1}: ${d.type}`];
    if (d.primary_patterns?.length) parts.push(`patterns: ${d.primary_patterns.join(',')}`);
    if (d.arm_finisher) parts.push('arms:yes');
    if (d.core_block) parts.push('core:yes');
    if (d.run) parts.push(`run:${d.run.type}`);
    if (d.wod) parts.push(`wod:${d.wod.type}`);
    p.push(`  ${parts.join(' | ')}`);
  }

  // Menus
  p.push('\n' + formatExerciseMenu(exerciseMenu));
  p.push('\n' + formatWodMenu(wodMenu));

  return p.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// Default selections — when Claude fails
// ═══════════════════════════════════════════════════════════════

function buildDefaultSelections(dayConfigs, exerciseMenu, wodMenu, archetype) {
  const menuByPattern = {};
  for (const ex of exerciseMenu) {
    if (!menuByPattern[ex.pattern]) menuByPattern[ex.pattern] = [];
    menuByPattern[ex.pattern].push(ex.id);
  }

  const pickFromPattern = (pattern, count = 3) => {
    const pool = menuByPattern[pattern] || menuByPattern['squat'] || [];
    return pool.slice(0, count);
  };

  const days = dayConfigs.map((config, i) => {
    // Build exercise POOLS (more than needed per session for weekly rotation)
    const compounds = [];
    for (const p of (config.primary_patterns || [])) {
      compounds.push(...pickFromPattern(p, 3));
    }
    const accessories = [];
    for (const p of (config.secondary_patterns || [])) {
      accessories.push(...pickFromPattern(p, 2));
    }
    const arms = config.arm_finisher ? [...pickFromPattern('arm_pull', 2), ...pickFromPattern('arm_push', 2)] : [];
    const core = config.core_block ? pickFromPattern('core', 4) : [];
    const wod = config.wod && wodMenu.length > 0 ? wodMenu[i % wodMenu.length].id : null;

    // Fun fallback names based on day type
    const FUN_NAMES = {
      full_body_a: 'THE FOUNDATION', full_body_b: 'TOTAL BODY BLAST', full_body_c: 'FULL SEND',
      full_body_d: 'THE GRIND', full_body_push: 'PUSH IT', full_body_pull: 'GRIP & RIP',
      full_body_legs: 'THUNDER THIGHS', full_body_upper: 'UPPER DECK',
      full_body_metabolic: 'THE FURNACE', lower_power: 'LEG DAY MAYHEM',
      upper_push: 'IRON CURTAIN', upper_pull: 'BACK ATTACK', obstacle: 'OBSTACLE CRUSHER',
      endurance_metabolic: 'CARDIO KING', push: 'PRESS PARTY', pull: 'ROW & GO',
      legs: 'SQUAT CITY', sprint_conditioning: 'SPRINT & BURN',
    };
    const title = FUN_NAMES[config.type] || config.type?.replace(/_/g, ' ').toUpperCase() || 'TRAINING';
    return { dayIndex: i, title, compounds, accessories, arms, core, wod, rationale: 'Auto-selected defaults' };
  });

  return {
    planName: `${archetype?.label || 'Training'} Program`,
    days,
    wodPool: wodMenu.slice(0, 5).map(w => w.id),
    progressionNotes: '',
  };
}

// ═══════════════════════════════════════════════════════════════
// Build the full plan from Claude's selections
// ═══════════════════════════════════════════════════════════════

async function buildPlanV5(selections, dayConfigs, userProfile, exerciseMenu, wodMenu, targetDistance, shouldHaveRuns, archetype, onStatus) {
  const planId = generateUUID();
  const startDate = getNextMonday();
  const eventDate = userProfile.eventDate || addWeeks(startDate, 16);
  const { totalWeeks, phases } = calculatePhases(startDate, eventDate);
  const trainingDays = userProfile.trainingDays || Array.from({ length: userProfile.trainingDaysPerWeek || 5 }, (_, i) => i);
  const sessionMinutes = parseInt(userProfile.sessionDuration) || 60;

  // Build exercise lookup from seed
  const allExercises = seedExercises();
  const exerciseById = {};
  for (const ex of allExercises) exerciseById[ex.id] = ex;

  // Build WOD lookup
  const allWods = await getWodsFromDb().catch(() => []);
  const wodById = {};
  for (const w of allWods) wodById[w.id] = w;

  // WOD pool from Claude's selections
  const wodPool = (selections.wodPool || []).filter(id => wodById[id]);

  // Warmup pool — no jog if can't run
  const warmupPool = shouldHaveRuns ? WARMUP_IDS_WITH_JOG : WARMUP_IDS;

  const recentlyUsed = new Set();
  const weeklyExerciseCount = {}; // track how many times each exercise appears per week

  for (let week = 1; week <= totalWeeks; week++) {
    const phase = getPhaseForWeek(phases, week);
    if (!phase) continue;
    const weekStartDate = addDays(startDate, (week - 1) * 7);
    const mesoPhase = getMesocyclePhase(week);
    const stimulus = STIMULUS_TYPES[mesoPhase.defaultStimulus];
    const weeksFromEnd = totalWeeks - week;

    // Phase display
    let displayPhase;
    if (archetype?.hasTaper && weeksFromEnd < 3 && totalWeeks > 12) {
      displayPhase = 'race_prep';
    } else if (phase.phase === 'race_prep' && !archetype?.hasTaper) {
      const cw = ((week - 1) % 12) + 1;
      displayPhase = cw <= 4 ? 'foundation' : cw <= 8 ? 'build' : 'peak';
    } else {
      displayPhase = phase.phase;
    }

    const weekWodIdx = (week - 1) % Math.max(1, wodPool.length);
    // Reset weekly exercise frequency counter
    for (const key of Object.keys(weeklyExerciseCount)) weeklyExerciseCount[key] = 0;

    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      const date = addDays(weekStartDate, dayOfWeek);
      const tdi = trainingDays.indexOf(dayOfWeek);

      if (tdi === -1) {
        await savePlanDay({ planId, date, dayOfWeek, weekNumber: week, phase: displayPhase, title: 'REST DAY', focus: 'Recovery & mobility', color: '#333', emoji: '', isRestDay: true });
        continue;
      }

      const dayConfig = dayConfigs[tdi % dayConfigs.length];
      const daySelection = (selections.days || [])[tdi % (selections.days || []).length] || {};
      const title = daySelection.title || dayConfig.type?.replace(/_/g, ' ').toUpperCase() || 'TRAINING';
      const focusLabel = displayPhase === 'race_prep'
        ? `TAPER \u2022 RACE PREP \u2022 Week ${week}`
        : `${mesoPhase.label} \u2022 ${stimulus.label} \u2022 Week ${week}`;

      const dayId = await savePlanDay({ planId, date, dayOfWeek, weekNumber: week, phase: displayPhase, title, focus: focusLabel, color: phase.color, emoji: '', isRestDay: false });

      const usedToday = new Set();
      let blockOrder = 0;
      const bodyCompGoal = userProfile.bodyCompGoal || 'maintain';

      // ── WARMUP ──
      const warmupBlockId = await savePlanBlock({ planDayId: dayId, sortOrder: blockOrder++, name: 'WARM-UP', type: 'MOVEMENT PREP', timeCap: '8 min', isAmrap: false, hasGps: false });
      const shuffledWarmup = [...warmupPool].sort(() => Math.random() - 0.5).slice(0, 4);
      for (let i = 0; i < shuffledWarmup.length; i++) {
        const ex = exerciseById[shuffledWarmup[i]];
        if (ex) await savePlanExercise({ planBlockId: warmupBlockId, exerciseId: ex.id, sortOrder: i, sets: `1x${ex.default_reps || '10'}`, reps: ex.default_reps || '10', weight: ex.default_weight || 'BW', rest: null, notes: null });
      }

      // ── COMPOUNDS — expand pool respecting archetype + phase progression ──
      const compoundPool = expandPool(daySelection.compounds || [], exerciseMenu, dayConfig, archetype, week);
      const compoundIds = rotateExercises(compoundPool, week, recentlyUsed, usedToday, 3, weeklyExerciseCount);
      if (compoundIds.length > 0) {
        const compBlockId = await savePlanBlock({ planDayId: dayId, sortOrder: blockOrder++, name: 'MAIN LIFTS', type: 'COMPOUND', timeCap: '25 min', isAmrap: false, hasGps: false });
        for (let i = 0; i < compoundIds.length; i++) {
          const ex = exerciseById[compoundIds[i]];
          if (!ex) continue;
          const { sets, reps } = calculateSetsReps(ex, week, displayPhase, bodyCompGoal, sessionMinutes);
          const weight = calculateWeight(ex, week, displayPhase, bodyCompGoal, userProfile.experience, userProfile.equipmentDetails, userProfile.workingWeights);
          await savePlanExercise({ planBlockId: compBlockId, exerciseId: ex.id, sortOrder: i, sets: `${sets}x${reps}`, reps: `${reps}`, weight, rest: getBodyCompParams(bodyCompGoal).restSeconds, notes: null });
          usedToday.add(ex.id); recentlyUsed.add(ex.id);
        }
      }

      // ── RUN (if applicable) ──
      if (dayConfig.run && shouldHaveRuns) {
        const runType = dayConfig.run.type?.toUpperCase() || pickRunType(displayPhase, week);
        const runBlockId = await savePlanBlock({ planDayId: dayId, sortOrder: blockOrder++, name: dayConfig.run.label || 'RUN', type: runType, timeCap: runType === 'LONG_RUN' ? '30 min' : '20 min', isAmrap: false, hasGps: true });
        await updateBlockRunType(runBlockId, runType);
        const runExercises = generateRunExercises(week, displayPhase, totalWeeks, runType, userProfile.experience, targetDistance);
        for (let i = 0; i < runExercises.length; i++) {
          await savePlanExercise({ planBlockId: runBlockId, exerciseId: runExercises[i].id, sortOrder: i, sets: runExercises[i].sets, reps: runExercises[i].reps, weight: runExercises[i].weight, rest: null, notes: runExercises[i].notes });
        }
      }

      // ── WOD — rotate through pool so each week has a different WOD ──
      if (dayConfig.wod && wodPool.length > 0) {
        // Combine week + day index for rotation so different days get different WODs
        const wodRotationIdx = ((week - 1) * dayConfigs.length + tdi) % Math.max(1, wodPool.length);
        const wodId = wodPool[wodRotationIdx] || wodPool[0];
        const wod = wodById[wodId];
        const wodBlockId = await savePlanBlock({ planDayId: dayId, sortOrder: blockOrder++, name: 'WOD', type: dayConfig.wod.type || 'CIRCUIT', timeCap: '10 min', isAmrap: true, hasGps: false });
        const wodExercises = buildWodExercises(wod, userProfile.equipmentDetails);
        for (let i = 0; i < wodExercises.length; i++) {
          await savePlanExercise({ planBlockId: wodBlockId, exerciseId: wodExercises[i].id, sortOrder: i, sets: wodExercises[i].sets, reps: wodExercises[i].reps, weight: wodExercises[i].weight, rest: null, notes: wodExercises[i].notes });
        }
      }

      // ── ACCESSORIES — expand pool respecting archetype + phase progression ──
      const accPool = expandPool(daySelection.accessories || [], exerciseMenu, dayConfig, archetype, week);
      const accIds = rotateExercises(accPool, week, recentlyUsed, usedToday, 2, weeklyExerciseCount);
      if (accIds.length > 0) {
        const accBlockId = await savePlanBlock({ planDayId: dayId, sortOrder: blockOrder++, name: 'ACCESSORIES', type: 'ISOLATION', timeCap: '10 min', isAmrap: false, hasGps: false });
        for (let i = 0; i < accIds.length; i++) {
          const ex = exerciseById[accIds[i]];
          if (!ex) continue;
          const { sets, reps } = calculateSetsReps(ex, week, displayPhase, bodyCompGoal, sessionMinutes);
          const weight = calculateWeight(ex, week, displayPhase, bodyCompGoal, userProfile.experience, userProfile.equipmentDetails, userProfile.workingWeights);
          await savePlanExercise({ planBlockId: accBlockId, exerciseId: ex.id, sortOrder: i, sets: `${sets}x${reps}`, reps: `${reps}`, weight, rest: '45-60s', notes: null });
          usedToday.add(ex.id); recentlyUsed.add(ex.id);
        }
      }

      // ── ARM FINISHER — guaranteed when day config requests it ──
      let armIds = daySelection.arms || [];
      // If day config wants arms but Claude didn't provide them, add defaults
      if (armIds.length === 0 && dayConfig.arm_finisher) {
        const armPullOptions = exerciseMenu.filter(e => e.pattern === 'arm_pull').map(e => e.id);
        const armPushOptions = exerciseMenu.filter(e => e.pattern === 'arm_push').map(e => e.id);
        if (armPullOptions.length > 0) armIds.push(armPullOptions[week % armPullOptions.length]);
        if (armPushOptions.length > 0) armIds.push(armPushOptions[week % armPushOptions.length]);
      }
      if (armIds.length > 0) {
        const armBlockId = await savePlanBlock({ planDayId: dayId, sortOrder: blockOrder++, name: 'ARM BLASTER', type: 'SUPERSETS', timeCap: '8 min', isAmrap: false, hasGps: false });
        for (let i = 0; i < armIds.length; i++) {
          const ex = exerciseById[armIds[i]];
          if (!ex) continue;
          const { sets, reps } = calculateSetsReps(ex, week, displayPhase, bodyCompGoal, sessionMinutes);
          const weight = calculateWeight(ex, week, displayPhase, bodyCompGoal, userProfile.experience, userProfile.equipmentDetails, userProfile.workingWeights);
          await savePlanExercise({ planBlockId: armBlockId, exerciseId: ex.id, sortOrder: i, sets: `${sets}x${reps}`, reps: `${reps}`, weight, rest: '30-45s', notes: null });
        }
      }

      // ── CORE — guaranteed when day config requests it ──
      let coreIds = daySelection.core || [];
      if (coreIds.length === 0 && dayConfig.core_block) {
        const coreOptions = exerciseMenu.filter(e => e.pattern === 'core').map(e => e.id);
        // Pick 2 core exercises, rotating by week
        if (coreOptions.length > 0) {
          coreIds.push(coreOptions[week % coreOptions.length]);
          if (coreOptions.length > 1) coreIds.push(coreOptions[(week + 1) % coreOptions.length]);
        }
      }
      if (coreIds.length > 0) {
        const coreBlockId = await savePlanBlock({ planDayId: dayId, sortOrder: blockOrder++, name: 'CORE', type: 'CIRCUIT', timeCap: '8 min', isAmrap: false, hasGps: false });
        for (let i = 0; i < coreIds.length; i++) {
          const ex = exerciseById[coreIds[i]];
          if (!ex) continue;
          await savePlanExercise({ planBlockId: coreBlockId, exerciseId: ex.id, sortOrder: i, sets: '3x15', reps: ex.default_reps || '15', weight: 'BW', rest: null, notes: null });
        }
      }

      // ── COOLDOWN ──
      if (sessionMinutes >= 45) {
        const focus = (dayConfig.primary_patterns || []).some(p => ['squat', 'hinge'].includes(p)) ? 'lower' : 'upper';
        const cooldownExs = focus === 'lower'
          ? ['hip_flexor_stretch', 'pigeon_pose', 'hamstring_stretch']
          : ['shoulder_stretch', 'thoracic_rotation', 'pvc_pass_throughs'];
        const cdBlockId = await savePlanBlock({ planDayId: dayId, sortOrder: blockOrder++, name: 'COOLDOWN', type: 'MOBILITY', timeCap: '5 min', isAmrap: false, hasGps: false });
        for (let i = 0; i < cooldownExs.length; i++) {
          const ex = exerciseById[cooldownExs[i]];
          if (ex) await savePlanExercise({ planBlockId: cdBlockId, exerciseId: ex.id, sortOrder: i, sets: `1x${ex.default_reps || '30s'}`, reps: ex.default_reps || '30s', weight: 'BW', rest: null, notes: null });
        }
      }
    }

    if (week % 2 === 0) recentlyUsed.clear();
    if (onStatus && week % 4 === 0) onStatus(`Week ${week}/${totalWeeks}...`);
  }

  // Save rationales for coach awareness and future regeneration
  try {
    await savePlanRationales(planId, archetype?.archetype, selections);
  } catch (e) {
    console.warn('[AI Plan] Failed to save rationales:', e.message);
  }

  console.log('[AI Plan] Plan generated successfully');
  return { planId, totalWeeks, phases, startDate, eventDate, planName: selections.planName || 'Training Program', programNotes: selections.progressionNotes || '' };
}

// Pick a SUBSET from Claude's exercise pool, rotating across weeks
// Pool of 6 exercises → pick 2-3 per week, different each week
// weeklyCount tracks frequency to prevent any exercise appearing 3+ times in a week
function rotateExercises(pool, week, recentlyUsed, usedToday, pickCount, weeklyCount) {
  if (pool.length === 0) return [];
  const count = pickCount || Math.min(3, pool.length);

  if (pool.length <= count) {
    return pool.filter(id => !usedToday.has(id));
  }

  const offset = (week - 1) * count;
  const result = [];
  let attempts = 0;
  for (let i = 0; result.length < count && attempts < pool.length * 2; i++) {
    const idx = (offset + i) % pool.length;
    const id = pool[idx];
    attempts++;
    if (usedToday.has(id)) continue;
    // Cap weekly frequency at 2 appearances per exercise
    if (weeklyCount && (weeklyCount[id] || 0) >= 2) continue;
    result.push(id);
    usedToday.add(id);
    if (weeklyCount) weeklyCount[id] = (weeklyCount[id] || 0) + 1;
  }
  return result;
}

// Expand Claude's exercise picks by adding similar exercises from the menu
// Respects archetype equipment preference AND phase progression
// Beginners: machines only in weeks 1-4, add DB in weeks 5-8, barbell in 9+
function expandPool(claudePicks, exerciseMenu, dayConfig, archetype, week) {
  const pool = [...claudePicks];
  const poolSet = new Set(pool);
  const patterns = [...(dayConfig.primary_patterns || []), ...(dayConfig.secondary_patterns || [])];
  const equipPref = archetype?.equipmentPreference || ['barbell', 'dumbbell', 'kettlebell', 'machine', 'cable', 'bodyweight'];
  const isBeginner = archetype?.exerciseComplexity === 'simple';

  // For beginners: restrict equipment by phase
  // Weeks 1-4: machine, cable, bodyweight only
  // Weeks 5-8: add dumbbell, kettlebell
  // Weeks 9+: add barbell (if available)
  let allowedEquipment;
  if (isBeginner) {
    if (week <= 4) {
      allowedEquipment = new Set(['machine', 'cable', 'bodyweight']);
    } else if (week <= 8) {
      allowedEquipment = new Set(['machine', 'cable', 'dumbbell', 'kettlebell', 'bodyweight']);
    } else {
      allowedEquipment = null; // all allowed
    }
  }

  // Filter and sort by equipment preference
  const sorted = exerciseMenu
    .filter(ex => {
      if (poolSet.has(ex.id)) return false;
      if (!patterns.includes(ex.pattern)) return false;
      // Phase-based equipment restriction for beginners
      if (allowedEquipment && !allowedEquipment.has(ex.equipment)) return false;
      // Never add advanced exercises for beginners via expansion
      if (isBeginner && /ab.?wheel|toes.?to.?bar|muscle.?up|pistol|handstand|jump.?squat/i.test(ex.id)) return false;
      return true;
    })
    .sort((a, b) => {
      const aRank = equipPref.indexOf(a.equipment);
      const bRank = equipPref.indexOf(b.equipment);
      const aScore = aRank >= 0 ? aRank : 99;
      const bScore = bRank >= 0 ? bRank : 99;
      const aSource = a.source === 'seed' || !a.source ? 0 : 1;
      const bSource = b.source === 'seed' || !b.source ? 0 : 1;
      return (aScore + aSource * 10) - (bScore + bSource * 10);
    });

  for (const ex of sorted) {
    pool.push(ex.id);
    poolSet.add(ex.id);
    if (pool.length >= 10) break;
  }

  return pool;
}

// ═══════════════════════════════════════════════════════════════
// WOD exercise builder — from seed data
// ═══════════════════════════════════════════════════════════════

function buildWodExercises(wod, equipmentDetails) {
  if (!wod) {
    return [
      { id: 'air_squats', sets: '1x15', reps: '15', weight: 'BW', notes: 'Bodyweight circuit' },
      { id: 'push_ups', sets: '1x10', reps: '10', weight: 'BW', notes: null },
      { id: 'burpees', sets: '1x5', reps: '5', weight: 'BW', notes: null },
    ];
  }
  const exercises = [];
  for (let i = 0; i < wod.movements.length; i++) {
    const movement = wod.movements[i];
    const parsed = parseWodMovement(movement, wod.scheme, i);
    const exerciseId = fuzzyMatchWodMovement(parsed.name);
    let weight = parsed.weight || wod.rxWeight || 'BW';
    weight = scaleWodWeight(weight, exerciseId, equipmentDetails);
    let reps = parsed.reps;
    if (/^\d+\s*m$/i.test(reps) && !/run|row|bike|ski|sprint/i.test(exerciseId)) {
      reps = `${Math.max(5, Math.round(parseInt(reps) / 10))}`;
    }
    exercises.push({
      id: exerciseId, sets: `1x${reps}`, reps, weight,
      notes: i === 0 ? `${wod.name} \u2014 ${wod.type}${wod.timeCap ? ` (${wod.timeCap})` : ''}: ${wod.description}` : null,
    });
  }
  return exercises;
}

function parseWodMovement(movement, scheme, index) {
  const repNameMatch = movement.match(/^(\d+)\s+(.+)$/);
  if (repNameMatch) {
    const name = repNameMatch[2].replace(/\s*\([^)]+\)/, '').trim();
    const weightMatch = movement.match(/\(([^)]+)\)/);
    return { name, reps: repNameMatch[1], weight: weightMatch ? weightMatch[1] : null };
  }
  const distMatch = movement.match(/^(\d+\s*m)\s+(.+)$/i);
  if (distMatch) return { name: distMatch[2].trim(), reps: distMatch[1], weight: null };
  const nameOnly = movement.replace(/\s*\([^)]+\)/, '').trim();
  const weightMatch = movement.match(/\(([^)]+)\)/);
  const schemeNums = (scheme || '').match(/\d+/g);
  return { name: nameOnly, reps: schemeNums ? schemeNums.join('-') : '10', weight: weightMatch ? weightMatch[1] : null };
}

function fuzzyMatchWodMovement(name) {
  const n = name.toLowerCase().replace(/[^a-z\s]/g, '').trim();
  const MAP = [
    ['handstand push ups', 'handstand_push_ups'], ['muscle ups', 'muscle_ups'],
    ['front squats', 'front_squat'], ['front squat', 'front_squat'],
    ['overhead squats', 'front_squat'], ['pistol squats', 'pistol_squats'],
    ['air squats', 'air_squats'], ['squats', 'air_squats'],
    ['pull ups', 'pull_ups'], ['pullups', 'pull_ups'],
    ['push ups', 'push_ups'], ['pushups', 'push_ups'],
    ['burpees', 'burpees'], ['sit ups', 'sit_ups'],
    ['toes to bar', 'sit_ups'], ['thrusters', 'barbell_thrusters'],
    ['deadlifts', 'deadlift'], ['deadlift', 'deadlift'],
    ['hang power cleans', 'hang_clean'], ['power cleans', 'power_clean'],
    ['cleans', 'power_clean'], ['clean and jerk', 'clean_and_jerk'],
    ['push jerk', 'push_jerk'], ['push press', 'push_press'],
    ['snatches', 'snatch'], ['snatch', 'snatch'],
    ['box jumps', 'box_jumps'], ['kb swings', 'kb_swings'],
    ['kettlebell swings', 'kb_swings'], ['wall balls', 'wall_balls'],
    ['double unders', 'jump_rope'], ['dips', 'dips'],
    ['step ups', 'step_ups'], ['farmer walk', 'farmer_walk'],
    ['mile run', 'easy_run'], ['run', 'easy_run'], ['row', 'easy_run'],
  ];
  for (const [key, id] of MAP) { if (n.includes(key)) return id; }
  return 'burpees';
}

function scaleWodWeight(weight, exerciseId, equipmentDetails) {
  if (!weight || weight === 'BW' || !equipmentDetails) return weight;
  const match = weight.match(/(\d+)(?:\/(\d+))?\s*(?:lb|lbs)?/i);
  if (!match) return weight;
  const rxWeight = parseInt(match[1]);
  if (!rxWeight) return weight;
  const isBarbell = /deadlift|squat|clean|snatch|jerk|press|thruster/i.test(exerciseId);
  const isKB = /kb|swing|kettlebell/i.test(exerciseId) || /kb/i.test(weight.toLowerCase());
  if (isBarbell && equipmentDetails.barbell?.maxWeight) {
    const max = parseFloat(equipmentDetails.barbell.maxWeight);
    if (rxWeight > max) return `${Math.round(max / 5) * 5} lb (scaled)`;
    return `${rxWeight} lb`;
  }
  if (isKB && equipmentDetails.kettlebell?.weights) {
    const kbWeights = equipmentDetails.kettlebell.weights.split(',').map(w => parseFloat(w.trim())).filter(w => w > 0).sort((a, b) => b - a);
    if (kbWeights.length > 0) {
      const available = kbWeights.filter(w => w <= rxWeight);
      const bestKB = available.length > 0 ? available[0] : kbWeights[kbWeights.length - 1];
      return bestKB !== rxWeight ? `${bestKB} lb KB (scaled)` : `${bestKB} lb KB`;
    }
  }
  return match[2] ? `${rxWeight} lb` : weight;
}

// ═══════════════════════════════════════════════════════════════
// Run generation
// ═══════════════════════════════════════════════════════════════

function pickRunType(phase, weekNumber) {
  const RUN_ROTATION = {
    foundation: ['EASY', 'INTERVALS', 'EASY', 'FARTLEK'],
    build: ['TEMPO', 'INTERVALS', 'FARTLEK', 'TEMPO'],
    peak: ['INTERVALS', 'RACE_PACE', 'TEMPO', 'INTERVALS'],
    race_prep: ['EASY', 'TEMPO', 'EASY', 'EASY'],
  };
  return (RUN_ROTATION[phase] || RUN_ROTATION.foundation)[(weekNumber - 1) % 4];
}

function generateRunExercises(weekNumber, phase, totalWeeks, runType, experience, targetDistance) {
  const runParams = calculateRunParams(weekNumber, phase, totalWeeks, targetDistance);
  const distScale = (runType === 'LONG_RUN' || runType === 'RACE_PACE') ? 1.0 : (experience === 'beginner' ? 0.7 : experience === 'intermediate' ? 0.85 : 1.0);
  const scaledDist = Math.round(parseFloat(runParams.distance) * distScale * 2) / 2;
  const distance = `${scaledDist} mi`;

  const exercises = [{ id: 'easy_jog', sets: '5 min', reps: '5 min', weight: 'Build pace', rest: null, notes: 'Warm into it' }];
  switch (runType) {
    case 'INTERVALS': exercises.push({ id: 'interval_run', sets: `${runParams.intervals} rounds`, reps: '2 min hard / 1 min easy', weight: '80-85% effort', rest: null, notes: `Target: ${distance}` }); break;
    case 'TEMPO': exercises.push({ id: 'tempo_run', sets: distance, reps: distance, weight: runParams.paceType + ' pace', rest: null, notes: `Target: ${distance}` }); break;
    case 'LONG_RUN': exercises.push({ id: 'easy_run', sets: distance, reps: distance, weight: 'Conversational pace', rest: null, notes: `Target: ${distance}` }); break;
    case 'RACE_PACE': exercises.push({ id: 'interval_run', sets: distance, reps: distance, weight: 'Goal race pace', rest: null, notes: `Target: ${distance} at race effort` }); break;
    default: exercises.push({ id: 'easy_run', sets: distance, reps: distance, weight: 'Easy conversational pace', rest: null, notes: `Target: ${distance}` }); break;
  }
  exercises.push({ id: 'easy_jog', sets: '5 min', reps: '5 min', weight: 'Cool down', rest: null, notes: null });
  return exercises;
}

// Parse target race distance
function getTargetRaceDistance(profile) {
  if (!profile) return null;
  const all = `${(profile.additionalNotes || '')} ${(profile.goals || []).join(' ')}`.toLowerCase();
  if (all.includes('marathon') && !all.includes('half')) return 26.2;
  if (all.includes('half marathon')) return 13.1;
  if (all.includes('spartan beast')) return 13.1;
  if (all.includes('10k') || all.includes('spartan super')) return 6.2;
  if (all.includes('spartan sprint') || all.includes('5k')) return 3.1;
  if (/endurance|athletic|spartan/i.test(all)) return 6.2;
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function generateUUID() { return 'xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)); }
function addDays(d, n) { const dt = new Date(d + 'T12:00:00Z'); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().split('T')[0]; }
function addWeeks(d, w) { return addDays(d, w * 7); }
function getNextMonday() {
  const n = new Date(), d = n.getDay(), dm = d === 0 ? 1 : d === 1 ? 0 : 8 - d;
  n.setDate(n.getDate() + dm);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
