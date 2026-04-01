// AI Plan Generator v3 — Strategy-driven hybrid architecture
// Claude returns a program STRATEGY (movement patterns, priorities)
// Code builds workouts deterministically using composable day templates
//
// New modules:
// - raceRequirements.js — race profiles and must-include movements
// - wodSelector.js — context-aware WOD filtering
// - dayTemplates.js — composable block builder
// - planValidator.js — validation before save

import Constants from 'expo-constants';
import { calculatePhases, getPhaseForWeek } from './phaseCalculator';
import { calculateWeight, calculateSetsReps, calculateRunParams, getBodyCompParams, getMesocyclePhase, STIMULUS_TYPES } from './progressionRules';
import { isDeloadWeek } from './phaseCalculator';
import { savePlanDay, savePlanBlock, savePlanExercise, getExercisesByFilter, getWodsFromDb, updateBlockRunType } from '../data/database';
import { getRaceRequirements, getRaceExerciseRequirements, getRaceDistance } from './raceRequirements';
import { selectWOD } from './wodSelector';
import { buildDayBlocks, getDefaultDayConfigs } from './dayTemplates';
import { logValidation } from './planValidator';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

function getApiKey() {
  return Constants.expoConfig?.extra?.claudeApiKey
    || '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';
}

// ═══════════════════════════════════════════════════════════════
// Safe warmup and cooldown exercise IDs (all exist in exerciseSeed)
// ═══════════════════════════════════════════════════════════════

const WARMUP_IDS = [
  'easy_jog', 'dynamic_stretching', 'push_up_to_t', 'air_squats',
  'lunge_matrix', 'a_skips', 'pvc_pass_throughs', 'samson_stretch',
  'bear_crawl', 'cossack_squats', 'high_knees', 'strides',
  'arm_circles', 'inchworm',
];

// ═══════════════════════════════════════════════════════════════
// Claude strategy prompt — asks for movement patterns, not exercises
// ═══════════════════════════════════════════════════════════════

const STRATEGY_PROMPT = `You are an elite S&C coach. Design a training STRATEGY for this athlete.

Return valid JSON. Do NOT pick individual exercises — pick movement PATTERNS and priorities.
The app builds specific workouts from your strategy.

Valid movement patterns: squat, hinge, horizontal_push, horizontal_pull, vertical_push, vertical_pull, pull_up, carry, core, olympic, elbow_flexion, elbow_extension, plyometric

Valid day types: lower_power, upper_push, upper_pull, upper_push_pull, sprint_conditioning, olympic_power, endurance_metabolic, obstacle, full_body, wod_focus

Return this exact JSON structure:
{
  "planName": "descriptive name",
  "dayConfigs": [
    {
      "type": "day_type",
      "primary_patterns": ["squat", "hinge"],
      "secondary_patterns": ["carry"],
      "arm_finisher": true,
      "core_block": false,
      "run": null,
      "wod": { "type": "AMRAP" }
    }
  ],
  "patternPriorities": {
    "horizontal_push": 9,
    "pull_up": 9,
    "squat": 7
  },
  "compoundEquipmentPreference": ["barbell", "dumbbell"],
  "programNotes": "coaching notes",
  "restDayAdvice": "recovery guidance"
}

RULES:
- dayConfigs must have exactly N entries matching training days per week
- For endurance/race goals: include run blocks on 2-3 days
- run.type options: "easy", "tempo", "intervals", "fartlek", "long_run", "race_pace"
- For strength goals: prioritize squat, hinge, horizontal_push patterns
- Arm emphasis: set arm_finisher:true on desired days
- Obstacle race: include pull_up, carry patterns and wod blocks
- Balance push/pull patterns across the week
- JSON only, no other text`;

// ═══════════════════════════════════════════════════════════════
// Main generator
// ═══════════════════════════════════════════════════════════════

export async function generateAIPlan(userProfile, onStatus) {
  const apiKey = getApiKey();
  if (onStatus) onStatus('Analyzing your goals and equipment...');

  // Load data
  const exercisePool = await loadExercisePool(userProfile);
  const wodList = await loadWodList();

  // Get race requirements
  const raceReqs = getRaceRequirements(userProfile);
  const raceExerciseReqs = getRaceExerciseRequirements(raceReqs, userProfile.equipment);
  const targetDistance = getRaceDistance(userProfile);

  if (onStatus) onStatus('Designing your program strategy...');

  // Get strategy from Claude (or fallback)
  let strategy;
  try {
    const prompt = buildStrategyPrompt(userProfile, raceReqs);
    const raw = await callClaude(apiKey, prompt);
    console.log('[AI Plan] Claude raw dayConfigs:', JSON.stringify((raw.dayConfigs || []).map(d => ({ type: d.type, run: !!d.run, wod: !!d.wod }))));
    strategy = validateStrategy(raw, userProfile);
    console.log('[AI Plan] After validation dayConfigs:', JSON.stringify(strategy.dayConfigs.map(d => ({ type: d.type, run: !!d.run, wod: !!d.wod }))));
  } catch (err) {
    console.warn('[AI Plan] Strategy call failed, using defaults:', err.message);
    strategy = buildDefaultStrategy(userProfile, raceReqs);
  }

  if (onStatus) onStatus('Building your workouts...');

  // Build the full plan
  const result = await buildPlan(strategy, userProfile, exercisePool, wodList, raceReqs, raceExerciseReqs, targetDistance, onStatus);
  return result;
}

