// AI Plan Generator — 3-phase periodized plans via Claude Haiku

import Constants from 'expo-constants';
import { calculatePhases, getPhaseForWeek } from './phaseCalculator';
import { getMesocyclePhase, STIMULUS_TYPES } from './progressionRules';
import { getDatabase, savePlanDay, savePlanBlock, savePlanExercise, getExercisesByFilter, getWodsFromDb } from '../data/database';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

function getApiKey() {
  return Constants.expoConfig?.extra?.claudeApiKey
    || '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';
}

// ═══════════════════════════════════════════════════════════════
// System prompt — kept minimal for token efficiency
// Sent with every API call, so every word costs 3x
// ═══════════════════════════════════════════════════════════════

const SYS = `Elite S&C coach. Design ONE phase template as valid JSON.

RULES: compound-first sequencing (power→compound→accessory→core→conditioning). Push/pull 1:1 ratio. Use only exercises from AVAILABLE list. Respect equipment/exclusions. No redundant exercises per session.

PHASES set rep schemes: accumulation=4x10,3x12 RPE6-7; intensification=4x8,5x5 RPE7-8; realization=5x3,3x3 RPE8-9. Different accessories+WODs per phase.

VOLUME BY TIME: 30min=3-4 supersets only; 45min=warmup+2-3 compounds+1-2 accessories+short WOD; 60min=warmup+3-4 compounds+2-3 accessories+WOD+cooldown; 90min=full+core+carries; 120min=everything+skill.

Sessions 60+ min: end with COOLDOWN block (4-5 stretches, 6-8 min — hip flexors, shoulders, thoracic, hamstrings, glutes). Olympic/run days need longer cooldowns. Core variety: anti-extension/anti-rotation/carries/hip flexion.

WEIGHTS: Set ACCUMULATION weights only at RPE 6-7. App handles ALL progression — do NOT increase weights between phases yourself. Use the SAME base weight for an exercise across all 3 phases. If working weights given, use as baseline. Else: beginner=50-60% of max equip, intermediate=65-75%, advanced=75-85%. Max equip is CEILING. For Olympic lifts, offer power/hang alternatives for beginners/intermediate.

BMI>30: limit running, low-impact cardio. Run blocks: isRun=true, type=EASY/TEMPO/INTERVALS/FARTLEK/LONG_RUN/RACE_PACE. Run distances in "X mi" format. RUNNING PROGRESSION: If the user has a race goal or mentions a distance in notes, build toward that distance. Accumulation long run=40-50% of target distance, intensification=60-75%, realization=80-90%, race prep=taper to 50%. Example: half marathon(13.1mi) → accum long run 5-6mi, build 8-10mi, peak 10-12mi, taper 6mi. 5K(3.1mi) → accum 1.5mi, build 2-2.5mi, peak 2.5-3mi. If no race distance mentioned, scale runs to general fitness.

WODs: use REAL named WODs from WODS list. Each movement=separate exercise entry with clear sets/reps. No stretches/isolation in WODs. EMOMs: 1 exercise per minute. Format clearly: "5 Pull-Ups" not "Pull-Ups 3xx3 rounds".

RPE notes on main compounds. JSON only, no text outside.

FORMAT: {"planName":"...","weeklyTemplate":[{"dayIndex":0,"title":"...","focus":"...","blocks":[{"name":"...","type":"...","duration":"...","exercises":[{"name":"...","sets":"4","reps":"10","weight":"95 lb","rest":"90s","notes":"RPE 7"}]}]}],"restDayAdvice":"...","programNotes":"..."}`;

// ═══════════════════════════════════════════════════════════════
// Main generator — 3 sequential API calls, one per phase
// ═══════════════════════════════════════════════════════════════

