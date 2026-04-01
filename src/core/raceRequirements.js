// Race Requirements Module
// Defines race-specific profiles and maps them to training requirements

const RACE_PROFILES = {
  spartan_sprint: {
    label: 'Spartan Sprint',
    distance_miles: 3.1,
    obstacles: 20,
    must_include: ['pull_ups', 'burpees', 'farmer_walk', 'dead_hang'],
    grip_work: true,
    carry_progression: { start_meters: 25, peak_meters: 100 },
    obstacle_sim_by_phase: {
      foundation: 1, // times per week
      build: 2,
      peak: 2,
      race_prep: 1,
    },
  },
  spartan_super: {
    label: 'Spartan Super',
    distance_miles: 6.2,
    obstacles: 25,
    must_include: ['pull_ups', 'burpees', 'farmer_walk', 'dead_hang', 'box_jumps', 'wall_balls'],
    grip_work: true,
    carry_progression: { start_meters: 50, peak_meters: 200 },
    obstacle_sim_by_phase: {
      foundation: 1,
      build: 2,
      peak: 3,
      race_prep: 2,
    },
  },
  spartan_beast: {
    label: 'Spartan Beast',
    distance_miles: 13.1,
    obstacles: 30,
    must_include: ['pull_ups', 'burpees', 'farmer_walk', 'dead_hang', 'box_jumps', 'wall_balls', 'rope_climb'],
    grip_work: true,
    carry_progression: { start_meters: 50, peak_meters: 400 },
    obstacle_sim_by_phase: {
      foundation: 1,
      build: 2,
      peak: 3,
      race_prep: 2,
    },
  },
  '5k': {
    label: '5K',
    distance_miles: 3.1,
    obstacles: 0,
    must_include: [],
    grip_work: false,
    carry_progression: null,
    obstacle_sim_by_phase: null,
  },
  '10k': {
    label: '10K',
    distance_miles: 6.2,
    obstacles: 0,
    must_include: [],
    grip_work: false,
    carry_progression: null,
    obstacle_sim_by_phase: null,
  },
  half_marathon: {
    label: 'Half Marathon',
    distance_miles: 13.1,
    obstacles: 0,
    must_include: [],
    grip_work: false,
    carry_progression: null,
    obstacle_sim_by_phase: null,
  },
  marathon: {
    label: 'Marathon',
    distance_miles: 26.2,
    obstacles: 0,
    must_include: [],
    grip_work: false,
    carry_progression: null,
    obstacle_sim_by_phase: null,
  },
};

// Detect race type from goals and free-text notes
function detectRaceType(goals, additionalNotes) {
  const all = `${(goals || []).join(' ')} ${additionalNotes || ''}`.toLowerCase();

  if (all.includes('spartan beast') || all.includes('21k')) return 'spartan_beast';
  if (all.includes('spartan super') || (all.includes('spartan') && all.includes('10k'))) return 'spartan_super';
  if (all.includes('spartan sprint') || (all.includes('spartan') && all.includes('5k'))) return 'spartan_sprint';
  if (all.includes('spartan')) return 'spartan_super'; // default Spartan = Super
  if (all.includes('marathon') && !all.includes('half')) return 'marathon';
  if (all.includes('half marathon') || all.includes('half-marathon')) return 'half_marathon';
  if (all.includes('10k') || all.includes('10 k')) return '10k';
  if (all.includes('5k') || all.includes('5 k')) return '5k';

  return null;
}

// Map must-include movement names to exercise IDs available in exerciseSeed
const MOVEMENT_TO_EXERCISES = {
  pull_ups: ['pull_ups', 'chin_ups', 'inverted_row'],
  burpees: ['burpees'],
  farmer_walk: ['farmer_walk', 'kb_carry'],
  dead_hang: ['dead_hang'],
  box_jumps: ['box_jumps'],
  wall_balls: ['wall_balls'],
  rope_climb: ['rope_climb', 'towel_pull_ups', 'pull_ups'], // fallback if no rope
};

export function getRaceRequirements(userProfile) {
  const goals = userProfile.goals || [userProfile.goal];
  const notes = userProfile.additionalNotes || '';
  const raceType = detectRaceType(goals, notes);

  if (!raceType) return null;
  return { ...RACE_PROFILES[raceType], type: raceType };
}

export function getRaceExerciseRequirements(raceProfile, userEquipment) {
  if (!raceProfile) return [];
  const equip = new Set((userEquipment || []).map(e => e.toLowerCase()));
  const requirements = [];

  for (const movement of raceProfile.must_include) {
    const exerciseOptions = MOVEMENT_TO_EXERCISES[movement] || [movement];
    requirements.push({
      movement,
      min_frequency_per_week: 1,
      exercises: exerciseOptions,
    });
  }

  if (raceProfile.grip_work) {
    requirements.push({
      movement: 'grip',
      min_frequency_per_week: 2,
      exercises: ['dead_hang', 'farmer_walk'],
    });
  }

  if (raceProfile.carry_progression) {
    requirements.push({
      movement: 'carry',
      min_frequency_per_week: 1,
      exercises: equip.has('kettlebell') ? ['farmer_walk', 'kb_carry'] : ['farmer_walk'],
      progression: raceProfile.carry_progression,
    });
  }

  return requirements;
}

export function getRaceDistance(userProfile) {
  const race = getRaceRequirements(userProfile);
  if (race) return race.distance_miles;

  // Fallback: check goals for endurance/athletic
  const goals = (userProfile.goals || [userProfile.goal || '']).join(' ').toLowerCase();
  if (/endurance|athletic/i.test(goals)) return 6.2;
  return null;
}

export { RACE_PROFILES };