// ═══════════════════════════════════════════════════════════════
// Claude API
// ═══════════════════════════════════════════════════════════════

async function callClaude(apiKey, userPrompt) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: STRATEGY_PROMPT, messages: [{ role: 'user', content: userPrompt }] }),
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
    return JSON.parse(text);
  } catch (err) { clearTimeout(timer); throw err; }
}

function buildStrategyPrompt(userProfile, raceReqs) {
  const p = [];
  p.push(`ATHLETE: ${userProfile.experience || 'intermediate'} level`);
  p.push(`GOALS: ${(userProfile.goals || [userProfile.goal]).join(', ')}`);
  p.push(`DAYS/WEEK: ${userProfile.trainingDaysPerWeek || 5}`);
  p.push(`TIME: ${userProfile.sessionDuration || 60} min`);
  if (userProfile.equipment?.length) p.push(`EQUIPMENT: ${userProfile.equipment.join(', ')}`);
  if (userProfile.workingWeights) {
    const ww = userProfile.workingWeights;
    p.push(`WORKING WEIGHTS (8-10RM): Squat ${ww.squat || '?'}, Bench ${ww.bench || '?'}, DL ${ww.deadlift || '?'}, OHP ${ww.overhead_press || '?'}, Row ${ww.row || '?'}`);
  }
  if (userProfile.bodyCompGoals?.length) p.push(`BODY COMP: ${userProfile.bodyCompGoals.join(', ')}`);
  if (userProfile.exclusions?.length) p.push(`EXCLUSIONS: ${userProfile.exclusions.join(', ')}`);
  if (raceReqs) p.push(`RACE: ${raceReqs.label} (${raceReqs.distance_miles} mi, ${raceReqs.obstacles} obstacles)`);
  if (userProfile.additionalNotes) p.push(`NOTES: ${userProfile.additionalNotes}`);
  return p.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// Strategy validation and defaults
// ═══════════════════════════════════════════════════════════════

function validateStrategy(raw, userProfile) {
  const daysPerWeek = userProfile.trainingDaysPerWeek || 5;
  const s = raw;

  // Validate dayConfigs count
  if (!s.dayConfigs || !Array.isArray(s.dayConfigs)) s.dayConfigs = [];
  while (s.dayConfigs.length < daysPerWeek) {
    s.dayConfigs.push({ type: 'strength', primary_patterns: ['squat', 'horizontal_push'], secondary_patterns: [], arm_finisher: false });
  }
  s.dayConfigs = s.dayConfigs.slice(0, daysPerWeek);

  // Ensure valid patterns
  const VALID_PATTERNS = ['squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull', 'pull_up', 'carry', 'core', 'olympic', 'elbow_flexion', 'elbow_extension', 'plyometric'];
  for (const day of s.dayConfigs) {
    day.primary_patterns = (day.primary_patterns || []).filter(p => VALID_PATTERNS.includes(p));
    day.secondary_patterns = (day.secondary_patterns || []).filter(p => VALID_PATTERNS.includes(p));
  }

  // Ensure runs exist on at least 2 days for endurance/race goals
  const goals = (userProfile.goals || [userProfile.goal || '']).join(' ').toLowerCase();
  const notes = (userProfile.additionalNotes || '').toLowerCase();
  const hasEndurance = /endurance|athletic|spartan|race|run|marathon|10k|5k/i.test(goals + ' ' + notes);

  if (hasEndurance) {
    const runDays = s.dayConfigs.filter(d => d.run);
    if (runDays.length < 2) {
      const midIdx = Math.floor(daysPerWeek / 2);
      const lastIdx = daysPerWeek - 1;
      if (!s.dayConfigs[midIdx].run) {
        s.dayConfigs[midIdx].run = { type: 'intervals', label: 'SPRINT INTERVALS' };
      }
      if (!s.dayConfigs[lastIdx].run) {
        s.dayConfigs[lastIdx].run = { type: 'long_run', label: 'LONG RUN' };
      }
    }

    // ALWAYS ensure exactly one day has a long run — critical for race prep
    const hasLongRun = s.dayConfigs.some(d => d.run?.type === 'long_run');
    if (!hasLongRun) {
      // Put long run on the last training day
      const lastIdx = daysPerWeek - 1;
      s.dayConfigs[lastIdx].run = { type: 'long_run', label: 'LONG RUN' };
    }
  }

  // Ensure WODs exist on at least 2 days
  const wodDays = s.dayConfigs.filter(d => d.wod);
  if (wodDays.length < 2) {
    for (let i = 0; i < s.dayConfigs.length && wodDays.length < 2; i++) {
      if (!s.dayConfigs[i].wod && !s.dayConfigs[i].run) {
        s.dayConfigs[i].wod = { type: 'AMRAP' };
        wodDays.push(s.dayConfigs[i]);
      }
    }
    // If still not enough (all days have runs), add WODs alongside runs
    for (let i = 0; i < s.dayConfigs.length && wodDays.length < 2; i++) {
      if (!s.dayConfigs[i].wod) {
        s.dayConfigs[i].wod = { type: 'FOR TIME' };
        wodDays.push(s.dayConfigs[i]);
      }
    }
  }

  if (!s.patternPriorities) s.patternPriorities = {};
  if (!s.compoundEquipmentPreference) {
    const equip = (userProfile.equipment || []).map(e => e.toLowerCase());
    s.compoundEquipmentPreference = equip.includes('barbell') ? ['barbell', 'dumbbell', 'kettlebell'] : ['dumbbell', 'kettlebell', 'bodyweight'];
  }

  return s;
}

function buildDefaultStrategy(userProfile, raceReqs) {
  const goals = userProfile.goals || [userProfile.goal || 'general_fitness'];
  const equip = (userProfile.equipment || []).map(e => e.toLowerCase());
  const hasBarbell = equip.some(e => /barbell|squat rack/i.test(e));
  const hasSpartanGoal = !!raceReqs || goals.some(g => /spartan|obstacle|athletic/i.test(g));
  const daysPerWeek = userProfile.trainingDaysPerWeek || 5;

  const dayConfigs = getDefaultDayConfigs(daysPerWeek, goals, hasBarbell, hasSpartanGoal);

  return {
    planName: `${userProfile.experience || 'Intermediate'} ${hasSpartanGoal ? 'Spartan' : 'Strength'} Program`,
    dayConfigs,
    patternPriorities: {
      squat: 7, hinge: 7, horizontal_push: 8, horizontal_pull: 7,
      vertical_push: 6, pull_up: hasSpartanGoal ? 9 : 6,
      carry: hasSpartanGoal ? 8 : 4, core: 5,
      elbow_flexion: 6, elbow_extension: 6,
    },
    compoundEquipmentPreference: hasBarbell ? ['barbell', 'dumbbell', 'kettlebell'] : ['dumbbell', 'kettlebell', 'bodyweight'],
    programNotes: 'Auto-generated program.',
    restDayAdvice: 'Light walking, foam rolling, mobility.',
  };
}

// ═══════════════════════════════════════════════════════════════
// Build the full plan
// ═══════════════════════════════════════════════════════════════

async function buildPlan(strategy, userProfile, exercisePool, wodList, raceReqs, raceExerciseReqs, targetDistance, onStatus) {
  const planId = generateUUID();
  const startDate = getNextMonday();
  const eventDate = userProfile.eventDate || addWeeks(startDate, 16);
  const { totalWeeks, phases } = calculatePhases(startDate, eventDate);
  const trainingDays = userProfile.trainingDays || Array.from({ length: userProfile.trainingDaysPerWeek || 5 }, (_, i) => i);
  const sessionMinutes = parseInt(userProfile.sessionDuration) || 60;

  const recentlyUsed = new Set();
  const weekWodIds = []; // track WODs used this week

  for (let week = 1; week <= totalWeeks; week++) {
    const phase = getPhaseForWeek(phases, week);
    if (!phase) continue;
    const weekStartDate = addDays(startDate, (week - 1) * 7);
    const mesoPhase = getMesocyclePhase(week);
    const stimulus = STIMULUS_TYPES[mesoPhase.defaultStimulus];

    // Determine display phase for race prep override
    const weeksFromEnd = totalWeeks - week;
    const isRacePrep = weeksFromEnd < 3 && totalWeeks > 12;
    const displayPhase = isRacePrep ? 'race_prep' : phase.phase;

    weekWodIds.length = 0; // reset weekly WOD tracking

    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      const date = addDays(weekStartDate, dayOfWeek);
      const trainingDayIndex = trainingDays.indexOf(dayOfWeek);

      if (trainingDayIndex === -1) {
        await savePlanDay({
          planId, date, dayOfWeek, weekNumber: week,
          phase: displayPhase, title: 'REST DAY',
          focus: strategy.restDayAdvice || 'Recovery & mobility',
          color: '#333', emoji: '', isRestDay: true,
        });
        continue;
      }

      // Get day config from strategy
      const dayConfig = strategy.dayConfigs[trainingDayIndex % strategy.dayConfigs.length];

      // Build composable block list from day config
      const blocks = buildDayBlocks(dayConfig, displayPhase, sessionMinutes);

      // Determine day title and focus
      const title = dayConfig.type?.replace(/_/g, ' ').toUpperCase() || 'TRAINING';
      const focusLabel = isRacePrep
        ? `TAPER \u2022 RACE PREP \u2022 Week ${week}`
        : `${mesoPhase.label} \u2022 ${stimulus.label} \u2022 Week ${week}`;

      const dayId = await savePlanDay({
        planId, date, dayOfWeek, weekNumber: week,
        phase: displayPhase, title,
        focus: focusLabel,
        color: phase.color, emoji: '', isRestDay: false,
      });

      const usedToday = new Set();

      if (week <= 2 && trainingDayIndex === 0) {
        console.log(`[AI Plan] Wk${week} Day1 blocks:`, blocks.map(b => `${b.name}(run:${!!b.isRun},wod:${!!b.isWod})`).join(', '));
      }

      for (let bi = 0; bi < blocks.length; bi++) {
        const block = blocks[bi];

        const blockId = await savePlanBlock({
          planDayId: dayId, sortOrder: bi,
          name: block.name, type: block.type,
          timeCap: block.duration,
          isAmrap: block.isWod || false,
          hasGps: block.hasGps || false,
        });

        let exercises;

        if (block.isRun) {
          // ── Run block ──
          const runType = block.runType?.toUpperCase() || pickRunType(displayPhase, week);
          await updateBlockRunType(blockId, runType);
          exercises = generateRunExercises(week, displayPhase, totalWeeks, exercisePool, runType, userProfile.experience, targetDistance);
          if (week <= 2) console.log(`[AI Plan] RUN block: wk${week} ${runType} → ${exercises.length} exercises, dist=${exercises[1]?.reps || '?'}`);
        } else if (block.isWarmup) {
          // ── Warmup ──
          exercises = selectWarmupExercises(block.warmupPool || WARMUP_IDS, block.exerciseCount, exercisePool);
        } else if (block.isCooldown) {
          // ── Cooldown ──
          exercises = selectCooldownExercises(block.cooldownPool || [], exercisePool);
        } else if (block.isWod) {
          // ── WOD from seed data ──
          const dayPatterns = dayConfig.primary_patterns || [];
          const spartanBias = raceReqs ? 0.7 : 0.2;
          const wod = selectWOD(wodList, {
            phase: displayPhase, dayPatterns,
            userEquipment: userProfile.equipment || [],
            spartanBias, excludeWodIds: weekWodIds,
            targetMinutes: parseInt(block.duration) || 12,
          });
          exercises = buildWodExercises(wod, userProfile.equipmentDetails);
          if (wod) weekWodIds.push(wod.id);
          if (week <= 2) console.log(`[AI Plan] WOD block: wk${week} ${wod?.name || 'fallback'} → ${exercises.length} exercises`);
        } else {
          // ── Lifts / accessories ──
          exercises = selectExercises(block, exercisePool, recentlyUsed, usedToday, week, displayPhase, userProfile, strategy, raceExerciseReqs);
        }

        for (let ei = 0; ei < exercises.length; ei++) {
          const ex = exercises[ei];
          await savePlanExercise({
            planBlockId: blockId, exerciseId: ex.id, sortOrder: ei,
            sets: ex.sets, reps: ex.reps, weight: ex.weight,
            rest: ex.rest || null, notes: ex.notes || null,
          });
          usedToday.add(ex.id);
          recentlyUsed.add(ex.id);
        }
      }
    }

    if (week % 2 === 0) recentlyUsed.clear();
    if (onStatus && week % 4 === 0) onStatus(`Week ${week}/${totalWeeks}...`);
  }

  // Log validation summary
  const equip = (userProfile.equipment || []).map(e => e.toLowerCase());
  const hasBarbell = equip.some(e => /barbell|squat.?rack/i.test(e));
  const validation = { violations: [] };
  if (hasBarbell) {
    // We can't easily scan saved exercises, but log the constraint was active
    console.log('[AI Plan] Barbell constraint: ACTIVE');
  }
  if (raceReqs) {
    console.log(`[AI Plan] Race requirements: ${raceReqs.label}, must_include: ${raceReqs.must_include.join(', ')}`);
  }
  console.log(`[AI Plan] Target run distance: ${targetDistance || 'none'} mi`);
  console.log('[AI Plan] Plan generated successfully');

  return {
    planId, totalWeeks, phases, startDate, eventDate,
    planName: strategy.planName || 'AI Training Program',
    programNotes: strategy.programNotes || '',
  };
}