export async function generateAIPlan(userProfile, onStatus) {
  const apiKey = getApiKey();
  if (onStatus) onStatus('Analyzing your goals and equipment...');

  const exercisePool = await loadExercisePool(userProfile);
  // Load WODs from DB, filtered by user experience
  let wodList = [];
  try {
    wodList = await getWodsFromDb({ difficulty: userProfile.experience });
    wodList = wodList.slice(0, 20); // Cap to save tokens
  } catch {}

  const basePrompt = buildPrompt(userProfile, exercisePool, wodList);

  const phases = ['accumulation', 'intensification', 'realization'];
  const phaseDesc = {
    accumulation: '4x10, 3x12, RPE 6-7, longer WODs (12-20 min AMRAPs/chippers)',
    intensification: '4x8, 5x5, RPE 7-8, moderate WODs (8-12 min). DIFFERENT accessories than accumulation.',
    realization: '5x3, 3x3, RPE 8-9, short WODs (<8 min). DIFFERENT accessories than previous phases.',
  };

  const phaseTemplates = {};
  let planName = 'Custom Program', programNotes = '', restDayAdvice = 'Light walking, foam rolling, mobility';
  const usedExercises = [];

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    if (onStatus) onStatus(`Designing ${phase} phase...`);
    if (i > 0) await sleep(1500);

    const avoidList = usedExercises.length > 0
      ? `\nAVOID these (used in prior phases): ${usedExercises.slice(-30).join(', ')}`
      : '';

    const prompt = `${basePrompt}\n\nDesign the ${phase.toUpperCase()} phase: ${phaseDesc[phase]}${avoidList}\nJSON only:`;

    try {
      let result;
      try { result = await callAPI(apiKey, prompt); }
      catch (e) {
        if (e.message?.includes('Network') || e.name === 'AbortError') {
          await sleep(3000);
          result = await callAPI(apiKey, prompt);
        } else throw e;
      }

      phaseTemplates[phase] = { weeklyTemplate: result.weeklyTemplate || [] };
      if (i === 0) {
        planName = result.planName || planName;
        programNotes = result.programNotes || '';
        restDayAdvice = result.restDayAdvice || restDayAdvice;
      }
      for (const day of (result.weeklyTemplate || []))
        for (const block of (day.blocks || []))
          for (const ex of (block.exercises || []))
            if (ex.name) usedExercises.push(ex.name);
    } catch (e) {
      console.error(`[AI Plan] ${phase} failed:`, e.message);
      phaseTemplates[phase] = phaseTemplates[phases[i - 1]] || { weeklyTemplate: [] };
    }
  }

  // Normalize weights: use accumulation as baseline for all phases
  // This prevents Claude from setting different base weights per phase
  normalizePhaseWeights(phaseTemplates);

  if (onStatus) onStatus('Matching exercises to database...');
  return await savePlanToDb({ planName, programNotes, restDayAdvice, phases: phaseTemplates }, userProfile, onStatus, exercisePool);
}

// ═══════════════════════════════════════════════════════════════
// Build user prompt — kept compact
// ═══════════════════════════════════════════════════════════════

