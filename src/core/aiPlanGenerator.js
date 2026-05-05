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
import { getWodMetadata } from '../data/wodSeed';
import { buildDayBlocks, getDefaultDayConfigs } from './dayTemplates';
import { getAuthToken } from '../data/supabase';

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || 'https://nyvanilszqnjdwmxnybd.supabase.co';
const PROXY_URL = `${SUPABASE_URL}/functions/v1/claude-proxy`;
const DIRECT_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

// Warmup exercises — always safe
const WARMUP_IDS = [
  'push_up_to_t', 'air_squats',
  'lunge_matrix', 'pvc_pass_throughs', 'samson_stretch',
  'bear_crawl', 'cossack_squats', 'high_knees',
  'arm_circles', 'inchworm', 'hip_90_90',
];
const WARMUP_IDS_WITH_JOG = ['easy_jog', ...WARMUP_IDS, 'a_skips', 'strides'];

// ═══════════════════════════════════════════════════════════════
// v5 Claude Prompt — sends filtered menu, gets exercise IDs back
// ═══════════════════════════════════════════════════════════════

const V5_SYSTEM = `You are an elite S&C coach designing a training program. You receive athlete profile + exercise/WOD menus. Return EXERCISE POOLS for each day — the app rotates through your picks weekly.

UNIVERSAL PROGRAMMING RULES:

SPLIT BALANCE:
- Every major muscle group trained 1-2x/week minimum
- Push:pull ratio max 2:1. Never 3 push days and 1 pull day.
- 3 days/week = full body each day. 4-5 days = upper/lower or PPL. 6 days = PPL x2.

DAY ROLES (exercises MUST match the day's role):
- Push days: bench press, overhead press, dips, chest fly, tricep work. NO rows, pull-ups, deadlifts, curls.
- Pull days: rows, pull-ups, chin-ups, deadlift, RDL, rear delt, bicep work. NO bench, OHP, squats, triceps.
- Leg days: squats, lunges, leg press, leg curl, hip thrust, calf raise. NO bench, rows, curls.
- Sprint/conditioning days: explosive lifts (cleans, thrusters), plyometrics, intervals.
- Carry/endurance days: loaded carries, long runs. NO accessories or arm work.

VOLUME BY EXPERIENCE:
- Beginner: 2 main lifts, 1 accessory, 3x10, 50-65% intensity
- Intermediate: 2-3 main lifts, 2 accessories, 3x8-10, 65-80%
- Advanced: 3 main lifts, 2-3 accessories, 3x6-8, 75-90%

BODY WEIGHT AWARENESS:
- BMI>30 or overweight: favor machines, goblet squats, leg press over barbell squats. No high-impact running.
- Scale to barbell compounds in later phases as strength improves.
- For beginners: ALWAYS include at least 1 pushing main lift (machine chest press, DB press, or push-ups) and 1 pulling main lift (lat pulldown, machine row, or seated cable row) per session. Full body balance is critical.
- Never program Olympic lifts (cleans, snatches, jerks), handstand push-ups, or heavy barbell complexes for beginners. Use machines, dumbbells, and bodyweight instead.

EQUIPMENT CONSTRAINTS:
- ONLY program exercises the athlete can do with their listed equipment
- No cable exercises without cables. No machines without machines. No tire flips without a tire.
- No rope climbs without a rope. No battle ropes without battle ropes.
- RESPECT EQUIPMENT PREFERENCE ORDER: if barbell is listed first, use barbell compounds as primary lifts (bench press, back squat, deadlift, OHP, barbell row). DB exercises should be accessories/variations, not primary lifts when barbell is available.
- Intermediate/advanced athletes with barbell access should get barbell compounds from day 1.

CARDIO RULES:
- Pure bulk/strength goals: zero cardio blocks
- Endurance/race goals: 2 runs/week (1 interval + 1 long)
- Fat loss: 2-3 moderate cardio sessions (walking, bike)
- Deconditioned/heavy athletes: walk first, progress to jog after 3-4 weeks

WOD SELECTION:
- Only pick WODs whose movements the athlete can do with their equipment
- Skip WODs with movements requiring equipment they don't have
- Prefer mixed-modal WODs over single-exercise benchmarks for conditioning days

Return valid JSON:
{
  "planName": "CREATIVE PLAN NAME",
  "days": [
    {
      "dayIndex": 0,
      "title": "FUN WORKOUT NAME",
      "compounds": ["id1", "id2", "id3", "id4"],
      "accessories": ["id1", "id2", "id3"],
      "arms": ["id1", "id2", "id3", "id4"],
      "core": ["id1", "id2", "id3"],
      "rationale": "Brief reasoning"
    }
  ],
  "wodPool": ["wod_id1", "wod_id2", "wod_id3", "wod_id4", "wod_id5", "wod_id6", "wod_id7", "wod_id8"],
  "excludedRationale": "What was excluded and why",
  "progressionNotes": "Weight/progression guidance"
}

CRITICAL RULES:
- ONLY use IDs from the provided EXERCISE MENU and WOD MENU
- Pick 4-6 compounds per day as a POOL (app rotates 2-3 per session)
- Pick 3-4 accessories per day (app uses 1-2 per session)
- Pick 3-4 arm exercises if arm emphasis requested
- Pick 6-10 WODs for the wodPool
- Each day's compounds MUST match the day's movement patterns. No squats on pull day. No curls on push day.
- Consider athlete's notes for constraints (injuries, schedule, preferences)
- JSON only, no other text`;

// ═══════════════════════════════════════════════════════════════
// Main generator
// ═══════════════════════════════════════════════════════════════

export async function generateAIPlan(userProfile, onStatus) {
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
    throw new Error('Failed to build exercise menu — please try again. (' + menuErr.message + ')');
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
  const dayConfigs = getDefaultDayConfigs(daysPerWeek, goals, hasBarbell, hasSpartanGoal, archetype, equip);

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
      // If the day had no lifting patterns (was a pure run day), give it full-body patterns
      // so expandPool can find exercises from the menu — otherwise the day starves (warmup only)
      if (!day.primary_patterns || day.primary_patterns.length === 0) {
        day.primary_patterns = ['horizontal_push', 'horizontal_pull'];
        day.secondary_patterns = day.secondary_patterns?.length ? day.secondary_patterns : ['core'];
      }
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

  // Step 5b: Reorder days based on user notes (e.g. "no legs Monday")
  const userNotes = (userProfile.additionalNotes || '').toLowerCase();
  const trainingDayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const noLegsMatch = userNotes.match(/no\s+(?:legs?|lower|squat)\s+(?:on\s+)?(\w+day)/i);
  if (noLegsMatch) {
    const avoidDay = trainingDayNames.indexOf(noLegsMatch[1].toLowerCase());
    const trainingDaysList = userProfile.trainingDays || Array.from({ length: daysPerWeek }, (_, i) => i);
    const avoidIdx = trainingDaysList.indexOf(avoidDay);
    if (avoidIdx >= 0 && avoidIdx < dayConfigs.length) {
      const isLegPattern = (d) => d.primary_patterns?.some(p => p === 'squat' || p === 'hinge');
      // Only swap if the day currently at avoidIdx is actually a lower-body day
      if (isLegPattern(dayConfigs[avoidIdx])) {
        // Find the first non-leg day to swap with (prefer one that has upper patterns)
        const swapIdx = dayConfigs.findIndex((d, i) => i !== avoidIdx && !isLegPattern(d) && d.primary_patterns?.length > 0);
        if (swapIdx >= 0) {
          console.log(`[PlanV5] Reordering: moving leg day off ${noLegsMatch[1]} (idx ${avoidIdx}) → swapping with idx ${swapIdx}`);
          [dayConfigs[avoidIdx], dayConfigs[swapIdx]] = [dayConfigs[swapIdx], dayConfigs[avoidIdx]];
        }
      }
    }
  }

  if (onStatus) onStatus('Designing your program...');

  // Step 6: Claude picks exercises from menu — no fallback, fail fast
  let claudeSelections;
  try {
    claudeSelections = await callClaudeV5(null, userProfile, archetype, exerciseMenu, wodMenu, dayConfigs, raceReqs);
  } catch (err) {
    console.error('[AI Plan] Claude call failed:', err.message);
    throw new Error('Plan generation failed — please try again. (' + err.message + ')');
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

async function callClaudeV5(unusedApiKey, userProfile, archetype, exerciseMenu, wodMenu, dayConfigs, raceReqs) {
  const prompt = buildV5Prompt(userProfile, archetype, exerciseMenu, wodMenu, dayConfigs, raceReqs);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    // Route through Supabase proxy — requires auth
    const authToken = await getAuthToken();
    if (!authToken && !Constants.expoConfig?.extra?.claudeApiKey) {
      throw new Error('Not authenticated — please sign in to generate a plan');
    }
    const useProxy = !!authToken;
    const url = useProxy ? PROXY_URL : DIRECT_API_URL;
    const headers = useProxy
      ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }
      : { 'Content-Type': 'application/json', 'x-api-key': Constants.expoConfig?.extra?.claudeApiKey, 'anthropic-version': '2023-06-01' };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, system: V5_SYSTEM, messages: [{ role: 'user', content: prompt }], skip_rate_limit: true }),
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
// Build the full plan from Claude's selections
// ═══════════════════════════════════════════════════════════════

