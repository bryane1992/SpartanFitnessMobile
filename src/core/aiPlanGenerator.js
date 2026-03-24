// AI Plan Generator
// Uses Claude to design a personalized workout plan based on user profile
// Then saves it using the existing DB infrastructure

import Constants from 'expo-constants';
import { calculatePhases, getPhaseForWeek } from './phaseCalculator';
import { getMesocyclePhase, STIMULUS_TYPES } from './progressionRules';
import { getDatabase, savePlanDay, savePlanBlock, savePlanExercise, getExercisesByFilter } from '../data/database';
import { getWods } from '../data/wodSeed';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

function getApiKey() {
  return Constants.expoConfig?.extra?.claudeApiKey
    || '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';
}

const PLAN_SYSTEM_PROMPT = `You are an elite S&C coach designing a periodized program.

You must design THREE phase templates (not one). Each phase has different exercises, rep schemes, and conditioning.

RULES:
- Design for the user's specific equipment, goals, time, injuries, experience, and body metrics
- Follow exercise sequencing: power → compound → accessory → core → conditioning
- Never program exercises the user can't do with their equipment
- Respect exclusions completely
- Prioritize EFFICIENCY: compound lifts first, isolation only for gaps
- No redundant exercises in the same session (e.g. bench press + DB bench)
- PUSH/PULL BALANCE: every push day needs equal pulling volume. Count horizontal push (bench) vs horizontal pull (row), vertical push (OHP) vs vertical pull (pull-up). Ratio must be close to 1:1.
- WEIGHT RULES: DB weights never exceed user's max DB per hand. Barbell never exceeds user's barbell max.
- BODY METRICS: BMI > 30: limit running to walks/jogs, low-impact cardio. BMI 25-30: gradual cardio buildup.
- Spartan/OCR goals: include 1-2 run days + obstacle training
- Run blocks: set "isRun": true, type must be EASY/TEMPO/INTERVALS/FARTLEK/LONG_RUN/RACE_PACE

PHASE DESIGN:
- ACCUMULATION (weeks 1-4): Higher volume, moderate intensity. 4x10, 3x12, 3x15. RPE 6-7. Longer rest (90-120s). Build work capacity.
- INTENSIFICATION (weeks 5-8): Moderate volume, higher intensity. 4x8, 5x5, 3x6. RPE 7-8. Moderate rest (60-90s). Different accessories than accumulation.
- REALIZATION (weeks 9-12): Low volume, high intensity. 5x3, 4x5, 3x3. RPE 8-9. Long rest (2-3 min). Peak compounds, minimal accessories.
- Each phase MUST have different exercises for accessories and conditioning. Main lifts can stay but rep scheme must change.

CONDITIONING EVOLUTION:
- Each phase must have DIFFERENT WODs/conditioning. Do NOT repeat the same WOD across phases.
- Accumulation: longer, aerobic WODs (12-20 min AMRAPs, chippers)
- Intensification: moderate WODs (8-12 min, heavier weights)
- Realization: short, intense WODs (< 8 min, sprint efforts)

VOLUME BY SESSION DURATION:
- 30 min: 1 block of 3-4 supersets, no warmup, short WOD or skip
- 45 min: brief warmup, 2-3 compounds, 1-2 accessories, short WOD
- 60 min: warmup, 3-4 compounds, 2-3 accessories, WOD, cooldown
- 90 min: warmup, 3-4 compounds, 3-4 accessories, full WOD, core, cooldown
- 120 min: everything + skill work, extra volume

EVERY TRAINING DAY (60+ min) must end with:
- COOLDOWN block: 3-4 mobility/stretching moves (hip flexor stretch, shoulder stretch, thoracic rotation, foam roll)

CORE WORK must include variety: anti-extension (ab wheel, hollow hold), anti-rotation (pallof press, bird dog), loaded carries (farmer walk, suitcase carry), and hip flexion (hanging leg raise, V-ups). Progress core over phases.

WOD EXERCISE SELECTION: Only use exercises appropriate for the WOD format. Sprints use running/rowing/burpees, NOT stretches or dead bugs. AMRAPs use compound movements. EMOMs use movements that can be completed in under 40 seconds. NEVER put static stretches, mobility work, or isolation exercises in a WOD.

WEIGHT CALIBRATION: The weights you set for the accumulation phase are BASELINE. The app will automatically scale them up 15% for intensification and 25% for realization. So set accumulation weights conservatively — they should feel like RPE 6-7 for the prescribed reps.

RPE NOTES: Add "RPE X" in the notes field for main compound lifts.

RESPONSE FORMAT — valid JSON only:
{
  "planName": "Program name",
  "phases": {
    "accumulation": {
      "weeklyTemplate": [
        {
          "dayIndex": 0,
          "title": "LOWER POWER",
          "focus": "Quads, glutes, hamstrings",
          "blocks": [
            {"name": "WARM-UP", "type": "MOVEMENT PREP", "duration": "8 min", "exercises": [...]},
            {"name": "MAIN LIFTS", "type": "COMPOUND", "duration": "25 min", "exercises": [
              {"name": "Back Squat", "sets": "4", "reps": "10", "weight": "95 lb", "rest": "90s", "notes": "RPE 7"}
            ]},
            {"name": "ACCESSORIES", "type": "ISOLATION", "duration": "12 min", "exercises": [...]},
            {"name": "CINDY", "type": "WOD", "duration": "20 min", "exercises": [...]},
            {"name": "COOLDOWN", "type": "MOBILITY", "duration": "5 min", "exercises": [...]}
          ]
        }
      ]
    },
    "intensification": { "weeklyTemplate": [...] },
    "realization": { "weeklyTemplate": [...] }
  },
  "restDayAdvice": "Light walking, foam rolling, mobility",
  "programNotes": "Why you designed it this way"
}

IMPORTANT:
- dayIndex = index into user's training days (0 = first training day)
- Only training days, not rest days
- Use COMMON exercise names from the AVAILABLE EXERCISES list
- Each phase's accessories and WODs must be DIFFERENT from other phases
- WODs must be REAL named WODs from AVAILABLE WODS list
- WOD FORMAT: Each movement in the WOD must be a SEPARATE exercise entry. For EMOMs, each minute is a separate exercise (e.g. {"name": "Air Squats", "sets": "1", "reps": "15", "notes": "Min 1"}, {"name": "Push Ups", "sets": "1", "reps": "12", "notes": "Min 2"}). For AMRAPs, list each movement separately with the round scheme in the block name. NEVER put multiple movements in one exercise entry.
- Do NOT add text outside JSON`;

