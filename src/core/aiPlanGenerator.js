// AI Plan Generator
// Uses Claude to design a personalized workout plan based on user profile
// Then saves it using the existing DB infrastructure

import Constants from 'expo-constants';
import { calculatePhases, getPhaseForWeek } from './phaseCalculator';
import { getMesocyclePhase, STIMULUS_TYPES } from './progressionRules';
import { getDatabase, savePlanDay, savePlanBlock, savePlanExercise, getExercisesByFilter } from '../data/database';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

function getApiKey() {
  return Constants.expoConfig?.extra?.claudeApiKey
    || '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';
}

const PLAN_SYSTEM_PROMPT = `You are an elite strength & conditioning coach designing a personalized workout program.

You will receive a user's complete profile and must design a WEEKLY TEMPLATE — a repeating pattern of training days.

RULES:
- Design for the user's specific equipment, goals, time constraints, injuries, and experience
- Each training day must fit within their session duration
- Use proper periodization (accumulation → intensification → realization)
- Follow exercise sequencing: power → compound → accessory → core → conditioning
- Never program exercises the user can't do with their equipment
- Respect exclusions completely
- Include warmup blocks for every training day
- For injury notes, avoid aggravating movements and program around them
- Prioritize EFFICIENCY: pick exercises that hit the most muscle per movement. Prefer big compound lifts (squat, deadlift, press, row, pull-up) over isolation. Only add isolation work to address weak points or fill volume gaps.
- No redundant exercises — if bench press and dumbbell press are in the same session, one is wasted. Each exercise should earn its slot by targeting something the others don't.
- NEVER use "BW" for weighted carries (farmer's walk, suitcase carry, etc.) — always prescribe actual weight based on user's equipment
- Spartan/OCR goals MUST include 1-2 dedicated RUN days per week with a block named "RUN" and type set to one of: EASY, TEMPO, INTERVALS, FARTLEK, LONG_RUN, RACE_PACE
- Run blocks should have "isRun": true in the block object
- Spartan goals should also include obstacle-specific training (carries, grip work, crawls)

RESPONSE FORMAT — valid JSON only:
{
  "planName": "Short catchy name for the program",
  "weeklyTemplate": [
    {
      "dayIndex": 0,
      "title": "PUSH POWER",
      "type": "upper_push",
      "focus": "Chest, shoulders, triceps",
      "blocks": [
        {
          "name": "WARM-UP",
          "type": "MOVEMENT PREP",
          "duration": "8 min",
          "exercises": [
            { "name": "Band Pull-Aparts", "sets": "2", "reps": "15", "weight": "BW", "rest": null, "notes": null }
          ]
        },
        {
          "name": "MAIN LIFTS",
          "type": "COMPOUND",
          "duration": "25 min",
          "exercises": [
            { "name": "Bench Press", "sets": "4", "reps": "6", "weight": "135 lb", "rest": "120s", "notes": "Tempo: 3110" }
          ]
        },
        {
          "name": "RUN",
          "type": "INTERVALS",
          "isRun": true,
          "duration": "25 min",
          "exercises": [
            { "name": "Easy Jog", "sets": "1", "reps": "5 min", "weight": "Warm-up pace", "rest": null, "notes": null },
            { "name": "Interval Run", "sets": "6", "reps": "2 min hard / 1 min easy", "weight": "80% effort", "rest": null, "notes": "Target: 3 mi" }
          ]
        }
      ]
    }
  ],
  "restDayAdvice": "Light walking, foam rolling, mobility work",
  "programNotes": "Brief explanation of why you designed the plan this way"
}

IMPORTANT:
- dayIndex corresponds to the user's selected training days (0 = first training day, 1 = second, etc.)
- Only include training days, not rest days
- Exercise names should be common names that can be fuzzy-matched to a database
- Weight should be realistic for the user's experience level and equipment
- Sets/reps should match the body comp goal and mesocycle phase
- Use COMMON exercise names: "Back Squat", "Bench Press", "Deadlift", "Pull Up", "Overhead Press", "Bent Over Row", "Lunges", "Romanian Deadlift", "Bicep Curl", "Tricep Pushdown", "Lat Pulldown", "Leg Press", "Farmer Walk", "Plank", "Push Up". Do NOT prefix with equipment (say "Bench Press" not "Barbell Bench Press")
- 3-6 exercises per block, 2-4 blocks per day — do NOT over-program
- Keep "notes" and "rest" fields null unless truly needed
- Do NOT add explanatory text outside the JSON — return ONLY valid JSON`;