// ═══════════════════════════════════════════════════════════════
// Exercise selection — strategy-driven scoring
// ═══════════════════════════════════════════════════════════════

async function loadExercisePool(userProfile) {
  // Load ALL exercises — don't filter by style (was excluding barbell exercises)
  // Equipment and exclusion filters still apply
  const exerciseMap = new Map();
  const exercises = await getExercisesByFilter({
    style: null, // No style filter — include all exercises
    exclusions: userProfile.exclusions || [],
    equipment: userProfile.equipment || [],
    difficulty: null,
  });
  for (const ex of exercises) exerciseMap.set(ex.id, ex);
  const allExercises = Array.from(exerciseMap.values());
  const byMuscle = {};
  for (const ex of allExercises) {
    if (!byMuscle[ex.muscle_group]) byMuscle[ex.muscle_group] = [];
    byMuscle[ex.muscle_group].push(ex);
  }
  // Debug: verify key exercises are in the pool
  const barbellCount = allExercises.filter(e => e.category === 'barbell').length;
  const pullUps = allExercises.find(e => e.id === 'pull_ups');
  const backSquat = allExercises.find(e => e.id === 'back_squat');
  const benchPress = allExercises.find(e => e.id === 'bench_press');
  console.log(`[AI Plan] Pool: ${allExercises.length} total, ${barbellCount} barbell, pullups:${!!pullUps}, squat:${!!backSquat}, bench:${!!benchPress}`);
  if (!backSquat) console.warn('[AI Plan] WARNING: back_squat not in exercise pool!');
  if (!pullUps) console.warn('[AI Plan] WARNING: pull_ups not in exercise pool!');

  return { all: allExercises, byMuscle };
}