export async function generateAIPlan(userProfile, onStatus) {
  const apiKey = getApiKey();

  if (onStatus) onStatus('Analyzing your goals and equipment...');

  const exercisePool = await loadExercisePool(userProfile);
  const basePrompt = buildPlanPrompt(userProfile, exercisePool);

  // Generate each phase separately to avoid token truncation
  const phaseNames = ['accumulation', 'intensification', 'realization'];
  const phaseDescriptions = {
    accumulation: 'ACCUMULATION (weeks 1-4): Higher volume, moderate intensity. 4x10, 3x12. RPE 6-7. Pick longer WODs (12-20 min).',
    intensification: 'INTENSIFICATION (weeks 5-8): Moderate volume, higher intensity. 4x8, 5x5. RPE 7-8. Different accessories than accumulation. Moderate WODs (8-12 min).',
    realization: 'REALIZATION (weeks 9-12): Low volume, high intensity. 5x3, 3x3. RPE 8-9. Minimal accessories, peak compounds. Short intense WODs (<8 min).',
  };

  const phaseTemplates = {};
  let planName = 'Custom Program';
  let programNotes = '';
  let restDayAdvice = 'Light walking, foam rolling, mobility';
  const previousPhaseExercises = [];

  for (let i = 0; i < phaseNames.length; i++) {
    const phase = phaseNames[i];
    const statusMessages = ['Designing accumulation phase...', 'Designing intensification phase...', 'Designing realization phase...'];
    if (onStatus) onStatus(statusMessages[i]);

    const phasePrompt = `${basePrompt}\n\nGenerate ONLY the ${phase.toUpperCase()} phase template.\n${phaseDescriptions[phase]}${
      previousPhaseExercises.length > 0 ? `\n\nPREVIOUS PHASES USED THESE EXERCISES (pick DIFFERENT accessories and WODs): ${previousPhaseExercises.join(', ')}` : ''
    }\n\nRespond with JSON: {"planName":"...","weeklyTemplate":[...],"restDayAdvice":"...","programNotes":"..."}`;

    // Small delay between calls to avoid network issues
    if (i > 0) await new Promise(r => setTimeout(r, 1500));

    try {
      // Retry once on network failure
      let result;
      try {
        result = await callClaude(apiKey, phasePrompt);
      } catch (retryErr) {
        if (retryErr.message?.includes('Network') || retryErr.name === 'AbortError') {
          console.log(`[AI Plan] Retrying ${phase} after network error...`);
          await new Promise(r => setTimeout(r, 3000));
          result = await callClaude(apiKey, phasePrompt);
        } else {
          throw retryErr;
        }
      }
      phaseTemplates[phase] = { weeklyTemplate: result.weeklyTemplate || [] };
      if (i === 0) {
        planName = result.planName || planName;
        programNotes = result.programNotes || '';
        restDayAdvice = result.restDayAdvice || restDayAdvice;
      }
      // Track exercises used so next phase picks different ones
      for (const day of (result.weeklyTemplate || [])) {
        for (const block of (day.blocks || [])) {
          for (const ex of (block.exercises || [])) {
            if (ex.name) previousPhaseExercises.push(ex.name);
          }
        }
      }
    } catch (e) {
      console.error(`[AI Plan] ${phase} phase failed:`, e.message);
      // If a phase fails, reuse the previous one
      const fallback = phaseTemplates[phaseNames[i - 1]] || { weeklyTemplate: [] };
      phaseTemplates[phase] = fallback;
    }
  }

  if (onStatus) onStatus('Matching exercises to our database...');

  const aiPlan = { planName, programNotes, restDayAdvice, phases: phaseTemplates };
  return await saveAIPlanToDb(aiPlan, userProfile, onStatus, exercisePool);
}