function buildPrompt(profile, pool, wodList) {
  const p = [];
  p.push(`GOALS: ${(profile.goals || [profile.goal]).join(', ')}`);
  if (profile.sex) p.push(`SEX: ${profile.sex}`);
  if (profile.height) p.push(`HT: ${profile.height}`);
  if (profile.weight) p.push(`WT: ${profile.weight} lb`);
  if (profile.bmi) p.push(`BMI: ${profile.bmi}`);
  p.push(`EXP: ${profile.experience}`);

  if (profile.workingWeights && Object.keys(profile.workingWeights).length > 0) {
    const ww = profile.workingWeights;
    const w = [];
    if (ww.bench) w.push(`Bench:${ww.bench}`);
    if (ww.squat) w.push(`Squat:${ww.squat}`);
    if (ww.deadlift) w.push(`DL:${ww.deadlift}`);
    if (ww.overhead_press) w.push(`OHP:${ww.overhead_press}`);
    if (ww.row) w.push(`Row:${ww.row}`);
    p.push(`WORKING WEIGHTS (8-10 rep max): ${w.join(', ')}`);
  }

  p.push(`DAYS/WK: ${profile.trainingDaysPerWeek}, TIME: ${profile.sessionDuration || 60}min`);
  p.push(`STYLES: ${(profile.workoutStyles || [profile.workoutStyle]).join(', ')}`);
  if (profile.bodyCompGoals?.length) p.push(`BODY COMP: ${profile.bodyCompGoals.join(', ')}`);

  if (profile.equipment?.length) {
    p.push(`EQUIP: ${profile.equipment.join(', ')}`);
    const d = profile.equipmentDetails || {};
    if (d.barbell?.maxWeight) p.push(`  Bar max:${d.barbell.maxWeight}lb`);
    if (d.kettlebell?.weights) p.push(`  KBs:${d.kettlebell.weights}lb`);
    if (d.dumbbells?.maxWeight) p.push(`  DBs: up to ${d.dumbbells.maxWeight}lb/hand`);
  }

  if (profile.exclusions?.length) p.push(`EXCLUDE: ${profile.exclusions.join(', ')}`);

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  if (profile.trainingDays) p.push(`DAYS: ${profile.trainingDays.map(d => dayNames[d]).join(', ')}`);

  // Notes
  let baseNotes = '', adjustments = '';
  if (profile.additionalNotes) {
    const full = profile.additionalNotes.substring(0, 400);
    const idx = full.indexOf('ADJUSTMENTS:');
    if (idx >= 0) {
      baseNotes = full.substring(0, idx).trim();
      adjustments = full.substring(idx).replace('ADJUSTMENTS:', '').trim();
    } else baseNotes = full;
    if (baseNotes) p.push(`NOTES: ${baseNotes}`);
  }

  // Exercise names — send seed names only (compact), not 1400 API exercises
  if (pool?.all.length > 0) {
    const seeds = pool.all.filter(e => e.source === 'seed' || !e.source).map(e => e.name);
    p.push(`\nEXERCISES: ${seeds.join(', ')}`);
  }

  // WODs from DB — include movements so Claude programs them correctly
  if (wodList) {
    p.push(`\nWODS (use these exact WODs for conditioning blocks — include all listed movements as separate exercises):`);
    for (const w of wodList) {
      p.push(`  ${w.name}(${w.type},${w.estimated_time}): ${w.movements.join(', ')}`);
    }
  }

  // Mandatory adjustments LAST
  if (adjustments) p.push(`\n=== MANDATORY CHANGES ===\n${adjustments}\n===`);

  return p.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// API call
// ═══════════════════════════════════════════════════════════════

async function callAPI(apiKey, prompt) {
  console.log(`[AI Plan] Prompt: ${prompt.length} chars`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 6000, system: SYS, messages: [{ role: 'user', content: prompt }] }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    let text = data.content?.[0]?.text || '';
    const u = data.usage || {};
    console.log(`[AI Plan] Tokens in:${u.input_tokens||'?'} out:${u.output_tokens||'?'}`);
    text = text.trim();
    if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    return JSON.parse(text);
  } catch (e) { clearTimeout(timer); throw e; }
}

// ═══════════════════════════════════════════════════════════════
// Save plan to DB with week-over-week variation
// ═══════════════════════════════════════════════════════════════

// Normalize weights across phases — accumulation is the baseline
// If Claude set different weights per phase, override later phases with accumulation weights
function normalizePhaseWeights(phases) {
  const accum = phases.accumulation?.weeklyTemplate;
  if (!accum) return;

  // Build a map of exercise name → accumulation weight
  const baseWeights = {};
  for (const day of accum) {
    for (const block of (day.blocks || [])) {
      for (const ex of (block.exercises || [])) {
        const name = (ex.name || '').toLowerCase().trim();
        const w = parseFloat(ex.weight);
        if (name && !isNaN(w) && w > 0) baseWeights[name] = ex.weight;
      }
    }
  }

  // Override later phases with accumulation weights
  for (const phaseKey of ['intensification', 'realization']) {
    const template = phases[phaseKey]?.weeklyTemplate;
    if (!template) continue;
    for (const day of template) {
      for (const block of (day.blocks || [])) {
        for (const ex of (block.exercises || [])) {
          const name = (ex.name || '').toLowerCase().trim();
          if (baseWeights[name]) ex.weight = baseWeights[name];
        }
      }
    }
  }
}