async function loadWodList() {
  try {
    return await getWodsFromDb();
  } catch { return []; }
}

function selectExercises(block, pool, recentlyUsed, usedToday, weekNumber, phase, userProfile, strategy, raceExerciseReqs) {
  const { muscleGroups, exerciseCount, compoundsOnly, olympicOnly, patterns } = block;
  const bodyCompGoal = userProfile.bodyCompGoal || 'maintain';
  const bodyCompParams = getBodyCompParams(bodyCompGoal);

  // Gather candidates from relevant muscle groups
  const candidates = [];
  const seen = new Set();
  for (const mg of (muscleGroups || [])) {
    for (const ex of (pool.byMuscle[mg] || [])) {
      if (!seen.has(ex.id)) { seen.add(ex.id); candidates.push(ex); }
    }
  }

  // Equipment preference order from strategy
  const equipPref = strategy.compoundEquipmentPreference || ['barbell', 'dumbbell', 'kettlebell'];

  // Race required exercise IDs
  const raceRequiredIds = new Set();
  for (const req of (raceExerciseReqs || [])) {
    req.exercises.forEach(id => raceRequiredIds.add(id));
  }

  // Score candidates
  const scored = candidates.map(ex => {
    let score = Math.random() * 3;

    // Exclusion enforcement — check exercise name against user's exclusion tags
    const userExclusions = userProfile.exclusions || [];
    if (userExclusions.includes('olympic_lift') && /clean|snatch|jerk/i.test(ex.name) && !/push press/i.test(ex.name)) {
      score -= 100;
    }
    if (userExclusions.includes('overhead') && /overhead|jerk|snatch|push press/i.test(ex.name)) {
      score -= 100;
    }

    // Compound filtering
    if (compoundsOnly && ex.is_compound) score += 15;
    if (compoundsOnly && !ex.is_compound) score -= 25;
    if (olympicOnly && /clean|snatch|jerk/i.test(ex.name)) score += 20;
    if (olympicOnly && !/clean|snatch|jerk|push.*press/i.test(ex.name)) score -= 20;

    // Equipment preference from strategy
    const equipRank = equipPref.indexOf(ex.category);
    if (equipRank === 0) score += 12;
    else if (equipRank === 1) score += 6;
    else if (equipRank === 2) score += 2;

    // Pattern priority from strategy
    if (patterns && strategy.patternPriorities) {
      for (const pattern of patterns) {
        const pri = strategy.patternPriorities[pattern] || 5;
        // Check if this exercise matches the pattern
        if (exerciseMatchesPattern(ex, pattern)) score += pri * 2;
      }
    }

    // Race requirement boost
    if (raceRequiredIds.has(ex.id)) score += 15;

    // Dedup
    if (usedToday.has(ex.id)) score -= 100;
    if (recentlyUsed.has(ex.id)) score -= 8;

    // Strong seed exercise preference — curated exercises are better than random ExerciseDB ones
    if (ex.source === 'seed' || !ex.source) score += 20;
    // Filter out obscure ExerciseDB exercises aggressively
    if (ex.source === 'api') {
      const eName = ex.name || '';
      if (/\(female\)|\(male\)|v\.\s*\d|sitted|lying floor/i.test(eName) || eName.length > 40) {
        score -= 100; // hard exclude
      } else if (/reverse grip|guillotine|cambered|lever |floor fly|kneeling jump|squat jump step|step rear lunge|bent v\.|side bent|wide reverse|close grip to skull|behind neck|behind the neck|decline close grip/i.test(eName)) {
        score -= 100; // hard exclude
      } else if (eName.split(' ').length > 5 || eName.length > 35) {
        score -= 50; // penalize overly wordy exercise names
      }
    }

    return { exercise: ex, score };
  });

  // Deduplicate by normalized name (ExerciseDB creates case-variant duplicates)
  const nameMap = new Map();
  for (const item of scored) {
    const normName = item.exercise.name.toLowerCase().trim();
    const existing = nameMap.get(normName);
    if (!existing || item.score > existing.score) {
      nameMap.set(normName, item);
    }
  }
  scored.length = 0;
  scored.push(...nameMap.values());

  scored.sort((a, b) => b.score - a.score);

  // Debug: log top 5 candidates for first block of first day
  if (block.name === 'MAIN LIFTS' || block.name === 'OLYMPIC LIFTS') {
    console.log(`[AI Plan] Top 5 for ${block.name} (patterns: ${(patterns || []).join(',')}):`,
      scored.slice(0, 5).map(s => `${s.exercise.name}(${s.exercise.category}):${s.score.toFixed(1)}`).join(', '));
  }

  // Pick top N
  const selected = [];
  const usedIds = new Set();
  for (const item of scored) {
    if (usedIds.has(item.exercise.id)) continue;
    if (selected.length >= (exerciseCount || 3)) break;
    usedIds.add(item.exercise.id);

    const ex = item.exercise;
    const { sets, reps } = calculateSetsReps(ex, weekNumber, phase, bodyCompGoal);
    const weight = calculateWeight(ex, weekNumber, phase, bodyCompGoal, userProfile.experience, userProfile.equipmentDetails, userProfile.workingWeights);

    selected.push({
      id: ex.id,
      sets: `${sets}x${reps}`,
      reps: `${reps}`,
      weight,
      rest: bodyCompParams.restSeconds,
      notes: null,
      category: ex.category, // needed for hard constraints below
    });
  }

  // ── Hard constraints — enforce critical exercise types ──
  const userEquip = (userProfile.equipment || []).map(e => e.toLowerCase());
  const hasBarbell = userEquip.some(e => /barbell|squat.?rack/i.test(e));
  const compoundPatterns = ['squat', 'hinge', 'horizontal_push', 'horizontal_pull'];
  const isCompoundBlock = compoundsOnly && patterns?.some(p => compoundPatterns.includes(p));

  // Barbell constraint: compound blocks for primary patterns MUST have at least 1 barbell exercise
  if (hasBarbell && isCompoundBlock && !selected.some(e => e.category === 'barbell')) {
    const barbellOption = scored.find(s => s.exercise.category === 'barbell' && !usedToday.has(s.exercise.id));
    if (barbellOption && selected.length > 0) {
      const ex = barbellOption.exercise;
      const { sets, reps } = calculateSetsReps(ex, weekNumber, phase, bodyCompGoal);
      const weight = calculateWeight(ex, weekNumber, phase, bodyCompGoal, userProfile.experience, userProfile.equipmentDetails, userProfile.workingWeights);
      selected[selected.length - 1] = { id: ex.id, sets: `${sets}x${reps}`, reps: `${reps}`, weight, rest: bodyCompParams.restSeconds, notes: null, category: ex.category };
    }
  }

  // Pull-up constraint: pull_up/vertical_pull patterns MUST include pull-ups or chin-ups
  if (patterns?.some(p => p === 'pull_up' || p === 'vertical_pull') && !selected.some(e => /pull.?up|chin.?up/i.test(e.id))) {
    const pullUpOption = scored.find(s => /pull_ups|chin_ups/i.test(s.exercise.id) && !usedToday.has(s.exercise.id));
    if (pullUpOption && selected.length > 0) {
      const ex = pullUpOption.exercise;
      const { sets, reps } = calculateSetsReps(ex, weekNumber, phase, bodyCompGoal);
      const weight = calculateWeight(ex, weekNumber, phase, bodyCompGoal, userProfile.experience, userProfile.equipmentDetails, userProfile.workingWeights);
      selected[selected.length - 1] = { id: ex.id, sets: `${sets}x${reps}`, reps: `${reps}`, weight, rest: bodyCompParams.restSeconds, notes: null, category: ex.category };
    }
  }

  // Carry constraint: carry pattern MUST include a carry exercise
  if (patterns?.includes('carry') && !selected.some(e => /carry|farmer|suitcase/i.test(e.id))) {
    const carryOption = scored.find(s => /farmer_walk|kb_carry|overhead_carry|bucket_carry|sandbag_carry/i.test(s.exercise.id) && !usedToday.has(s.exercise.id));
    if (carryOption && selected.length > 0) {
      const ex = carryOption.exercise;
      const { sets, reps } = calculateSetsReps(ex, weekNumber, phase, bodyCompGoal);
      const weight = calculateWeight(ex, weekNumber, phase, bodyCompGoal, userProfile.experience, userProfile.equipmentDetails, userProfile.workingWeights);
      selected[selected.length - 1] = { id: ex.id, sets: `${sets}x${reps}`, reps: `${reps}`, weight, rest: bodyCompParams.restSeconds, notes: null, category: ex.category };
    }
  }

  return selected;
}

