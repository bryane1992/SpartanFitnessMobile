// Beginner Exercise Allowlist
// For experience === 'beginner', ONLY these exercises are allowed
// This prevents obscure ExerciseDB exercises from appearing
// All IDs must exist in exerciseSeed.js or the ExerciseDB sync

// Machine & Cable (safest for beginners, guided motion)
const MACHINE_CABLE = [
  'lat_pulldown', 'machine_chest_press', 'machine_shoulder_press',
  'machine_row', 'leg_press', 'leg_curl', 'leg_extension',
  'machine_dip', 'cable_row', 'cable_fly',
  'cable_tricep_pushdown', 'cable_bicep_curl', 'cable_lateral_raise',
  'cable_pull_through', 'band_assisted_pull_ups',
];

// Dumbbell (versatile, scalable)
const DUMBBELL = [
  'db_bench_press', 'db_incline_press', 'db_shoulder_press',
  'db_row', 'db_curl', 'hammer_curl', 'db_fly',
  'db_walking_lunges', 'goblet_squat', 'db_thrusters',
  'lateral_raise', 'reverse_fly', 'face_pulls',
  'skull_crushers', 'tricep_kickback', 'db_clean_press',
  'split_squat',
];

// Kettlebell
const KETTLEBELL = [
  'kb_swings', 'goblet_squat', 'kb_clean_press',
  'farmer_walk', 'kb_carry', 'overhead_carry',
  'kb_thrusters',
];

// Barbell (intermediate complexity — only for beginners who have some coaching)
const BARBELL_BEGINNER = [
  'bench_press', 'back_squat', 'deadlift', 'overhead_press',
  'barbell_row', 'romanian_deadlift', 'front_squat',
  'floor_press', 'hip_thrust', 'trap_bar_deadlift',
  'sumo_deadlift',
];

// Bodyweight
const BODYWEIGHT = [
  'push_ups', 'air_squats', 'burpees', 'sit_ups',
  'inverted_row', 'step_ups', 'box_jumps',
  'plank', 'dead_bug', 'bird_dog', 'hollow_hold',
  'mountain_climbers', 'bench_dips',
  'jump_rope', 'v_ups',
];

// Warmup & Mobility
const WARMUP_MOBILITY = [
  'easy_jog', 'dynamic_stretching', 'push_up_to_t',
  'lunge_matrix', 'a_skips', 'pvc_pass_throughs',
  'samson_stretch', 'bear_crawl', 'cossack_squats',
  'high_knees', 'strides', 'arm_circles', 'inchworm',
  'hip_flexor_stretch', 'pigeon_pose', 'shoulder_stretch',
  'hamstring_stretch', 'thoracic_rotation',
];

// Cardio
const CARDIO = [
  'easy_jog', 'easy_run', 'tempo_run', 'interval_run',
  'rowing_machine', 'assault_bike',
];

// Combined allowlist
export const BEGINNER_ALLOWLIST = new Set([
  ...MACHINE_CABLE, ...DUMBBELL, ...KETTLEBELL,
  ...BARBELL_BEGINNER, ...BODYWEIGHT, ...WARMUP_MOBILITY, ...CARDIO,
]);

// Check if an exercise is allowed for a beginner
export function isBeginnerAllowed(exerciseId) {
  return BEGINNER_ALLOWLIST.has(exerciseId);
}
