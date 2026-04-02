// Elite Progression Rules
// Implements: stimulus intent, tempo, energy systems, RPE-based autoregulation,
// mesocycle periodization, and equipment-aware weight scaling

// ═══════════════════════════════════════════════════════════════
// Stimulus Intent System
// ═══════════════════════════════════════════════════════════════

export const STIMULUS_TYPES = {
  strength: {
    label: 'STRENGTH',
    repRange: [3, 5],
    sets: [4, 5],
    restSeconds: '180-300s',
    rpe: 8,
    tempo: '2010', // 2s down, 0 pause, 1s up, 0 pause
    intensity: 0.85, // % of max
    description: 'Heavy, low rep, long rest. Neural adaptation.',
  },
  hypertrophy_mechanical: {
    label: 'HYPERTROPHY (MECHANICAL)',
    repRange: [6, 10],
    sets: [3, 4],
    restSeconds: '60-90s',
    rpe: 7,
    tempo: '3110', // 3s eccentric, 1s pause, 1s concentric, 0 pause
    intensity: 0.72,
    description: 'Moderate weight, controlled tempo. Muscle damage & tension.',
  },
  hypertrophy_metabolic: {
    label: 'HYPERTROPHY (METABOLIC)',
    repRange: [12, 20],
    sets: [3, 4],
    restSeconds: '30-45s',
    rpe: 7,
    tempo: '2010',
    intensity: 0.55,
    description: 'Lighter weight, short rest, pump. Metabolic stress.',
  },
  power: {
    label: 'POWER',
    repRange: [1, 3],
    sets: [5, 6],
    restSeconds: '180-300s',
    rpe: 9,
    tempo: 'X010', // eXplosive concentric
    intensity: 0.90,
    description: 'Explosive, low rep, full recovery. Rate of force development.',
  },
  conditioning: {
    label: 'CONDITIONING',
    repRange: [10, 20],
    sets: [3, 5],
    restSeconds: '30-60s',
    rpe: 8,
    tempo: null, // just go
    intensity: 0.50,
    description: 'Sustained elevated HR. Work capacity.',
  },
  skill: {
    label: 'SKILL / PRACTICE',
    repRange: [5, 8],
    sets: [3, 5],
    restSeconds: '60-120s',
    rpe: 5,
    tempo: '3110',
    intensity: 0.50,
    description: 'Technique focus. Light loads, perfect reps.',
  },
};

// ═══════════════════════════════════════════════════════════════
// Energy Systems
// ═══════════════════════════════════════════════════════════════

export const ENERGY_SYSTEMS = {
  phosphocreatine: { label: 'PHOSPHOCREATINE', duration: '5-15s', examples: 'Heavy singles, sprints, box jumps' },
  glycolytic: { label: 'GLYCOLYTIC', duration: '30s-2min', examples: 'AMRAPs, interval work, Tabata' },
  oxidative: { label: 'OXIDATIVE', duration: '3+ min', examples: 'Long WODs, steady state, endurance runs' },
};

// ═══════════════════════════════════════════════════════════════
// Mesocycle Periodization (12-week macrocycle)
// ═══════════════════════════════════════════════════════════════

export const MESOCYCLE_PHASES = {
  accumulation: {
    weeks: [1, 4],
    label: 'ACCUMULATION',
    volumeMultiplier: 1.1,
    intensityMultiplier: 0.70,
    defaultStimulus: 'hypertrophy_mechanical',
    description: 'Higher volume, moderate intensity. Building work capacity.',
    energyFocus: 'oxidative',
  },
  intensification: {
    weeks: [5, 8],
    label: 'INTENSIFICATION',
    volumeMultiplier: 0.85,
    intensityMultiplier: 0.85,
    defaultStimulus: 'strength',
    description: 'Lower volume, higher intensity. Converting capacity to strength.',
    energyFocus: 'glycolytic',
  },
  realization: {
    weeks: [9, 12],
    label: 'REALIZATION',
    volumeMultiplier: 0.65,
    intensityMultiplier: 1.0,
    defaultStimulus: 'power',
    description: 'Low volume, high intensity. Testing benchmarks.',
    energyFocus: 'phosphocreatine',
  },
};

export function getMesocyclePhase(weekNumber) {
  const cycleWeek = ((weekNumber - 1) % 12) + 1;
  if (cycleWeek <= 4) return MESOCYCLE_PHASES.accumulation;
  if (cycleWeek <= 8) return MESOCYCLE_PHASES.intensification;
  return MESOCYCLE_PHASES.realization;
}

// ═══════════════════════════════════════════════════════════════
// Body Comp Modifiers
// ═══════════════════════════════════════════════════════════════