export async function generateAIPlan(userProfile, onStatus) {
  const apiKey = getApiKey();

  if (onStatus) onStatus('Analyzing your goals and equipment...');

  // Preload exercise pool so we can send names to Claude
  const exercisePool = await loadExercisePool(userProfile);

  // Build the user context for Claude, including available exercise names
  const prompt = buildPlanPrompt(userProfile, exercisePool);

  if (onStatus) onStatus('Designing your personalized program...');

  // Call Claude
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000); // 60s timeout for plan generation

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
        max_tokens: 8000,
        system: PLAN_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI Plan] API error:', response.status, errorText);
      throw new Error(`Plan generation failed: ${response.status}`);
    }

    const result = await response.json();
    let rawText = result.content?.[0]?.text || '';

    const usage = result.usage || {};
    console.log(`[AI Plan] Tokens — in: ${usage.input_tokens || '?'}, out: ${usage.output_tokens || '?'}, response: ${rawText.length} chars`);

    // Strip markdown fences
    rawText = rawText.trim();
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    }

    const aiPlan = JSON.parse(rawText);

    if (onStatus) onStatus('Matching exercises to our database...');

    // Now convert AI plan to DB records using the already-loaded pool
    return await saveAIPlanToDb(aiPlan, userProfile, onStatus, exercisePool);

  } catch (e) {
    clearTimeout(timer);
    console.error('[AI Plan] Error:', e);
    throw e;
  }
}

function buildPlanPrompt(profile, exercisePool) {
  const parts = [];

  parts.push('Design a weekly workout template for this user:\n');
  parts.push(`GOALS: ${(profile.goals || [profile.goal]).join(', ')}`);
  parts.push(`EXPERIENCE: ${profile.experience}`);
  parts.push(`TRAINING DAYS PER WEEK: ${profile.trainingDaysPerWeek}`);
  parts.push(`SESSION DURATION: ${profile.sessionDuration || 60} minutes`);
  parts.push(`WORKOUT STYLES: ${(profile.workoutStyles || [profile.workoutStyle]).join(', ')}`);
  parts.push(`BODY COMP GOALS: ${(profile.bodyCompGoals || [profile.bodyCompGoal]).join(', ')}`);

  if (profile.equipment && profile.equipment.length > 0) {
    parts.push(`\nEQUIPMENT AVAILABLE: ${profile.equipment.join(', ')}`);
  }
  if (profile.equipmentDetails) {
    if (profile.equipmentDetails.barbell?.maxWeight) {
      parts.push(`  Barbell max load: ${profile.equipmentDetails.barbell.maxWeight} lbs`);
    }
    if (profile.equipmentDetails.kettlebell?.weights) {
      parts.push(`  Kettlebell weights: ${profile.equipmentDetails.kettlebell.weights} lbs`);
    }
    if (profile.equipmentDetails.dumbbells?.maxWeight) {
      parts.push(`  Dumbbells: adjustable up to ${profile.equipmentDetails.dumbbells.maxWeight} lbs per hand`);
    } else if (profile.equipmentDetails.dumbbells?.weights) {
      parts.push(`  Dumbbell weights: ${profile.equipmentDetails.dumbbells.weights} lbs`);
    }
  }

  if (profile.exclusions && profile.exclusions.length > 0) {
    parts.push(`\nEXCLUSIONS (do NOT program these): ${profile.exclusions.join(', ')}`);
  }

  if (profile.additionalNotes) {
    // Cap notes at 300 chars to control token spend
    const notes = profile.additionalNotes.substring(0, 300);
    parts.push(`\nUSER NOTES: ${notes}`);
  }

  const trainingDayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  if (profile.trainingDays) {
    const dayNames = profile.trainingDays.map(d => trainingDayNames[d]);
    parts.push(`\nTRAINING DAYS: ${dayNames.join(', ')}`);
  }

  if (profile.eventDate) {
    parts.push(`\nEVENT DATE: ${profile.eventDate}`);
  }

  // Send available exercise names so Claude picks from real exercises
  if (exercisePool && exercisePool.all.length > 0) {
    // Prefer seed exercises (curated), limit to 120 names to control tokens
    const seeds = exercisePool.all.filter(e => e.source === 'seed' || !e.source);
    const apiExercises = exercisePool.all.filter(e => e.source === 'exercisedb');
    const exerciseList = [
      ...seeds.map(e => e.name),
      ...apiExercises.slice(0, Math.max(0, 120 - seeds.length)).map(e => e.name),
    ];
    parts.push(`\nAVAILABLE EXERCISES (use these exact names when possible):\n${exerciseList.join(', ')}`);
  }

  return parts.join('\n');
}

