// Test Profiles for Plan Generator
// Run from Settings screen to generate and validate plans for different user types
// Each profile tests a different archetype path through the generator

import { detectArchetype, adjustArchetypeForEquipment } from './archetypes';
import { getRaceRequirements } from './raceRequirements';

export const TEST_PROFILES = {
  spartan_intermediate: {
    label: '200lb Male, Spartan Super, Home Gym',
    expected: 'obstacle_racer — barbell compounds, pulls, carries, WODs, race taper',
    profile: {
      goals: ['endurance', 'athletic', 'build_muscle'],
      sex: 'male',
      height: '5\'11"',
      weight: '200',
      bmi: '27.9',
      experience: 'intermediate',
      workingWeights: { bench: '110', squat: '135', deadlift: '155', overhead_press: '75', row: '95' },
      equipment: ['dumbbells', 'barbell', 'squat_rack', 'bench', 'pull_up_bar', 'kettlebell', 'outdoor'],
      equipmentDetails: { barbell: { maxWeight: '155' }, kettlebell: { weights: '25,35,53' }, dumbbells: { maxWeight: '55' } },
      trainingDaysPerWeek: 5,
      trainingDays: [0, 1, 2, 3, 4],
      sessionDuration: 60,
      workoutStyles: ['hybrid', 'crossfit'],
      bodyCompGoals: ['maintain'],
      exclusions: ['olympic_lift'],
      additionalNotes: 'Training for Spartan Super 10K in 14 weeks. Emphasis on chest and arms.',
    },
  },

  beginner_female_fat_loss: {
    label: '225lb Female Beginner, Fat Loss, Full Gym',
    expected: 'overweight_beginner — machines, circuits, no raw pull-ups, no taper, beginner WODs',
    profile: {
      goals: ['lose_fat', 'general_fitness'],
      sex: 'female',
      height: '5\'6"',
      weight: '225',
      bmi: '36.3',
      experience: 'beginner',
      workingWeights: {},
      equipment: ['dumbbells', 'barbell', 'squat_rack', 'bench', 'pull_up_bar', 'kettlebell', 'cables', 'machines', 'cardio_machines'],
      equipmentDetails: {},
      trainingDaysPerWeek: 4,
      trainingDays: [0, 1, 3, 4],
      sessionDuration: 45,
      workoutStyles: ['hybrid'],
      bodyCompGoals: ['cut'],
      exclusions: ['olympic_lift', 'max_effort'],
      additionalNotes: 'Never worked out before. Want to lose weight and get healthy.',
    },
  },

  runner_female: {
    label: '150lb Female, Half Marathon, Bodyweight Only',
    expected: 'endurance — run-focused, bodyweight strength, endurance periodization',
    profile: {
      goals: ['endurance'],
      sex: 'female',
      height: '5\'5"',
      weight: '150',
      bmi: '25.0',
      experience: 'intermediate',
      workingWeights: {},
      equipment: ['outdoor'],
      equipmentDetails: {},
      trainingDaysPerWeek: 5,
      trainingDays: [0, 1, 2, 3, 4],
      sessionDuration: 60,
      workoutStyles: ['bodyweight'],
      bodyCompGoals: ['maintain'],
      exclusions: [],
      additionalNotes: 'Training for a half marathon in 16 weeks.',
    },
  },

  bodybuilder_male: {
    label: '180lb Male, Hypertrophy, Full Gym',
    expected: 'hypertrophy — push/pull/legs, no conditioning, heavy compounds',
    profile: {
      goals: ['build_muscle', 'get_stronger'],
      sex: 'male',
      height: '5\'10"',
      weight: '180',
      bmi: '25.8',
      experience: 'advanced',
      workingWeights: { bench: '185', squat: '225', deadlift: '315', overhead_press: '115', row: '155' },
      equipment: ['dumbbells', 'barbell', 'squat_rack', 'bench', 'pull_up_bar', 'cables', 'machines'],
      equipmentDetails: { barbell: { maxWeight: '400' }, dumbbells: { maxWeight: '100' } },
      trainingDaysPerWeek: 5,
      trainingDays: [0, 1, 2, 3, 4],
      sessionDuration: 75,
      workoutStyles: ['traditional'],
      bodyCompGoals: ['bulk'],
      exclusions: [],
      additionalNotes: 'Want to add size. Focus on chest, back, and arms.',
    },
  },

  beginner_male_dumbbells: {
    label: '160lb Male Beginner, General Fitness, Dumbbells Only',
    expected: 'general_fitness — full body 3x, simple exercises, DB-only',
    profile: {
      goals: ['general_fitness'],
      sex: 'male',
      height: '5\'9"',
      weight: '160',
      bmi: '23.6',
      experience: 'beginner',
      workingWeights: {},
      equipment: ['dumbbells'],
      equipmentDetails: { dumbbells: { maxWeight: '30' } },
      trainingDaysPerWeek: 3,
      trainingDays: [0, 2, 4],
      sessionDuration: 45,
      workoutStyles: ['hybrid'],
      bodyCompGoals: ['maintain'],
      exclusions: [],
      additionalNotes: 'Just starting out. Want to get in shape.',
    },
  },

  crossfit_female: {
    label: '140lb Female, CrossFit Competition, Full Gym',
    expected: 'obstacle_racer or general — complex WODs, barbell, varied conditioning',
    profile: {
      goals: ['athletic', 'build_muscle', 'endurance'],
      sex: 'female',
      height: '5\'4"',
      weight: '140',
      bmi: '24.0',
      experience: 'advanced',
      workingWeights: { bench: '95', squat: '155', deadlift: '195', overhead_press: '65', row: '85' },
      equipment: ['dumbbells', 'barbell', 'squat_rack', 'bench', 'pull_up_bar', 'kettlebell', 'cables', 'machines', 'cardio_machines'],
      equipmentDetails: { barbell: { maxWeight: '300' }, kettlebell: { weights: '15,25,35,53' }, dumbbells: { maxWeight: '50' } },
      trainingDaysPerWeek: 5,
      trainingDays: [0, 1, 2, 3, 4],
      sessionDuration: 60,
      workoutStyles: ['crossfit'],
      bodyCompGoals: ['maintain'],
      exclusions: [],
      additionalNotes: 'Training for CrossFit competition. Want challenging WODs.',
    },
  },

  heavy_beginner_no_weights: {
    label: '250lb Male Beginner, No Working Weights, Fat Loss, Home Gym',
    expected: 'overweight_beginner — conservative weights, machines if available, assessment onramp',
    profile: {
      goals: ['lose_fat'],
      sex: 'male',
      height: '6\'0"',
      weight: '250',
      bmi: '33.9',
      experience: 'beginner',
      workingWeights: {},
      equipment: ['dumbbells', 'barbell', 'squat_rack', 'bench', 'kettlebell'],
      equipmentDetails: { barbell: { maxWeight: '155' }, dumbbells: { maxWeight: '40' }, kettlebell: { weights: '25,35' } },
      trainingDaysPerWeek: 4,
      trainingDays: [0, 1, 3, 4],
      sessionDuration: 45,
      workoutStyles: ['hybrid'],
      bodyCompGoals: ['cut'],
      exclusions: ['olympic_lift', 'max_effort', 'jumping'],
      additionalNotes: 'Very overweight, want to get started safely.',
    },
  },
};