const BODY_COMP_PARAMS = {
  bulk: { compoundReps: [4, 6], accessoryReps: [8, 10], compoundSets: [4, 5], accessorySets: [3, 4], restSeconds: '90-120s', weightMultiplier: 1.1, description: 'Heavy, build mass' },
  cut: { compoundReps: [10, 15], accessoryReps: [12, 15], compoundSets: [3, 4], accessorySets: [3, 4], restSeconds: '30-60s', weightMultiplier: 0.8, description: 'Higher reps, shorter rest' },
  maintain: { compoundReps: [8, 10], accessoryReps: [10, 12], compoundSets: [3, 4], accessorySets: [3, 3], restSeconds: '60-90s', weightMultiplier: 1.0, description: 'Balanced' },
  endurance: { compoundReps: [12, 20], accessoryReps: [15, 20], compoundSets: [2, 3], accessorySets: [2, 3], restSeconds: '30-45s', weightMultiplier: 0.7, description: 'High rep, stamina' },
};

const EXPERIENCE_MULTIPLIERS = {
  beginner: 0.65,
  intermediate: 0.85,
  advanced: 1.0,
  elite: 1.15,
};

export function getBodyCompParams(bodyCompGoal) {
  return BODY_COMP_PARAMS[bodyCompGoal] || BODY_COMP_PARAMS.maintain;
}

export function getPhaseModifier(phase) {
  // Map old phase names to mesocycle
  const map = {
    foundation: MESOCYCLE_PHASES.accumulation,
    build: MESOCYCLE_PHASES.intensification,
    peak: MESOCYCLE_PHASES.realization,
    race_prep: { volumeMultiplier: 0.6, intensityMultiplier: 0.75 },
  };
  return map[phase] || MESOCYCLE_PHASES.accumulation;
}

export function getExperienceMultiplier(experience) {
  return EXPERIENCE_MULTIPLIERS[experience] || EXPERIENCE_MULTIPLIERS.intermediate;
}

// ═══════════════════════════════════════════════════════════════
// Weight Calculation with Equipment Awareness
// ═══════════════════════════════════════════════════════════════

export function calculateWeight(exercise, weekNumber, phase, bodyCompGoal, experience, equipmentDetails, workingWeights) {
  const seedWeight = parseFloat(exercise.default_weight) || 0;
  if (seedWeight === 0 || exercise.default_weight === 'BW') return exercise.default_weight;

  // Step 1: Get base from user's working weights (much better than seed defaults)
  // Working weights are 8-10RM — that's roughly 75% of 1RM
  // So estimated 1RM = working weight × 1.3
  const userBase = getUserBaseWeight(exercise, workingWeights);
  const baseWeight = userBase || seedWeight;
  const hasUserWeights = !!userBase;

  // Step 2: Classify exercise — compound vs isolation
  const isCompound = exercise.is_compound;
  const category = isCompound ? 'compound' : 'isolation';

  // Step 3: Phase intensity as % of ESTIMATED 1RM
  // If we have user's working weights, estimate 1RM first then apply phase %
  // If no working weights, apply phase % to seed default directly
  const est1RM = hasUserWeights ? baseWeight * 1.3 : baseWeight;

  // Phase targets as % of estimated 1RM:
  // Foundation: 65-70% 1RM = moderate (≈ user's working weight for higher reps)
  // Build: 75-80% 1RM = challenging
  // Peak: 85-90% 1RM = heavy
  // Race prep: 70-75% 1RM = maintain without fatigue
  const PHASE_INTENSITY = {
    foundation: { compound: 0.70, isolation: 0.60 },
    build:      { compound: 0.80, isolation: 0.70 },
    peak:       { compound: 0.90, isolation: 0.80 },
    race_prep:  { compound: 0.75, isolation: 0.65 },
  };
  const phaseKey = phase === 'race_prep' ? 'race_prep' : phase === 'peak' ? 'peak' : phase === 'build' ? 'build' : 'foundation';
  const phaseIntensity = PHASE_INTENSITY[phaseKey]?.[category] || 0.70;

  // Step 4: Weekly progression — cumulative across ALL weeks (not reset per phase)
  // Compounds: +2.5% per week, Isolation: +1.5% per week
  const weeklyBump = isCompound ? 0.02 : 0.01;
  const progressionMultiplier = 1 + ((weekNumber - 1) * weeklyBump);

  // Step 5: Experience multiplier (only when no working weights)
  const expMult = hasUserWeights ? 1.0 : getExperienceMultiplier(experience);

  // Step 6: Calculate from estimated 1RM
  let weight = est1RM * phaseIntensity * progressionMultiplier * expMult;

  // Step 7: Deload — 70% of working weight
  if (isDeloadWeek(weekNumber)) {
    weight *= 0.70;
  }

  // Step 8: Apply floor — prevents absurdly light weights
  const floor = getMinimumWeight(exercise, experience, workingWeights);
  if (!isDeloadWeek(weekNumber)) {
    weight = Math.max(weight, floor);
  }

  // Step 9: Cap to equipment limits
  weight = capToEquipment(weight, exercise, equipmentDetails);

  // Step 10: Round to nearest practical increment
  if (exercise.category === 'kettlebell' && equipmentDetails?.kettlebell?.weights) {
    // Snap to nearest available KB
    const kbWeights = equipmentDetails.kettlebell.weights.split(',').map(w => parseFloat(w.trim())).filter(w => w > 0).sort((a, b) => a - b);
    if (kbWeights.length > 0) {
      weight = kbWeights.reduce((prev, curr) => Math.abs(curr - weight) < Math.abs(prev - weight) ? curr : prev);
    }
  } else {
    weight = Math.round(weight / 5) * 5;
  }

  // Equipment practical minimums — machines/cables can't go below their starting weight
  const EQUIP_MINIMUMS = {
    machine: 10,   // most machine stacks start at 10-20 lb
    cable: 5,      // cable stacks start at 5-10 lb
    barbell: 45,   // empty bar
    dumbbell: 5,   // lightest DB
    kettlebell: 15, // lightest common KB
    bodyweight: 0,
  };
  const equipMin = EQUIP_MINIMUMS[exercise.category] || 5;
  weight = Math.max(equipMin, weight);

  return `${weight} lb`;
}

