// Exercise Ability Filter
// Checks if a user can realistically perform an exercise based on their profile
// Returns the exercise if ok, or a substitution from the same movement pattern

// Substitution chains — same movement pattern, decreasing difficulty
const SUBSTITUTION_CHAINS = {
  // Vertical pull
  pull_ups: ['pull_ups', 'band_assisted_pull_ups', 'lat_pulldown', 'inverted_row'],
  chin_ups: ['chin_ups', 'band_assisted_pull_ups', 'lat_pulldown', 'inverted_row'],
  muscle_ups: ['muscle_ups', 'pull_ups', 'lat_pulldown', 'inverted_row'],

  // Horizontal push
  bench_press: ['bench_press', 'db_bench_press', 'machine_chest_press', 'push_ups'],
  incline_bench: ['incline_bench', 'db_incline_press', 'machine_chest_press', 'push_ups'],

  // Squat pattern
  back_squat: ['back_squat', 'goblet_squat', 'leg_press', 'air_squats'],
  front_squat: ['front_squat', 'goblet_squat', 'leg_press', 'air_squats'],

  // Hinge pattern
  deadlift: ['deadlift', 'trap_bar_deadlift', 'romanian_deadlift', 'kb_swings'],

  // Overhead press
  overhead_press: ['overhead_press', 'db_shoulder_press', 'machine_shoulder_press', 'lateral_raise'],

  // Dips
  dips: ['dips', 'machine_dip', 'tricep_pushdown', 'bench_dips'],
};

// Check if user can perform bodyweight pulling exercises
function canDoBodyweightPull(userProfile) {
  const experience = (userProfile.experience || '').toLowerCase();
  const bodyWeight = parseFloat(userProfile.weight) || 0;
  const sex = (userProfile.sex || '').toLowerCase();

  // Strength-to-weight thresholds for bodyweight pulling
  if (experience === 'beginner') return false; // beginners should use assisted versions
  if (experience === 'intermediate') {
    // Heavier users struggle more with bodyweight movements
    if (sex === 'female' && bodyWeight > 160) return false;
    if (sex === 'male' && bodyWeight > 240) return false;
    return true;
  }
  return true; // advanced/elite can handle it
}

// Check if user should use barbell compounds
function canDoBarbell(userProfile) {
  const experience = (userProfile.experience || '').toLowerCase();
  if (experience === 'beginner') return false; // start with simpler variations
  return true;
}

// Get the best substitute from the chain that the user can actually do
export function getAbilitySubstitute(exerciseId, userProfile, availableExerciseIds) {
  const chain = SUBSTITUTION_CHAINS[exerciseId];
  if (!chain) return exerciseId; // no chain = no restriction

  const available = new Set(availableExerciseIds);
  const canPull = canDoBodyweightPull(userProfile);
  const canBarbell = canDoBarbell(userProfile);

  for (const substitute of chain) {
    // Skip if not in exercise pool
    if (!available.has(substitute)) continue;

    // Check ability constraints
    if (/pull_ups|chin_ups|muscle_ups|dips/.test(substitute) && !canPull) continue;
    if (/^bench_press$|^back_squat$|^front_squat$|^deadlift$|^overhead_press$/.test(substitute) && !canBarbell) continue;

    return substitute;
  }

  return exerciseId; // fallback to original if nothing in chain is available
}

// Filter a full exercise list — replace exercises user can't do with substitutes
export function filterByAbility(exercises, userProfile, pool) {
  const availableIds = new Set(pool.all.map(e => e.id));

  return exercises.map(ex => {
    const sub = getAbilitySubstitute(ex.id, userProfile, availableIds);
    if (sub !== ex.id) {
      const subExercise = pool.all.find(e => e.id === sub);
      if (subExercise) {
        return { ...ex, id: sub, name: subExercise.name, substituted: true, originalId: ex.id };
      }
    }
    return ex;
  });
}

// Score adjustment — exercises the user can't do get penalized in selection
export function getAbilityScore(exercise, userProfile) {
  const canPull = canDoBodyweightPull(userProfile);
  const canBB = canDoBarbell(userProfile);
  const id = exercise.id || '';
  const name = (exercise.name || '').toLowerCase();
  const experience = (userProfile.experience || '').toLowerCase();
  const bodyWeight = parseFloat(userProfile.weight) || 0;

  // Bodyweight pulling — hard exclude for those who can't
  if (/pull_ups|chin_ups|muscle_ups/i.test(id) && !canPull) return -100;
  if (/^dips$/i.test(id) && !canPull) return -50;

  // Hanging exercises require grip strength — exclude for heavy beginners
  if (/toes.?to.?bar|hanging|knee.?raise/i.test(name) && experience === 'beginner' && bodyWeight > 180) return -50;

  // Inverted row is partial bodyweight — penalize for heavy beginners
  if (/inverted.?row/i.test(name) && experience === 'beginner' && bodyWeight > 200) return -30;

  // Ab wheel / rollout — requires significant core strength, not for heavy beginners
  if (/ab.?wheel|rollout/i.test(name) && experience === 'beginner') return -50;

  // Pike push-ups — requires shoulder strength and mobility, not for beginners
  if (/pike.?push/i.test(name) && experience === 'beginner') return -30;

  // Wall balls — requires wall ball equipment and is conditioning, not compound
  if (/wall.?ball/i.test(name) && experience === 'beginner' && bodyWeight > 200) return -30;

  // Jump squats — high impact, dangerous for heavy beginners
  if (/jump.?squat/i.test(name) && experience === 'beginner' && bodyWeight > 200) return -50;

  // Thrusters — complex movement combining squat + press
  if (/thruster/i.test(name) && experience === 'beginner') return -20;

  // Barbell compounds for beginners — penalize but don't hard exclude (goblet squat etc should win via scoring)
  if (/^bench_press$|^back_squat$|^front_squat$|^deadlift$|^overhead_press$/i.test(id) && !canBB) return -30;

  // Complex Olympic lifts for beginners
  if (/clean|snatch|jerk/i.test(name) && experience === 'beginner') return -100;

  // Advanced bodyweight movements for beginners
  if (/pistol|handstand|muscle.?up|ring|l.?sit/i.test(name) && experience === 'beginner') return -50;

  return 0;
}

export { canDoBodyweightPull, canDoBarbell, SUBSTITUTION_CHAINS };