async function savePlanToDb(aiPlan, userProfile, onStatus, exercisePool) {
  const planId = genUUID();
  const startDate = getNextMonday();
  const eventDate = userProfile.eventDate || addWeeks(startDate, 16);
  const phaseData = calculatePhases(startDate, eventDate);
  const { totalWeeks, phases } = phaseData;
  const trainingDays = userProfile.trainingDays || [0, 1, 2, 3, 4];
  const pt = aiPlan.phases || { accumulation: { weeklyTemplate: [] } };

  if (onStatus) onStatus('Building your multi-week plan...');

  for (let week = 1; week <= totalWeeks; week++) {
    const phase = getPhaseForWeek(phases, week);
    if (!phase) continue;

    const weekStart = addDays(startDate, (week - 1) * 7);
    const meso = getMesocyclePhase(week);
    const stimulus = STIMULUS_TYPES[meso.defaultStimulus];

    // Phase selection: last 3 weeks = race_prep taper
    const weeksFromEnd = totalWeeks - week;
    let phaseKey, weekInBlock, isDeload;
    if (weeksFromEnd < 3 && totalWeeks > 12) {
      phaseKey = 'race_prep';
      weekInBlock = 3 - weeksFromEnd;
      isDeload = false;
    } else {
      const cw = ((week - 1) % 12) + 1;
      phaseKey = cw <= 4 ? 'accumulation' : cw <= 8 ? 'intensification' : 'realization';
      weekInBlock = ((cw - 1) % 4) + 1;
      isDeload = weekInBlock === 4;
    }

    const template = pt[phaseKey]?.weeklyTemplate || pt.realization?.weeklyTemplate || pt.accumulation?.weeklyTemplate || [];

    for (let dow = 0; dow < 7; dow++) {
      const date = addDays(weekStart, dow);
      const tdi = trainingDays.indexOf(dow);

      if (tdi === -1) {
        await savePlanDay({ planId, date, dayOfWeek: dow, weekNumber: week, phase: phase.phase, title: 'REST DAY', focus: aiPlan.restDayAdvice || 'Recovery', color: '#333', emoji: '', isRestDay: true });
        continue;
      }

      const dt = template[tdi % template.length];
      if (!dt) continue;

      const dayId = await savePlanDay({
        planId, date, dayOfWeek: dow, weekNumber: week, phase: phase.phase,
        title: dt.title || 'TRAINING', focus: `${meso.label} • ${stimulus.label} • Wk ${week}`,
        color: phase.color, emoji: '', isRestDay: false,
      });

      for (let bi = 0; bi < (dt.blocks || []).length; bi++) {
        const block = dt.blocks[bi];
        const RUN_TYPES = ['EASY', 'TEMPO', 'INTERVALS', 'FARTLEK', 'LONG_RUN', 'RACE_PACE'];
        const btu = (block.type || '').toUpperCase();
        const isRun = block.isRun || block.name?.toUpperCase() === 'RUN' || RUN_TYPES.includes(btu);
        const blockType = isRun ? (RUN_TYPES.includes(btu) ? btu : 'INTERVALS') : block.type;
        const isWod = blockType === 'WOD' || btu === 'AMRAP' || btu === 'EMOM' || btu === 'FOR TIME';

        const blockId = await savePlanBlock({
          planDayId: dayId, sortOrder: bi, name: block.name, type: blockType,
          timeCap: block.duration, isAmrap: false, hasGps: isRun,
        });

        for (let ei = 0; ei < (block.exercises || []).length; ei++) {
          const aiEx = block.exercises[ei];
          const matchedId = fuzzyMatch(aiEx.name, exercisePool);
          const matched = exercisePool.all.find(e => e.id === matchedId);
          const cat = matched?.category || null;

          let sets, reps, weight, rest, notes;
          if (isWod) {
            sets = aiEx.sets || '1'; reps = aiEx.reps || ''; weight = aiEx.weight || 'BW';
            rest = aiEx.rest || null; notes = aiEx.notes || null;
          } else {
            ({ sets, reps, weight, rest, notes } = applyVariation(aiEx, weekInBlock, isDeload, phaseKey, cat, userProfile, week));
          }

          if (isRun && weight) weight = scaleRunDist(weight, notes, week, totalWeeks, phaseKey, userProfile);

          await savePlanExercise({
            planBlockId: blockId, exerciseId: matchedId, sortOrder: ei,
            sets: `${sets}x${reps}`, reps: reps || '', weight: weight || 'BW', rest, notes,
          });
        }
      }
    }
    if (onStatus && week % 4 === 0) onStatus(`Week ${week}/${totalWeeks}...`);
  }

  return { planId, totalWeeks, phases, startDate, eventDate, planName: aiPlan.planName, programNotes: aiPlan.programNotes };
}