// Check if an exercise matches a movement pattern
function exerciseMatchesPattern(exercise, pattern) {
  const name = (exercise.name || '').toLowerCase();
  const mg = exercise.muscle_group;
  const MATCHES = {
    squat: () => /squat|goblet|lunge|split|step.?up|pistol/i.test(name),
    hinge: () => /deadlift|rdl|romanian|swing|hip thrust|good morning/i.test(name),
    horizontal_push: () => /bench|push.?up|dip|fly|press/i.test(name) && !/overhead|shoulder/i.test(name) && mg === 'chest',
    horizontal_pull: () => /row|inverted/i.test(name) && mg === 'back',
    vertical_push: () => /overhead|shoulder|press|push.?press|jerk/i.test(name) && mg === 'shoulders',
    vertical_pull: () => /pull.?up|chin.?up|lat.*pull|pulldown/i.test(name),
    pull_up: () => /pull.?up|chin.?up|muscle.?up/i.test(name),
    carry: () => /carry|farmer|walk.*kb|walk.*db|suitcase/i.test(name),
    core: () => mg === 'core' || /plank|hollow|dead.?bug|pallof|bird.?dog|sit.?up|crunch/i.test(name),
    olympic: () => /clean|snatch|jerk/i.test(name),
    elbow_flexion: () => /curl|chin/i.test(name),
    elbow_extension: () => /tricep|skull|pushdown|extension|dip/i.test(name),
    plyometric: () => /jump|box|bound|skip/i.test(name),
  };
  return MATCHES[pattern]?.() || false;
}