async function saveAIPlanToDb(aiPlan, userProfile, onStatus, exercisePool) {
  const planId = generateUUID();
  const startDate = getNextMonday();
  const eventDate = userProfile.eventDate || addWeeks(startDate, 16);
  const phaseData = calculatePhases(startDate, eventDate);
  const { totalWeeks, phases } = phaseData;

  const trainingDays = userProfile.trainingDays || [0, 1, 2, 3, 4];
  const template = aiPlan.weeklyTemplate || [];

  if (onStatus) onStatus('Building your multi-week plan...');

  for (let week = 1; week <= totalWeeks; week++) {
    const phase = getPhaseForWeek(phases, week);
    if (!phase) continue;

    const weekStartDate = addDays(startDate, (week - 1) * 7);
    const mesoPhase = getMesocyclePhase(week);
    const stimulus = STIMULUS_TYPES[mesoPhase.defaultStimulus];

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

      // Get the AI template for this training day
      const dayTemplate = template[trainingDayIndex % template.length];
      if (!dayTemplate) continue;

      const dayId = await savePlanDay({
        planId, date, dayOfWeek, weekNumber: week,
        phase: phase.phase,
        title: dayTemplate.title || 'TRAINING',
        focus: `${mesoPhase.label} • ${stimulus.label} • Week ${week}`,
        color: phase.color, emoji: '', isRestDay: false,
      });

      // Create blocks
      for (let blockIdx = 0; blockIdx < (dayTemplate.blocks || []).length; blockIdx++) {
        const block = dayTemplate.blocks[blockIdx];

        // Detect run blocks — set GPS tracking
        const RUN_TYPES = ['EASY', 'TEMPO', 'INTERVALS', 'FARTLEK', 'LONG_RUN', 'RACE_PACE'];
        const blockTypeUpper = (block.type || '').toUpperCase();
        const isRunBlock = block.isRun
          || block.name?.toUpperCase() === 'RUN'
          || RUN_TYPES.includes(blockTypeUpper);

        // Normalize run block type to match RUN_CONFIGS keys in RunTracker
        const blockType = isRunBlock
          ? (RUN_TYPES.includes(blockTypeUpper) ? blockTypeUpper : 'INTERVALS')
          : block.type;

        const blockId = await savePlanBlock({
          planDayId: dayId, sortOrder: blockIdx,
          name: block.name, type: blockType,
          timeCap: block.duration, isAmrap: false, hasGps: isRunBlock,
        });

        // For run blocks, don't apply weight progression to exercises
        // Match and save exercises
        for (let exIdx = 0; exIdx < (block.exercises || []).length; exIdx++) {
          const aiEx = block.exercises[exIdx];
          const matchedId = fuzzyMatchExercise(aiEx.name, exercisePool);

          // Apply weekly progression to weight
          const baseWeight = aiEx.weight || 'BW';
          const progWeight = applyWeeklyProgression(baseWeight, week, phase.phase);

          await savePlanExercise({
            planBlockId: blockId,
            exerciseId: matchedId,
            sortOrder: exIdx,
            sets: `${aiEx.sets}x${aiEx.reps}`,
            reps: aiEx.reps,
            weight: progWeight,
            rest: aiEx.rest || null,
            notes: aiEx.notes || null,
          });
        }
      }
    }

    if (onStatus && week % 4 === 0) {
      onStatus(`Building week ${week} of ${totalWeeks}...`);
    }
  }

  return { planId, totalWeeks, phases, startDate, eventDate, planName: aiPlan.planName };
}