// ═══════════════════════════════════════════════════════════════
// Week-over-week variation
// ═══════════════════════════════════════════════════════════════

function applyVariation(aiEx, weekInBlock, isDeload, phaseKey, category, profile) {
  let sets = parseInt(aiEx.sets) || 3;
  let reps = aiEx.reps || '8';
  let weight = aiEx.weight || 'BW';
  let rest = aiEx.rest || null;
  let notes = aiEx.notes || null;
  const name = (aiEx.name || '').toLowerCase();

  // Skip warmup/cooldown/stretching entirely
  if (/stretch|foam|mobil|warm|cool|circle|activ|band pull|dead hang|pose|roller/i.test(name)) {
    return { sets: `${sets}`, reps, weight, rest: null, notes };
  }
  // Skip cardio
  if (/\brun\b|jog|sprint|\brow\b|bike/i.test(name)) {
    return { sets: `${sets}`, reps, weight, rest, notes };
  }

  const bw = parseFloat(weight);
  const hasW = !isNaN(bw) && bw > 0;
  const nr = parseInt(reps);
  const hasR = !isNaN(nr);

  const gp = getGoalProfile(profile.goals || [profile.goal]);
  const pm = gp.phaseWeightMult[phaseKey] || 1.0;

  const WAVE = {
    accumulation: { 1: [0, 0, 1.0], 2: [0, 2, 0.97], 3: [1, 0, 1.05] },
    intensification: { 1: [0, 0, 1.0], 2: [0, -2, 1.07], 3: [1, -2, 1.12] },
    realization: { 1: [0, 0, 1.0], 2: [0, -1, 1.08], 3: [0, -2, 1.15] },
    race_prep: { 1: [-1, 0, 1.0], 2: [-1, -2, 0.95], 3: [-1, -2, 0.90] },
  };

  if (isDeload) {
    sets = Math.max(2, sets - 1);
    if (hasR) reps = `${Math.max(3, nr - 2)}`;
    if (hasW) weight = `${r5(bw * pm * 0.7)} lb`;
    rest = '90s';
    notes = notes ? `${notes} | DELOAD` : 'DELOAD';
  } else {
    const [sa, ra, wm] = WAVE[phaseKey]?.[weekInBlock] || [0, 0, 1.0];
    sets = Math.max(2, sets + sa);
    if (hasR) reps = `${Math.max(2, nr + ra)}`;
    if (hasW) weight = `${r5(bw * pm * wm)} lb`;
    const REST = { accumulation: '60s', intensification: '90s', realization: '120s', race_prep: '60s' };
    if (!rest) rest = REST[phaseKey] || '60s';
  }

  weight = capWeight(weight, category, profile);

  // Beginner safety: cap to experience % of max on accumulation wk1
  if (hasW && phaseKey === 'accumulation' && weekInBlock === 1) {
    const cur = parseFloat(weight);
    if (!isNaN(cur) && cur > 0) {
      const ceil = { beginner: 0.55, intermediate: 0.75, advanced: 0.85, elite: 0.95 }[profile.experience] || 0.75;
      const det = profile.equipmentDetails || {};
      let maxE = null;
      if (category === 'dumbbell' && det.dumbbells?.maxWeight) maxE = parseFloat(det.dumbbells.maxWeight);
      if (category === 'barbell' && det.barbell?.maxWeight) maxE = parseFloat(det.barbell.maxWeight);
      if (maxE && cur > maxE * ceil) weight = `${r5(maxE * ceil)} lb`;
    }
  }

  return { sets: `${sets}`, reps, weight, rest, notes };
}