// ═══════════════════════════════════════════════════════════════
// Warmup and cooldown — safe, pattern-matched
// ═══════════════════════════════════════════════════════════════

function selectWarmupExercises(warmupPool, count, pool) {
  const available = warmupPool
    .map(id => pool.all.find(e => e.id === id))
    .filter(Boolean);

  const shuffled = available.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count || 4).map(ex => ({
    id: ex.id,
    sets: `1x${ex.default_reps || '10'}`,
    reps: ex.default_reps || '10',
    weight: ex.default_weight || 'BW',
    rest: null, notes: null,
  }));
}

function selectCooldownExercises(cooldownPool, pool) {
  return cooldownPool.map(id => {
    const ex = pool.all.find(e => e.id === id);
    if (!ex) return null;
    return {
      id: ex.id,
      sets: `1x${ex.default_reps || '30s'}`,
      reps: ex.default_reps || '30s',
      weight: 'BW',
      rest: null, notes: null,
    };
  }).filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════
// WOD exercises from seed data — never freeform
// ═══════════════════════════════════════════════════════════════

function buildWodExercises(wod, equipmentDetails) {
  if (!wod) {
    return [
      { id: 'air_squats', sets: '1x15', reps: '15', weight: 'BW', rest: null, notes: 'Bodyweight circuit' },
      { id: 'push_ups', sets: '1x10', reps: '10', weight: 'BW', rest: null, notes: null },
      { id: 'burpees', sets: '1x5', reps: '5', weight: 'BW', rest: null, notes: null },
    ];
  }

  const exercises = [];
  for (let i = 0; i < wod.movements.length; i++) {
    const movement = wod.movements[i];
    const parsed = parseWodMovement(movement, wod.scheme, i);
    const exerciseId = fuzzyMatchWodMovement(parsed.name);

    // Scale WOD weight to user's equipment limits
    let weight = parsed.weight || wod.rxWeight || 'BW';
    weight = scaleWodWeight(weight, exerciseId, equipmentDetails);

    exercises.push({
      id: exerciseId,
      sets: `1x${parsed.reps}`,
      reps: parsed.reps,
      weight,
      rest: null,
      notes: i === 0 ? `${wod.name} \u2014 ${wod.type}${wod.timeCap ? ` (${wod.timeCap})` : ''}: ${wod.description}` : null,
    });
  }
  return exercises;
}

// Scale WOD prescribed weights to user's equipment limits
function scaleWodWeight(weight, exerciseId, equipmentDetails) {
  if (!weight || weight === 'BW' || !equipmentDetails) return weight;

  // Parse the weight — handle "225/155 lb", "95/65 lb", "53/35 lb KB" formats
  const match = weight.match(/(\d+)(?:\/(\d+))?\s*(?:lb|lbs)?/i);
  if (!match) return weight;

  let rxWeight = parseInt(match[1]); // Use the heavier (male) RX weight
  if (!rxWeight) return weight;

  // Always simplify "225/155 lb" → just the male weight "225 lb"
  const simplified = match[2] ? `${rxWeight} lb` : weight;

  // Determine equipment type from exercise
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
      if (bestKB !== rxWeight) return `${bestKB} lb KB (scaled)`;
      return `${bestKB} lb KB`;
    }
  }

  return simplified;
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
  const reps = schemeNums ? schemeNums.join('-') : '10';
  return { name: nameOnly, reps, weight: weightMatch ? weightMatch[1] : null };
}