// Experience-aware minimum weights — prevents goblet squat at 15 lb for intermediate lifters
function getMinimumWeight(exercise, experience, workingWeights) {
  const name = (exercise.name || '').toLowerCase();
  const cat = exercise.category;

  // If we have working weights, floors are based on them
  if (workingWeights) {
    const userBase = getUserBaseWeight(exercise, workingWeights);
    if (userBase) return userBase * 0.50; // Never below 50% of their known capacity
  }

  // Generic floors by experience and equipment type
  const floors = {
    beginner:     { barbell: 25, dumbbell: 10, kettlebell: 15, bodyweight: 0 },
    intermediate: { barbell: 45, dumbbell: 20, kettlebell: 25, bodyweight: 0 },
    advanced:     { barbell: 65, dumbbell: 30, kettlebell: 35, bodyweight: 0 },
    elite:        { barbell: 95, dumbbell: 40, kettlebell: 45, bodyweight: 0 },
  };

  return floors[experience]?.[cat] || floors.intermediate?.[cat] || 10;
}

// Cap weight to equipment limits
function capToEquipment(weight, exercise, equipmentDetails) {
  if (!equipmentDetails) return weight;
  const cat = exercise.category;

  if (cat === 'barbell' && equipmentDetails.barbell?.maxWeight) {
    const max = parseFloat(equipmentDetails.barbell.maxWeight);
    if (weight > max) weight = max;
  }
  if (cat === 'dumbbell' && equipmentDetails.dumbbells?.maxWeight) {
    const max = parseFloat(equipmentDetails.dumbbells.maxWeight);
    if (weight > max) weight = max;
  }
  return weight;
}

// ═══════════════════════════════════════════════════════════════
// Sets, Reps & Tempo
// ═══════════════════════════════════════════════════════════════

