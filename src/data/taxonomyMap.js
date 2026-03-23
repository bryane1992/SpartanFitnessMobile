// Maps ExerciseDB API data to our local exercises table schema
// RapidAPI format: fields are strings (not arrays like the vercel version)

const BODY_PART_MAP = {
  'chest': 'chest',
  'back': 'back',
  'upper arms': 'arms',
  'lower arms': 'arms',
  'shoulders': 'shoulders',
  'neck': 'shoulders',
  'upper legs': 'legs',
  'lower legs': 'legs',
  'waist': 'core',
  'cardio': 'cardio',
};

const EQUIPMENT_MAP = {
  'barbell': 'barbell',
  'olympic barbell': 'barbell',
  'ez barbell': 'barbell',
  'trap bar': 'barbell',
  'dumbbell': 'dumbbell',
  'cable': 'cable',
  'kettlebell': 'kettlebell',
  'band': 'band',
  'resistance band': 'band',
  'body weight': null, // no equipment needed
  'assisted': null,
  'leverage machine': 'machine',
  'smith machine': 'machine',
  'sled machine': 'machine',
  'stability ball': 'ball',
  'medicine ball': 'ball',
  'bosu ball': 'ball',
  'roller': null,
  'wheel roller': null,
  'rope': 'cable',
  'weighted': null,
  'hammer': 'dumbbell',
  'tire': null,
  'stepmill machine': 'machine',
  'elliptical machine': 'machine',
  'stationary bike': 'machine',
  'skierg machine': 'machine',
  'upper body ergometer': 'machine',
};

const CATEGORY_FROM_EQUIPMENT = {
  'barbell': 'barbell',
  'dumbbell': 'dumbbell',
  'cable': 'cable',
  'kettlebell': 'kettlebell',
  'band': 'band',
  'machine': 'machine',
  'ball': 'bodyweight',
};

const STYLE_TAGS_FROM_CATEGORY = {
  'barbell': ['traditional', 'hybrid'],
  'dumbbell': ['traditional', 'hybrid'],
  'cable': ['traditional', 'hybrid'],
  'machine': ['traditional'],
  'kettlebell': ['crossfit', 'hybrid'],
  'band': ['bodyweight', 'hybrid'],
  'bodyweight': ['bodyweight', 'hybrid', 'crossfit'],
};

const DEFAULTS_BY_CATEGORY = {
  barbell: { sets: 3, reps: '8', weight: '95 lb' },
  dumbbell: { sets: 3, reps: '10', weight: '25 lb' },
  cable: { sets: 3, reps: '12', weight: '40 lb' },
  machine: { sets: 3, reps: '12', weight: '80 lb' },
  kettlebell: { sets: 3, reps: '10', weight: '35 lb' },
  band: { sets: 3, reps: '15', weight: 'BW' },
  bodyweight: { sets: 3, reps: '12', weight: 'BW' },
};

export function mapExerciseDbToLocal(apiExercise) {
  // RapidAPI format: bodyPart/equipment/target are strings, not arrays
  const bodyPart = apiExercise.bodyPart || '';
  const muscleGroup = BODY_PART_MAP[bodyPart.toLowerCase()] || 'full_body';

  const primaryEquip = apiExercise.equipment || 'body weight';
  const mappedEquip = EQUIPMENT_MAP[primaryEquip.toLowerCase()];
  const equipmentRequired = mappedEquip ? [mappedEquip] : [];
  const category = CATEGORY_FROM_EQUIPMENT[mappedEquip] || 'bodyweight';

  const styleTags = STYLE_TAGS_FROM_CATEGORY[category] || ['hybrid'];

  // RapidAPI: target is string, secondaryMuscles is array
  const secondaryMuscles = apiExercise.secondaryMuscles || [];
  const targetMuscle = apiExercise.target || '';
  const targetCount = 1 + secondaryMuscles.length;
  const isCompound = targetCount >= 3 ? 1 : 0;

  const defaults = DEFAULTS_BY_CATEGORY[category] || DEFAULTS_BY_CATEGORY.bodyweight;

  // RapidAPI exercise id is a 4-digit string like "0001"
  const exerciseId = apiExercise.id || apiExercise.exerciseId;

  // Use API difficulty if available, otherwise estimate
  const difficulty = apiExercise.difficulty || 'intermediate';

  return {
    id: `exdb_${exerciseId}`,
    name: titleCase(apiExercise.name || 'Unknown Exercise'),
    emoji: '',
    muscle_group: muscleGroup,
    secondary_muscles: JSON.stringify(secondaryMuscles),
    category,
    style_tags: JSON.stringify(styleTags),
    exclusion_tags: JSON.stringify([]),
    equipment_required: JSON.stringify(equipmentRequired),
    default_sets: defaults.sets,
    default_reps: defaults.reps,
    default_weight: defaults.weight,
    is_compound: isCompound,
    difficulty,
    source: 'exercisedb',
    gif_url: apiExercise.gifUrl || null,
    instructions: JSON.stringify(apiExercise.instructions || []),
    target_muscles: JSON.stringify(targetMuscle ? [targetMuscle] : []),
    body_parts: JSON.stringify(bodyPart ? [bodyPart] : []),
    api_id: exerciseId,
    description: apiExercise.description || null,
  };
}

function titleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}