function fuzzyMatchWodMovement(name) {
  const n = name.toLowerCase().replace(/[^a-z\s]/g, '').trim();
  // Order matters — specific matches before generic ones
  const MAP = [
    ['pull ups', 'pull_ups'], ['pullups', 'pull_ups'], ['push ups', 'push_ups'], ['pushups', 'push_ups'],
    ['handstand push ups', 'handstand_push_ups'], ['hspu', 'handstand_push_ups'],
    ['muscle ups', 'muscle_ups'], ['muscleups', 'muscle_ups'],
    ['front squats', 'front_squat'], ['front squat', 'front_squat'],
    ['overhead squats', 'front_squat'], ['overhead squat', 'front_squat'],
    ['squat snatches', 'snatch'], ['squat cleans', 'power_clean'],
    ['pistol squats', 'pistol_squats'], ['pistol', 'pistol_squats'],
    ['air squats', 'air_squats'], ['squats', 'air_squats'],
    ['burpees', 'burpees'], ['burpee', 'burpees'],
    ['sit ups', 'sit_ups'], ['situps', 'sit_ups'], ['toes to bar', 'sit_ups'],
    ['thrusters', 'barbell_thrusters'], ['thruster', 'barbell_thrusters'],
    ['deadlifts', 'deadlift'], ['deadlift', 'deadlift'],
    ['hang power cleans', 'hang_clean'], ['power cleans', 'power_clean'],
    ['cleans', 'power_clean'], ['clean jerk', 'clean_and_jerk'],
    ['clean and jerk', 'clean_and_jerk'],
    ['push jerk', 'push_jerk'], ['push jerks', 'push_jerk'], ['jerk', 'push_jerk'],
    ['push press', 'push_press'],
    ['snatches', 'snatch'], ['snatch', 'snatch'],
    ['box jumps', 'box_jumps'], ['box jump', 'box_jumps'],
    ['kb swings', 'kb_swings'], ['kettlebell swings', 'kb_swings'],
    ['wall balls', 'wall_balls'], ['wall ball', 'wall_balls'],
    ['double unders', 'jump_rope'], ['doubleunders', 'jump_rope'],
    ['ring dips', 'dips'], ['dips', 'dips'],
    ['step ups', 'step_ups'], ['farmer walk', 'farmer_walk'], ['farmer carry', 'farmer_walk'],
    ['mile run', 'easy_run'], ['run', 'easy_run'], ['running', 'easy_run'],
    ['row', 'easy_run'], ['rowing', 'easy_run'],
    ['back extensions', 'back_extension'],
  ];
  for (const [key, id] of MAP) {
    if (n.includes(key)) return id;
  }
  return 'burpees';
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
  const rotation = RUN_ROTATION[phase] || RUN_ROTATION.foundation;
  return rotation[(weekNumber - 1) % rotation.length];
}