export function calculateSetsReps(exercise, weekNumber, phase, bodyCompGoal, sessionMinutes, targetSets) {
  const bodyComp = getBodyCompParams(bodyCompGoal);
  const isCompound = exercise.is_compound;
  const session = sessionMinutes || 60;

  // Race prep: fixed reduced volume
  if (phase === 'race_prep') {
    const sets = isCompound ? 3 : 2;
    const reps = isCompound ? 5 : 8;
    return { sets: `${sets}`, reps: `${reps}` };
  }

  const mesoPhase = getMesocyclePhase(weekNumber);
  const repRange = isCompound ? bodyComp.compoundReps : bodyComp.accessoryReps;
  const setRange = isCompound ? bodyComp.compoundSets : bodyComp.accessorySets;

  // Reps FIXED per phase — weight is the progression variable, not reps
  // Foundation: higher reps (10 compound, 12 isolation) for movement learning
  // Build: moderate reps (8 compound, 10 isolation) for strength building
  // Peak: lower reps (6 compound, 8 isolation) for peak expression
  const PHASE_REPS = {
    foundation: { compound: 10, isolation: 12 },
    build:      { compound: 8,  isolation: 10 },
    peak:       { compound: 6,  isolation: 8 },
  };
  const phaseReps = PHASE_REPS[phase] || PHASE_REPS.foundation;
  let reps = isCompound ? phaseReps.compound : phaseReps.isolation;

  // Sets: from time budget calculator, or range minimum
  const weekInPhase = weekNumber % 4 || 4;
  let sets = targetSets || setRange[0];

  // Session duration cap: 60-min or less sessions max 3 sets per exercise
  if (session <= 60 && sets > 3) sets = 3;
  if (session <= 45 && sets > 2) sets = 2;

  // Deload: fewer sets, lower reps
  if (isDeloadWeek(weekNumber)) {
    sets = Math.max(2, sets - 1);
    reps = repRange[0];
  }

  // Preserve special rep formats
  const defaultReps = exercise.default_reps || '';
  if (defaultReps.includes('ea') || defaultReps.includes('s') || defaultReps.includes('min') || defaultReps.includes('yd') || defaultReps.includes('m')) {
    return { sets: `${sets}`, reps: defaultReps };
  }

  return { sets: `${sets}`, reps: `${reps}` };
}

export function getTempoForExercise(exercise, weekNumber) {
  if (!exercise.is_compound) return null; // only prescribe tempo for compounds

  const mesoPhase = getMesocyclePhase(weekNumber);
  const stimulus = STIMULUS_TYPES[mesoPhase.defaultStimulus];
  return stimulus?.tempo || null;
}

// ═══════════════════════════════════════════════════════════════
// Run Parameters
// ═══════════════════════════════════════════════════════════════

export function calculateRunParams(weekNumber, phase, totalWeeks, targetDistance) {
  const target = targetDistance || 6.2; // Default to 10K / Spartan Super distance
  const baseDistance = Math.max(1.5, target * 0.25); // Start at 25% of target
  const peakDistance = target * 1.10; // Build beyond race distance — overshoot so race feels manageable
  const progress = Math.min(1, (weekNumber - 1) / Math.max(1, totalWeeks - 3)); // Peak 3 weeks before end
  let distance = baseDistance + (peakDistance - baseDistance) * progress;

  // Race prep: taper down but not below 50% of target
  if (phase === 'race_prep') {
    const weeksLeft = totalWeeks - weekNumber;
    distance = target * (0.50 + weeksLeft * 0.08); // Week before race = ~50%, earlier = ~65%
  }

  // Deload: 70% of current progression (not 60%)
  if (isDeloadWeek(weekNumber)) distance *= 0.70;

  // Round to nearest 0.5 for easy measurement
  distance = Math.round(distance * 2) / 2;

  const intervals = weekNumber <= 4 ? 4 : weekNumber <= 8 ? 6 : weekNumber <= 12 ? 8 : 6;

  return {
    distance: `${distance} mi`,
    intervals,
    paceType: phase === 'foundation' ? 'EASY' : phase === 'build' ? 'MODERATE' : phase === 'peak' ? 'RACE PACE' : 'TAPER',
  };
}

// ═══════════════════════════════════════════════════════════════
// RPE Autoregulation
// ═══════════════════════════════════════════════════════════════