async function callClaude(apiKey, prompt) {
  console.log(`[AI Plan] Sending prompt: ${prompt.length} chars`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 6000,
        system: PLAN_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    let rawText = result.content?.[0]?.text || '';
    const usage = result.usage || {};
    console.log(`[AI Plan] Tokens — in: ${usage.input_tokens || '?'}, out: ${usage.output_tokens || '?'}`);

    rawText = rawText.trim();
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    }

    return JSON.parse(rawText);
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

function buildPlanPrompt(profile, exercisePool) {
  const parts = [];

  parts.push('Design a 3-phase periodized program for this user:\n');
  parts.push(`GOALS: ${(profile.goals || [profile.goal]).join(', ')}`);
  if (profile.sex) parts.push(`SEX: ${profile.sex}`);
  if (profile.height) parts.push(`HEIGHT: ${profile.height}`);
  if (profile.weight) parts.push(`WEIGHT: ${profile.weight} lbs`);
  if (profile.bmi) parts.push(`BMI: ${profile.bmi}`);
  parts.push(`EXPERIENCE: ${profile.experience}`);
  parts.push(`TRAINING DAYS PER WEEK: ${profile.trainingDaysPerWeek}`);
  parts.push(`SESSION DURATION: ${profile.sessionDuration || 60} minutes`);
  parts.push(`WORKOUT STYLES: ${(profile.workoutStyles || [profile.workoutStyle]).join(', ')}`);
  parts.push(`BODY COMP GOALS: ${(profile.bodyCompGoals || [profile.bodyCompGoal]).join(', ')}`);

  if (profile.equipment && profile.equipment.length > 0) {
    parts.push(`\nEQUIPMENT: ${profile.equipment.join(', ')}`);
  }
  if (profile.equipmentDetails) {
    if (profile.equipmentDetails.barbell?.maxWeight) parts.push(`  Barbell max: ${profile.equipmentDetails.barbell.maxWeight} lbs`);
    if (profile.equipmentDetails.kettlebell?.weights) parts.push(`  KBs: ${profile.equipmentDetails.kettlebell.weights} lbs`);
    if (profile.equipmentDetails.dumbbells?.maxWeight) parts.push(`  DBs: up to ${profile.equipmentDetails.dumbbells.maxWeight} lbs/hand`);
    else if (profile.equipmentDetails.dumbbells?.weights) parts.push(`  DBs: ${profile.equipmentDetails.dumbbells.weights} lbs`);
  }

  if (profile.exclusions && profile.exclusions.length > 0) {
    parts.push(`\nEXCLUSIONS: ${profile.exclusions.join(', ')}`);
  }

  const trainingDayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  if (profile.trainingDays) {
    parts.push(`\nTRAINING DAYS: ${profile.trainingDays.map(d => trainingDayNames[d]).join(', ')}`);
  }

  // Base user notes
  let baseNotes = '';
  let adjustments = '';
  if (profile.additionalNotes) {
    const fullNotes = profile.additionalNotes.substring(0, 500);
    const adjustIdx = fullNotes.indexOf('ADJUSTMENTS:');
    if (adjustIdx >= 0) {
      baseNotes = fullNotes.substring(0, adjustIdx).trim();
      adjustments = fullNotes.substring(adjustIdx).replace('ADJUSTMENTS:', '').trim();
    } else {
      baseNotes = fullNotes;
    }
    if (baseNotes) parts.push(`\nUSER NOTES: ${baseNotes}`);
  }

  // Exercise list
  if (exercisePool && exercisePool.all.length > 0) {
    const seeds = exercisePool.all.filter(e => e.source === 'seed' || !e.source);
    const apiExercises = exercisePool.all.filter(e => e.source === 'exercisedb');
    const exerciseList = [
      ...seeds.map(e => e.name),
      ...apiExercises.slice(0, Math.max(0, 80 - seeds.length)).map(e => e.name),
    ];
    parts.push(`\nAVAILABLE EXERCISES:\n${exerciseList.join(', ')}`);
  }

  // WOD list
  try {
    const wods = getWods();
    const levels = { beginner: 1, intermediate: 2, advanced: 3, elite: 4 };
    const userLevel = levels[profile.experience] || 2;
    const filteredWods = wods.filter(w => (levels[w.difficulty] || 2) <= userLevel);
    const wodList = filteredWods.slice(0, 30).map(w =>
      `${w.name} (${w.type}, ${w.estimatedTime}): ${w.movements.join(', ')}`
    );
    if (wodList.length > 0) {
      parts.push(`\nAVAILABLE WODS:\n${wodList.join('\n')}`);
    }
  } catch {}

  // Adjustments last
  if (adjustments) {
    parts.push(`\n\n=== MANDATORY CHANGES ===\n${adjustments}\n=== END ===`);
  }

  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// Save AI Plan to DB with week-over-week variation
// ═══════════════════════════════════════════════════════════════

async function saveAIPlanToDb(aiPlan, userProfile, onStatus, exercisePool) {
  const planId = generateUUID();
  const startDate = getNextMonday();
  const eventDate = userProfile.eventDate || addWeeks(startDate, 16);
  const phaseData = calculatePhases(startDate, eventDate);
  const { totalWeeks, phases } = phaseData;

  const trainingDays = userProfile.trainingDays || [0, 1, 2, 3, 4];

  // Get phase templates — support both old (weeklyTemplate) and new (phases) format
  const phaseTemplates = aiPlan.phases || {
    accumulation: { weeklyTemplate: aiPlan.weeklyTemplate || [] },
    intensification: { weeklyTemplate: aiPlan.weeklyTemplate || [] },
    realization: { weeklyTemplate: aiPlan.weeklyTemplate || [] },
  };

  if (onStatus) onStatus('Building your multi-week plan...');

  for (let week = 1; week <= totalWeeks; week++) {
    const phase = getPhaseForWeek(phases, week);
    if (!phase) continue;

    const weekStartDate = addDays(startDate, (week - 1) * 7);
    const mesoPhase = getMesocyclePhase(week);
    const stimulus = STIMULUS_TYPES[mesoPhase.defaultStimulus];

    // Pick the right phase template
    // Last 3-4 weeks before event = race_prep (taper), not accumulation recycled
    const weeksFromEnd = totalWeeks - week;
    let phaseKey;
    let weekInBlock;
    let isDeload;

    if (weeksFromEnd < 3 && totalWeeks > 12) {
      // RACE PREP / TAPER — last 3 weeks
      phaseKey = 'race_prep';
      weekInBlock = 3 - weeksFromEnd; // 1, 2, 3 counting up
      isDeload = false; // taper IS the deload
    } else {
      const cycleWeek = ((week - 1) % 12) + 1;
      if (cycleWeek <= 4) phaseKey = 'accumulation';
      else if (cycleWeek <= 8) phaseKey = 'intensification';
      else phaseKey = 'realization';
      weekInBlock = ((cycleWeek - 1) % 4) + 1;
      isDeload = weekInBlock === 4;
    }

    // Use race_prep template if available, else fall back to realization with taper adjustments
    const template = phaseTemplates[phaseKey]?.weeklyTemplate
      || (phaseKey === 'race_prep' ? phaseTemplates.realization?.weeklyTemplate : null)
      || phaseTemplates.accumulation?.weeklyTemplate || [];

    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      const date = addDays(weekStartDate, dayOfWeek);
      const trainingDayIndex = trainingDays.indexOf(dayOfWeek);
      const isTrainingDay = trainingDayIndex !== -1;

      if (!isTrainingDay) {
        await savePlanDay({
          planId, date, dayOfWeek, weekNumber: week,
          phase: phase.phase, title: 'REST DAY',
          focus: aiPlan.restDayAdvice || 'Recovery & mobility',
          color: '#333', emoji: '', isRestDay: true,
        });
        continue;
      }

      const dayTemplate = template[trainingDayIndex % template.length];
      if (!dayTemplate) continue;

      const dayId = await savePlanDay({
        planId, date, dayOfWeek, weekNumber: week,
        phase: phase.phase,
        title: dayTemplate.title || 'TRAINING',
        focus: `${mesoPhase.label} • ${stimulus.label} • Week ${week}`,
        color: phase.color, emoji: '', isRestDay: false,
      });

      for (let blockIdx = 0; blockIdx < (dayTemplate.blocks || []).length; blockIdx++) {
        const block = dayTemplate.blocks[blockIdx];

        const RUN_TYPES = ['EASY', 'TEMPO', 'INTERVALS', 'FARTLEK', 'LONG_RUN', 'RACE_PACE'];
        const blockTypeUpper = (block.type || '').toUpperCase();
        const isRunBlock = block.isRun || block.name?.toUpperCase() === 'RUN' || RUN_TYPES.includes(blockTypeUpper);
        const blockType = isRunBlock
          ? (RUN_TYPES.includes(blockTypeUpper) ? blockTypeUpper : 'INTERVALS')
          : block.type;

        const blockId = await savePlanBlock({
          planDayId: dayId, sortOrder: blockIdx,
          name: block.name, type: blockType,
          timeCap: block.duration, isAmrap: false, hasGps: isRunBlock,
        });

        const isWodBlock = blockType === 'WOD' || block.name?.toUpperCase().includes('WOD')
          || block.type?.toUpperCase() === 'AMRAP' || block.type?.toUpperCase() === 'EMOM'
          || block.type?.toUpperCase() === 'FOR TIME';

        for (let exIdx = 0; exIdx < (block.exercises || []).length; exIdx++) {
          const aiEx = block.exercises[exIdx];

          // For WOD blocks: each movement is its own exercise entry
          // Don't fuzzy match WOD names (ANNIE, CINDY, etc.)
          const exName = (aiEx.name || '').trim();
          const matchedId = fuzzyMatchExercise(exName, exercisePool);
          const matchedExercise = exercisePool.all.find(e => e.id === matchedId);
          const category = matchedExercise?.category || null;

          // Don't apply week variation to WOD exercises (they have their own scheme)
          let sets, reps, weight, rest, notes;
          if (isWodBlock) {
            sets = aiEx.sets || '1';
            reps = aiEx.reps || '';
            weight = aiEx.weight || 'BW';
            rest = aiEx.rest || null;
            notes = aiEx.notes || null;
          } else {
            ({ sets, reps, weight, rest, notes } = applyWeekVariation(
              aiEx, weekInBlock, isDeload, phaseKey, category, userProfile, week
            ));
          }

          // Scale run distances progressively toward race distance
          if (isRunBlock && weight) {
            weight = scaleRunDistance(weight, notes, week, totalWeeks, phaseKey);
          }

          await savePlanExercise({
            planBlockId: blockId,
            exerciseId: matchedId,
            sortOrder: exIdx,
            sets: `${sets}x${reps}`,
            reps: reps || '',
            weight: weight || 'BW',
            rest,
            notes,
          });
        }
      }
    }

    if (onStatus && week % 4 === 0) {
      onStatus(`Building week ${week} of ${totalWeeks}...`);
    }
  }

  return { planId, totalWeeks, phases, startDate, eventDate, planName: aiPlan.planName, programNotes: aiPlan.programNotes };
}

// ═══════════════════════════════════════════════════════════════
// Week-over-week variation within a 4-week block
// ═══════════════════════════════════════════════════════════════

function applyWeekVariation(aiEx, weekInBlock, isDeload, phaseKey, category, profile, absoluteWeek) {
  let sets = parseInt(aiEx.sets) || 3;
  let reps = aiEx.reps || '8';
  let weight = aiEx.weight || 'BW';
  let rest = aiEx.rest || null;
  let notes = aiEx.notes || null;
  const lower = (aiEx.name || '').toLowerCase();

  // NEVER modify: warmup, cooldown, stretching, mobility, activation
  const isWarmupCooldown = lower.includes('stretch') || lower.includes('foam') || lower.includes('mobility')
    || lower.includes('warm') || lower.includes('cool') || lower.includes('circle')
    || lower.includes('activation') || lower.includes('band pull') || lower.includes('dead hang')
    || lower.includes('pose') || lower.includes('roller');
  if (isWarmupCooldown) {
    return { sets: `${sets}`, reps, weight, rest: null, notes };
  }

  // Don't modify run/cardio exercises (but DO scale distance — handled separately)
  if (lower.includes('run') || lower.includes('jog') || lower.includes('row') || lower.includes('bike') || lower.includes('sprint')) {
    return { sets: `${sets}`, reps, weight, rest, notes };
  }

  const baseWeight = parseFloat(weight);
  const hasNumericWeight = !isNaN(baseWeight) && baseWeight > 0;
  const numReps = parseInt(reps);
  const hasNumericReps = !isNaN(numReps);

  // ══════════════════════════════════════════════════
  // CROSS-PHASE WEIGHT PROGRESSION
  // Claude's weights are for Week 1 of that phase.
  // We scale UP across phases so weights actually increase over 16 weeks.
  // ══════════════════════════════════════════════════
  const PHASE_WEIGHT_MULTIPLIER = {
    accumulation: 1.0,        // baseline
    intensification: 1.15,    // 15% heavier (fewer reps justify more load)
    realization: 1.25,        // 25% heavier (triples/5s at near-max)
    race_prep: 0.85,          // taper: 85% of baseline, maintain don't build
  };
  const phaseMult = PHASE_WEIGHT_MULTIPLIER[phaseKey] || 1.0;

  if (isDeload) {
    sets = Math.max(2, sets - 1);
    if (hasNumericReps) reps = `${Math.max(3, numReps - 2)}`;
    if (hasNumericWeight) weight = `${Math.round(baseWeight * phaseMult * 0.7 / 5) * 5} lb`;
    rest = '90s';
    notes = notes ? `${notes} | DELOAD` : 'DELOAD — lighter, focus on form';
  } else {
    // Week wave within the 3 working weeks
    const WAVE = {
      accumulation: {
        1: { setsAdj: 0, repsAdj: 0, weightMult: 1.0 },
        2: { setsAdj: 0, repsAdj: 2, weightMult: 0.97 },
        3: { setsAdj: 1, repsAdj: 0, weightMult: 1.05 },
      },
      intensification: {
        1: { setsAdj: 0, repsAdj: 0, weightMult: 1.0 },
        2: { setsAdj: 0, repsAdj: -2, weightMult: 1.07 },
        3: { setsAdj: 1, repsAdj: -2, weightMult: 1.12 },
      },
      realization: {
        1: { setsAdj: 0, repsAdj: 0, weightMult: 1.0 },
        2: { setsAdj: 0, repsAdj: -1, weightMult: 1.08 },
        3: { setsAdj: 0, repsAdj: -2, weightMult: 1.15 },
      },
      race_prep: {
        1: { setsAdj: -1, repsAdj: 0, weightMult: 1.0 },
        2: { setsAdj: -1, repsAdj: -2, weightMult: 0.95 },
        3: { setsAdj: -1, repsAdj: -2, weightMult: 0.90 },
      },
    };

    const wave = WAVE[phaseKey]?.[weekInBlock] || WAVE.accumulation[1];

    sets = Math.max(2, sets + wave.setsAdj);
    if (hasNumericReps) {
      reps = `${Math.max(2, numReps + wave.repsAdj)}`;
    }
    if (hasNumericWeight) {
      // Apply both phase progression AND week wave
      let adjusted = Math.round(baseWeight * phaseMult * wave.weightMult / 5) * 5;
      weight = `${adjusted} lb`;
    }

    // Rest periods scale with phase intensity (don't touch warmup/cooldown — already handled above)
    const REST_BY_PHASE = {
      accumulation: '60s',
      intensification: '90s',
      realization: '120s',
      race_prep: '60s',
    };
    if (!rest) rest = REST_BY_PHASE[phaseKey] || '60s';
  }

  // Cap to equipment limits
  weight = capWeightToEquipment(weight, category, profile);

  return { sets: `${sets}`, reps, weight, rest, notes };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

// Scale run distances to build toward race distance over the plan
function scaleRunDistance(weight, notes, week, totalWeeks, phaseKey) {
  // Only modify if the weight/notes contain distance info
  const combined = `${weight} ${notes || ''}`.toLowerCase();
  const miMatch = combined.match(/([\d.]+)\s*mi/);
  if (!miMatch) return weight;

  const baseDist = parseFloat(miMatch[1]);
  if (isNaN(baseDist) || baseDist === 0) return weight;

  // Progressive distance: build from base to ~1.5x by realization, then taper
  const progress = Math.min(1, (week - 1) / Math.max(1, totalWeeks - 4));
  const PHASE_RUN_MULT = {
    accumulation: 1.0 + progress * 0.3,    // build slowly: 1.0→1.3x
    intensification: 1.2 + progress * 0.4,  // 1.2→1.6x
    realization: 1.5 + progress * 0.3,      // peak: 1.5→1.8x
    race_prep: 1.2 - progress * 0.3,        // taper: 1.2→0.9x
  };

  const mult = PHASE_RUN_MULT[phaseKey] || 1.0;
  const scaledDist = Math.round(baseDist * mult * 10) / 10;

  return weight.replace(miMatch[0], `${scaledDist} mi`);
}

function capWeightToEquipment(weight, category, profile) {
  if (!weight || weight === 'BW' || weight === 'bodyweight') return weight;
  const numWeight = parseFloat(weight);
  if (isNaN(numWeight) || numWeight === 0) return weight;
  if (!category) return weight;

  const details = profile.equipmentDetails || {};
  const limits = {
    dumbbell: details.dumbbells?.maxWeight ? parseFloat(details.dumbbells.maxWeight) : null,
    barbell: details.barbell?.maxWeight ? parseFloat(details.barbell.maxWeight) : null,
    kettlebell: details.kettlebell?.weights
      ? Math.max(...details.kettlebell.weights.split(',').map(w => parseFloat(w.trim())).filter(w => w > 0), 0)
      : null,
  };

  const maxWeight = limits[category];
  if (maxWeight && numWeight > maxWeight) {
    return `${Math.round(maxWeight / 5) * 5} lb`;
  }
  return weight;
}

function applyWeeklyProgression(baseWeight, weekNumber, phase) {
  if (!baseWeight || baseWeight === 'BW' || baseWeight === 'bodyweight') return baseWeight;
  const lower = baseWeight.toLowerCase();
  if (lower.includes('%') || lower.includes('pace') || lower.includes('effort')
      || lower.includes('min') || lower.includes('easy') || lower.includes('warm')
      || lower.includes('cool') || lower.includes('conversational')
      || lower.includes('speed') || lower.includes('target')) {
    return baseWeight;
  }
  const numWeight = parseFloat(baseWeight);
  if (isNaN(numWeight) || numWeight === 0) return baseWeight;
  const weekProgression = 1 + ((weekNumber - 1) * 0.02);
  const isDeload = weekNumber > 1 && weekNumber % 4 === 0;
  const deloadMultiplier = isDeload ? 0.85 : 1;
  let weight = Math.round((numWeight * weekProgression * deloadMultiplier) / 5) * 5;
  return `${weight} lb`;
}

function fuzzyMatchExercise(name, pool) {
  if (!name) return 'air_squats';
  const query = name.toLowerCase().trim();

  const exact = pool.all.find(e => e.name.toLowerCase() === query);
  if (exact) return exact.id;

  const containsMatch = pool.all.find(e => {
    const eName = e.name.toLowerCase();
    return eName.includes(query) || query.includes(eName);
  });
  if (containsMatch) return containsMatch.id;

  const GENERIC_WORDS = new Set(['barbell', 'dumbbell', 'cable', 'machine', 'band', 'seated', 'standing', 'weighted', 'single', 'double', 'arm', 'leg', 'with', 'the', 'and', 'for']);
  const queryWords = query.split(/\s+/).filter(w => w.length >= 2);

  let bestScore = 0;
  let bestMatch = null;

  for (const ex of pool.all) {
    const exWords = ex.name.toLowerCase().split(/\s+/);
    let score = 0;
    let meaningfulMatches = 0;
    let totalMeaningful = 0;

    for (const word of queryWords) {
      const isGeneric = GENERIC_WORDS.has(word);
      const matched = exWords.some(w => w === word || (w.length > 3 && word.length > 3 && (w.startsWith(word) || word.startsWith(w))));
      if (matched) {
        score += isGeneric ? 0.5 : 3;
        if (!isGeneric) meaningfulMatches++;
      }
      if (!isGeneric) totalMeaningful++;
    }

    if (totalMeaningful > 0) score += (meaningfulMatches / totalMeaningful) * 5;
    score -= Math.abs(exWords.length - queryWords.length) * 0.3;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = ex;
    }
  }

  if (bestMatch && bestScore >= 3) return bestMatch.id;

  const idGuess = query.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  const idMatch = pool.all.find(e => e.id === idGuess);
  if (idMatch) return idMatch.id;

  console.warn(`[AI Plan] No match for "${name}"`);
  const seeds = pool.all.filter(e => e.source === 'seed' || !e.source);
  return (seeds.length > 0 ? seeds[Math.floor(Math.random() * seeds.length)] : pool.all[0])?.id || 'air_squats';
}

async function loadExercisePool(userProfile) {
  const styles = userProfile.workoutStyles || [userProfile.workoutStyle || 'hybrid'];
  const exerciseMap = new Map();

  for (const style of styles) {
    const exercises = await getExercisesByFilter({
      style,
      exclusions: userProfile.exclusions || [],
      equipment: userProfile.equipment || [],
      difficulty: userProfile.experience || 'intermediate',
    });
    for (const ex of exercises) exerciseMap.set(ex.id, ex);
  }

  const all = Array.from(exerciseMap.values());
  console.log(`[AI Plan] Pool: ${all.length} exercises. Barbell: ${all.filter(e => e.category === 'barbell').length}, DB: ${all.filter(e => e.category === 'dumbbell').length}`);
  const hasBench = all.find(e => e.id === 'bench_press');
  console.log(`[AI Plan] Bench Press in pool: ${hasBench ? 'YES' : 'NO'}`);
  return { all };
}

function generateUUID() {
  return 'xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
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
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