async function buildPlanV5(selections, dayConfigs, userProfile, exerciseMenu, wodMenu, targetDistance, shouldHaveRuns, archetype, onStatus) {
  const planId = generateUUID();
  const startDate = getNextMonday();
  const eventDate = userProfile.eventDate || addWeeks(startDate, 16);
  const hasRace = !!(userProfile.hasRaceDate || userProfile.raceType);
  const { totalWeeks, phases } = calculatePhases(startDate, eventDate, hasRace);
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

  // WOD pool — expand based on user's equipment for maximum variety
  let wodPool = (selections.wodPool || []).filter(id => wodById[id]);

  // Build equipment set for WOD filtering
  const userEquipForWods = new Set((userProfile.equipment || []).map(e => e.toLowerCase()));
  userEquipForWods.add('bodyweight'); // everyone has bodyweight

  // Expand pool from ALL available WODs that match user's equipment
  if (wodPool.length < 15) {
    const equipMap = { dumbbells: 'dumbbell', barbell: 'barbell', kettlebell: 'kettlebell', pull_up_bar: 'pull_up_bar', bands: 'band', outdoor: 'outdoor', rings: 'rings', jump_rope: 'jump_rope', wall_ball: 'wall_ball', medicine_ball: 'wall_ball' };
    const mappedEquip = new Set();
    userEquipForWods.forEach(eq => { if (equipMap[eq]) mappedEquip.add(equipMap[eq]); });
    mappedEquip.add('bodyweight');

    for (const wod of allWods) {
      if (wodPool.includes(wod.id)) continue;
      // Check if WOD's equipment field is available
      let equipField = wod.equipment;
      if (typeof equipField === 'string') { try { equipField = JSON.parse(equipField); } catch { equipField = []; } }
      const wodEquip = Array.isArray(equipField) ? equipField : [];
      const canDo = wodEquip.length === 0 || wodEquip.every(e => mappedEquip.has(e) || userEquipForWods.has(e));
      if (!canDo) continue;

      // Movement-level equipment check — WOD equipment fields are often empty
      // but movements require specific gear (rope climb, barbell squat, rower, etc.)
      let movArr = wod.movements;
      if (typeof movArr === 'string') { try { movArr = JSON.parse(movArr); } catch { movArr = []; } }
      const movText = (Array.isArray(movArr) ? movArr.join(' ') : '').toLowerCase();
      let movementOk = true;
      if (/rope.?climb/i.test(movText) && !userEquipForWods.has('rope')) movementOk = false;
      if (/back.?squat|front.?squat.*barbell|barbell.*squat/i.test(movText) && !userEquipForWods.has('barbell') && !userEquipForWods.has('squat_rack')) movementOk = false;
      if (/handstand.?push|hspu/i.test(movText)) { if (!userEquipForWods.has('wall') && !userEquipForWods.has('outdoor')) movementOk = false; }
      if (/row\s*\d+.*meter|rower|rowing/i.test(movText) && !userEquipForWods.has('cardio_machines')) movementOk = false;
      if (/wall.?ball/i.test(movText) && !userEquipForWods.has('wall_ball') && !userEquipForWods.has('medicine_ball')) movementOk = false;
      if (/barbell|clean.?and.?jerk|snatch.*\d+.*lb|power.?clean/i.test(movText) && !userEquipForWods.has('barbell')) movementOk = false;
      if (!movementOk) continue;

      wodPool.push(wod.id);
      if (wodPool.length >= 30) break;
    }
  }

  // Pre-filter WOD pool for beginners — remove dangerous WODs before the weekly loop
  // This prevents fallback code from ever selecting them
  // Check BOTH archetype complexity AND experience level (general_fitness beginners need safety too)
  const isBeginnerProfile = archetype?.exerciseComplexity === 'simple' || userProfile.experience === 'beginner';
  if (isBeginnerProfile) {
    const beforeCount = wodPool.length;
    wodPool = wodPool.filter(id => {
      const w = wodById[id];
      if (!w) return false;
      // Duration cap: no 20+ min WODs for beginners
      const timeFields = [w.estimated_time, w.estimatedTime, w.time_cap, w.timeCap].filter(Boolean);
      let estTime = 10;
      for (const tf of timeFields) { const parsed = parseInt(String(tf)); if (!isNaN(parsed) && parsed > estTime) estTime = parsed; }
      if (estTime > 20) return false;
      // Movement safety: no Olympic, gymnastics, or heavy barbell
      let movArr = w.movements;
      if (typeof movArr === 'string') { try { movArr = JSON.parse(movArr); } catch { movArr = []; } }
      const movText = (Array.isArray(movArr) ? movArr.join(' ') : '').toLowerCase();
      if (/clean|snatch|jerk|thruster|power.?clean|hang.?clean/i.test(movText)) return false;
      if (/deadlift.*\d+|deadlift.*lb|deadlift.*kg|\d+.*deadlift/i.test(movText)) return false;
      if (/handstand|muscle.?up|ring.?dip|toes.?to.?bar|chest.?to.?bar|kipping|rope.?climb/i.test(movText)) return false;
      if (/pistol.?squat/i.test(movText)) return false;
      return true;
    });
    console.log(`[PlanV5] Beginner WOD pre-filter: ${beforeCount} → ${wodPool.length} WODs`);
  }

  // Shuffle for variety
  wodPool = wodPool.sort(() => Math.random() - 0.5);

  console.log(`[PlanV5] WOD pool: ${wodPool.length} WODs — ${wodPool.slice(0, 8).join(', ')}`);

  // Warmup pool — no jog if can't run
  const warmupPool = shouldHaveRuns ? WARMUP_IDS_WITH_JOG : WARMUP_IDS;

  const recentlyUsed = new Set();
  const weeklyExerciseCount = {}; // track how many times each exercise appears per week
  const wodUsageCount = {}; // track how many times each WOD is used across the plan
  const MAX_WOD_REPEATS = 2; // no WOD should appear more than twice in any plan
  const wodRecentWindow = []; // last 8 WOD IDs assigned (4-week recency window)
  let heroWodCount = 0; // max 3 hero WODs across entire plan

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
      // Non-race profiles: race_prep weeks become a second peak block (not regression to foundation)
      displayPhase = 'peak';
    } else {
      displayPhase = phase.phase;
    }

    const weekWodIdx = (week - 1) % Math.max(1, wodPool.length);
    const weekWodTypesUsed = []; // track WOD types used this week for variety
    const weekWodIdsUsed = []; // track WOD IDs used this week — no same WOD twice in one week
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

      // Day name — themed pools per pattern type, rotated by week for variety
      const DAY_NAME_POOLS = {
        // Push patterns
        chest:    ['CHEST WARS', 'IRON CHEST', 'PUSH AUTHORITY', 'BENCH HEAVY', 'CHEST SIEGE', 'PUSH PROTOCOL', 'CHEST DAY', 'PUSH DOMINANCE'],
        push:     ['PUSH AUTHORITY', 'CHEST SIEGE', 'IRON CHEST', 'PUSH PROTOCOL', 'PRESS HEAVY', 'CHEST WARS', 'PUSH DOMINANCE', 'BENCH HEAVY'],
        shoulder: ['BOULDER SHOULDERS', 'SHOULDER ASSAULT', 'DELTA FORCE', 'SHOULDER PUSH', 'OVERHEAD AUTHORITY', 'SHOULDER SIEGE', 'PRESS DAY', 'DELTA BUILD'],
        // Pull patterns
        back:     ['BACK ATTACK', 'ROW HARD', 'BACK BUILDER', 'PULL PROTOCOL', 'THICKNESS SESSION', 'BACK SIEGE', 'ROW HEAVY', 'PULL NATION'],
        pull:     ['PULL PROTOCOL', 'BACK ATTACK', 'ROW HARD', 'PULL NATION', 'BACK BUILDER', 'PULL SIEGE', 'ROW HEAVY', 'BACK SIEGE'],
        // Leg patterns
        leg:      ['LEG DAY HELL', 'SQUAT HEAVY', 'QUAD ANNIHILATION', 'LEG SIEGE', 'SQUAT PROTOCOL', 'LEG DAY ALPHA', 'QUAD DESTROYER', 'LEG AUTHORITY'],
        posterior:['POSTERIOR POWER', 'DEADLIFT HEAVY', 'POSTERIOR CHAIN', 'HINGE PROTOCOL', 'GLUTE & HAMSTRING', 'POSTERIOR SIEGE', 'HINGE HEAVY', 'DEAD SERIOUS'],
        // Special
        upper:    ['UPPER BODY ASSAULT', 'PUSH & PULL', 'UPPER SIEGE', 'PUSH PULL PROTOCOL', 'UPPER AUTHORITY', 'PUSH PULL HEAVY', 'UPPER DOMINATION', 'TOTAL UPPER'],
        lower:    ['LOWER BODY ASSAULT', 'LEG DAY HELL', 'LOWER SIEGE', 'SQUAT HEAVY', 'LOWER AUTHORITY', 'QUAD ANNIHILATION', 'LOWER DOMINATION', 'TOTAL LOWER'],
        full:     ['FULL SEND', 'TOTAL DOMINATION', 'NO MERCY', 'FULL BODY ASSAULT', 'TOTAL WARFARE', 'FULL SIEGE', 'NO DAYS OFF', 'TOTAL PROTOCOL'],
        power:    ['POWER HOUR', 'OLYMPIC COMPLEX', 'POWER PROTOCOL', 'EXPLOSIVE SESSION', 'POWER SIEGE', 'CLEAN & BUILD', 'POWER AUTHORITY', 'EXPLOSIVE POWER'],
        run:      ['ROAD WARRIOR', 'TEMPO PROTOCOL', 'SPRINT WARFARE', 'ENDURANCE SIEGE', 'INTERVAL HELL', 'SPEED PROTOCOL', 'RUN HEAVY', 'CARDIO ASSAULT'],
      };

      // Map primary pattern(s) to a name pool key
      const primaryPatterns = (dayConfig.primary_patterns || []).slice(0, 2);
      const DAY_TYPE_KEYS = {
        lower_a: 'lower', lower_b: 'lower', upper_a: 'upper', upper_b: 'upper',
      };
      const getPoolKey = () => {
        const typeKey = DAY_TYPE_KEYS[dayConfig.type];
        if (typeKey) return typeKey;
        const p0 = primaryPatterns[0] || '';
        const p1 = primaryPatterns[1] || '';
        if (p0 === 'squat' && p1 === 'horizontal_push') return 'full';
        if (p0 === 'squat' || p1 === 'squat') return p0 === 'hinge' || p1 === 'hinge' ? 'leg' : 'leg';
        if (p0 === 'hinge' || p1 === 'hinge') return 'posterior';
        if ((p0 === 'horizontal_push' || p1 === 'horizontal_push') && (p0 === 'horizontal_pull' || p1 === 'horizontal_pull')) return 'upper';
        if (p0 === 'horizontal_push' || p1 === 'horizontal_push') return 'chest';
        if (p0 === 'vertical_push' || p1 === 'vertical_push') {
          if (p0 === 'horizontal_pull' || p1 === 'horizontal_pull' || p0 === 'vertical_pull' || p1 === 'vertical_pull' || p0 === 'pull_up' || p1 === 'pull_up') return 'upper';
          return 'shoulder';
        }
        if (p0 === 'horizontal_pull' || p1 === 'horizontal_pull' || p0 === 'vertical_pull' || p1 === 'vertical_pull' || p0 === 'pull_up' || p1 === 'pull_up') return 'back';
        if (p0 === 'olympic') return 'power';
        return 'full';
      };
      const poolKey = getPoolKey();
      const pool = DAY_NAME_POOLS[poolKey] || DAY_NAME_POOLS.full;
      const deload = isDeloadWeek(week, totalWeeks);
      // Run-day title
      const runLabel = dayConfig.run
        ? (/long/i.test(dayConfig.run.type || '') ? 'LONG RUN' : /interval|sprint/i.test(dayConfig.run.type || '') ? 'SPRINT INTERVALS' : 'TEMPO RUN')
        : null;
      const baseTitle = runLabel && primaryPatterns.length === 0
        ? (DAY_NAME_POOLS.run[(week * dayConfigs.length + tdi) % DAY_NAME_POOLS.run.length])
        : pool[(week * dayConfigs.length + tdi) % pool.length];
      const title = deload
        ? `${baseTitle} — DELOAD`
        : baseTitle;
      const focusLabel = deload
        ? `DELOAD WEEK \u2022 2 sets \u2022 70% weight \u2022 Week ${week}`
        : displayPhase === 'race_prep'
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
      const hasJumpRope = (userProfile.equipment || []).includes('jump_rope');
      const WARMUP_BY_FOCUS = {
        lower: ['air_squats', 'cossack_squats', 'lunge_matrix', 'samson_stretch', 'high_knees', 'hip_90_90', 'glute_stretch_seated', 'adductor_stretch',
          ...(hasJumpRope ? ['jump_rope', 'double_unders'] : [])],
        upper: ['push_up_to_t', 'pvc_pass_throughs', 'arm_circles', 'bear_crawl', 'inchworm', 'band_pull_apart', 'wall_angels', 'shoulder_ext_rotation'],
        full: ['air_squats', 'push_up_to_t', 'bear_crawl', 'high_knees', 'lunge_matrix', 'inchworm', 'arm_circles',
          ...(hasJumpRope ? ['jump_rope'] : [])],
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
      const NEVER_MAIN_LIFT = /plank|dead.?bug|bird.?dog|v.?up|sit.?up|mountain.?climb|russian.?twist|cable.?wood|pallof|wall.?ball|ball.?slam|battle.?rope|lunge.?matrix|cossack|dead.?hang|farmer.?walk|cat.?cow|child.?pose|cobra|superman|stretch|circles|clam|hydrant|wall.?angel|pull.?apart|face.?pull|lateral.?raise|reverse.?fly|cable.?fly|chest.?fly|curl|tricep|pushdown|kickback|extension/i;
      // BW exercises shouldn't be main lifts when the user has real equipment (machines/barbell/DB)
      const hasRealEquip = (userProfile.equipment || []).some(e => /machine|barbell|dumbbell|squat.?rack|cable/i.test(e));
      const BW_NOT_MAIN = hasRealEquip ? /air.?squat|pike.?push|push.?up|burpee|high.?knee|jump.?jack|jumping.?jack/i : null;
      const rawCompoundPool = expandPool(daySelection.compounds || [], exerciseMenu, dayConfig, archetype, week);
      const allowedDayPatterns = new Set([...(dayConfig.primary_patterns || []), ...(dayConfig.secondary_patterns || [])]);
      // Sprint/run-only days with no patterns = no compound block (run IS the workout)
      const compoundPool = allowedDayPatterns.size === 0 && hasRun ? [] : rawCompoundPool.filter(id => {
        const ex = exerciseById[id];
        if (!ex) return false;
        if (NEVER_MAIN_LIFT.test(ex.name)) return false;
        if (BW_NOT_MAIN && BW_NOT_MAIN.test(ex.name)) return false;
        const pattern = getMovementPattern(ex);
        if (pattern === 'warmup' || pattern === 'cardio') return false;
        // Compounds must match this day's movement patterns — no squats on pull day
        if (allowedDayPatterns.size > 0 && !allowedDayPatterns.has(pattern)) return false;
        // On pull days (has horizontal_pull or pull_up), only allow pulling hinge exercises
        // Deadlift/RDL are pulls; hip thrust, glute bridge, leg curl are NOT
        const isPullDay = allowedDayPatterns.has('horizontal_pull') || allowedDayPatterns.has('pull_up');
        if (isPullDay && pattern === 'hinge') {
          const PULL_HINGES = new Set(['deadlift', 'romanian_deadlift', 'db_romanian_deadlift', 'db_single_leg_deadlift', 'back_extension']);
          if (!PULL_HINGES.has(id)) return false;
        }
        // Olympic lifts (push_jerk, snatch, clean_and_jerk) shouldn't be main lifts on push/pull days
        // They belong on conditioning/sprint days only
        const isPushDay = allowedDayPatterns.has('horizontal_push');
        if ((isPushDay || isPullDay) && ['olympic', 'plyometric'].includes(pattern)) return false;
        if ((isPushDay || isPullDay) && /push_jerk|snatch|clean_and_jerk|power_clean|hang_clean|db_thrusters|thrusters|db_clean_press|kb_clean_press/.test(id)) {
          // Blocked from push/pull day — silent
          return false;
        }
        return true;
      });

      // Sort compoundPool by equipment preference so barbell exercises are anchored first.
      // Claude may return only DB picks — this guarantees the equipment priority is enforced
      // at selection time regardless of what Claude returned.
      const equipPref = archetype?.equipmentPreference || ['barbell', 'dumbbell', 'kettlebell', 'machine', 'cable', 'bodyweight'];
      compoundPool.sort((a, b) => {
        const aEquip = exerciseById[a]?.category || 'bodyweight';
        const bEquip = exerciseById[b]?.category || 'bodyweight';
        const aRank = equipPref.indexOf(aEquip);
        const bRank = equipPref.indexOf(bEquip);
        return (aRank >= 0 ? aRank : 99) - (bRank >= 0 ? bRank : 99);
      });

      // Pattern-balanced compound selection: ensure each primary pattern gets at least 1 exercise
      // Without this, a day with [h_push, v_pull] could get 2 push exercises and 0 pull
      let compoundIds;
      const dayPrimaryPatterns = dayConfig.primary_patterns || [];
      if (compoundPool.length > 0 && bt.mainLiftCount >= 2 && dayPrimaryPatterns.length >= 2) {
        // Group pool by pattern
        const byPattern = {};
        for (const id of compoundPool) {
          const ex = exerciseById[id];
          if (!ex) continue;
          const p = getMovementPattern(ex);
          if (!byPattern[p]) byPattern[p] = [];
          byPattern[p].push(id);
        }
        // Pick 1 from each primary pattern
        // First pattern = anchor (same exercise every week for visible weight progression)
        // Second pattern = rotates for variety (different exercise each week)
        const picks = [];
        for (let pi = 0; pi < dayPrimaryPatterns.length; pi++) {
          if (picks.length >= bt.mainLiftCount) break;
          const pattern = dayPrimaryPatterns[pi];
          const group = byPattern[pattern] || [];
          if (group.length > 0) {
            const pick = pi === 0 ? group[0] : group[(week - 1) % group.length];
            picks.push(pick);
            usedToday.add(pick);
          }
        }
        // If we still need more (rare), fill from pool — enforce niche dedup against all already-picked
        if (picks.length < bt.mainLiftCount) {
          const pickedNiches = new Set(picks.map(id => getMovementNiche(id)).filter(Boolean));
          const remaining = compoundPool.filter(id => {
            if (picks.includes(id)) return false;
            const niche = getMovementNiche(id);
            if (niche && pickedNiches.has(niche)) return false; // skip same-niche as any picked compound
            return true;
          });
          const extra = rotateExercises(remaining, week, recentlyUsed, usedToday, bt.mainLiftCount - picks.length, weeklyExerciseCount);
          picks.push(...extra);
        }
        compoundIds = picks;
      } else if (compoundPool.length > 0 && bt.mainLiftCount > 1) {
        // Single-pattern day: anchor + rotate (filter out same-niche duplicates)
        const anchor = compoundPool[0];
        const anchorNiche = getMovementNiche(anchor);
        const remaining = compoundPool.slice(1).filter(id => {
          if (!anchorNiche) return true;
          const niche = getMovementNiche(id);
          return !niche || niche !== anchorNiche; // skip same niche as anchor
        });
        const rotated = rotateExercises(remaining, week, recentlyUsed, usedToday, bt.mainLiftCount - 1, weeklyExerciseCount);
        compoundIds = [anchor, ...rotated];
        usedToday.add(anchor);
      } else {
        compoundIds = rotateExercises(compoundPool, week, recentlyUsed, usedToday, bt.mainLiftCount, weeklyExerciseCount);
      }
      if (compoundIds.length > 0) {
        const compBlockId = await savePlanBlock({ planDayId: dayId, sortOrder: blockOrder++, name: 'MAIN LIFTS', type: 'COMPOUND', timeCap: `${bt.mainLifts} min`, isAmrap: false, hasGps: false });
        for (let i = 0; i < compoundIds.length; i++) {
          const ex = exerciseById[compoundIds[i]];
          if (!ex) continue;
          const { sets, reps } = calculateSetsReps(ex, week, displayPhase, bodyCompGoal, sessionMinutes, bt.sets, totalWeeks);
          const weight = calculateWeight(ex, week, displayPhase, bodyCompGoal, userProfile.experience, sanitizedProfile.equipmentDetails, sanitizedProfile.workingWeights, userProfile.sex, totalWeeks);
          const rest = getRestForPhase(displayPhase, true);
          // Near-cap strategy: if weight is close to equipment max, add tempo/AMRAP notes
          // Check equipment ceiling: barbell max for barbell exercises, DB max for dumbbell exercises
          const isBarbellEx = ex.category === 'barbell';
          const isDBEx = ex.category === 'dumbbell';
          const equipMax = isBarbellEx ? sanitizedProfile.equipmentDetails?.barbell?.maxWeight
            : isDBEx ? sanitizedProfile.equipmentDetails?.dumbbells?.maxWeight
            : null;
          const weightNum = parseFloat(weight) || 0;
          const capStrategy = equipMax ? getNearCapStrategy(weightNum, parseFloat(equipMax)) : null;
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
        // Phase-tier filtering: hero WODs only in Peak, standard in Foundation/Deload
        // Foundation allows standard + intermediate (Helen, The Chief are fine for base building)
        // Only hero WODs (Grace, DT, Fran) are restricted to Peak
        const isBeginner = archetype?.exerciseComplexity === 'simple';
        const PHASE_ALLOWED_TIERS = {
          foundation: isBeginner ? ['standard'] : ['standard', 'intermediate'],
          build: isBeginner ? ['standard'] : ['standard', 'intermediate'],
          peak: isBeginner ? ['standard', 'intermediate'] : ['standard', 'intermediate', 'hero'],
          race_prep: isBeginner ? ['standard'] : ['standard', 'intermediate'],
        };
        const allowedTiers = PHASE_ALLOWED_TIERS[displayPhase] || ['standard', 'intermediate'];
        const isDeload = isDeloadWeek(week, totalWeeks);
        const effectiveTiers = isDeload ? ['standard'] : allowedTiers;

        // Filter pool: tier + repeat cap + recency + no same WOD twice in one week + equipment + duration
        let eligibleWods = wodPool.filter(id => {
          if ((wodUsageCount[id] || 0) >= MAX_WOD_REPEATS) return false;
          if (weekWodIdsUsed.includes(id)) return false;
          if (wodRecentWindow.includes(id)) return false;
          const w = wodById[id];
          if (!w) return false;
          // Phase tier
          const meta = getWodMetadata(w);
          if (!effectiveTiers.includes(meta.phaseTier)) return false;
          // Duration cap: WODs on days with other blocks max 20 min
          // Check all possible field names (DB snake_case vs seed camelCase)
          const timeFields = [w.estimated_time, w.estimatedTime, w.time_cap, w.timeCap].filter(Boolean);
          let estTime = 10;
          for (const tf of timeFields) {
            const parsed = parseInt(String(tf));
            if (!isNaN(parsed) && parsed > estTime) estTime = parsed;
          }
          if (estTime > 20) return false; // skip 30-min WODs like Chelsea/Murph
          // Must have 2+ distinct movements (no single-exercise WODs like Grace, Isabel)
          let wMov = w.movements;
          if (typeof wMov === 'string') { try { wMov = JSON.parse(wMov); } catch { wMov = []; } }
          if (!Array.isArray(wMov) || wMov.length === 0) return false;
          // Running-only WODs (Griff, Jerry) excluded for everyone — run days cover running
          // Mixed WODs with some running (Helen, Nancy) allowed for racers only
          const allRunning = wMov.every(m => /run|mile|meter|sprint|jog|swim|row|bike/i.test(m));
          if (allRunning) return false;
          if (meta.containsRunning && !shouldHaveRuns) return false;
          // Movement ability check: skip WODs with movements user can't do
          let movArr = w.movements;
          if (typeof movArr === 'string') { try { movArr = JSON.parse(movArr); } catch { movArr = []; } }
          const movText = (Array.isArray(movArr) ? movArr.join(' ') : '').toLowerCase();
          if (/handstand push.?up|hspu/i.test(movText) && !userEquipForWods.has('rings')) return false;
          if (/pistol squat/i.test(movText)) return false;
          if (/muscle.?up/i.test(movText) && !userEquipForWods.has('rings')) return false;
          if (/rope climb/i.test(movText) && !userEquipForWods.has('rope')) return false;
          // Beginners: no WODs with Olympic lifts, heavy barbell, or advanced gymnastics
          if (isBeginner) {
            if (/clean|snatch|jerk|thruster|power.?clean|hang.?clean/i.test(movText)) return false;
            if (/deadlift.*\d+|deadlift.*lb|deadlift.*kg|\d+.*deadlift/i.test(movText)) return false;
            if (/handstand|muscle.?up|ring.?dip|toes.?to.?bar|chest.?to.?bar|kipping/i.test(movText)) return false;
          }
          return true;
        });
        if (eligibleWods.length === 0) {
          // Relax recency but still enforce repeat cap + tier + week dedup
          eligibleWods = wodPool.filter(id => {
            if ((wodUsageCount[id] || 0) >= MAX_WOD_REPEATS) return false;
            if (weekWodIdsUsed.includes(id)) return false;
            const w = wodById[id];
            if (!w) return false;
            const meta = getWodMetadata(w);
            return effectiveTiers.includes(meta.phaseTier);
          });
        }
        if (eligibleWods.length === 0) {
          // Last resort: allow any WOD not used this week, but STILL enforce beginner safety + duration
          eligibleWods = wodPool.filter(id => {
            if (weekWodIdsUsed.includes(id)) return false;
            const w = wodById[id];
            if (!w) return false;
            // Always enforce duration cap
            const timeFields = [w.estimated_time, w.estimatedTime, w.time_cap, w.timeCap].filter(Boolean);
            let estTime = 10;
            for (const tf of timeFields) { const parsed = parseInt(String(tf)); if (!isNaN(parsed) && parsed > estTime) estTime = parsed; }
            if (estTime > 20) return false;
            // Always enforce beginner safety
            if (isBeginner) {
              let movArr = w.movements;
              if (typeof movArr === 'string') { try { movArr = JSON.parse(movArr); } catch { movArr = []; } }
              const movText = (Array.isArray(movArr) ? movArr.join(' ') : '').toLowerCase();
              if (/clean|snatch|jerk|thruster|power.?clean|hang.?clean/i.test(movText)) return false;
              if (/handstand|muscle.?up|ring.?dip|toes.?to.?bar|chest.?to.?bar|kipping|rope.?climb/i.test(movText)) return false;
            }
            return true;
          });
        }
        if (eligibleWods.length === 0) eligibleWods = [...wodPool]; // absolute last resort

        // Type diversity within the week
        if (weekWodTypesUsed.length > 0) {
          const diverseWods = eligibleWods.filter(id => {
            const w = wodById[id];
            return w && !weekWodTypesUsed.includes((w.type || '').toLowerCase());
          });
          if (diverseWods.length > 0) eligibleWods = diverseWods;
        }

        // Hero WOD cap: max 2-3 across entire plan
        if (heroWodCount >= 3) {
          eligibleWods = eligibleWods.filter(id => {
            const w = wodById[id];
            if (!w) return true;
            return getWodMetadata(w).phaseTier !== 'hero';
          });
          if (eligibleWods.length === 0) eligibleWods = wodPool.filter(id => (wodUsageCount[id] || 0) < MAX_WOD_REPEATS);
        }

        // Day-focus scoring: score each WOD by how well it matches today's focus
        // Higher score = better match. Allows some variety (mixed WODs still appear)
        // but prevents pure squat WODs on chest day or pure run WODs on pull day
        const isPushDay = allowedDayPatterns.has('horizontal_push') || allowedDayPatterns.has('vertical_push');
        const isPullDay = allowedDayPatterns.has('horizontal_pull') || allowedDayPatterns.has('pull_up');
        const isLegDay = allowedDayPatterns.has('squat') || allowedDayPatterns.has('hinge');

        const scoredWods = eligibleWods.map(id => {
          const w = wodById[id];
          if (!w) return { id, score: 0 };
          let movArr = w.movements;
          if (typeof movArr === 'string') { try { movArr = JSON.parse(movArr); } catch { movArr = []; } }
          const movText = (Array.isArray(movArr) ? movArr.join(' ') : '').toLowerCase();

          const hasPush = /push.?up|press|dip|burpee|hspu/i.test(movText);
          const hasPull = /pull.?up|row|chin|climb/i.test(movText);
          const hasSquat = /squat|lunge|thruster|wall.?ball/i.test(movText);
          const hasHinge = /deadlift|swing|clean|snatch/i.test(movText);
          const hasRun = /run|row.*meter|mile|sprint/i.test(movText);
          const isMixed = [hasPush, hasPull, hasSquat || hasHinge, hasRun].filter(Boolean).length >= 2;

          let score = 0;
          // Reward matching movements
          if (isPushDay && hasPush) score += 3;
          if (isPullDay && hasPull) score += 3;
          if (isLegDay && (hasSquat || hasHinge)) score += 3;
          // Mixed WODs are always decent (Cindy, Helen-style)
          if (isMixed) score += 1;
          // Penalize pure mismatches
          if (isPushDay && !isLegDay && hasSquat && !hasPush) score -= 3;
          if (isPushDay && !isLegDay && hasRun && !hasPush) score -= 2;
          if (isPullDay && !isLegDay && hasSquat && !hasPull) score -= 3;
          if (isLegDay && !isPushDay && !isPullDay && hasPush && !hasSquat && !hasHinge) score -= 2;

          return { id, score };
        });

        // Sort by score (best match first), then by least-used for variety
        scoredWods.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return (wodUsageCount[a.id] || 0) - (wodUsageCount[b.id] || 0);
        });

        // Take top half by score, then pick from those for variety
        const topHalf = scoredWods.slice(0, Math.max(3, Math.ceil(scoredWods.length / 2)));
        eligibleWods = topHalf.map(s => s.id);

        // Select WOD — pick least-used from eligible pool for maximum variety
        eligibleWods.sort((a, b) => (wodUsageCount[a] || 0) - (wodUsageCount[b] || 0));
        // Among least-used, add some rotation variety
        const minUsage = wodUsageCount[eligibleWods[0]] || 0;
        const leastUsed = eligibleWods.filter(id => (wodUsageCount[id] || 0) === minUsage);
        const rotIdx = ((week - 1) * dayConfigs.length + tdi) % Math.max(1, leastUsed.length);
        const wodId = leastUsed[rotIdx] || eligibleWods[0];
        const selectedWod = wodById[wodId];
        if (selectedWod) {
          wodUsageCount[wodId] = (wodUsageCount[wodId] || 0) + 1;
          wodRecentWindow.push(wodId);
          if (wodRecentWindow.length > 8) wodRecentWindow.shift();
          weekWodIdsUsed.push(wodId);
          weekWodTypesUsed.push((selectedWod.type || '').toLowerCase());
          const selectedMeta = getWodMetadata(selectedWod);
          if (selectedMeta.phaseTier === 'hero') heroWodCount++;

          if (week <= 2) console.log(`[PlanV5] WOD: ${selectedWod.name} (${selectedMeta.phaseTier}) wk${week}`);
          const wodBlockType = selectedWod.type || dayConfig.wod.type || 'CIRCUIT';
          const isAmrap = /amrap/i.test(wodBlockType);
          const isTimedWod = /amrap|for time|emom/i.test(wodBlockType);
          const wodTimeCap = selectedWod.time_cap || selectedWod.timeCap || (isAmrap ? '10 min' : null);
          const wodBlockId = await savePlanBlock({ planDayId: dayId, sortOrder: blockOrder++, name: selectedWod.name || 'WOD', type: wodBlockType, timeCap: wodTimeCap || '10 min', isAmrap: isTimedWod ? 1 : 0, hasGps: false });
          const wodExercises = buildWodExercises(selectedWod, sanitizedProfile.equipmentDetails, sanitizedProfile.workingWeights, userProfile.experience);
          for (let i = 0; i < wodExercises.length; i++) {
            await savePlanExercise({ planBlockId: wodBlockId, exerciseId: wodExercises[i].id, sortOrder: i, sets: wodExercises[i].sets, reps: wodExercises[i].reps, weight: wodExercises[i].weight, rest: null, notes: wodExercises[i].notes });
          }
        }
      }

      // ── ACCESSORIES — expand pool, dedup movement niches vs compounds ──
      // Skip accessories on beginner finisher days to stay within session time
      const willHaveFinisher = isBeginnerProfile && archetype?.periodization === 'fat_loss' && tdi % 2 === 0 && !isDeloadWeek(week, totalWeeks) && bt.wod === 0;
      if (willHaveFinisher) { bt.accessoryCount = 0; bt.accessories = 0; }
      // Track which movement niches are already covered by compounds
      const usedNiches = new Set();
      for (const id of compoundIds) {
        const niche = getMovementNiche(id);
        if (niche) usedNiches.add(niche);
      }
      // Filter Claude's accessory picks to match day's patterns (no squats on pull day)
      const filteredAccPicks = (daySelection.accessories || []).filter(id => {
        const ex = exerciseById[id];
        if (!ex) return true;
        const p = getMovementPattern(ex);
        return !allowedDayPatterns.size || allowedDayPatterns.has(p) || p === 'core';
      });
      const accPool = bt.accessoryCount > 0 ? expandPool(filteredAccPicks, exerciseMenu, dayConfig, archetype, week) : [];
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
          const { sets, reps } = calculateSetsReps(ex, week, displayPhase, bodyCompGoal, sessionMinutes, bt.sets, totalWeeks);
          const weight = calculateWeight(ex, week, displayPhase, bodyCompGoal, userProfile.experience, sanitizedProfile.equipmentDetails, sanitizedProfile.workingWeights, userProfile.sex, totalWeeks);
          await savePlanExercise({ planBlockId: accBlockId, exerciseId: ex.id, sortOrder: i, sets: `${sets}x${reps}`, reps: `${reps}`, weight, rest: '45-60s', notes: null });
          usedToday.add(ex.id); recentlyUsed.add(ex.id);
        }
      }

      // ── ARM FINISHER — only if time budget allows ──
      // Filter Claude's arm picks: must be arm isolation, cap at 2 per session (1 pull + 1 push)
      let armIds = (daySelection.arms || []).filter(id => {
        const ex = exerciseById[id];
        if (!ex) return false;
        const pattern = getMovementPattern(ex);
        return pattern === 'arm_pull' || pattern === 'arm_push';
      });
      // Cap at 2 exercises: 1 bicep + 1 tricep (rotate across weeks for variety)
      if (armIds.length > 2) {
        const pulls = armIds.filter(id => getMovementPattern(exerciseById[id]) === 'arm_pull');
        const pushes = armIds.filter(id => getMovementPattern(exerciseById[id]) === 'arm_push');
        armIds = [
          pulls[week % pulls.length] || pulls[0],
          pushes[week % pushes.length] || pushes[0],
        ].filter(Boolean);
      }
      // Ensure arm blaster always has 2 exercises (1 bicep + 1 tricep) for a proper superset
      if (armIds.length < 2 && dayConfig.arm_finisher && bt.armBlaster > 0) {
        const armPullOptions = exerciseMenu.filter(e => e.pattern === 'arm_pull').map(e => e.id);
        const armPushOptions = exerciseMenu.filter(e => e.pattern === 'arm_push').map(e => e.id);
        const hasPull = armIds.some(id => getMovementPattern(exerciseById[id]) === 'arm_pull');
        const hasPush = armIds.some(id => getMovementPattern(exerciseById[id]) === 'arm_push');
        if (!hasPull && armPullOptions.length > 0) armIds.push(armPullOptions[week % armPullOptions.length]);
        if (!hasPush && armPushOptions.length > 0) armIds.push(armPushOptions[week % armPushOptions.length]);
      }
      if (armIds.length > 0 && bt.armBlaster > 0) {
        const armBlockId = await savePlanBlock({ planDayId: dayId, sortOrder: blockOrder++, name: 'ARM BLASTER', type: 'SUPERSETS', timeCap: `${bt.armBlaster} min`, isAmrap: false, hasGps: false });
        for (let i = 0; i < armIds.length; i++) {
          const ex = exerciseById[armIds[i]];
          if (!ex) continue;
          const { sets, reps } = calculateSetsReps(ex, week, displayPhase, bodyCompGoal, sessionMinutes, bt.sets, totalWeeks);
          const weight = calculateWeight(ex, week, displayPhase, bodyCompGoal, userProfile.experience, sanitizedProfile.equipmentDetails, sanitizedProfile.workingWeights, userProfile.sex, totalWeeks);
          await savePlanExercise({ planBlockId: armBlockId, exerciseId: ex.id, sortOrder: i, sets: `${sets}x${reps}`, reps: `${reps}`, weight, rest: '30-45s', notes: null });
        }
      }

      // ── CORE — present when time budget allows ──
      if (bt.core <= 0) { /* skip core on days with no time budget for it (e.g. carry + long run) */ } else {
      const userEquipSet = new Set((userProfile.equipment || []).map(e => e.toLowerCase()));
      const hasCables = userEquipSet.has('cables') || userEquipSet.has('cable');
      const hasBands = userEquipSet.has('bands') || userEquipSet.has('band');
      const CORE_CATEGORIES = {
        anti_extension: ['plank', 'dead_bug', 'bird_dog', 'plank_to_pushup'],
        flexion: ['sit_ups', 'v_ups', 'mountain_climbers', 'russian_twists'],
        anti_rotation: hasBands ? ['bird_dog', 'pallof_press', 'dead_bug'] : hasCables ? ['bird_dog', 'cable_woodchop', 'dead_bug'] : ['bird_dog', 'dead_bug', 'plank', 'plank_to_pushup'],
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
      const maxCoreExercises = sessionMinutes >= 75 ? 3 : 2;
      let coreIds = (daySelection.core || []).filter(id => {
        if (VALID_CORE_IDS.has(id)) return true;
        const ex = exerciseById[id];
        if (!ex) return false;
        const pattern = getMovementPattern(ex);
        return pattern === 'core' && ex.muscle_group === 'core';
      }).slice(0, maxCoreExercises); // Cap Claude's picks to session-appropriate count
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
        // Add a third from remaining categories (only for 75+ min sessions — 2 exercises is enough for ≤60 min)
        if (sessionMinutes >= 75) {
          const usedCats = new Set(corePair);
          const remaining = Object.keys(CORE_CATEGORIES).filter(c => !usedCats.has(c));
          if (remaining.length > 0) {
            const extraCat = remaining[week % remaining.length];
            const extraPool = CORE_CATEGORIES[extraCat].filter(id => exerciseById[id] && !coreIds.includes(id));
            if (extraPool.length > 0) coreIds.push(extraPool[week % extraPool.length]);
          }
        }
      }
      if (coreIds.length > 0) {
        // Scale core sets by session length: 2 sets for ≤60 min, 3 sets for 75+ min
        const coreSets = (sessionMinutes <= 60 || userProfile.experience === 'beginner') ? 2 : 3;
        const coreBlockId = await savePlanBlock({ planDayId: dayId, sortOrder: blockOrder++, name: 'CORE', type: 'CIRCUIT', timeCap: `${bt.core} min`, isAmrap: false, hasGps: false });
        for (let i = 0; i < coreIds.length; i++) {
          const ex = exerciseById[coreIds[i]];
          if (!ex) continue;
          await savePlanExercise({ planBlockId: coreBlockId, exerciseId: ex.id, sortOrder: i, sets: `${coreSets}x${ex.default_reps || '15'}`, reps: ex.default_reps || '15', weight: 'BW', rest: null, notes: null });
        }
      }
      } // end core time budget check

      // ── BEGINNER FINISHER — metabolic conditioning for fat loss (no named WODs) ──
      // Added on alternating training days for overweight_beginner archetype
      const isBeginnerFinisher = isBeginnerProfile && archetype?.periodization === 'fat_loss';
      const isFinisherDay = tdi % 2 === 0; // days 0 and 2 get finishers
      const isDeload = isDeloadWeek(week, totalWeeks);
      if (isBeginnerFinisher && isFinisherDay && !isDeload && bt.wod === 0) {
        const hasKB = (userProfile.equipment || []).some(e => /kettlebell/i.test(e));
        const hasBike = (userProfile.equipment || []).some(e => /cardio/i.test(e));
        // Rotate through simple circuits each week
        const FINISHER_CIRCUITS = [
          // Circuit A: lower body metabolic
          [
            { id: 'air_squats', sets: '3x15', reps: '15', weight: 'BW' },
            { id: 'mountain_climbers', sets: '3x10 ea', reps: '10 ea', weight: 'BW' },
            ...(hasKB ? [{ id: 'kb_swings', sets: '3x12', reps: '12', weight: '15 lb' }] : [{ id: 'high_knees', sets: '3x20', reps: '20', weight: 'BW' }]),
          ],
          // Circuit B: lower body + core metabolic (no push exercises to avoid skewing push/pull ratio)
          [
            { id: 'air_squats', sets: '3x20', reps: '20', weight: 'BW' },
            { id: 'plank', sets: '3x20s', reps: '20s', weight: 'BW' },
            ...(hasKB ? [{ id: 'kb_swings', sets: '3x10', reps: '10', weight: '15 lb' }] : [{ id: 'mountain_climbers', sets: '3x10 ea', reps: '10 ea', weight: 'BW' }]),
          ],
          // Circuit C: KB or bodyweight
          [
            ...(hasKB ? [{ id: 'kb_swings', sets: '3x15', reps: '15', weight: '15 lb' }] : [{ id: 'high_knees', sets: '3x20', reps: '20', weight: 'BW' }]),
            { id: 'mountain_climbers', sets: '3x10 ea', reps: '10 ea', weight: 'BW' },
            { id: 'air_squats', sets: '3x20', reps: '20', weight: 'BW' },
          ],
        ];
        const circuit = FINISHER_CIRCUITS[(week - 1) % FINISHER_CIRCUITS.length];
        const finBlockId = await savePlanBlock({ planDayId: dayId, sortOrder: blockOrder++, name: 'FINISHER', type: 'CIRCUIT', timeCap: '8 min', isAmrap: true, hasGps: false });
        for (let i = 0; i < circuit.length; i++) {
          const exData = circuit[i];
          const ex = exerciseById[exData.id];
          if (ex) {
            await savePlanExercise({ planBlockId: finBlockId, exerciseId: exData.id, sortOrder: i, sets: exData.sets, reps: exData.reps, weight: exData.weight, rest: '0s', notes: exData.notes || 'Minimal rest between exercises' });
          }
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

  // ── POST-GENERATION VALIDATION ──
  // Run all 10 checks, auto-fix what we can, log results
  try {
    const { getDatabase: getDb } = require('../data/database');
    const db = await getDb();
    // Load the plan we just saved for validation
    const savedDays = await db.getAllAsync(
      'SELECT * FROM plan_days WHERE plan_id = ? ORDER BY week_number, day_of_week', [planId]
    );
    for (const day of savedDays) {
      day.blocks = await db.getAllAsync('SELECT * FROM plan_blocks WHERE plan_day_id = ? ORDER BY sort_order', [day.id]);
      for (const block of day.blocks) {
        block.exercises = await db.getAllAsync('SELECT * FROM plan_exercises WHERE plan_block_id = ? ORDER BY sort_order', [block.id]);
      }
    }
    const { validatePlan, applyAutoFixes } = require('./planValidator');
    const validation = validatePlan(savedDays, userProfile);
    if (validation.auto_fixes_applied > 0) {
      await applyAutoFixes(validation.violations, db);
    }
    if (validation.needs_regeneration) {
      console.warn('[AI Plan] Validator flagged structural issues — plan may need regeneration');
    }
  } catch (e) {
    console.warn('[AI Plan] Validator failed:', e.message);
  }

  // ── AUTO-REVIEW (dev only — runs AI fitness expert on the rendered plan) ──
  try {
    const { getDatabase: getDb2 } = require('../data/database');
    const db2 = await getDb2();
    const reviewDays = await db2.getAllAsync('SELECT * FROM plan_days WHERE plan_id = ? ORDER BY week_number, day_of_week', [planId]);
    for (const day of reviewDays) {
      day.blocks = await db2.getAllAsync('SELECT * FROM plan_blocks WHERE plan_day_id = ? ORDER BY sort_order', [day.id]);
      for (const block of day.blocks) {
        block.exercises = await db2.getAllAsync(
          "SELECT pe.*, COALESCE(e.name, pe.exercise_id) as name FROM plan_exercises pe LEFT JOIN exercises e ON e.id = pe.exercise_id WHERE pe.plan_block_id = ? ORDER BY pe.sort_order",
          [block.id]
        );
      }
    }
    const { reviewPlan } = require('./planReviewer');
    const review = await reviewPlan(reviewDays, userProfile);
    console.log('\n[AI REVIEW]\n' + review);
  } catch (e) {
    console.log('[AI Review] Skipped:', e.message);
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
    // WOD day: 2 main lifts + WOD + arms if session allows (60+ min)
    const wodArmTime = (wantArms && sessionMinutes >= 60) ? 6 : 0;
    bt = { warmup: 6, mainLifts: 15, wod: wodArmTime > 0 ? 8 : 10, accessories: 0, armBlaster: wodArmTime, core: 5, cooldown: 5,
      sets: 3, mainLiftCount: 2, accessoryCount: 0, coreCount: 2, warmupCount: 3, rest: '45-60s' };
  } else {
    // Pure lifting day (no WOD, no run): 3 main lifts + accessories + core + arms
    const armTime = wantArms ? 6 : 0;
    bt = { warmup: 5, mainLifts: 25, wod: 0, accessories: 8, armBlaster: armTime, core: 5, cooldown: 5,
      sets: 3, mainLiftCount: 3, accessoryCount: 2, coreCount: 2, warmupCount: 2, rest: '45-60s' };
  }

  // ── Scale for session duration ──
  if (sessionMinutes <= 30) {
    bt.warmup = 3; bt.mainLifts = 15; bt.wod = 0; bt.accessories = 0; bt.armBlaster = 0; bt.core = 3; bt.cooldown = 3;
    bt.mainLiftCount = 2; bt.accessoryCount = 0; bt.coreCount = 2; bt.warmupCount = 2; bt.rest = '30-45s';
  } else if (sessionMinutes <= 45) {
    bt.warmup = Math.min(bt.warmup, 5); bt.cooldown = 4;
    bt.mainLiftCount = Math.min(bt.mainLiftCount, 2);
    bt.armBlaster = 0;
    bt.core = Math.min(bt.core, 5);
    if (bt.wod > 0) {
      // WOD day: drop accessories, cap WOD
      bt.accessories = 0; bt.accessoryCount = 0;
      bt.wod = Math.min(bt.wod, 8);
      bt.mainLifts = Math.min(bt.mainLifts, 15);
    } else {
      // No WOD: allow 1 accessory, more time for main lifts
      bt.accessories = Math.min(bt.accessories, 8); bt.accessoryCount = Math.min(bt.accessoryCount, 1);
      bt.mainLifts = Math.min(bt.mainLifts, 20);
    }
    bt.rest = '30-60s';
  } else if (sessionMinutes >= 90) {
    // 90 min: more rest between sets, 4 sets per exercise, but same exercise count
    bt.sets = 4; bt.rest = '90-120s';
    bt.warmup = 8; bt.warmupCount = 3;
    if (!hasWod && !hasRun) { bt.mainLiftCount = 3; bt.accessoryCount = 2; bt.accessories = 12; }
    bt.core = 5; bt.coreCount = 2;
  } else if (sessionMinutes >= 75) {
    bt.sets = 4; bt.rest = '60-90s';
    if (!hasWod && !hasRun) { bt.mainLiftCount = 3; bt.accessoryCount = 2; bt.accessories = 10; }
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
// Pattern matching catches variants not explicitly listed (e.g. db_romanian_deadlift, single_arm_row)
function getMovementNiche(exerciseId) {
  const id = exerciseId?.toLowerCase() || '';

  const NICHE_MAP = {
    // Incline push
    incline_bench: 'incline_push', db_incline_press: 'incline_push', incline_machine_press: 'incline_push',
    // Flat push
    bench_press: 'flat_push', db_bench_press: 'flat_push', machine_chest_press: 'flat_push',
    floor_press: 'floor_push', db_floor_press: 'floor_push',
    // Fly
    db_chest_fly: 'fly', cable_fly: 'fly', db_fly: 'fly',
    // Overhead press
    overhead_press: 'overhead_press', db_shoulder_press: 'overhead_press', machine_shoulder_press: 'overhead_press', push_press: 'overhead_press', db_arnold_press: 'overhead_press', arnold_press: 'overhead_press',
    // Row
    barbell_row: 'row', db_row: 'row', machine_row: 'row', cable_row: 'row', chest_supported_row: 'row', seated_cable_row: 'row', single_arm_cable_row: 'row',
    // Vertical pull
    pull_ups: 'pull_up', chin_ups: 'pull_up', band_assisted_pull_ups: 'pull_up',
    // Squat
    back_squat: 'squat_main', front_squat: 'squat_main',
    goblet_squat: 'squat_light', kb_goblet_squat: 'squat_light', db_goblet_squat: 'squat_light',
    // Hinge — explicit entries
    deadlift: 'hinge_main', sumo_deadlift: 'hinge_main', trap_bar_deadlift: 'hinge_main',
    romanian_deadlift: 'hinge_accessory', db_rdl: 'hinge_accessory', db_romanian_deadlift: 'hinge_accessory', db_stiff_leg_deadlift: 'hinge_accessory',
    // Curl
    bicep_curl: 'curl', hammer_curl: 'curl', cable_bicep_curl: 'curl', concentration_curl: 'curl', barbell_curl: 'curl',
    // Tricep extension
    skull_crushers: 'tricep_ext', overhead_tricep_ext: 'tricep_ext', cable_tricep_pushdown: 'tricep_ext',
    // Lateral raise
    lateral_raise: 'lateral_raise', cable_lateral_raise: 'lateral_raise',
  };

  if (NICHE_MAP[id]) return NICHE_MAP[id];

  // Pattern-based fallback — catches DB variants, single-arm versions, machine variants
  if (id.includes('romanian_deadlift') || id.includes('_rdl') || id.includes('stiff_leg_deadlift')) return 'hinge_accessory';
  if (id.includes('deadlift')) return 'hinge_main';
  if (id.includes('incline') && (id.includes('press') || id.includes('bench'))) return 'incline_push';
  if ((id.includes('bench_press') || id.includes('chest_press')) && !id.includes('incline')) return 'flat_push';
  if (id.includes('overhead_press') || id.includes('shoulder_press') || id.includes('arnold_press')) return 'overhead_press';
  if (id.includes('_row') || id.startsWith('row_')) return 'row';
  if (id.includes('pull_up') || id.includes('pullup') || id.includes('chin_up')) return 'pull_up';
  if (id.includes('lateral_raise')) return 'lateral_raise';
  if (id.endsWith('_curl') || id.includes('curl_')) return 'curl';
  if (id.includes('tricep') && (id.includes('ext') || id.includes('pushdown') || id.includes('press'))) return 'tricep_ext';

  return null;
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
  const patterns = [...(dayConfig.primary_patterns || []), ...(dayConfig.secondary_patterns || [])];
  const equipPref = archetype?.equipmentPreference || ['barbell', 'dumbbell', 'kettlebell', 'machine', 'cable', 'bodyweight'];
  const isBeginner = archetype?.exerciseComplexity === 'simple';

  // Re-sort Claude's picks by equipment preference so barbell exercises
  // come first even if Claude returned DB variants first
  const exerciseById = Object.fromEntries(exerciseMenu.map(e => [e.id, e]));
  const sortedClaudePicks = [...claudePicks].sort((a, b) => {
    const aEquip = exerciseById[a]?.equipment || 'bodyweight';
    const bEquip = exerciseById[b]?.equipment || 'bodyweight';
    const aRank = equipPref.indexOf(aEquip);
    const bRank = equipPref.indexOf(bEquip);
    return (aRank >= 0 ? aRank : 99) - (bRank >= 0 ? bRank : 99);
  });

  const pool = [...sortedClaudePicks];
  const poolSet = new Set(pool);

  // For beginners: restrict equipment by phase
  // 'simple' complexity (overweight_beginner) WITH alternatives: DB/KB/machine/cable/BW only
  //   — barbell introduces form complexity + sudden weight jumps (45 lb floor)
  //   — but if barbell is their ONLY loaded equipment, keep it (better than BW-only)
  // Other beginners: barbell unlocked at week 9 after building confidence
  const userEquipSet = new Set((archetype?.equipmentPreference || []).map(e => e.toLowerCase()));
  const hasAlternatives = exerciseMenu.some(e => e.equipment === 'dumbbell' || e.equipment === 'machine' || e.equipment === 'cable');
  let allowedEquipment;
  if (isBeginner) {
    if (week <= 4 && hasAlternatives) {
      // Weeks 1-4: machines/DBs/KBs only (learn movement patterns safely)
      allowedEquipment = new Set(['machine', 'cable', 'dumbbell', 'kettlebell', 'bodyweight']);
    } else if (week <= 8 && archetype?.exerciseComplexity === 'simple' && hasAlternatives) {
      // Overweight beginners: extend DB/machine preference through week 8
      allowedEquipment = new Set(['machine', 'cable', 'dumbbell', 'kettlebell', 'bodyweight']);
    } else {
      allowedEquipment = null; // week 5+ (or week 9+ for overweight) — barbell unlocked
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
      if (isBeginner && /ab.?wheel|toes.?to.?bar|muscle.?up|pistol|handstand|jump.?squat|thruster|clean.?press|push.?press|snatch/i.test(ex.id)) return false;
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

function buildWodExercises(wod, equipmentDetails, workingWeights, experience) {
  if (!wod) return [];
  // Parse movements — could be JSON string from DB or array from seed
  let movements = wod.movements;
  if (typeof movements === 'string') {
    try { movements = JSON.parse(movements); } catch { movements = [movements]; }
  }
  if (!Array.isArray(movements) || movements.length === 0) {
    console.warn(`[WOD] ${wod.name} has no parseable movements:`, wod.movements);
    return [{ id: 'burpees', sets: '1x10', reps: '10', weight: 'BW', notes: `${wod.name} — movements not found` }];
  }

  // Extract rounds from scheme
  const scheme = (wod.scheme || '').toLowerCase();
  let rounds = '';
  const roundMatch = scheme.match(/(\d+)\s*round/i);
  if (roundMatch) rounds = `${roundMatch[1]} rounds`;
  else if (/amrap/i.test(scheme)) rounds = scheme.toUpperCase();
  else if (/^\d+[-\/]/.test(scheme)) rounds = scheme; // "21-15-9"

  const exercises = [];
  const usedIds = new Set();
  for (let i = 0; i < movements.length; i++) {
    const movement = movements[i];
    const parsed = parseWodMovement(movement, wod.scheme, i);
    const exerciseId = fuzzyMatchWodMovement(parsed.name);
    // Skip duplicate exercise IDs in the same WOD
    if (usedIds.has(exerciseId)) {
      // skipping duplicate — silent
      continue;
    }
    usedIds.add(exerciseId);
    // Individual WOD movement parsing — silent (use [PlanV5] WOD assigned log for tracking)
    let weight = parsed.weight || wod.rxWeight;
    // If no weight specified but it's a barbell exercise, estimate from working weights
    if (!weight || weight === 'BW') {
      const isBarbell = /clean|jerk|snatch|deadlift|squat|press|thruster/i.test(exerciseId);
      if (isBarbell && workingWeights) {
        const ww = workingWeights.squat || workingWeights.deadlift || workingWeights.bench;
        if (ww) {
          const wodWeight = Math.round(parseFloat(ww) * 0.55 / 5) * 5; // 55% for conditioning
          weight = `${wodWeight} lb`;
        } else {
          weight = 'BW';
        }
      } else {
        weight = 'BW';
      }
    }
    // Strip non-weight parentheticals like "(max reps)", "(each arm)", "(alternating)"
    if (weight && !/\d/.test(weight)) weight = 'BW';
    weight = scaleWodWeight(weight, exerciseId, equipmentDetails, workingWeights, experience);
    let reps = parsed.reps;
    if (/^\d+\s*m$/i.test(reps) && !/run|row|bike|ski|sprint/i.test(exerciseId)) {
      reps = `${Math.max(5, Math.round(parseInt(reps) / 10))}`;
    }
    // WOD format: no "1x" prefix — just reps. Rounds shown in block header.
    exercises.push({
      id: exerciseId, sets: reps, reps, weight,
      notes: i === 0 ? `${wod.name} \u2014 ${wod.type}${rounds ? ` \u2022 ${rounds}` : ''}${wod.timeCap ? ` (${wod.timeCap})` : ''}` : null,
    });
  }
  return exercises;
}

function parseWodMovement(movement, scheme, index) {
  // Format: "155/105 pound Deadlift, 12 reps" (weight first, reps at end)
  const weightFirstMatch = movement.match(/^(\d+\/?\d*)\s*(?:pound|lb|#)\s+(.+?)(?:,\s*(\d+)\s*reps?)?$/i);
  if (weightFirstMatch) {
    const weight = weightFirstMatch[1] + ' lb';
    const name = weightFirstMatch[2].replace(/,\s*$/, '').trim();
    const reps = weightFirstMatch[3] || '10';
    return { name, reps, weight };
  }

  // Format: "12 Deadlifts (225 lb)"
  const repNameMatch = movement.match(/^(\d+)\s+(.+)$/);
  if (repNameMatch) {
    const name = repNameMatch[2].replace(/\s*\([^)]+\)/, '').trim();
    const weightMatch = movement.match(/\(([^)]+)\)/);
    return { name, reps: repNameMatch[1], weight: weightMatch ? weightMatch[1] : null };
  }

  // Format: "400m Run"
  const distMatch = movement.match(/^(\d+\s*m)\s+(.+)$/i);
  if (distMatch) return { name: distMatch[2].trim(), reps: distMatch[1], weight: null };

  // Format: "Run 800 meters" or "Run 800m" or "Run 6 miles" (name first, distance at end)
  const nameDistMatch = movement.match(/^(.+?)\s+(\d+)\s*(?:meters?|yards?|feet|ft|miles?|m)$/i);
  if (nameDistMatch) {
    const unit = /mile/i.test(movement) ? 'mi' : 'm';
    return { name: nameDistMatch[1].trim(), reps: nameDistMatch[2] + unit, weight: null };
  }

  // Format: "Run 800m" with no space between number and m
  const compactDistMatch = movement.match(/^(.+?)\s+(\d+)(m|mi|km)\b/i);
  if (compactDistMatch) return { name: compactDistMatch[1].trim(), reps: compactDistMatch[2] + compactDistMatch[3], weight: null };

  // Fallback: exercise name only, reps from scheme
  const nameOnly = movement.replace(/\s*\([^)]+\)/, '').replace(/\s*\d+\/\d+#?\s*$/, '').trim();
  const weightMatch = movement.match(/(\d+\/\d+)\s*(?:#|lb)/i) || movement.match(/\(([^)]+)\)/);
  const schemeNums = (scheme || '').match(/\d+/g);
  return { name: nameOnly, reps: schemeNums ? schemeNums.join('-') : '10', weight: weightMatch ? weightMatch[1] + ' lb' : null };
}

function fuzzyMatchWodMovement(name) {
  // Normalize: lowercase, hyphens→spaces, & → and, strip non-alpha except spaces
  const n = name.toLowerCase().replace(/[-_]/g, ' ').replace(/&/g, 'and').replace(/[^a-z\s]/g, '').trim();

  // Ordered from most specific to least — first match wins
  const MAP = [
    // Gymnastics
    ['handstand push ups', 'handstand_push_ups'], ['handstand push up', 'handstand_push_ups'],
    ['hspu', 'handstand_push_ups'], // acronym
    ['muscle ups', 'muscle_ups'], ['muscle up', 'muscle_ups'],
    ['pistol squats', 'pistol_squats'], ['pistol squat', 'pistol_squats'],
    ['one legged squat', 'pistol_squats'], ['single leg squat', 'pistol_squats'],
    ['toes to bar', 'toes_to_bar'], ['toes through ring', 'toes_to_bar'],
    ['knees to elbow', 'hanging_knee_raise'], ['knees to chest', 'hanging_knee_raise'],
    ['rope climb', 'rope_climb'], ['rope ascent', 'rope_climb'],
    ['ring dip', 'dips'], ['bar muscle up', 'muscle_ups'],
    ['l pull up', 'pull_ups'], ['chest to bar', 'pull_ups'],
    ['strict pull up', 'pull_ups'], ['weighted pull up', 'pull_ups'],
    ['wall climb', 'wall_climb'],
    // Bodyweight
    ['pull ups', 'pull_ups'], ['pullups', 'pull_ups'], ['pull up', 'pull_ups'],
    ['chin ups', 'chin_ups'],
    ['push ups', 'push_ups'], ['pushups', 'push_ups'], ['push up', 'push_ups'],
    ['air squats', 'air_squats'], ['airsquats', 'air_squats'],
    ['burpees', 'burpees'], ['burpee', 'burpees'],
    ['sit ups', 'sit_ups'], ['situps', 'sit_ups'], ['ghd sit up', 'sit_ups'],
    ['box jumps', 'box_jumps'], ['box jump', 'box_jumps'],
    ['box step', 'step_ups'],
    ['double unders', 'jump_rope'], ['double under', 'jump_rope'], ['triple under', 'jump_rope'],
    ['dips', 'dips'], ['step ups', 'step_ups'],
    ['bear crawl', 'bear_crawl'],
    ['broad jump', 'broad_jump'], ['standing broad', 'broad_jump'],
    ['forward roll', 'burpees'], // closest
    ['walking lunge', 'db_walking_lunges'], ['lunge step', 'db_walking_lunges'], ['lunges', 'db_walking_lunges'],
    ['back extension', 'back_extension'],
    // Barbell — specific before general
    ['clean and jerk', 'clean_and_jerk'], ['cleanand jerk', 'clean_and_jerk'],
    ['hang power snatch', 'snatch'], ['hang power clean', 'hang_clean'],
    ['power clean', 'power_clean'], ['power snatch', 'snatch'],
    ['hang clean', 'hang_clean'], ['squat clean', 'power_clean'],
    ['benchpress', 'bench_press'], ['bench press', 'bench_press'], // no-space variant
    ['shoulder to overhead', 'overhead_press'], ['overhead press', 'overhead_press'],
    ['push press', 'push_press'], ['push jerk', 'push_jerk'],
    ['jerk', 'push_jerk'], // generic jerk after specific
    ['front squat', 'front_squat'], ['back squat', 'back_squat'],
    ['overhead squat', 'front_squat'],
    ['sumo deadlift high pull', 'sumo_deadlift'], ['sumo deadlift', 'sumo_deadlift'],
    ['deadlift', 'deadlift'],
    ['thruster', 'barbell_thrusters'], ['snatch', 'snatch'],
    ['clean', 'power_clean'], // generic clean — after specific cleans
    ['weighted lunge', 'db_walking_lunges'],
    // KB
    ['kb swing', 'kb_swings'], ['kettlebell swing', 'kb_swings'], ['kettle swing', 'kb_swings'],
    ['russian kettle', 'kb_swings'], ['swings', 'kb_swings'],
    ['kb snatch', 'kb_snatch'], ['kettlebell snatch', 'kb_snatch'],
    ['turkish get up', 'turkish_getup'], ['turkish getup', 'turkish_getup'],
    // DB
    ['dumbbell snatch', 'snatch'], ['dumbbell thruster', 'db_thrusters'],
    ['dumbbell walking lunge', 'db_walking_lunges'],
    ['dumbbell waiter walk', 'farmer_walk'],
    // Other
    ['wall ball', 'wall_balls'], ['wallball', 'wall_balls'],
    ['ball slam', 'ball_slams'], ['med ball', 'wall_balls'],
    ['farmer walk', 'farmer_walk'], ['farmer carry', 'farmer_walk'], ['farmers carry', 'farmer_walk'],
    ['sandbag carry', 'sandbag_carry'], ['sandbag over', 'sandbag_carry'],
    ['battle rope', 'battle_ropes'],
    ['hip touch', 'sit_ups'], ['hanging hip', 'sit_ups'],
    ['inverted hang', 'pull_ups'], ['skin the cat', 'pull_ups'],
    ['squats', 'air_squats'], // generic "squats" → air squats
    // Cardio
    ['shuttle sprint', 'easy_run'], ['sprint', 'easy_run'],
    ['mile run', 'easy_run'], ['meter run', 'easy_run'], ['run', 'easy_run'],
    ['swim', 'easy_run'], ['jog', 'easy_run'],
    ['row', 'rowing_machine'], ['bike', 'assault_bike'], ['ski erg', 'rowing_machine'],
  ];

  for (const [key, id] of MAP) { if (n.includes(key)) return id; }

  // If nothing matched, log it and return burpees as last resort
  console.warn(`[WOD] Unmatched movement: "${name}" → defaulting to burpees`);
  return 'burpees';
}

function scaleWodWeight(weight, exerciseId, equipmentDetails, workingWeights, experience) {
  if (!weight || weight === 'BW' || !equipmentDetails) return weight;
  const match = weight.match(/(\d+)(?:\/(\d+))?\s*(?:lb|lbs|#)?/i);
  if (!match) return weight;
  const rxWeight = parseInt(match[1]);
  if (!rxWeight) return weight;

  const isBarbell = /deadlift|squat|clean|snatch|jerk|press|thruster/i.test(exerciseId);
  const isKB = /kb|swing|kettlebell/i.test(exerciseId) || /kb|pood/i.test(weight.toLowerCase());
  const isDB = /dumbbell|db/i.test(exerciseId);

  if (isBarbell) {
    const max = equipmentDetails.barbell?.maxWeight ? parseFloat(equipmentDetails.barbell.maxWeight) : null;
    let scaled = rxWeight;

    if (workingWeights) {
      // Scale based on user's actual working weight for this pattern
      const ww = /deadlift/i.test(exerciseId) ? workingWeights.deadlift
        : /squat|thruster/i.test(exerciseId) ? workingWeights.squat
        : /clean|snatch|jerk/i.test(exerciseId) ? workingWeights.squat
        : /press/i.test(exerciseId) ? workingWeights.overhead_press
        : null;
      if (ww) {
        const userMax = parseFloat(ww) * 1.3;
        const wodTarget = Math.round(userMax * 0.55 / 5) * 5; // 55% of 1RM for conditioning
        scaled = Math.min(rxWeight, wodTarget);
      } else {
        // Has some working weights but not for this pattern — use experience fallback
        const EXP_SCALE = { beginner: 0.50, intermediate: 0.65, advanced: 0.85, elite: 1.0 };
        scaled = Math.round(rxWeight * (EXP_SCALE[experience] || 0.65) / 5) * 5;
      }
    } else {
      // No working weights at all — scale by experience level
      const EXP_SCALE = { beginner: 0.50, intermediate: 0.65, advanced: 0.85, elite: 1.0 };
      scaled = Math.round(rxWeight * (EXP_SCALE[experience] || 0.65) / 5) * 5;
    }

    if (max && scaled > max) scaled = Math.round(max / 5) * 5;
    if (scaled < 45) scaled = 45; // barbell minimum is empty bar
    const isScaled = scaled !== rxWeight;
    return `${scaled} lb${isScaled ? ' (scaled)' : ' (Rx)'}`;
  }

  if (isKB && equipmentDetails.kettlebell?.weights) {
    const kbWeights = equipmentDetails.kettlebell.weights.split(',').map(w => parseFloat(w.trim())).filter(w => w > 0).sort((a, b) => b - a);
    if (kbWeights.length > 0) {
      const available = kbWeights.filter(w => w <= rxWeight);
      const bestKB = available.length > 0 ? available[0] : kbWeights[kbWeights.length - 1];
      return bestKB === rxWeight ? `${bestKB} lb KB (Rx)` : `${bestKB} lb KB (scaled)`;
    }
  }

  if (isDB && equipmentDetails.dumbbells?.maxWeight) {
    const dbMax = parseFloat(equipmentDetails.dumbbells.maxWeight);
    if (rxWeight > dbMax) return `${Math.round(dbMax / 5) * 5} lb (scaled)`;
    return `${rxWeight} lb (Rx)`;
  }

  return `${rxWeight} lb`;
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
    case 'INTERVALS': {
      const perRound = Math.round((scaledDist / runParams.intervals) * 4) / 4; // nearest 0.25 mi
      exercises.push({ id: 'interval_run', sets: `${runParams.intervals} rounds`, reps: `~${perRound} mi each`, weight: '80-85% effort', rest: '90s walk between', notes: `Total: ${distance}` });
      break;
    }
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