// Fuzzy match an exercise name to our DB
function fuzzyMatchExercise(name, pool) {
  if (!name) return 'air_squats';

  const query = name.toLowerCase().trim();

  // 1. Exact match
  const exact = pool.all.find(e => e.name.toLowerCase() === query);
  if (exact) return exact.id;

  // 2. One name contains the other entirely
  const containsMatch = pool.all.find(e => {
    const eName = e.name.toLowerCase();
    return eName.includes(query) || query.includes(eName);
  });
  if (containsMatch) return containsMatch.id;

  // 3. Score-based matching — weight meaningful words higher than generic ones
  const GENERIC_WORDS = new Set(['barbell', 'dumbbell', 'cable', 'machine', 'band', 'seated', 'standing', 'weighted', 'single', 'double', 'arm', 'leg', 'with', 'the', 'and', 'for']);
  const queryWords = query.split(/\s+/).filter(w => w.length >= 2);

  let bestScore = 0;
  let bestMatch = null;

  for (const ex of pool.all) {
    const exName = ex.name.toLowerCase();
    const exWords = exName.split(/\s+/);

    let score = 0;
    let meaningfulMatches = 0;
    let totalMeaningful = 0;

    for (const word of queryWords) {
      const isGeneric = GENERIC_WORDS.has(word);
      const matched = exWords.some(w => w === word || (w.length > 3 && word.length > 3 && (w.startsWith(word) || word.startsWith(w))));

      if (matched) {
        score += isGeneric ? 0.5 : 3; // meaningful words worth 6x more
        if (!isGeneric) meaningfulMatches++;
      }
      if (!isGeneric) totalMeaningful++;
    }

    // Bonus: proportion of meaningful words matched
    if (totalMeaningful > 0) {
      score += (meaningfulMatches / totalMeaningful) * 5;
    }

    // Penalty: big length difference suggests wrong exercise
    const lenDiff = Math.abs(exWords.length - queryWords.length);
    score -= lenDiff * 0.3;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = ex;
    }
  }

  if (bestMatch && bestScore >= 3) {
    console.log(`[AI Plan] Matched "${name}" → "${bestMatch.name}" (score: ${bestScore.toFixed(1)})`);
    return bestMatch.id;
  }

  // 4. Last resort: try to match by seed exercise ID (e.g. "bench_press" → "bench_press")
  const idGuess = query.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  const idMatch = pool.all.find(e => e.id === idGuess);
  if (idMatch) return idMatch.id;

  console.warn(`[AI Plan] No match for "${name}" — using fallback`);
  // Pick a random seed exercise as fallback (prefer seed over API exercises)
  const seeds = pool.all.filter(e => e.source === 'seed' || !e.source);
  return (seeds.length > 0 ? seeds[Math.floor(Math.random() * seeds.length)] : pool.all[0])?.id || 'air_squats';
}

function applyWeeklyProgression(baseWeight, weekNumber, phase) {
  if (!baseWeight || baseWeight === 'BW' || baseWeight === 'bodyweight') return baseWeight;

  // Don't apply progression to non-weight values (pace, effort, etc.)
  const lower = baseWeight.toLowerCase();
  if (lower.includes('%') || lower.includes('pace') || lower.includes('effort')
      || lower.includes('min') || lower.includes('easy') || lower.includes('warm')
      || lower.includes('cool') || lower.includes('conversational')
      || lower.includes('speed') || lower.includes('target')) {
    return baseWeight;
  }

  const numWeight = parseFloat(baseWeight);
  if (isNaN(numWeight) || numWeight === 0) return baseWeight;

  // 2% weekly progression
  const weekProgression = 1 + ((weekNumber - 1) * 0.02);

  // Deload every 4th week
  const isDeload = weekNumber > 1 && weekNumber % 4 === 0;
  const deloadMultiplier = isDeload ? 0.85 : 1;

  let weight = Math.round((numWeight * weekProgression * deloadMultiplier) / 5) * 5;
  return `${weight} lb`;
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
    for (const ex of exercises) {
      exerciseMap.set(ex.id, ex);
    }
  }

  return { all: Array.from(exerciseMap.values()) };
}

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
