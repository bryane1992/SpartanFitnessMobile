// AI Plan Generator v5 — Constrained AI Selection + Feedback Loop
// Claude picks exercises and WODs from a pre-filtered MENU
// Builder handles all math (weights, progression, periodization)
//
// Pipeline: detectArchetype → buildMenu → Claude picks → builder constructs

import Constants from 'expo-constants';
import { calculatePhases, getPhaseForWeek, isDeloadWeek } from './phaseCalculator';
import { calculateWeight, calculateSetsReps, calculateRunParams, getBodyCompParams, getMesocyclePhase, getRestForPhase, getNearCapStrategy, STIMULUS_TYPES } from './progressionRules';
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

  // Sanitize working weights — reset any that exceed equipment max (corrupted by coach)
  const sanitizedProfile = { ...userProfile };
  if (sanitizedProfile.workingWeights && sanitizedProfile.equipmentDetails) {
    const ed = sanitizedProfile.equipmentDetails;
    const barbellMax = ed.barbell?.maxWeight ? parseFloat(ed.barbell.maxWeight) : null;
    const dbMax = ed.dumbbells?.maxWeight ? parseFloat(ed.dumbbells.maxWeight) : null;
    for (const [lift, weight] of Object.entries(sanitizedProfile.workingWeights)) {
      const w = parseFloat(weight);
      // All barbell lifts: bench, squat, deadlift, ohp, row
      if (barbellMax && w > barbellMax) {
        console.log(`[PlanV5] Reset corrupted working weight: ${lift} ${w} lb → ${barbellMax} lb (exceeds barbell max)`);
        sanitizedProfile.workingWeights[lift] = barbellMax;
      }
    }
  }

  // Build exercise lookup from seed
  const allExercises = seedExercises();
  const exerciseById = {};
  for (const ex of allExercises) exerciseById[ex.id] = ex;

  // Build WOD lookup
  const allWods = await getWodsFromDb().catch(() => []);
  const wodById = {};
  for (const w of allWods) wodById[w.id] = w;

  // WOD pool — minimum 3 for rotation variety
  let wodPool = (selections.wodPool || []).filter(id => wodById[id]);
  // Pad with beginner defaults if pool is too small
  if (wodPool.length < 3) {
    const defaults = ['amrap_bodyweight_10', 'beginner_circuit_1', 'beginner_fortime_1', 'beginner_circuit_2', 'beginner_circuit_4'];
    for (const d of defaults) {
      if (!wodPool.includes(d) && wodById[d]) wodPool.push(d);
      if (wodPool.length >= 5) break;
    }
  }

  // Warmup pool — no jog if can't run
  const warmupPool = shouldHaveRuns ? WARMUP_IDS_WITH_JOG : WARMUP_IDS;

  const recentlyUsed = new Set();
  const weeklyExerciseCount = {}; // track how many times each exercise appears per week
  const wodUsageCount = {}; // track how many times each WOD is used across the plan
  const MAX_WOD_REPEATS = 3; // no WOD should appear more than 3 times in the plan

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

      // Day name — generate from actual selected exercises, not Claude's static week 1 title
      // Claude's title was for week 1 exercises, but rotation changes exercises each week
      const PATTERN_NAMES = { squat: 'LEGS', hinge: 'POSTERIOR', horizontal_push: 'CHEST', horizontal_pull: 'BACK', vertical_push: 'SHOULDERS', vertical_pull: 'PULL', carry: 'CARRY', core: 'CORE' };
      const FUN_SUFFIXES = ['FORGE', 'GRIND', 'POWER', 'BLITZ', 'FIRE', 'IRON', 'THUNDER', 'FURY', 'SPARK', 'RUSH', 'WAVE', 'STEEL', 'GRIT', 'RISE', 'BURN'];
      const primaryPatterns = (dayConfig.primary_patterns || []).slice(0, 2);
      const patternLabel = primaryPatterns.map(p => PATTERN_NAMES[p] || p.toUpperCase()).join(' & ');
      const suffix = FUN_SUFFIXES[(week * dayConfigs.length + tdi) % FUN_SUFFIXES.length];
      const title = patternLabel ? `${patternLabel} ${suffix}` : (daySelection.title || 'TRAINING');
      const focusLabel = displayPhase === 'race_prep'
        ? `TAPER \u2022 RACE PREP \u2022 Week ${week}`
        : `${mesoPhase.label} \u2022 ${stimulus.label} \u2022 Week ${week}`;

      const dayId = await savePlanDay({ planId, date, dayOfWeek, weekNumber: week, phase: displayPhase, title, focus: focusLabel, color: phase.color, emoji: '', isRestDay: false });

      const usedToday = new Set();
      let blockOrder = 0;
      const bodyCompGoal = userProfile.bodyCompGoal || 'maintain';
      const dayPatterns = [...(dayConfig.primary_patterns || []), ...(dayConfig.secondary_patterns || [])];

      // Calculate time-scaled block parameters
      const bt = calculateBlockTimes(sessionMinutes, dayConfig, archetype?.archetype);

      // ── WARMUP — matched to day's movement patterns ──
      const WARMUP_BY_FOCUS = {
        lower: ['air_squats', 'cossack_squats', 'lunge_matrix', 'samson_stretch', 'high_knees', 'dynamic_stretching'],
        upper: ['push_up_to_t', 'pvc_pass_throughs', 'dynamic_stretching', 'arm_circles', 'bear_crawl', 'inchworm'],
        full: ['dynamic_stretching', 'air_squats', 'push_up_to_t', 'bear_crawl', 'high_knees', 'lunge_matrix'],
      };
      const warmupFocus = dayPatterns.some(p => ['squat', 'hinge'].includes(p)) ? 'lower'
        : dayPatterns.some(p => ['horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull'].includes(p)) ? 'upper' : 'full';
      let dayWarmupPool = WARMUP_BY_FOCUS[warmupFocus];
      if (!shouldHaveRuns) dayWarmupPool = dayWarmupPool.filter(id => id !== 'easy_jog' && id !== 'strides');

      const warmupBlockId = await savePlanBlock({ planDayId: dayId, sortOrder: blockOrder++, name: 'WARM-UP', type: 'MOVEMENT PREP', timeCap: `${bt.warmup} min`, isAmrap: false, hasGps: false });
      const shuffledWarmup = [...dayWarmupPool].sort(() => Math.random() - 0.5).slice(0, bt.warmupCount);
      for (let i = 0; i < shuffledWarmup.length; i++) {
        const ex = exerciseById[shuffledWarmup[i]];
        if (ex) await savePlanExercise({ planBlockId: warmupBlockId, exerciseId: ex.id, sortOrder: i, sets: `1x${ex.default_reps || '10'}`, reps: ex.default_reps || '10', weight: ex.default_weight || 'BW', rest: null, notes: null });
      }

      // ── COMPOUNDS — expand pool, filter out non-compound exercises ──
      const NEVER_MAIN_LIFT = /plank|dead.?bug|bird.?dog|v.?up|sit.?up|mountain.?climb|russian.?twist|cable.?wood|pallof|wall.?ball|ball.?slam|battle.?rope|lunge.?matrix|cossack|dead.?hang|farmer.?walk/i;
      const rawCompoundPool = expandPool(daySelection.compounds || [], exerciseMenu, dayConfig, archetype, week);
      const compoundPool = rawCompoundPool.filter(id => {
        const ex = exerciseById[id];
        if (!ex) return false;
        if (NEVER_MAIN_LIFT.test(ex.name)) return false;
        return true;
      });
      const compoundIds = rotateExercises(compoundPool, week, recentlyUsed, usedToday, bt.mainLiftCount, weeklyExerciseCount);
      if (compoundIds.length > 0) {
        const compBlockId = await savePlanBlock({ planDayId: dayId, sortOrder: blockOrder++, name: 'MAIN LIFTS', type: 'COMPOUND', timeCap: `${bt.mainLifts} min`, isAmrap: false, hasGps: false });
        for (let i = 0; i < compoundIds.length; i++) {
          const ex = exerciseById[compoundIds[i]];
          if (!ex) continue;
          const { sets, reps } = calculateSetsReps(ex, week, displayPhase, bodyCompGoal, sessionMinutes, bt.sets);
          const weight = calculateWeight(ex, week, displayPhase, bodyCompGoal, userProfile.experience, sanitizedProfile.equipmentDetails, sanitizedProfile.workingWeights);
          const rest = getRestForPhase(displayPhase, true);
          // Near-cap strategy: if weight is close to equipment max, add tempo/AMRAP notes
          const equipMax = sanitizedProfile.equipmentDetails?.barbell?.maxWeight;
          const weightNum = parseFloat(weight) || 0;
          const capStrategy = equipMax ? getNearCapStrategy(weightNum, equipMax) : null;
          const notes = capStrategy ? capStrategy.notes : null;
          await savePlanExercise({ planBlockId: compBlockId, exerciseId: ex.id, sortOrder: i, sets: `${sets}x${reps}`, reps: `${reps}`, weight, rest, notes });
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

      // ── WOD — skip entirely on run days (the run IS the conditioning) ──
      const hasRunBlock = !!dayConfig.run;
      if (dayConfig.wod && wodPool.length > 0 && bt.wod > 0 && !hasRunBlock) {
        const eligibleWods = wodPool;
        {
        // Filter out WODs that have hit the repeat cap
        const cappedWods = eligibleWods.filter(id => (wodUsageCount[id] || 0) < MAX_WOD_REPEATS);
        const rotationPool = cappedWods.length > 0 ? cappedWods : eligibleWods; // fallback if all capped
        // Combine week + day index for rotation so different days get different WODs
        const wodRotationIdx = ((week - 1) * dayConfigs.length + tdi) % Math.max(1, rotationPool.length);
        const wodId = rotationPool[wodRotationIdx] || rotationPool[0];
        wodUsageCount[wodId] = (wodUsageCount[wodId] || 0) + 1;
        const wod = wodById[wodId];
        const wodBlockId = await savePlanBlock({ planDayId: dayId, sortOrder: blockOrder++, name: 'WOD', type: dayConfig.wod.type || 'CIRCUIT', timeCap: '10 min', isAmrap: true, hasGps: false });
        const wodExercises = buildWodExercises(wod, sanitizedProfile.equipmentDetails);
        for (let i = 0; i < wodExercises.length; i++) {
          await savePlanExercise({ planBlockId: wodBlockId, exerciseId: wodExercises[i].id, sortOrder: i, sets: wodExercises[i].sets, reps: wodExercises[i].reps, weight: wodExercises[i].weight, rest: null, notes: wodExercises[i].notes });
        }
        }
      }

      // ── ACCESSORIES — expand pool, dedup movement niches vs compounds ──
      // Track which movement niches are already covered by compounds
      const usedNiches = new Set();
      for (const id of compoundIds) {
        const niche = getMovementNiche(id);
        if (niche) usedNiches.add(niche);
      }
      const accPool = bt.accessoryCount > 0 ? expandPool(daySelection.accessories || [], exerciseMenu, dayConfig, archetype, week) : [];
      // Filter out accessories that duplicate a compound's movement niche
      const dedupedAccPool = accPool.filter(id => {
        const niche = getMovementNiche(id);
        if (!niche) return true; // unknown niche = allow
        return !usedNiches.has(niche);
      });
      const accIds = rotateExercises(dedupedAccPool.length > 0 ? dedupedAccPool : accPool, week, recentlyUsed, usedToday, bt.accessoryCount, weeklyExerciseCount);
      if (accIds.length > 0) {
        const accBlockId = await savePlanBlock({ planDayId: dayId, sortOrder: blockOrder++, name: 'ACCESSORIES', type: 'ISOLATION', timeCap: `${bt.accessories} min`, isAmrap: false, hasGps: false });
        for (let i = 0; i < accIds.length; i++) {
          const ex = exerciseById[accIds[i]];
          if (!ex) continue;
          const { sets, reps } = calculateSetsReps(ex, week, displayPhase, bodyCompGoal, sessionMinutes, bt.sets);
          const weight = calculateWeight(ex, week, displayPhase, bodyCompGoal, userProfile.experience, sanitizedProfile.equipmentDetails, sanitizedProfile.workingWeights);
          await savePlanExercise({ planBlockId: accBlockId, exerciseId: ex.id, sortOrder: i, sets: `${sets}x${reps}`, reps: `${reps}`, weight, rest: '45-60s', notes: null });
          usedToday.add(ex.id); recentlyUsed.add(ex.id);
        }
      }

      // ── ARM FINISHER — only if time budget allows ──
      // Filter Claude's arm picks: must be arm isolation (arm_pull/arm_push), not compounds like clean & press
      let armIds = (daySelection.arms || []).filter(id => {
        const ex = exerciseById[id];
        if (!ex) return false;
        const pattern = getMovementPattern(ex);
        return pattern === 'arm_pull' || pattern === 'arm_push';
      });
      if (armIds.length === 0 && dayConfig.arm_finisher && bt.armBlaster > 0) {
        const armPullOptions = exerciseMenu.filter(e => e.pattern === 'arm_pull').map(e => e.id);
        const armPushOptions = exerciseMenu.filter(e => e.pattern === 'arm_push').map(e => e.id);
        if (armPullOptions.length > 0) armIds.push(armPullOptions[week % armPullOptions.length]);
        if (armPushOptions.length > 0) armIds.push(armPushOptions[week % armPushOptions.length]);
      }
      if (armIds.length > 0 && bt.armBlaster > 0) {
        const armBlockId = await savePlanBlock({ planDayId: dayId, sortOrder: blockOrder++, name: 'ARM BLASTER', type: 'SUPERSETS', timeCap: `${bt.armBlaster} min`, isAmrap: false, hasGps: false });
        for (let i = 0; i < armIds.length; i++) {
          const ex = exerciseById[armIds[i]];
          if (!ex) continue;
          const { sets, reps } = calculateSetsReps(ex, week, displayPhase, bodyCompGoal, sessionMinutes, bt.sets);
          const weight = calculateWeight(ex, week, displayPhase, bodyCompGoal, userProfile.experience, sanitizedProfile.equipmentDetails, sanitizedProfile.workingWeights);
          await savePlanExercise({ planBlockId: armBlockId, exerciseId: ex.id, sortOrder: i, sets: `${sets}x${reps}`, reps: `${reps}`, weight, rest: '30-45s', notes: null });
        }
      }

      // ── CORE — ALWAYS present, category rotation, equipment-filtered ──
      const userEquipSet = new Set((userProfile.equipment || []).map(e => e.toLowerCase()));
      const hasCables = userEquipSet.has('cables') || userEquipSet.has('cable');
      const CORE_CATEGORIES = {
        anti_extension: ['plank', 'dead_bug', 'bird_dog', 'plank_to_pushup'],
        flexion: ['sit_ups', 'v_ups', 'mountain_climbers', 'russian_twists'],
        anti_rotation: hasCables ? ['bird_dog', 'pallof_press', 'cable_woodchop', 'dead_bug'] : ['bird_dog', 'dead_bug', 'plank', 'plank_to_pushup'],
        rotation: hasCables ? ['russian_twists', 'cable_woodchop'] : ['russian_twists', 'mountain_climbers'],
      };
      const corePairs = [
        ['anti_extension', 'flexion'],
        ['anti_rotation', 'rotation'],
        ['anti_extension', 'anti_rotation'],
        ['flexion', 'rotation'],
      ];
      const corePair = corePairs[tdi % corePairs.length];
      // Filter Claude's core picks: must be actual core exercises, not carries/compounds
      const VALID_CORE_IDS = new Set(Object.values(CORE_CATEGORIES).flat());
      let coreIds = (daySelection.core || []).filter(id => {
        if (VALID_CORE_IDS.has(id)) return true;
        const ex = exerciseById[id];
        if (!ex) return false;
        const pattern = getMovementPattern(ex);
        return pattern === 'core' && ex.muscle_group === 'core';
      });
      if (coreIds.length === 0) {
        // Auto-select from category rotation
        for (const cat of corePair) {
          const pool = CORE_CATEGORIES[cat].filter(id => exerciseById[id] && !usedToday.has(id));
          if (pool.length > 0) {
            const pick = pool[(week + tdi) % pool.length];
            coreIds.push(pick);
            usedToday.add(pick);
          }
        }
        // Add a third from remaining categories
        const usedCats = new Set(corePair);
        const remaining = Object.keys(CORE_CATEGORIES).filter(c => !usedCats.has(c));
        if (remaining.length > 0) {
          const extraCat = remaining[week % remaining.length];
          const extraPool = CORE_CATEGORIES[extraCat].filter(id => exerciseById[id] && !coreIds.includes(id));
          if (extraPool.length > 0) coreIds.push(extraPool[week % extraPool.length]);
        }
      }
      if (coreIds.length > 0) {
        const coreBlockId = await savePlanBlock({ planDayId: dayId, sortOrder: blockOrder++, name: 'CORE', type: 'CIRCUIT', timeCap: `${bt.core} min`, isAmrap: false, hasGps: false });
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

// ═══════════════════════════════════════════════════════════════
// Session duration scaling — adapts blocks to 30/45/60/90+ min
// ═══════════════════════════════════════════════════════════════

function calculateBlockTimes(sessionMinutes, dayConfig, archetypeKey) {
  const hasWod = !!dayConfig.wod && !dayConfig.run;
  const hasRun = !!dayConfig.run;
  const hasArms = !!dayConfig.arm_finisher;
  const noArmsArchetypes = ['overweight_beginner', 'endurance'];
  const wantArms = hasArms && !noArmsArchetypes.includes(archetypeKey);
  const isSprintDay = hasRun && /interval|sprint/i.test(dayConfig.run?.type || '');
  const isLongRunDay = hasRun && /long/i.test(dayConfig.run?.type || '');
  const isCarryDay = dayConfig.primary_patterns?.includes('carry');

  let bt;

  // ── Day-type specific templates ──

  if (isLongRunDay || (isCarryDay && hasRun)) {
    // Carry + Long Run day: carries + run + cooldown, no accessories/core/arms
    bt = { warmup: 8, mainLifts: isCarryDay ? 20 : 15, wod: 0, accessories: 0, armBlaster: 0, core: 0, cooldown: 5,
      sets: 3, mainLiftCount: isCarryDay ? 3 : 2, accessoryCount: 0, coreCount: 0, warmupCount: 3, rest: '60-90s' };
  } else if (isSprintDay) {
    // Sprint day: 2 explosive lifts + sprints + core, no accessories/arms
    bt = { warmup: 8, mainLifts: 15, wod: 0, accessories: 0, armBlaster: 0, core: 5, cooldown: 5,
      sets: 3, mainLiftCount: 2, accessoryCount: 0, coreCount: 2, warmupCount: 3, rest: '45-60s' };
  } else if (hasWod) {
    // WOD day: 2 main lifts + WOD + arms if time, no accessories (WOD IS the volume)
    const armTime = wantArms ? 8 : 0;
    bt = { warmup: 6, mainLifts: 15, wod: 10, accessories: 0, armBlaster: armTime, core: 5, cooldown: 5,
      sets: 3, mainLiftCount: 2, accessoryCount: 0, coreCount: 2, warmupCount: 3, rest: '45-60s' };
  } else {
    // Pure lifting day (no WOD, no run): 3 main lifts + accessories + core + arms
    const armTime = wantArms ? 8 : 0;
    bt = { warmup: 8, mainLifts: 25, wod: 0, accessories: 8, armBlaster: armTime, core: 8, cooldown: 5,
      sets: 3, mainLiftCount: 3, accessoryCount: 2, coreCount: 3, warmupCount: 3, rest: '45-60s' };
  }

  // ── Scale for session duration ──
  if (sessionMinutes <= 30) {
    bt.warmup = 3; bt.mainLifts = 15; bt.wod = 0; bt.accessories = 0; bt.armBlaster = 0; bt.core = 3; bt.cooldown = 3;
    bt.mainLiftCount = 2; bt.accessoryCount = 0; bt.coreCount = 2; bt.warmupCount = 2; bt.rest = '30-45s';
  } else if (sessionMinutes <= 44) {
    bt.warmup = Math.min(bt.warmup, 5); bt.cooldown = 4;
    bt.mainLiftCount = Math.min(bt.mainLiftCount, 2);
    bt.armBlaster = 0; bt.accessories = 0; bt.accessoryCount = 0;
    bt.rest = '30-60s';
  } else if (sessionMinutes >= 75) {
    bt.sets = 4; bt.rest = '60-90s';
    if (!hasWod && !hasRun) { bt.mainLiftCount = 3; bt.accessoryCount = 3; bt.accessories = 12; }
  } else if (sessionMinutes >= 90) {
    bt.sets = 4; bt.rest = '90-120s';
    bt.warmup = 10; bt.warmupCount = 4;
    if (!hasWod && !hasRun) { bt.mainLiftCount = 4; bt.accessoryCount = 4; bt.accessories = 15; }
  }

  return enforceSessionTime(bt, sessionMinutes);
}

// Enforce session time — drop blocks in tier order if total exceeds budget
// Drop order: accessories → arm blasters → WOD. Never drop warmup, main lifts, core, cooldown.
function enforceSessionTime(bt, sessionMinutes) {
  const total = () => bt.warmup + bt.mainLifts + bt.wod + bt.accessories + bt.armBlaster + bt.core + bt.cooldown;
  if (total() <= sessionMinutes) return bt;
  // Tier 1: drop accessories
  if (bt.accessories > 0 && total() > sessionMinutes) {
    console.log(`[TimeBudget] Over by ${total() - sessionMinutes}min — dropping accessories (${bt.accessories}min)`);
    bt.accessories = 0; bt.accessoryCount = 0;
  }
  // Tier 2: drop arm blasters
  if (bt.armBlaster > 0 && total() > sessionMinutes) {
    console.log(`[TimeBudget] Still over by ${total() - sessionMinutes}min — dropping arm blaster (${bt.armBlaster}min)`);
    bt.armBlaster = 0;
  }
  // Tier 3: drop WOD (rare — only very short sessions)
  if (bt.wod > 0 && total() > sessionMinutes) {
    console.log(`[TimeBudget] Still over by ${total() - sessionMinutes}min — dropping WOD (${bt.wod}min)`);
    bt.wod = 0;
  }
  // Tier 1: reduce accessories
  if (bt.accessories > 0 && total() > sessionMinutes) {
    const overage = total() - sessionMinutes;
    const cut = Math.min(bt.accessories, overage);
    console.log(`[TimeBudget] Still over by ${overage}min — trimming accessories by ${cut}min`);
    bt.accessories -= cut;
    if (bt.accessories <= 0) { bt.accessories = 0; bt.accessoryCount = 0; }
  }
  if (total() > sessionMinutes) {
    console.log(`[TimeBudget] WARNING: Session still ${total() - sessionMinutes}min over ${sessionMinutes}min budget after all cuts`);
  }
  return bt;
}

// Pick a SUBSET from Claude's exercise pool, rotating across weeks
// Pool of 6 exercises → pick 2-3 per week, different each week
// weeklyCount tracks frequency to prevent any exercise appearing 3+ times in a week
// Movement niche — finer than movement pattern, prevents same-angle/same-motion duplication
// e.g. incline_bench and db_incline_press are both "incline_push" — shouldn't appear in same session
function getMovementNiche(exerciseId) {
  const NICHE_MAP = {
    // Incline push (don't pair barbell incline + DB incline)
    incline_bench: 'incline_push', db_incline_press: 'incline_push', incline_machine_press: 'incline_push',
    // Flat push (don't pair barbell bench + DB bench)
    bench_press: 'flat_push', db_bench_press: 'flat_push', machine_chest_press: 'flat_push',
    // Floor press is its own niche (different ROM)
    floor_press: 'floor_push', db_floor_press: 'floor_push',
    // Fly variations are their own niche (isolation, OK alongside presses)
    db_chest_fly: 'fly', cable_fly: 'fly', db_fly: 'fly',
    // Overhead press (don't pair barbell OHP + DB shoulder press)
    overhead_press: 'overhead_press', db_shoulder_press: 'overhead_press', machine_shoulder_press: 'overhead_press', push_press: 'overhead_press',
    // Row (don't pair barbell row + DB row)
    barbell_row: 'row', db_row: 'row', machine_row: 'row', cable_row: 'row',
    // Vertical pull (pull-ups and lat pulldown are different enough to coexist, but don't double pull-up variants)
    pull_ups: 'pull_up', chin_ups: 'pull_up', band_assisted_pull_ups: 'pull_up',
    // Squat (don't pair back squat + front squat usually)
    back_squat: 'squat_main', front_squat: 'squat_main',
    goblet_squat: 'squat_light', kb_goblet_squat: 'squat_light', db_goblet_squat: 'squat_light',
    // Hinge (don't pair deadlift + RDL)
    deadlift: 'hinge_main', sumo_deadlift: 'hinge_main', trap_bar_deadlift: 'hinge_main',
    romanian_deadlift: 'hinge_accessory', db_rdl: 'hinge_accessory', db_stiff_leg_deadlift: 'hinge_accessory',
    // Curl (don't pair two curl variations)
    bicep_curl: 'curl', hammer_curl: 'curl', cable_bicep_curl: 'curl', concentration_curl: 'curl', barbell_curl: 'curl',
    // Tricep extension (don't pair two extension variations)
    skull_crushers: 'tricep_ext', overhead_tricep_ext: 'tricep_ext', cable_tricep_pushdown: 'tricep_ext',
    // Lateral raise variations
    lateral_raise: 'lateral_raise', cable_lateral_raise: 'lateral_raise',
  };
  return NICHE_MAP[exerciseId] || null;
}

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
  const usedIds = new Set();
  for (let i = 0; i < wod.movements.length; i++) {
    const movement = wod.movements[i];
    const parsed = parseWodMovement(movement, wod.scheme, i);
    const exerciseId = fuzzyMatchWodMovement(parsed.name);
    // Skip duplicate exercise IDs in the same WOD
    if (usedIds.has(exerciseId)) continue;
    usedIds.add(exerciseId);
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
  const n = name.toLowerCase().replace(/[-_]/g, ' ').replace(/[^a-z\s]/g, '').trim();
  const MAP = [
    ['handstand push ups', 'handstand_push_ups'], ['muscle ups', 'muscle_ups'],
    ['front squats', 'front_squat'], ['front squat', 'front_squat'],
    ['overhead squats', 'front_squat'], ['pistol squats', 'pistol_squats'],
    ['air squats', 'air_squats'], ['airsquats', 'air_squats'], ['squats', 'air_squats'],
    ['pull ups', 'pull_ups'], ['pullups', 'pull_ups'], ['pull-ups', 'pull_ups'],
    ['push ups', 'push_ups'], ['pushups', 'push_ups'], ['push-ups', 'push_ups'],
    ['burpees', 'burpees'], ['sit ups', 'sit_ups'], ['situps', 'sit_ups'], ['sit-ups', 'sit_ups'],
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
