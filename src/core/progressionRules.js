// Progression Rules
// Handles weight, volume, and distance progression across weeks

const BODY_COMP_PARAMS = {
  bulk: {
    compoundReps: [4, 6],
    accessoryReps: [8, 10],
    compoundSets: [4, 5],
    accessorySets: [3, 4],
    restSeconds: '90-120s',
    weightMultiplier: 1.1,
    cardioRatio: 0.2,
    wodTimeCap: '15 min',
    description: 'Heavy weight, low reps, max gains',
  },
  cut: {
    compoundReps: [10, 15],
    accessoryReps: [12, 15],
    compoundSets: [3, 4],
    accessorySets: [3, 4],
    restSeconds: '30-60s',
    weightMultiplier: 0.8,
    cardioRatio: 0.4,
    wodTimeCap: '20 min',
    description: 'Higher reps, shorter rest, fat torching',
  },
  maintain: {
    compoundReps: [8, 10],
    accessoryReps: [10, 12],
    compoundSets: [3, 4],
    accessorySets: [3, 3],
    restSeconds: '60-90s',
    weightMultiplier: 1.0,
    cardioRatio: 0.3,
    wodTimeCap: '15 min',
    description: 'Balanced approach, steady progress',
  },
  endurance: {
    compoundReps: [12, 20],
    accessoryReps: [15, 20],
    compoundSets: [2, 3],
    accessorySets: [2, 3],
    restSeconds: '30-45s',
    weightMultiplier: 0.7,
    cardioRatio: 0.5,
    wodTimeCap: '25 min',
    description: 'High rep, stamina focused',
  },
};

const PHASE_MODIFIERS = {
  foundation: {
    intensityMultiplier: 0.7,
    volumeMultiplier: 0.85,
    description: 'Building base, perfecting form',
  },
  build: {
    intensityMultiplier: 0.85,
    volumeMultiplier: 1.0,
    description: 'Progressive overload, pushing limits',
  },
  peak: {
    intensityMultiplier: 1.0,
    volumeMultiplier: 1.1,
    description: 'Maximum intensity, peak performance',
  },
  race_prep: {
    intensityMultiplier: 0.75,
    volumeMultiplier: 0.6,
    description: 'Taper & sharpen, race ready',
  },
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
  return PHASE_MODIFIERS[phase] || PHASE_MODIFIERS.foundation;
}

export function getExperienceMultiplier(experience) {
  return EXPERIENCE_MULTIPLIERS[experience] || EXPERIENCE_MULTIPLIERS.intermediate;
}

// Calculate weight for an exercise based on all factors
export function calculateWeight(exercise, weekNumber, phase, bodyCompGoal, experience) {
  const baseWeight = parseFloat(exercise.default_weight) || 0;
  if (baseWeight === 0 || exercise.default_weight === 'BW') return exercise.default_weight;

  const bodyComp = getBodyCompParams(bodyCompGoal);
  const phaseModifier = getPhaseModifier(phase);
  const expMultiplier = getExperienceMultiplier(experience);

  // Weekly progression: +2.5% per week for compounds, +1.5% for isolation
  const weeklyProgression = exercise.is_compound ? 1.025 : 1.015;
  const weekProgression = Math.pow(weeklyProgression, weekNumber - 1);

  let weight = baseWeight
    * bodyComp.weightMultiplier
    * phaseModifier.intensityMultiplier
    * expMultiplier
    * weekProgression;

  // Deload: reduce by 40%
  if (isDeloadWeek(weekNumber)) {
    weight *= 0.6;
  }

  // Round to nearest 5 lbs
  weight = Math.round(weight / 5) * 5;

  return `${weight} lb`;
}

// Calculate sets and reps based on exercise type and goals
export function calculateSetsReps(exercise, weekNumber, phase, bodyCompGoal) {
  const bodyComp = getBodyCompParams(bodyCompGoal);
  const phaseModifier = getPhaseModifier(phase);

  const isCompound = exercise.is_compound;
  const repRange = isCompound ? bodyComp.compoundReps : bodyComp.accessoryReps;
  const setRange = isCompound ? bodyComp.compoundSets : bodyComp.accessorySets;

  // Progress reps within range over weeks
  const weekInPhase = weekNumber % 4 || 4;
  const repProgress = Math.min(1, (weekInPhase - 1) / 3);
  let reps = Math.round(repRange[0] + (repRange[1] - repRange[0]) * repProgress);
  let sets = setRange[0];

  // Volume progression: add a set every 2 weeks
  if (weekNumber > 2 && weekNumber % 2 === 0) {
    sets = Math.min(setRange[1], sets + 1);
  }

  // Apply phase volume modifier
  sets = Math.max(2, Math.round(sets * phaseModifier.volumeMultiplier));

  // Deload: fewer sets
  if (isDeloadWeek(weekNumber)) {
    sets = Math.max(2, sets - 1);
    reps = repRange[0]; // lower end
  }

  // If exercise has special rep format (e.g., '10 ea', '30s'), preserve it
  const defaultReps = exercise.default_reps || '';
  if (defaultReps.includes('ea') || defaultReps.includes('s') || defaultReps.includes('min') || defaultReps.includes('yd') || defaultReps.includes('m')) {
    return { sets: `${sets}`, reps: defaultReps };
  }

  return { sets: `${sets}`, reps: `${reps}` };
}

// Calculate running parameters
export function calculateRunParams(weekNumber, phase, totalWeeks) {
  const phaseModifier = getPhaseModifier(phase);

  // Base distance in miles, progresses over weeks
  const baseDistance = 2;
  const maxDistance = 6.5;
  const progress = Math.min(1, (weekNumber - 1) / (totalWeeks - 1));
  let distance = baseDistance + (maxDistance - baseDistance) * progress;

  // Phase adjustments
  if (phase === 'race_prep') {
    distance *= 0.85; // taper
  }

  // Deload
  if (isDeloadWeek(weekNumber)) {
    distance *= 0.7;
  }

  distance = Math.round(distance * 10) / 10;

  // Interval count
  const intervals = phase === 'foundation' ? 4 :
                    phase === 'build' ? 6 :
                    phase === 'peak' ? 8 : 6;

  return {
    distance: `${distance} mi`,
    intervals,
    paceType: phase === 'foundation' ? 'EASY' :
              phase === 'build' ? 'MODERATE' :
              phase === 'peak' ? 'RACE PACE' : 'TAPER',
  };
}

function isDeloadWeek(weekNumber) {
  return weekNumber > 1 && weekNumber % 4 === 0;
}