// ═══════════════════════════════════════════════════════════════
// Goal-aware profiles
// ═══════════════════════════════════════════════════════════════

function getGoalProfile(goals) {
  const g = Array.isArray(goals) ? goals : [goals];
  const isEnd = g.some(x => ['endurance', 'athletic'].includes(x));
  const isStr = g.some(x => ['build_muscle', 'get_stronger'].includes(x));
  const isFat = g.some(x => x === 'lose_fat');

  if (isEnd && !isStr) return {
    phaseWeightMult: { accumulation: 1.0, intensification: 1.08, realization: 1.12, race_prep: 0.85 },
  };
  if (isStr && !isEnd) return {
    phaseWeightMult: { accumulation: 1.0, intensification: 1.18, realization: 1.30, race_prep: 0.90 },
  };
  if (isFat) return {
    phaseWeightMult: { accumulation: 1.0, intensification: 1.10, realization: 1.15, race_prep: 0.90 },
  };
  return {
    phaseWeightMult: { accumulation: 1.0, intensification: 1.15, realization: 1.25, race_prep: 0.85 },
  };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function scaleRunDist(weight, notes, week, totalWeeks, phaseKey, profile) {
  const m = `${weight} ${notes || ''}`.match(/([\d.]+)\s*mi/i);
  if (!m) return weight;
  const baseDist = parseFloat(m[1]);
  if (!baseDist) return weight;

  const targetDist = getTargetRaceDistance(profile);
  const progress = Math.min(1, (week - 1) / Math.max(1, totalWeeks - 4));

  if (!targetDist) {
    // No race goal — gentle progression
    const gentle = { accumulation: 1.0, intensification: 1.1, realization: 1.2, race_prep: 0.9 };
    const mult = (gentle[phaseKey] || 1.0) + progress * 0.1;
    return weight.replace(m[0], `${Math.round(baseDist * mult * 10) / 10} mi`);
  }

  // Build toward target distance by phase
  const phasePct = { accumulation: 0.45, intensification: 0.68, realization: 0.85, race_prep: 0.50 };
  const pct = phasePct[phaseKey] || 0.5;
  const phaseDist = targetDist * (pct - 0.1 + progress * 0.1);
  const finalDist = Math.max(baseDist, Math.round(phaseDist * 10) / 10);
  return weight.replace(m[0], `${finalDist} mi`);
}

// Parse target race distance from goals and notes
function getTargetRaceDistance(profile) {
  if (!profile) return null;
  const all = `${(profile.additionalNotes || '')} ${(profile.goals || []).join(' ')}`.toLowerCase();

  if (all.includes('marathon') && !all.includes('half')) return 26.2;
  if (all.includes('half marathon') || all.includes('half-marathon')) return 13.1;
  if (all.includes('50k') || all.includes('ultra')) return 31.0;
  if (all.includes('spartan beast') || all.includes('21k')) return 13.1;
  if (all.includes('10k') || all.includes('10 k') || all.includes('spartan super')) return 6.2;
  if (all.includes('spartan sprint') || all.includes('5k') || all.includes('5 k')) return 3.1;
  if (all.includes('10 mi') || all.includes('10-mile')) return 10.0;

  const distMatch = all.match(/(\d+(?:\.\d+)?)\s*(?:mile|mi)\s*(?:race|run|goal)/i);
  if (distMatch) return parseFloat(distMatch[1]);

  if (all.includes('endurance') || all.includes('athletic')) return 6.2;
  return null;
}

function capWeight(weight, category, profile) {
  if (!weight || weight === 'BW') return weight;
  const n = parseFloat(weight);
  if (isNaN(n) || n <= 0 || !category) return weight;
  const d = profile.equipmentDetails || {};
  const limits = {
    dumbbell: d.dumbbells?.maxWeight ? parseFloat(d.dumbbells.maxWeight) : null,
    barbell: d.barbell?.maxWeight ? parseFloat(d.barbell.maxWeight) : null,
    kettlebell: d.kettlebell?.weights ? Math.max(...d.kettlebell.weights.split(',').map(w => parseFloat(w.trim())).filter(w => w > 0), 0) : null,
  };
  const max = limits[category];
  if (max && n > max) return `${r5(max)} lb`;
  return weight;
}

function r5(n) { return Math.round(n / 5) * 5; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fuzzyMatch(name, pool) {
  if (!name) return 'air_squats';
  const q = name.toLowerCase().trim();
  const exact = pool.all.find(e => e.name.toLowerCase() === q);
  if (exact) return exact.id;
  const contains = pool.all.find(e => e.name.toLowerCase().includes(q) || q.includes(e.name.toLowerCase()));
  if (contains) return contains.id;

  const SKIP = new Set(['barbell', 'dumbbell', 'cable', 'machine', 'band', 'seated', 'standing', 'weighted', 'single', 'double', 'arm', 'leg', 'with', 'the', 'and', 'for']);
  const qw = q.split(/\s+/).filter(w => w.length >= 2);
  let best = 0, match = null;
  for (const ex of pool.all) {
    const ew = ex.name.toLowerCase().split(/\s+/);
    let s = 0, mm = 0, tm = 0;
    for (const w of qw) {
      const gen = SKIP.has(w);
      const hit = ew.some(e => e === w || (e.length > 3 && w.length > 3 && (e.startsWith(w) || w.startsWith(e))));
      if (hit) { s += gen ? 0.5 : 3; if (!gen) mm++; }
      if (!gen) tm++;
    }
    if (tm > 0) s += (mm / tm) * 5;
    s -= Math.abs(ew.length - qw.length) * 0.3;
    if (s > best) { best = s; match = ex; }
  }
  if (match && best >= 3) return match.id;
  const idGuess = q.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  const idMatch = pool.all.find(e => e.id === idGuess);
  if (idMatch) return idMatch.id;
  const seeds = pool.all.filter(e => e.source === 'seed' || !e.source);
  return (seeds[Math.floor(Math.random() * seeds.length)] || pool.all[0])?.id || 'air_squats';
}

async function loadExercisePool(userProfile) {
  const styles = [...new Set([...(userProfile.workoutStyles || [userProfile.workoutStyle || 'hybrid']), 'hybrid', 'traditional'])];
  const map = new Map();
  for (const style of styles) {
    const exs = await getExercisesByFilter({ style, exclusions: userProfile.exclusions || [], equipment: userProfile.equipment || [], difficulty: null });
    for (const ex of exs) map.set(ex.id, ex);
  }
  const all = Array.from(map.values());
  console.log(`[AI Plan] Pool: ${all.length} ex. Barbell:${all.filter(e => e.category === 'barbell').length} DB:${all.filter(e => e.category === 'dumbbell').length} Bench:${all.find(e => e.id === 'bench_press') ? 'YES' : 'NO'}`);
  return { all };
}

function genUUID() { return 'xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)); }
function addDays(d, n) { const dt = new Date(d + 'T12:00:00Z'); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().split('T')[0]; }
function addWeeks(d, w) { return addDays(d, w * 7); }
function getNextMonday() {
  const n = new Date(), d = n.getDay(), dm = d === 0 ? 1 : d === 1 ? 0 : 8 - d;
  n.setDate(n.getDate() + dm);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
