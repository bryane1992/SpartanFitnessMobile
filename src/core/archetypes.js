// User Archetype Detection
// Classifies user into a training archetype based on profile data
// Sets sensible defaults that the strategy call can refine

const ARCHETYPES = {
  overweight_beginner: {
    label: 'Guided Start',
    splitModel: 'full_body_3x',
    equipmentPreference: ['machine', 'cable', 'dumbbell', 'kettlebell', 'barbell', 'bodyweight'],
    exerciseComplexity: 'simple', // goblet squats, machine rows, no Olympic lifts
    periodization: 'fat_loss',
    conditioningStyle: 'none', // no CrossFit WODs — conditioning via walking/cardio outside plan
    hasTaper: false,
    maxWodDifficulty: 0,
    bodyweightPullAllowed: false, // no raw pull-ups/dips
    repRange: { compound: [10, 15], isolation: [12, 15] },
    restSeconds: '45-60s',
  },
  obstacle_racer: {
    label: 'Obstacle Racer',
    splitModel: 'sport_specific',
    equipmentPreference: ['barbell', 'kettlebell', 'dumbbell', 'bodyweight', 'machine'],
    exerciseComplexity: 'full',
    periodization: 'race',
    conditioningStyle: 'wod',
    hasTaper: true,
    maxWodDifficulty: 3,
    bodyweightPullAllowed: true,
    repRange: { compound: [5, 10], isolation: [8, 12] },
    restSeconds: '90-120s',
  },
  hypertrophy: {
    label: 'Muscle Builder',
    splitModel: 'push_pull_legs',
    equipmentPreference: ['barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'bodyweight'],
    exerciseComplexity: 'full',
    periodization: 'hypertrophy',
    conditioningStyle: 'none',
    hasTaper: false,
    maxWodDifficulty: 2,
    bodyweightPullAllowed: true,
    repRange: { compound: [6, 10], isolation: [10, 15] },
    restSeconds: '60-90s',
  },
  fat_loss: {
    label: 'Fat Loss',
    splitModel: 'full_body_5x',
    equipmentPreference: ['dumbbell', 'kettlebell', 'machine', 'cable', 'barbell', 'bodyweight'],
    exerciseComplexity: 'moderate',
    periodization: 'fat_loss',
    conditioningStyle: 'hiit',
    hasTaper: false,
    maxWodDifficulty: 2,
    bodyweightPullAllowed: true,
    repRange: { compound: [8, 12], isolation: [12, 15] },
    restSeconds: '30-45s',
  },
  endurance: {
    label: 'Endurance Athlete',
    splitModel: 'endurance_focused',
    equipmentPreference: ['bodyweight', 'dumbbell', 'kettlebell', 'barbell', 'machine'],
    exerciseComplexity: 'moderate',
    periodization: 'endurance',
    conditioningStyle: 'steady_state',
    hasTaper: true,
    maxWodDifficulty: 2,
    bodyweightPullAllowed: true,
    repRange: { compound: [8, 12], isolation: [10, 15] },
    restSeconds: '60-90s',
  },
  skinny_beginner: {
    label: 'Muscle Builder (Beginner)',
    splitModel: 'full_body_3x',
    equipmentPreference: ['dumbbell', 'barbell', 'kettlebell', 'bodyweight', 'machine', 'cable'],
    exerciseComplexity: 'moderate',
    periodization: 'hypertrophy',
    conditioningStyle: 'none',
    hasTaper: false,
    maxWodDifficulty: 1,
    bodyweightPullAllowed: true,
    repRange: { compound: [8, 12], isolation: [10, 15] },
    restSeconds: '60-90s',
    minSets: 3,
  },
  general_fitness: {
    label: 'General Fitness',
    splitModel: 'full_body_3x',
    equipmentPreference: ['dumbbell', 'barbell', 'kettlebell', 'machine', 'cable', 'bodyweight'],
    exerciseComplexity: 'moderate',
    periodization: 'general',
    conditioningStyle: 'circuit',
    hasTaper: false,
    maxWodDifficulty: 2,
    bodyweightPullAllowed: true,
    repRange: { compound: [8, 12], isolation: [10, 15] },
    restSeconds: '60-90s',
  },
};

export function detectArchetype(userProfile) {
  const goals = (userProfile.goals || [userProfile.goal || '']).map(g => g.toLowerCase());
  const notes = (userProfile.additionalNotes || '').toLowerCase();
  const experience = (userProfile.experience || 'intermediate').toLowerCase();
  const bmi = parseFloat(userProfile.bmi) || 0;
  const bodyWeight = parseFloat(userProfile.weight) || 0;
  const bodyCompGoals = (userProfile.bodyCompGoals || []).map(g => g.toLowerCase());
  const styles = (userProfile.workoutStyles || []).map(s => s.toLowerCase());

  // Check for race/obstacle mentions
  const hasRace = /spartan|obstacle|mud run|tough mudder|marathon|half marathon|10k|5k|race/i.test(notes + ' ' + goals.join(' '));
  const hasSpartan = /spartan|obstacle/i.test(notes + ' ' + goals.join(' '));

  // Skinny beginner wanting to bulk — needs volume, not conditioning
  const isUnderweight = bmi > 0 && bmi < 22 && experience === 'beginner' && bodyCompGoals.some(g => /bulk/i.test(g));
  if (isUnderweight) {
    return { archetype: 'skinny_beginner', ...ARCHETYPES.skinny_beginner };
  }

  // Overweight beginner — highest priority check
  if (experience === 'beginner' && (bmi >= 30 || bodyWeight >= 220)) {
    return { archetype: 'overweight_beginner', ...ARCHETYPES.overweight_beginner };
  }

  // Obstacle racer
  if (hasSpartan || (hasRace && goals.some(g => /athletic|endurance/i.test(g)))) {
    return { archetype: 'obstacle_racer', ...ARCHETYPES.obstacle_racer };
  }

  // Endurance athlete (runners without obstacles)
  if (hasRace && !hasSpartan && goals.some(g => /endurance/i.test(g))) {
    return { archetype: 'endurance', ...ARCHETYPES.endurance };
  }

  // Hypertrophy / bodybuilding
  if (goals.some(g => /build_muscle|get_stronger/i.test(g)) && bodyCompGoals.some(g => /bulk/i.test(g))) {
    return { archetype: 'hypertrophy', ...ARCHETYPES.hypertrophy };
  }

  // Fat loss
  if (goals.some(g => /lose_fat/i.test(g)) || bodyCompGoals.some(g => /cut/i.test(g))) {
    // Beginner + fat loss = overweight beginner path
    if (experience === 'beginner') {
      return { archetype: 'overweight_beginner', ...ARCHETYPES.overweight_beginner };
    }
    return { archetype: 'fat_loss', ...ARCHETYPES.fat_loss };
  }

  // General fitness (fallback)
  return { archetype: 'general_fitness', ...ARCHETYPES.general_fitness };
}

// Adjust archetype based on equipment available
export function adjustArchetypeForEquipment(archetype, equipment) {
  const equip = new Set((equipment || []).map(e => e.toLowerCase()));
  const hasBarbell = equip.has('barbell') || equip.has('squat_rack');
  const hasMachines = equip.has('machines') || equip.has('cables');
  const hasDumbbells = equip.has('dumbbells');

  // If archetype prefers barbell but user doesn't have one, shift preference
  if (!hasBarbell && archetype.equipmentPreference[0] === 'barbell') {
    archetype.equipmentPreference = hasMachines
      ? ['machine', 'cable', 'dumbbell', 'kettlebell', 'bodyweight']
      : hasDumbbells
        ? ['dumbbell', 'kettlebell', 'bodyweight']
        : ['bodyweight', 'kettlebell'];
  }

  // Beginners with machines should prefer machines for safety
  if (archetype.exerciseComplexity === 'simple' && hasMachines) {
    archetype.equipmentPreference = ['machine', 'cable', 'dumbbell', 'kettlebell', 'barbell', 'bodyweight'];
  }

  return archetype;
}

export { ARCHETYPES };