// Map exercise to user's working weight by movement pattern
// workingWeights = { bench: 110, squat: 135, deadlift: 155, overhead_press: 75, row: 95 }
// Returns the appropriate working weight scaled by movement similarity
function getUserBaseWeight(exercise, workingWeights) {
  if (!workingWeights) return null;
  const name = (exercise.name || '').toLowerCase();
  const id = (exercise.id || '').toLowerCase();

  // Direct matches — use the exact working weight (it's their 8-10RM)
  if (/^bench\s*press$|^bench_press$/.test(id)) return parseFloat(workingWeights.bench) || null;
  if (/^back\s*squat$|^back_squat$/.test(id)) return parseFloat(workingWeights.squat) || null;
  if (/^deadlift$/.test(id)) return parseFloat(workingWeights.deadlift) || null;
  if (/^overhead_press$|^ohp$/.test(id)) return parseFloat(workingWeights.overhead_press) || null;
  if (/^barbell_row$/.test(id)) return parseFloat(workingWeights.row) || null;

  // Scaled matches — related exercises as % of the primary
  const bench = parseFloat(workingWeights.bench) || 0;
  const squat = parseFloat(workingWeights.squat) || 0;
  const dl = parseFloat(workingWeights.deadlift) || 0;
  const ohp = parseFloat(workingWeights.overhead_press) || 0;
  const row = parseFloat(workingWeights.row) || 0;

  // Bench variants — raised ratios for realism
  if (/incline.*bench|incline.*press/i.test(name)) return bench * 0.80 || null;
  if (/decline.*bench/i.test(name)) return bench * 0.90 || null;
  if (/db.*bench|dumbbell.*bench|db.*press/i.test(name)) return bench * 0.50 || null; // per hand
  if (/floor\s*press/i.test(name)) return bench * 0.85 || null;
  if (/db.*fly|chest\s*fly/i.test(name)) return bench * 0.30 || null;

  // Squat variants
  if (/front\s*squat/i.test(name)) return squat * 0.80 || null;
  if (/goblet/i.test(name)) return squat * 0.55 || null;
  if (/split\s*squat|lunge|step.?up|bulgarian/i.test(name)) return squat * 0.40 || null; // per leg
  if (/leg\s*press/i.test(name)) return squat * 1.20 || null;

  // Deadlift variants
  if (/sumo/i.test(name)) return dl * 0.95 || null;
  if (/romanian|rdl|stiff/i.test(name)) return dl * 0.65 || null;
  if (/trap\s*bar/i.test(name)) return dl * 0.95 || null;
  if (/hip\s*thrust/i.test(name)) return dl * 0.80 || null;
  if (/kb.*swing|kettlebell.*swing/i.test(name)) return dl * 0.35 || null;

  // Overhead variants
  if (/push\s*press/i.test(name)) return ohp * 1.15 || null;
  if (/db.*shoulder|db.*ohp|db.*overhead/i.test(name)) return ohp * 0.50 || null;
  if (/lateral\s*raise/i.test(name)) return ohp * 0.25 || null;
  if (/face\s*pull|reverse\s*fly/i.test(name)) return ohp * 0.25 || null;

  // Row variants
  if (/db.*row|dumbbell.*row/i.test(name)) return row * 0.55 || null;
  if (/cable.*row|seated.*row/i.test(name)) return row * 0.80 || null;
  if (/inverted/i.test(name)) return null; // bodyweight

  // Olympic lifts — scale from deadlift
  if (/power\s*clean|hang.*clean/i.test(name)) return dl * 0.60 || null;
  if (/clean.*jerk/i.test(name)) return dl * 0.55 || null;
  if (/snatch/i.test(name)) return dl * 0.50 || null;
  if (/push\s*jerk/i.test(name)) return ohp * 1.25 || null;

  // Arms — scale from bench
  if (/curl/i.test(name)) return bench * 0.25 || null;
  if (/tricep|skull|pushdown/i.test(name)) return bench * 0.30 || null;

  return null;
}

export function adjustWeightByRpe(currentWeight, rpe, targetRpe = 8) {
  // RPE feedback: Too Easy (5-6), Just Right (7-8), Tough (9), Failed (10)
  const diff = rpe - targetRpe;
  if (diff <= -2) return Math.round((currentWeight * 1.05) / 5) * 5; // too easy, add 5%
  if (diff === -1) return Math.round((currentWeight * 1.025) / 5) * 5; // slightly easy
  if (diff === 0) return currentWeight; // just right
  if (diff === 1) return Math.round((currentWeight * 0.95) / 5) * 5; // tough, reduce 5%
  return Math.round((currentWeight * 0.90) / 5) * 5; // failed, reduce 10%
}

// ═══════════════════════════════════════════════════════════════
// Exercise Sequencing Rules
// ═══════════════════════════════════════════════════════════════

export const SEQUENCING_RULES = {
  // Power/explosive before strength before isolation
  orderPriority: {
    power: 1,       // plyometrics, olympic lifts
    compound: 2,    // squats, deadlifts, presses
    accessory: 3,   // isolation, machines
    core: 4,        // ab work
    conditioning: 5, // cardio, WODs
  },
  // Don't stack these back-to-back
  gripIntensive: ['deadlift', 'row', 'pull_up', 'farmer_walk', 'hang', 'clean', 'snatch', 'kb_swing'],
  // Warmup should prime these patterns
  warmupPatterns: {
    overhead: ['band_pull_apart', 'shoulder_dislocate', 'light_press', 'thoracic_rotation'],
    squat: ['hip_circle', 'goblet_squat', 'ankle_mobility', 'air_squat'],
    hinge: ['hip_hinge', 'glute_bridge', 'hamstring_sweep', 'rdl_light'],
    push: ['push_up', 'band_pull_apart', 'shoulder_rotation', 'light_press'],
    pull: ['band_pull_apart', 'scap_pull_up', 'lat_stretch', 'light_row'],
  },
};

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function isDeloadWeek(weekNumber) {
  return weekNumber > 1 && weekNumber % 4 === 0;
}