function generateRunExercises(weekNumber, phase, totalWeeks, pool, runType, experience, targetDistance) {
  const runParams = calculateRunParams(weekNumber, phase, totalWeeks, targetDistance);

  // Experience affects interval count and pace, NOT distance for race-specific training
  // If training for a race, you MUST run the race distance — can't scale it down
  const expMult = experience === 'beginner' ? 0.7 : experience === 'intermediate' ? 0.85 : experience === 'advanced' ? 1.0 : 1.1;
  const rawDist = parseFloat(runParams.distance);
  // Only scale distance for non-long-run types. Long runs must reach target distance.
  const distScale = (runType === 'LONG_RUN' || runType === 'RACE_PACE') ? 1.0 : expMult;
  const scaledDist = Math.round(rawDist * distScale * 2) / 2; // round to 0.5
  const distance = `${scaledDist} mi`;
  const longRunMin = `${Math.round(scaledDist * 9)}-${Math.round(scaledDist * 11)} min`;
  const scaledIntervals = Math.max(2, Math.round(runParams.intervals * expMult));

  const exercises = [
    { id: 'easy_jog', sets: '5 min', reps: '5 min', weight: 'Build pace', rest: null, notes: 'Warm into it' },
  ];

  switch (runType) {
    case 'INTERVALS':
      exercises.push({ id: 'interval_run', sets: `${scaledIntervals} rounds`, reps: phase === 'peak' ? '90s hard / 60s easy' : '2 min hard / 1 min easy', weight: phase === 'peak' ? 'Race pace' : '80-85% effort', rest: null, notes: `Target: ${distance}` });
      break;
    case 'TEMPO':
      exercises.push({ id: 'tempo_run', sets: distance, reps: distance, weight: runParams.paceType + ' pace', rest: null, notes: `Target: ${distance}` });
      break;
    case 'FARTLEK':
      exercises.push({ id: 'tempo_run', sets: '25 min variable', reps: '25 min variable', weight: 'Alternate fast/easy every 2-3 min', rest: null, notes: `Target: ${distance}` });
      break;
    case 'LONG_RUN':
      exercises.push({ id: 'easy_run', sets: distance, reps: distance, weight: 'Conversational pace', rest: null, notes: `Target: ${distance} (${longRunMin})` });
      break;
    case 'RACE_PACE':
      exercises.push({ id: 'interval_run', sets: distance, reps: distance, weight: 'Goal race pace', rest: null, notes: `Target: ${distance} at race effort` });
      break;
    case 'EASY': default:
      exercises.push({ id: 'easy_run', sets: distance, reps: distance, weight: 'Easy conversational pace', rest: null, notes: `Target: ${distance}` });
      break;
  }

  exercises.push({ id: 'easy_jog', sets: '5 min', reps: '5 min', weight: 'Cool down', rest: null, notes: 'Easy jog to finish' });
  return exercises;
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
