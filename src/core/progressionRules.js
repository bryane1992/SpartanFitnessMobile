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

export function calculateWeight(exercise, weekNumber, phase, bodyCompGoal, experience, equipmentDetails) {
  const baseWeight = parseFloat(exercise.default_weight) || 0;
  if (baseWeight === 0 || exercise.default_weight === 'BW') return exercise.default_weight;

  const bodyComp = getBodyCompParams(bodyCompGoal);
  const mesoPhase = getMesocyclePhase(weekNumber);
  const expMultiplier = getExperienceMultiplier(experience);

  // Weekly progression: +2.5% per week for compounds, +1.5% for isolation
  const weeklyProgression = exercise.is_compound ? 1.025 : 1.015;
  const weekProgression = Math.pow(weeklyProgression, weekNumber - 1);

  let weight = baseWeight
    * bodyComp.weightMultiplier
    * mesoPhase.intensityMultiplier
    * expMultiplier
    * weekProgression;

  // Deload: reduce by 40%
  if (isDeloadWeek(weekNumber)) {
    weight *= 0.6;
  }

  // Round to nearest 5 lbs
  weight = Math.round(weight / 5) * 5;

  // Cap to equipment limits
  if (equipmentDetails) {
    const category = exercise.category;
    if (category === 'barbell' && equipmentDetails.barbell?.maxWeight) {
      const maxLoad = parseFloat(equipmentDetails.barbell.maxWeight);
      if (weight > maxLoad) weight = Math.round(maxLoad / 5) * 5;
    }
    if (category === 'kettlebell' && equipmentDetails.kettlebell?.weights) {
      const kbWeights = equipmentDetails.kettlebell.weights.split(',').map(w => parseFloat(w.trim())).filter(w => w > 0).sort((a, b) => a - b);
      if (kbWeights.length > 0) {
        // Find closest available KB weight
        const closest = kbWeights.reduce((prev, curr) => Math.abs(curr - weight) < Math.abs(prev - weight) ? curr : prev);
        weight = closest;
      }
    }
    if (category === 'dumbbell' && equipmentDetails.dumbbells?.weights) {
      const dbWeights = equipmentDetails.dumbbells.weights.split(',').map(w => parseFloat(w.trim())).filter(w => w > 0).sort((a, b) => a - b);
      if (dbWeights.length > 0) {
        const closest = dbWeights.reduce((prev, curr) => Math.abs(curr - weight) < Math.abs(prev - weight) ? curr : prev);
        weight = closest;
      }
    }
  }

  return `${weight} lb`;
}

// ═══════════════════════════════════════════════════════════════
// Sets, Reps & Tempo
// ═══════════════════════════════════════════════════════════════

export function calculateSetsReps(exercise, weekNumber, phase, bodyCompGoal) {
  const bodyComp = getBodyCompParams(bodyCompGoal);
  const mesoPhase = getMesocyclePhase(weekNumber);

  const isCompound = exercise.is_compound;
  const repRange = isCompound ? bodyComp.compoundReps : bodyComp.accessoryReps;
  const setRange = isCompound ? bodyComp.compoundSets : bodyComp.accessorySets;

  // Progress reps within range over the 4-week block
  const weekInPhase = weekNumber % 4 || 4;
  const repProgress = Math.min(1, (weekInPhase - 1) / 3);
  let reps = Math.round(repRange[0] + (repRange[1] - repRange[0]) * repProgress);
  let sets = setRange[0];

  // Volume progression: add a set every 2 weeks
  if (weekNumber > 2 && weekNumber % 2 === 0) {
    sets = Math.min(setRange[1], sets + 1);
  }

  // Apply mesocycle volume modifier
  sets = Math.max(2, Math.round(sets * mesoPhase.volumeMultiplier));

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

export function calculateRunParams(weekNumber, phase, totalWeeks) {
  const mesoPhase = getMesocyclePhase(weekNumber);

  const baseDistance = 2;
  const maxDistance = 6.5;
  const progress = Math.min(1, (weekNumber - 1) / (totalWeeks - 1));
  let distance = baseDistance + (maxDistance - baseDistance) * progress;

  if (phase === 'race_prep') distance *= 0.85;
  if (isDeloadWeek(weekNumber)) distance *= 0.7;

  distance = Math.round(distance * 10) / 10;

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