// Run archetype detection on all profiles and log results
export function testArchetypes() {
  console.log('\n═══════════════════════════════════════');
  console.log('   ARCHETYPE DETECTION TEST');
  console.log('═══════════════════════════════════════\n');

  const results = [];
  for (const [key, test] of Object.entries(TEST_PROFILES)) {
    let arch = detectArchetype(test.profile);
    arch = adjustArchetypeForEquipment(arch, test.profile.equipment);
    const race = getRaceRequirements(test.profile);

    const passed = test.expected.toLowerCase().includes(arch.archetype);
    results.push({ key, passed, archetype: arch.archetype });

    console.log(`${passed ? 'PASS' : 'FAIL'} | ${test.label}`);
    console.log(`  Archetype: ${arch.archetype} (${arch.label})`);
    console.log(`  Split: ${arch.splitModel}`);
    console.log(`  Equipment pref: ${arch.equipmentPreference.slice(0, 3).join(', ')}`);
    console.log(`  Complexity: ${arch.exerciseComplexity}`);
    console.log(`  Periodization: ${arch.periodization}`);
    console.log(`  Conditioning: ${arch.conditioningStyle}`);
    console.log(`  Max WOD difficulty: ${arch.maxWodDifficulty}`);
    console.log(`  BW pull allowed: ${arch.bodyweightPullAllowed}`);
    console.log(`  Race: ${race?.label || 'none'}`);
    console.log(`  Expected: ${test.expected}`);
    console.log('');
  }

  const passCount = results.filter(r => r.passed).length;
  console.log(`═══ ${passCount}/${results.length} passed ═══\n`);
  return results;
}

// Generate a plan for a specific test profile (returns the profile to use with generateAIPlan)
export function getTestProfile(key) {
  const test = TEST_PROFILES[key];
  if (!test) {
    console.error(`Unknown test profile: ${key}. Available: ${Object.keys(TEST_PROFILES).join(', ')}`);
    return null;
  }
  return test.profile;
}
