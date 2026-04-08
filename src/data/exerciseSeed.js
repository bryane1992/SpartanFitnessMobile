//  Spartan Fitness Exercise Catalog
// ~136 exercises with muscle groups, style tags, exclusion tags, and alternatives

// Derive movement pattern from exercise properties — used by v5 menu builder
// Patterns: horizontal_push, horizontal_pull, vertical_push, vertical_pull,
//           squat, hinge, carry, core, arm_push, arm_pull, plyometric, cardio, warmup
export function getMovementPattern(exercise) {
  const id = (exercise.id || '').toLowerCase();
  const name = (exercise.name || '').toLowerCase();
  const mg = (exercise.muscle_group || '').toLowerCase();

  // Explicit overrides for ambiguous exercises
  const PATTERN_MAP = {
    // Horizontal push
    bench_press: 'horizontal_push', incline_bench: 'horizontal_push', db_bench_press: 'horizontal_push',
    db_incline_press: 'horizontal_push', push_ups: 'horizontal_push', db_fly: 'horizontal_push',
    cable_fly: 'horizontal_push', machine_chest_press: 'horizontal_push', machine_dip: 'horizontal_push',
    floor_press: 'horizontal_push', dips: 'horizontal_push',
    // Horizontal pull
    barbell_row: 'horizontal_pull', db_row: 'horizontal_pull', cable_row: 'horizontal_pull',
    machine_row: 'horizontal_pull', inverted_row: 'horizontal_pull', monkey_bars: 'horizontal_pull',
    // Vertical push
    overhead_press: 'vertical_push', db_shoulder_press: 'vertical_push', push_press: 'vertical_push',
    db_push_press: 'vertical_push', machine_shoulder_press: 'vertical_push',
    pike_push_ups: 'vertical_push', handstand_push_ups: 'vertical_push',
    push_jerk: 'vertical_push',
    // Vertical pull
    pull_ups: 'vertical_pull', chin_ups: 'vertical_pull', lat_pulldown: 'vertical_pull',
    band_assisted_pull_ups: 'vertical_pull', muscle_ups: 'vertical_pull',
    rope_climb: 'vertical_pull', dead_hang: 'vertical_pull', towel_pull_ups: 'vertical_pull',
    // Squat
    back_squat: 'squat', front_squat: 'squat', air_squats: 'squat', goblet_squat: 'squat',
    db_goblet_squat: 'squat', kb_goblet_squat: 'squat', pistol_squats: 'squat',
    leg_press: 'squat', split_squat: 'squat', db_walking_lunges: 'squat',
    db_lunges: 'squat', step_ups: 'squat', cossack_squats: 'squat', lunge_matrix: 'squat',
    wall_balls: 'plyometric', leg_extension: 'squat', barbell_thrusters: 'squat',
    db_thrusters: 'squat', kb_thrusters: 'squat',
    // Hinge
    deadlift: 'hinge', trap_bar_deadlift: 'hinge', romanian_deadlift: 'hinge',
    sumo_deadlift: 'hinge', hip_thrust: 'hinge', kb_swings: 'hinge',
    cable_pull_through: 'hinge', leg_curl: 'hinge',
    // Carry
    farmer_walk: 'carry', kb_carry: 'carry', overhead_carry: 'carry',
    sandbag_carry: 'carry', bucket_carry: 'carry',
    // Core
    plank: 'core', plank_to_pushup: 'core', v_ups: 'core', russian_twists: 'core',
    sit_ups: 'core', hanging_knee_raise: 'core', pallof_press: 'core',
    ab_wheel: 'core', dead_bug: 'core', mountain_climbers: 'core',
    toes_to_bar: 'core', bird_dog: 'core', hollow_hold: 'core',
    // Arm push (tricep)
    skull_crushers: 'arm_push', cable_tricep_pushdown: 'arm_push', bench_dips: 'arm_push',
    tricep_kickback: 'arm_push',
    // Arm pull (bicep)
    db_curl: 'arm_pull', hammer_curl: 'arm_pull', cable_bicep_curl: 'arm_pull',
    bicep_curl: 'arm_pull',
    // Shoulder isolation
    lateral_raise: 'vertical_push', reverse_fly: 'horizontal_pull', face_pulls: 'horizontal_pull',
    cable_lateral_raise: 'vertical_push',
    // Plyometric
    box_jumps: 'plyometric', jump_squats: 'plyometric', burpees: 'plyometric',
    broad_jump: 'plyometric', burpee_box_jumps: 'plyometric',
    ball_slams: 'plyometric', battle_ropes: 'plyometric',
    // Cardio
    easy_jog: 'cardio', easy_run: 'cardio', tempo_run: 'cardio', interval_run: 'cardio',
    strides: 'cardio', high_knees: 'cardio', a_skips: 'cardio',
    rowing_machine: 'cardio', assault_bike: 'cardio', jump_rope: 'cardio', double_unders: 'cardio',
    // Warmup / Mobility
    dynamic_stretching: 'warmup', pvc_pass_throughs: 'warmup', samson_stretch: 'warmup',
    push_up_to_t: 'warmup', bear_crawl: 'warmup', inchworm: 'warmup', arm_circles: 'warmup',
    hip_flexor_stretch: 'warmup', pigeon_pose: 'warmup', shoulder_stretch: 'warmup',
    hamstring_stretch: 'warmup', thoracic_rotation: 'warmup',
    // Olympic
    power_clean: 'olympic', hang_clean: 'olympic', snatch: 'olympic',
    clean_and_jerk: 'olympic', kb_snatch: 'olympic', db_hang_clean: 'olympic',
    kb_clean_press: 'olympic', db_clean_press: 'olympic',
    // Gap-fill exercises
    glute_bridge: 'hinge', back_extension: 'hinge', good_morning: 'hinge',
    db_romanian_deadlift: 'hinge', db_single_leg_deadlift: 'hinge',
    single_leg_glute_bridge: 'hinge', db_hip_thrust: 'hinge',
    db_swing: 'hinge', db_good_morning: 'hinge',
    db_floor_press: 'horizontal_push', db_arnold_press: 'vertical_push',
    db_seal_row: 'horizontal_pull',
    straight_arm_pulldown: 'vertical_pull', close_grip_lat_pulldown: 'vertical_pull',
    chest_supported_row: 'horizontal_pull', single_arm_cable_row: 'horizontal_pull',
    db_farmer_walk: 'carry', plate_carry: 'carry',
    preacher_curl: 'arm_pull', concentration_curl: 'arm_pull',
    overhead_tricep_ext: 'arm_push', close_grip_bench: 'arm_push',
    incline_machine_press: 'horizontal_push',
    cable_woodchop: 'core', bird_dog: 'core',
    // Rehab/mobility — never main lifts
    cat_cow: 'warmup', child_pose: 'warmup', cobra_stretch: 'warmup', superman_hold: 'warmup',
    lat_stretch: 'warmup', calf_stretch_wall: 'warmup', seated_calf_stretch: 'warmup',
    tibialis_raise: 'warmup', ankle_circles: 'warmup', toe_walks: 'warmup', heel_walks: 'warmup',
    calf_raise_bodyweight: 'warmup', quad_stretch: 'warmup', knee_circles: 'warmup',
    wall_sit: 'warmup', terminal_knee_ext: 'warmup', banded_lateral_walk: 'warmup',
    hip_90_90: 'warmup', glute_stretch_seated: 'warmup', clam_shells: 'warmup',
    fire_hydrants: 'warmup', adductor_stretch: 'warmup',
    band_pull_apart: 'warmup', shoulder_ext_rotation: 'warmup', shoulder_int_rotation: 'warmup',
    wall_angels: 'warmup', arm_circles: 'warmup', chest_doorway_stretch: 'warmup',
    wrist_circles: 'warmup', wrist_flexor_stretch: 'warmup', neck_stretch: 'warmup',
  };

  if (PATTERN_MAP[id]) return PATTERN_MAP[id];

  // Fallback heuristics
  if (mg === 'chest') return 'horizontal_push';
  if (mg === 'back') return /pull.?up|pulldown|chin|hang/i.test(name) ? 'vertical_pull' : 'horizontal_pull';
  if (mg === 'shoulders') return 'vertical_push';
  if (mg === 'legs' || mg === 'glutes') return /squat|lunge|press|step|split|pistol/i.test(name) ? 'squat' : 'hinge';
  if (mg === 'core') return 'core';
  if (mg === 'arms') return /curl|bicep/i.test(name) ? 'arm_pull' : 'arm_push';
  if (mg === 'full_body') return /carry|farmer|suitcase/i.test(name) ? 'carry' : /clean|snatch|jerk/i.test(name) ? 'olympic' : 'plyometric';
  if (mg === 'cardio') return 'cardio';

  return 'core'; // safe fallback
}

export function seedExercises() {
  return [
    // ═══════════════════════════════════════════════════════════
    //  BARBELL COMPOUNDS
    // ═══════════════════════════════════════════════════════════
    { id: 'bench_press', name: 'Bench Press', emoji: '', muscle_group: 'chest', secondary_muscles: ['triceps', 'shoulders'], category: 'barbell', style_tags: ['traditional', 'hybrid', 'crossfit'], exclusion_tags: [], equipment_required: ['barbell', 'bench'], default_sets: 5, default_reps: '5', default_weight: '135 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'incline_bench', name: 'Incline Bench Press', emoji: '', muscle_group: 'chest', secondary_muscles: ['shoulders', 'triceps'], category: 'barbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['barbell', 'bench'], default_sets: 4, default_reps: '8', default_weight: '95 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'back_squat', name: 'Back Squat', emoji: '', muscle_group: 'legs', secondary_muscles: ['core', 'glutes'], category: 'barbell', style_tags: ['traditional', 'crossfit', 'hybrid'], exclusion_tags: [], equipment_required: ['barbell', 'rack'], default_sets: 5, default_reps: '5', default_weight: '135 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'front_squat', name: 'Front Squat', emoji: '', muscle_group: 'legs', secondary_muscles: ['core', 'shoulders'], category: 'barbell', style_tags: ['traditional', 'crossfit', 'hybrid'], exclusion_tags: [], equipment_required: ['barbell', 'rack'], default_sets: 4, default_reps: '6', default_weight: '95 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'deadlift', name: 'Deadlift', emoji: '', muscle_group: 'back', secondary_muscles: ['legs', 'core', 'glutes'], category: 'barbell', style_tags: ['traditional', 'crossfit', 'hybrid'], exclusion_tags: [], equipment_required: ['barbell'], default_sets: 5, default_reps: '5', default_weight: '185 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'trap_bar_deadlift', name: 'Trap Bar Deadlift', emoji: '', muscle_group: 'back', secondary_muscles: ['legs', 'core'], category: 'barbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['trap_bar'], default_sets: 5, default_reps: '5', default_weight: '155 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'overhead_press', name: 'Overhead Press', emoji: '', muscle_group: 'shoulders', secondary_muscles: ['triceps', 'core'], category: 'barbell', style_tags: ['traditional', 'crossfit', 'hybrid'], exclusion_tags: ['overhead'], equipment_required: ['barbell'], default_sets: 4, default_reps: '6', default_weight: '75 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'barbell_row', name: 'Barbell Row', emoji: '', muscle_group: 'back', secondary_muscles: ['biceps', 'core'], category: 'barbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['barbell'], default_sets: 4, default_reps: '8', default_weight: '95 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'romanian_deadlift', name: 'Romanian Deadlift', emoji: '', muscle_group: 'legs', secondary_muscles: ['back', 'glutes'], category: 'barbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['barbell'], default_sets: 4, default_reps: '8', default_weight: '115 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'hip_thrust', name: 'Barbell Hip Thrust', emoji: '', muscle_group: 'glutes', secondary_muscles: ['legs'], category: 'barbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['barbell', 'bench'], default_sets: 4, default_reps: '10', default_weight: '135 lb', is_compound: true, difficulty: 'intermediate' },

    // ═══════════════════════════════════════════════════════════
    //  OLYMPIC LIFTS (excluded by 'olympic_lift' tag)
    // ═══════════════════════════════════════════════════════════
    { id: 'power_clean', name: 'Power Clean', emoji: '', muscle_group: 'full_body', secondary_muscles: ['legs', 'back', 'shoulders'], category: 'barbell', style_tags: ['crossfit', 'hybrid'], exclusion_tags: ['olympic_lift'], equipment_required: ['barbell'], default_sets: 5, default_reps: '3', default_weight: '95 lb', is_compound: true, difficulty: 'advanced' },
    { id: 'hang_clean', name: 'Hang Power Clean', emoji: '', muscle_group: 'full_body', secondary_muscles: ['legs', 'back'], category: 'barbell', style_tags: ['crossfit', 'hybrid'], exclusion_tags: ['olympic_lift'], equipment_required: ['barbell'], default_sets: 5, default_reps: '3', default_weight: '75 lb', is_compound: true, difficulty: 'advanced' },
    { id: 'push_jerk', name: 'Push Jerk', emoji: '', muscle_group: 'shoulders', secondary_muscles: ['legs', 'triceps'], category: 'barbell', style_tags: ['crossfit', 'hybrid'], exclusion_tags: ['olympic_lift', 'overhead'], equipment_required: ['barbell'], default_sets: 5, default_reps: '3', default_weight: '85 lb', is_compound: true, difficulty: 'advanced' },
    { id: 'snatch', name: 'Snatch', emoji: '', muscle_group: 'full_body', secondary_muscles: ['shoulders', 'back', 'legs'], category: 'barbell', style_tags: ['crossfit'], exclusion_tags: ['olympic_lift', 'overhead'], equipment_required: ['barbell'], default_sets: 5, default_reps: '2', default_weight: '65 lb', is_compound: true, difficulty: 'elite' },
    { id: 'clean_and_jerk', name: 'Clean and Jerk', emoji: '', muscle_group: 'full_body', secondary_muscles: ['legs', 'shoulders', 'back'], category: 'barbell', style_tags: ['crossfit'], exclusion_tags: ['olympic_lift', 'overhead'], equipment_required: ['barbell'], default_sets: 5, default_reps: '2', default_weight: '95 lb', is_compound: true, difficulty: 'elite' },

    // ═══════════════════════════════════════════════════════════
    //  DUMBBELL EXERCISES
    // ═══════════════════════════════════════════════════════════
    { id: 'db_bench_press', name: 'DB Bench Press', emoji: '', muscle_group: 'chest', secondary_muscles: ['triceps', 'shoulders'], category: 'dumbbell', style_tags: ['traditional', 'hybrid', 'crossfit'], exclusion_tags: [], equipment_required: ['dumbbell', 'bench'], default_sets: 4, default_reps: '10', default_weight: '40 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'db_incline_press', name: 'DB Incline Press', emoji: '', muscle_group: 'chest', secondary_muscles: ['shoulders', 'triceps'], category: 'dumbbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell', 'bench'], default_sets: 3, default_reps: '10', default_weight: '35 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'db_shoulder_press', name: 'DB Shoulder Press', emoji: '', muscle_group: 'shoulders', secondary_muscles: ['triceps'], category: 'dumbbell', style_tags: ['traditional', 'hybrid', 'crossfit'], exclusion_tags: ['overhead'], equipment_required: ['dumbbell'], default_sets: 4, default_reps: '8', default_weight: '30 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'db_row', name: 'DB Row', emoji: '', muscle_group: 'back', secondary_muscles: ['biceps'], category: 'dumbbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell'], default_sets: 4, default_reps: '10', default_weight: '40 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'db_lunges', name: 'DB Walking Lunges', emoji: '', muscle_group: 'legs', secondary_muscles: ['glutes', 'core'], category: 'dumbbell', style_tags: ['traditional', 'hybrid', 'crossfit'], exclusion_tags: [], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '10 ea', default_weight: '30 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'db_thrusters', name: 'DB Thrusters', emoji: '', muscle_group: 'full_body', secondary_muscles: ['legs', 'shoulders'], category: 'dumbbell', style_tags: ['crossfit', 'hybrid'], exclusion_tags: ['overhead'], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '12', default_weight: '30 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'db_snatches', name: 'DB Snatches', emoji: '', muscle_group: 'full_body', secondary_muscles: ['shoulders', 'back'], category: 'dumbbell', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '10 alt', default_weight: '35 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'db_clean_press', name: 'DB Clean & Press', emoji: '', muscle_group: 'full_body', secondary_muscles: ['shoulders', 'legs'], category: 'dumbbell', style_tags: ['crossfit', 'hybrid'], exclusion_tags: ['overhead'], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '8', default_weight: '35 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'db_goblet_squat', name: 'Goblet Squat', emoji: '', muscle_group: 'legs', secondary_muscles: ['core', 'glutes'], category: 'dumbbell', style_tags: ['crossfit', 'traditional', 'hybrid', 'bodyweight'], exclusion_tags: [], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '12', default_weight: '40 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'lateral_raise', name: 'Lateral Raise', emoji: '', muscle_group: 'shoulders', secondary_muscles: [], category: 'dumbbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '12', default_weight: '15 lb', is_compound: false, difficulty: 'beginner' },
    { id: 'bicep_curl', name: 'Bicep Curl', emoji: '', muscle_group: 'arms', secondary_muscles: [], category: 'dumbbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '12', default_weight: '25 lb', is_compound: false, difficulty: 'beginner' },
    { id: 'hammer_curl', name: 'Hammer Curl', emoji: '', muscle_group: 'arms', secondary_muscles: [], category: 'dumbbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '12', default_weight: '25 lb', is_compound: false, difficulty: 'beginner' },
    { id: 'skull_crushers', name: 'Skull Crushers', emoji: '', muscle_group: 'arms', secondary_muscles: [], category: 'dumbbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell', 'bench'], default_sets: 3, default_reps: '10', default_weight: '20 lb', is_compound: false, difficulty: 'beginner' },
    { id: 'db_fly', name: 'DB Chest Fly', emoji: '', muscle_group: 'chest', secondary_muscles: [], category: 'dumbbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell', 'bench'], default_sets: 3, default_reps: '12', default_weight: '25 lb', is_compound: false, difficulty: 'beginner' },
    { id: 'db_reverse_fly', name: 'Reverse Fly', emoji: '', muscle_group: 'shoulders', secondary_muscles: ['back'], category: 'dumbbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '12', default_weight: '15 lb', is_compound: false, difficulty: 'beginner' },

    // ═══════════════════════════════════════════════════════════
    //  KETTLEBELL EXERCISES
    // ═══════════════════════════════════════════════════════════
    { id: 'kb_swings', name: 'KB Swings', emoji: '', muscle_group: 'full_body', secondary_muscles: ['glutes', 'back', 'core'], category: 'kettlebell', style_tags: ['crossfit', 'hybrid', 'bodyweight'], exclusion_tags: [], equipment_required: ['kettlebell'], default_sets: 3, default_reps: '15', default_weight: '35 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'kb_goblet_squat', name: 'KB Goblet Squat', emoji: '', muscle_group: 'legs', secondary_muscles: ['core'], category: 'kettlebell', style_tags: ['crossfit', 'hybrid', 'bodyweight'], exclusion_tags: [], equipment_required: ['kettlebell'], default_sets: 3, default_reps: '12', default_weight: '35 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'kb_clean_press', name: 'KB Clean & Press', emoji: '', muscle_group: 'full_body', secondary_muscles: ['shoulders', 'core'], category: 'kettlebell', style_tags: ['crossfit', 'hybrid'], exclusion_tags: ['overhead'], equipment_required: ['kettlebell'], default_sets: 3, default_reps: '8 ea', default_weight: '26 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'kb_snatch', name: 'KB Snatch', emoji: '', muscle_group: 'full_body', secondary_muscles: ['shoulders', 'back'], category: 'kettlebell', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: ['kettlebell'], default_sets: 3, default_reps: '8 ea', default_weight: '26 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'turkish_getup', name: 'Turkish Get-Up', emoji: '', muscle_group: 'full_body', secondary_muscles: ['core', 'shoulders'], category: 'kettlebell', style_tags: ['crossfit', 'hybrid'], exclusion_tags: ['overhead'], equipment_required: ['kettlebell'], default_sets: 3, default_reps: '3 ea', default_weight: '26 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'kb_thruster', name: 'KB Thruster', emoji: '', muscle_group: 'full_body', secondary_muscles: ['legs', 'shoulders'], category: 'kettlebell', style_tags: ['crossfit', 'hybrid'], exclusion_tags: ['overhead'], equipment_required: ['kettlebell'], default_sets: 3, default_reps: '10', default_weight: '26 lb', is_compound: true, difficulty: 'beginner' },

    // ═══════════════════════════════════════════════════════════
    //  BODYWEIGHT EXERCISES
    // ═══════════════════════════════════════════════════════════
    { id: 'push_ups', name: 'Push-Ups', emoji: '', muscle_group: 'chest', secondary_muscles: ['triceps', 'shoulders', 'core'], category: 'bodyweight', style_tags: ['bodyweight', 'crossfit', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '15', default_weight: 'BW', is_compound: true, difficulty: 'beginner' },
    { id: 'pull_ups', name: 'Pull-Ups', emoji: '', muscle_group: 'back', secondary_muscles: ['biceps', 'core'], category: 'bodyweight', style_tags: ['bodyweight', 'crossfit', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '8', default_weight: 'BW', is_compound: true, difficulty: 'intermediate' },
    { id: 'chin_ups', name: 'Chin-Ups', emoji: '', muscle_group: 'back', secondary_muscles: ['biceps'], category: 'bodyweight', style_tags: ['bodyweight', 'crossfit', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '8', default_weight: 'BW', is_compound: true, difficulty: 'intermediate' },
    { id: 'dips', name: 'Dips', emoji: '', muscle_group: 'chest', secondary_muscles: ['triceps', 'shoulders'], category: 'bodyweight', style_tags: ['bodyweight', 'crossfit', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '10', default_weight: 'BW', is_compound: true, difficulty: 'intermediate' },
    { id: 'burpees', name: 'Burpees', emoji: '', muscle_group: 'full_body', secondary_muscles: ['chest', 'legs', 'core'], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '10', default_weight: 'BW', is_compound: true, difficulty: 'beginner' },
    { id: 'air_squats', name: 'Air Squats', emoji: '', muscle_group: 'legs', secondary_muscles: ['glutes'], category: 'bodyweight', style_tags: ['bodyweight', 'crossfit', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '20', default_weight: 'BW', is_compound: true, difficulty: 'beginner' },
    { id: 'jump_squats', name: 'Jump Squats', emoji: '', muscle_group: 'legs', secondary_muscles: ['glutes', 'core'], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight', 'hybrid'], exclusion_tags: ['jumping'], equipment_required: [], default_sets: 3, default_reps: '12', default_weight: 'BW', is_compound: true, difficulty: 'beginner' },
    { id: 'pistol_squats', name: 'Pistol Squats', emoji: '', muscle_group: 'legs', secondary_muscles: ['core', 'glutes'], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '5 ea', default_weight: 'BW', is_compound: true, difficulty: 'advanced' },
    { id: 'bear_crawl', name: 'Bear Crawl', emoji: '', muscle_group: 'full_body', secondary_muscles: ['core', 'shoulders'], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '20 steps', default_weight: 'BW', is_compound: true, difficulty: 'beginner' },
    { id: 'mountain_climbers', name: 'Mountain Climbers', emoji: '', muscle_group: 'core', secondary_muscles: ['shoulders', 'legs'], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '20 ea', default_weight: 'BW', is_compound: true, difficulty: 'beginner' },
    { id: 'pike_push_ups', name: 'Pike Push-Ups', emoji: '', muscle_group: 'shoulders', secondary_muscles: ['triceps'], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: ['overhead'], equipment_required: [], default_sets: 3, default_reps: '10', default_weight: 'BW', is_compound: true, difficulty: 'intermediate' },
    { id: 'handstand_push_ups', name: 'Handstand Push-Ups', emoji: '', muscle_group: 'shoulders', secondary_muscles: ['triceps', 'core'], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight'], exclusion_tags: ['overhead'], equipment_required: [], default_sets: 3, default_reps: '5', default_weight: 'BW', is_compound: true, difficulty: 'advanced' },
    { id: 'muscle_ups', name: 'Muscle-Ups', emoji: '', muscle_group: 'full_body', secondary_muscles: ['back', 'chest', 'triceps'], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight'], exclusion_tags: [], equipment_required: ['rings'], default_sets: 3, default_reps: '3', default_weight: 'BW', is_compound: true, difficulty: 'elite' },
    { id: 'inverted_row', name: 'Inverted Row', emoji: '', muscle_group: 'back', secondary_muscles: ['biceps'], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: ['rack'], default_sets: 3, default_reps: '12', default_weight: 'BW', is_compound: true, difficulty: 'beginner' },

    // ═══════════════════════════════════════════════════════════
    //  CORE EXERCISES
    // ═══════════════════════════════════════════════════════════
    { id: 'plank', name: 'Plank', emoji: '', muscle_group: 'core', secondary_muscles: [], category: 'bodyweight', style_tags: ['bodyweight', 'crossfit', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '45s', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'plank_to_pushup', name: 'Plank to Push-Up', emoji: '', muscle_group: 'core', secondary_muscles: ['chest', 'triceps'], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '10', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'v_ups', name: 'V-Ups', emoji: '', muscle_group: 'core', secondary_muscles: [], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '15', default_weight: 'BW', is_compound: false, difficulty: 'intermediate' },
    { id: 'russian_twists', name: 'Russian Twists', emoji: '', muscle_group: 'core', secondary_muscles: [], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '20', default_weight: '25 lb plate', is_compound: false, difficulty: 'beginner' },
    { id: 'sit_ups', name: 'Sit-Ups', emoji: '', muscle_group: 'core', secondary_muscles: [], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '20', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'hanging_knee_raise', name: 'Hanging Knee Raise', emoji: '', muscle_group: 'core', secondary_muscles: [], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '12', default_weight: 'BW', is_compound: false, difficulty: 'intermediate' },
    { id: 'toes_to_bar', name: 'Toes to Bar', emoji: '', muscle_group: 'core', secondary_muscles: ['back'], category: 'bodyweight', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '10', default_weight: 'BW', is_compound: false, difficulty: 'advanced' },
    { id: 'pallof_press', name: 'Pallof Press', emoji: '', muscle_group: 'core', secondary_muscles: [], category: 'band', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['band'], default_sets: 3, default_reps: '12 ea', default_weight: 'Band', is_compound: false, difficulty: 'beginner' },
    { id: 'ab_wheel', name: 'Ab Wheel Rollout', emoji: '', muscle_group: 'core', secondary_muscles: ['shoulders'], category: 'bodyweight', style_tags: ['traditional', 'hybrid', 'crossfit'], exclusion_tags: [], equipment_required: ['ab_wheel'], default_sets: 3, default_reps: '10', default_weight: 'BW', is_compound: false, difficulty: 'intermediate' },
    { id: 'dead_bug', name: 'Dead Bug', emoji: '', muscle_group: 'core', secondary_muscles: [], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '10 ea', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },

    // ═══════════════════════════════════════════════════════════
    //  CARDIO / RUNNING
    // ═══════════════════════════════════════════════════════════
    { id: 'easy_run', name: 'Easy Run', emoji: '', muscle_group: 'cardio', secondary_muscles: ['legs'], category: 'cardio', style_tags: ['crossfit', 'bodyweight', 'hybrid', 'traditional'], exclusion_tags: ['running'], equipment_required: [], default_sets: 1, default_reps: '20 min', default_weight: 'Easy pace', is_compound: false, difficulty: 'beginner' },
    { id: 'interval_run', name: 'Interval Run', emoji: '', muscle_group: 'cardio', secondary_muscles: ['legs'], category: 'cardio', style_tags: ['crossfit', 'hybrid'], exclusion_tags: ['running'], equipment_required: [], default_sets: 1, default_reps: '25 min', default_weight: '80-85% effort', is_compound: false, difficulty: 'intermediate' },
    { id: 'tempo_run', name: 'Tempo Run', emoji: '', muscle_group: 'cardio', secondary_muscles: ['legs'], category: 'cardio', style_tags: ['crossfit', 'hybrid', 'traditional'], exclusion_tags: ['running'], equipment_required: [], default_sets: 1, default_reps: '25 min', default_weight: 'Threshold pace', is_compound: false, difficulty: 'intermediate' },
    { id: 'long_run', name: 'Long Run', emoji: '', muscle_group: 'cardio', secondary_muscles: ['legs', 'core'], category: 'cardio', style_tags: ['crossfit', 'hybrid', 'traditional'], exclusion_tags: ['running'], equipment_required: [], default_sets: 1, default_reps: '40 min', default_weight: 'Steady pace', is_compound: false, difficulty: 'intermediate' },
    { id: 'sprint_intervals', name: 'Sprint Intervals', emoji: '', muscle_group: 'cardio', secondary_muscles: ['legs', 'glutes'], category: 'cardio', style_tags: ['crossfit', 'hybrid'], exclusion_tags: ['running'], equipment_required: [], default_sets: 8, default_reps: '30s on / 60s off', default_weight: '90% effort', is_compound: false, difficulty: 'intermediate' },
    { id: 'rowing_machine', name: 'Rowing Machine', emoji: '', muscle_group: 'cardio', secondary_muscles: ['back', 'legs'], category: 'machine', style_tags: ['crossfit', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: ['machine'], default_sets: 1, default_reps: '500m', default_weight: 'Max effort', is_compound: true, difficulty: 'beginner' },
    { id: 'assault_bike', name: 'Assault Bike', emoji: '', muscle_group: 'cardio', secondary_muscles: ['legs', 'arms'], category: 'machine', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: ['machine'], default_sets: 1, default_reps: '15 cal', default_weight: 'All out', is_compound: true, difficulty: 'beginner' },
    { id: 'jump_rope', name: 'Jump Rope', emoji: '', muscle_group: 'cardio', secondary_muscles: ['legs'], category: 'cardio', style_tags: ['crossfit', 'bodyweight', 'hybrid'], exclusion_tags: ['jumping'], equipment_required: ['jump_rope'], default_sets: 3, default_reps: '50', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'double_unders', name: 'Double Unders', emoji: '', muscle_group: 'cardio', secondary_muscles: ['legs', 'shoulders'], category: 'cardio', style_tags: ['crossfit', 'hybrid'], exclusion_tags: ['jumping'], equipment_required: ['jump_rope'], default_sets: 3, default_reps: '30', default_weight: 'BW', is_compound: false, difficulty: 'intermediate' },
    { id: 'high_knees', name: 'High Knees', emoji: '', muscle_group: 'cardio', secondary_muscles: ['legs', 'core'], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '30s', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },

    // ═══════════════════════════════════════════════════════════
    //  CROSSFIT WOD MOVEMENTS
    // ═══════════════════════════════════════════════════════════
    { id: 'wall_balls', name: 'Wall Balls', emoji: '', muscle_group: 'full_body', secondary_muscles: ['legs', 'shoulders'], category: 'bodyweight', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: ['wall_ball'], default_sets: 3, default_reps: '15', default_weight: '14 lb ball', is_compound: true, difficulty: 'beginner' },
    { id: 'box_jumps', name: 'Box Jumps', emoji: '', muscle_group: 'legs', secondary_muscles: ['glutes', 'core'], category: 'plyometric', style_tags: ['crossfit', 'hybrid'], exclusion_tags: ['jumping'], equipment_required: [], default_sets: 3, default_reps: '10', default_weight: '24" box', is_compound: true, difficulty: 'intermediate' },
    { id: 'box_step_ups', name: 'Box Step-Ups', emoji: '', muscle_group: 'legs', secondary_muscles: ['glutes'], category: 'plyometric', style_tags: ['crossfit', 'hybrid', 'bodyweight'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '10 ea', default_weight: '20" box', is_compound: true, difficulty: 'beginner' },
    { id: 'thrusters', name: 'Barbell Thrusters', emoji: '', muscle_group: 'full_body', secondary_muscles: ['legs', 'shoulders'], category: 'barbell', style_tags: ['crossfit', 'hybrid'], exclusion_tags: ['overhead'], equipment_required: ['barbell'], default_sets: 3, default_reps: '10', default_weight: '65 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'burpee_box_jumps', name: 'Burpee Box Jumps', emoji: '', muscle_group: 'full_body', secondary_muscles: ['chest', 'legs'], category: 'plyometric', style_tags: ['crossfit', 'hybrid'], exclusion_tags: ['jumping'], equipment_required: [], default_sets: 3, default_reps: '10', default_weight: '24" box', is_compound: true, difficulty: 'intermediate' },
    { id: 'ball_slams', name: 'Ball Slams', emoji: '', muscle_group: 'full_body', secondary_muscles: ['core', 'shoulders'], category: 'bodyweight', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '15', default_weight: '20 lb ball', is_compound: true, difficulty: 'beginner' },
    { id: 'battle_ropes', name: 'Battle Ropes', emoji: '', muscle_group: 'full_body', secondary_muscles: ['shoulders', 'core'], category: 'bodyweight', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '30s', default_weight: 'BW', is_compound: true, difficulty: 'beginner' },
    { id: 'run_400m', name: '400m Run', emoji: '', muscle_group: 'cardio', secondary_muscles: ['legs'], category: 'cardio', style_tags: ['crossfit', 'hybrid'], exclusion_tags: ['running'], equipment_required: [], default_sets: 1, default_reps: '400m', default_weight: 'Fast pace', is_compound: false, difficulty: 'beginner' },

    // ═══════════════════════════════════════════════════════════
    //  SPARTAN / OBSTACLE TRAINING
    // ═══════════════════════════════════════════════════════════
    { id: 'rope_climb', name: 'Rope Climb', emoji: '', muscle_group: 'back', secondary_muscles: ['biceps', 'core'], category: 'bodyweight', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '1', default_weight: '15 ft rope', is_compound: true, difficulty: 'advanced' },
    { id: 'tire_flip', name: 'Tire Flips', emoji: '', muscle_group: 'full_body', secondary_muscles: ['legs', 'back', 'core'], category: 'bodyweight', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: ['tire'], default_sets: 3, default_reps: '5', default_weight: 'Medium tire', is_compound: true, difficulty: 'intermediate' },
    { id: 'sled_push', name: 'Sled Push', emoji: '', muscle_group: 'legs', secondary_muscles: ['core', 'shoulders'], category: 'bodyweight', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: ['sled'], default_sets: 3, default_reps: '40 yd', default_weight: '135 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'sled_pull', name: 'Sled Pull', emoji: '', muscle_group: 'back', secondary_muscles: ['biceps', 'legs'], category: 'bodyweight', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: ['sled'], default_sets: 3, default_reps: '40 yd', default_weight: '90 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'farmer_walk', name: 'Farmer Walk', emoji: '', muscle_group: 'full_body', secondary_muscles: ['core', 'grip'], category: 'kettlebell', style_tags: ['crossfit', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '60 yd', default_weight: 'Heavy', is_compound: true, difficulty: 'beginner' },
    { id: 'kb_carry', name: 'KB Suitcase Carry', emoji: '', muscle_group: 'full_body', secondary_muscles: ['core', 'grip'], category: 'kettlebell', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: ['kettlebell'], default_sets: 3, default_reps: '50 yd each', default_weight: '35 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'overhead_carry', name: 'Overhead KB Carry', emoji: '', muscle_group: 'shoulders', secondary_muscles: ['core', 'grip'], category: 'kettlebell', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: ['kettlebell'], default_sets: 3, default_reps: '50 yd each', default_weight: '25 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'sandbag_carry', name: 'Sandbag Carry', emoji: '', muscle_group: 'full_body', secondary_muscles: ['core', 'legs'], category: 'bodyweight', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '100 yd', default_weight: '60 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'bucket_carry', name: 'Bucket Carry', emoji: '', muscle_group: 'full_body', secondary_muscles: ['core', 'grip'], category: 'bodyweight', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 2, default_reps: '100 yd', default_weight: '50 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'spear_throw', name: 'Spear Throw Practice', emoji: '', muscle_group: 'full_body', secondary_muscles: ['shoulders', 'core'], category: 'bodyweight', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: ['outdoor'], default_sets: 3, default_reps: '10 throws', default_weight: 'Practice form', is_compound: false, difficulty: 'intermediate' },
    { id: 'dead_hang', name: 'Dead Hang', emoji: '', muscle_group: 'back', secondary_muscles: ['grip'], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: ['pull_up_bar'], default_sets: 3, default_reps: '30s', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'plate_pinch', name: 'Plate Pinch Hold', emoji: '', muscle_group: 'arms', secondary_muscles: ['grip'], category: 'bodyweight', style_tags: ['crossfit', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: 'Max hold', default_weight: '10-25 lb plates', is_compound: false, difficulty: 'beginner' },
    { id: 'wall_climb', name: 'Wall Climb', emoji: '', muscle_group: 'full_body', secondary_muscles: ['legs', 'back'], category: 'bodyweight', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: ['outdoor'], default_sets: 3, default_reps: '3', default_weight: 'BW', is_compound: true, difficulty: 'advanced' },
    { id: 'monkey_bars', name: 'Monkey Bars', emoji: '', muscle_group: 'back', secondary_muscles: ['biceps', 'grip'], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: ['outdoor'], default_sets: 3, default_reps: '1 crossing', default_weight: 'BW', is_compound: true, difficulty: 'intermediate' },

    // ═══════════════════════════════════════════════════════════
    //  CABLE / MACHINE EXERCISES
    // ═══════════════════════════════════════════════════════════
    { id: 'lat_pulldown', name: 'Lat Pulldown', emoji: '', muscle_group: 'back', secondary_muscles: ['biceps'], category: 'machine', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['machine'], default_sets: 3, default_reps: '10', default_weight: '100 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'cable_fly', name: 'Cable Fly', emoji: '', muscle_group: 'chest', secondary_muscles: [], category: 'cable', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['cable'], default_sets: 3, default_reps: '12', default_weight: '25 lb', is_compound: false, difficulty: 'beginner' },
    { id: 'cable_row', name: 'Seated Cable Row', emoji: '', muscle_group: 'back', secondary_muscles: ['biceps'], category: 'cable', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['cable'], default_sets: 3, default_reps: '10', default_weight: '90 lb', is_compound: true, difficulty: 'beginner' },
    // Machine & Cable exercises for gym users and beginners
    { id: 'machine_chest_press', name: 'Machine Chest Press', emoji: '', muscle_group: 'chest', secondary_muscles: ['triceps', 'shoulders'], category: 'machine', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['machine'], default_sets: 3, default_reps: '10', default_weight: '80 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'machine_shoulder_press', name: 'Machine Shoulder Press', emoji: '', muscle_group: 'shoulders', secondary_muscles: ['triceps'], category: 'machine', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['machine'], default_sets: 3, default_reps: '10', default_weight: '50 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'machine_row', name: 'Machine Row', emoji: '', muscle_group: 'back', secondary_muscles: ['biceps'], category: 'machine', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['machine'], default_sets: 3, default_reps: '10', default_weight: '80 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'leg_press', name: 'Leg Press', emoji: '', muscle_group: 'legs', secondary_muscles: ['glutes'], category: 'machine', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['machine'], default_sets: 3, default_reps: '10', default_weight: '180 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'leg_curl', name: 'Leg Curl', emoji: '', muscle_group: 'legs', secondary_muscles: [], category: 'machine', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['machine'], default_sets: 3, default_reps: '12', default_weight: '60 lb', is_compound: false, difficulty: 'beginner' },
    { id: 'leg_extension', name: 'Leg Extension', emoji: '', muscle_group: 'legs', secondary_muscles: [], category: 'machine', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['machine'], default_sets: 3, default_reps: '12', default_weight: '60 lb', is_compound: false, difficulty: 'beginner' },
    { id: 'machine_dip', name: 'Assisted Dip Machine', emoji: '', muscle_group: 'chest', secondary_muscles: ['triceps', 'shoulders'], category: 'machine', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['machine'], default_sets: 3, default_reps: '10', default_weight: 'Assisted', is_compound: true, difficulty: 'beginner' },
    { id: 'band_assisted_pull_ups', name: 'Band-Assisted Pull-Ups', emoji: '', muscle_group: 'back', secondary_muscles: ['biceps'], category: 'bodyweight', style_tags: ['crossfit', 'hybrid', 'bodyweight', 'traditional'], exclusion_tags: [], equipment_required: ['bands', 'pull_up_bar'], default_sets: 3, default_reps: '8', default_weight: 'BW - band', is_compound: true, difficulty: 'beginner' },
    { id: 'cable_tricep_pushdown', name: 'Cable Tricep Pushdown', emoji: '', muscle_group: 'arms', secondary_muscles: [], category: 'cable', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['cable'], default_sets: 3, default_reps: '12', default_weight: '30 lb', is_compound: false, difficulty: 'beginner' },
    { id: 'cable_bicep_curl', name: 'Cable Bicep Curl', emoji: '', muscle_group: 'arms', secondary_muscles: [], category: 'cable', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['cable'], default_sets: 3, default_reps: '12', default_weight: '25 lb', is_compound: false, difficulty: 'beginner' },
    { id: 'cable_lateral_raise', name: 'Cable Lateral Raise', emoji: '', muscle_group: 'shoulders', secondary_muscles: [], category: 'cable', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['cable'], default_sets: 3, default_reps: '12', default_weight: '10 lb', is_compound: false, difficulty: 'beginner' },
    { id: 'cable_pull_through', name: 'Cable Pull-Through', emoji: '', muscle_group: 'glutes', secondary_muscles: ['legs', 'back'], category: 'cable', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['cable'], default_sets: 3, default_reps: '12', default_weight: '40 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'bench_dips', name: 'Bench Dips', emoji: '', muscle_group: 'arms', secondary_muscles: ['chest', 'shoulders'], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '12', default_weight: 'BW', is_compound: true, difficulty: 'beginner' },
    { id: 'face_pulls', name: 'Face Pulls', emoji: '', muscle_group: 'shoulders', secondary_muscles: ['back'], category: 'cable', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['cable'], default_sets: 3, default_reps: '15', default_weight: '30 lb', is_compound: false, difficulty: 'beginner' },
    { id: 'tricep_pushdown', name: 'Tricep Pushdown', emoji: '', muscle_group: 'arms', secondary_muscles: [], category: 'cable', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['cable'], default_sets: 3, default_reps: '12', default_weight: '40 lb', is_compound: false, difficulty: 'beginner' },
    { id: 'cable_curl', name: 'Cable Curl', emoji: '', muscle_group: 'arms', secondary_muscles: [], category: 'cable', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['cable'], default_sets: 3, default_reps: '12', default_weight: '30 lb', is_compound: false, difficulty: 'beginner' },
    { id: 'leg_press', name: 'Leg Press', emoji: '', muscle_group: 'legs', secondary_muscles: ['glutes'], category: 'machine', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['machine'], default_sets: 4, default_reps: '10', default_weight: '200 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'leg_curl', name: 'Leg Curl', emoji: '', muscle_group: 'legs', secondary_muscles: [], category: 'machine', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['machine'], default_sets: 3, default_reps: '12', default_weight: '80 lb', is_compound: false, difficulty: 'beginner' },
    { id: 'leg_extension', name: 'Leg Extension', emoji: '', muscle_group: 'legs', secondary_muscles: [], category: 'machine', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['machine'], default_sets: 3, default_reps: '12', default_weight: '90 lb', is_compound: false, difficulty: 'beginner' },

    // ═══════════════════════════════════════════════════════════
    //  PLYOMETRIC / EXPLOSIVE
    // ═══════════════════════════════════════════════════════════
    { id: 'broad_jump', name: 'Broad Jump', emoji: '', muscle_group: 'legs', secondary_muscles: ['glutes', 'core'], category: 'plyometric', style_tags: ['crossfit', 'hybrid'], exclusion_tags: ['jumping'], equipment_required: [], default_sets: 3, default_reps: '5', default_weight: 'BW', is_compound: true, difficulty: 'intermediate' },
    { id: 'a_skips', name: 'A-Skips', emoji: '', muscle_group: 'cardio', secondary_muscles: ['legs'], category: 'bodyweight', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '30s', default_weight: 'Form drill', is_compound: false, difficulty: 'beginner' },
    { id: 'lunge_matrix', name: 'Lunge Matrix', emoji: '', muscle_group: 'legs', secondary_muscles: ['glutes', 'core'], category: 'bodyweight', style_tags: ['crossfit', 'hybrid', 'bodyweight'], exclusion_tags: [], equipment_required: [], default_sets: 1, default_reps: '5 ea direction', default_weight: 'BW', is_compound: true, difficulty: 'beginner' },
    { id: 'cossack_squats', name: 'Cossack Squats', emoji: '', muscle_group: 'legs', secondary_muscles: ['glutes'], category: 'bodyweight', style_tags: ['crossfit', 'hybrid', 'bodyweight'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '8 ea', default_weight: 'BW', is_compound: true, difficulty: 'intermediate' },

    // ═══════════════════════════════════════════════════════════
    //  WARM-UP / MOBILITY
    // ═══════════════════════════════════════════════════════════
    { id: 'dynamic_stretching', name: 'Dynamic Stretching', emoji: '', muscle_group: 'full_body', secondary_muscles: [], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 1, default_reps: '2 min', default_weight: 'Full body', is_compound: false, difficulty: 'beginner' },
    { id: 'pvc_pass_throughs', name: 'PVC Pass-Throughs', emoji: '', muscle_group: 'shoulders', secondary_muscles: [], category: 'bodyweight', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 1, default_reps: '15', default_weight: 'Shoulder mobility', is_compound: false, difficulty: 'beginner' },
    { id: 'samson_stretch', name: 'Samson Stretch', emoji: '', muscle_group: 'legs', secondary_muscles: ['core'], category: 'bodyweight', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 1, default_reps: '30s ea', default_weight: 'Hip flexors', is_compound: false, difficulty: 'beginner' },
    // Cooldown / Mobility
    { id: 'hip_flexor_stretch', name: 'Hip Flexor Stretch', emoji: '', muscle_group: 'legs', secondary_muscles: ['glutes'], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 1, default_reps: '60s each', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'pigeon_pose', name: 'Pigeon Pose', emoji: '', muscle_group: 'glutes', secondary_muscles: ['legs'], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 1, default_reps: '60s each', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'shoulder_stretch', name: 'Shoulder Stretch', emoji: '', muscle_group: 'shoulders', secondary_muscles: [], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 1, default_reps: '45s each', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'hamstring_stretch', name: 'Hamstring Stretch', emoji: '', muscle_group: 'legs', secondary_muscles: [], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 1, default_reps: '45s each', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'thoracic_rotation', name: 'Thoracic Rotation', emoji: '', muscle_group: 'back', secondary_muscles: ['core'], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 1, default_reps: '30s each', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'easy_jog', name: 'Easy Jog', emoji: '', muscle_group: 'cardio', secondary_muscles: [], category: 'cardio', style_tags: ['crossfit', 'bodyweight', 'hybrid', 'traditional'], exclusion_tags: ['running'], equipment_required: [], default_sets: 1, default_reps: '3 min', default_weight: 'Build pace', is_compound: false, difficulty: 'beginner' },
    { id: 'strides', name: 'Strides', emoji: '', muscle_group: 'cardio', secondary_muscles: ['legs'], category: 'cardio', style_tags: ['crossfit', 'hybrid'], exclusion_tags: ['running'], equipment_required: [], default_sets: 3, default_reps: '50m', default_weight: '80% speed', is_compound: false, difficulty: 'beginner' },
    { id: 'push_up_to_t', name: 'Push-Up to T-Rotation', emoji: '', muscle_group: 'chest', secondary_muscles: ['core', 'shoulders'], category: 'bodyweight', style_tags: ['crossfit', 'hybrid', 'bodyweight'], exclusion_tags: [], equipment_required: [], default_sets: 1, default_reps: '10 alt', default_weight: 'BW', is_compound: true, difficulty: 'beginner' },

    // ═══════════════════════════════════════════════════════════
    //  PUSH PRESS / NON-OLYMPIC OVERHEAD
    // ═══════════════════════════════════════════════════════════
    { id: 'push_press', name: 'Push Press', emoji: '', muscle_group: 'shoulders', secondary_muscles: ['triceps', 'legs'], category: 'barbell', style_tags: ['crossfit', 'hybrid'], exclusion_tags: ['overhead'], equipment_required: ['barbell'], default_sets: 4, default_reps: '6', default_weight: '85 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'db_push_press', name: 'DB Push Press', emoji: '', muscle_group: 'shoulders', secondary_muscles: ['triceps', 'legs'], category: 'dumbbell', style_tags: ['crossfit', 'hybrid'], exclusion_tags: ['overhead'], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '8', default_weight: '35 lb', is_compound: true, difficulty: 'beginner' },

    // ═══════════════════════════════════════════════════════════
    //  ADDITIONAL COMPOUND MOVEMENTS
    // ═══════════════════════════════════════════════════════════
    { id: 'floor_press', name: 'Floor Press', emoji: '', muscle_group: 'chest', secondary_muscles: ['triceps'], category: 'barbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['barbell'], default_sets: 4, default_reps: '8', default_weight: '95 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'sumo_deadlift', name: 'Sumo Deadlift', emoji: '', muscle_group: 'legs', secondary_muscles: ['back', 'glutes'], category: 'barbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['barbell'], default_sets: 4, default_reps: '6', default_weight: '185 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'split_squat', name: 'Bulgarian Split Squat', emoji: '', muscle_group: 'legs', secondary_muscles: ['glutes', 'core'], category: 'dumbbell', style_tags: ['traditional', 'hybrid', 'crossfit'], exclusion_tags: [], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '10 ea', default_weight: '30 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'step_ups', name: 'Step-Ups', emoji: '', muscle_group: 'legs', secondary_muscles: ['glutes'], category: 'bodyweight', style_tags: ['crossfit', 'bodyweight', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '10 ea', default_weight: 'BW', is_compound: true, difficulty: 'beginner' },
    { id: 'db_hang_clean', name: 'DB Hang Clean', emoji: '', muscle_group: 'full_body', secondary_muscles: ['back', 'shoulders'], category: 'dumbbell', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '8', default_weight: '35 lb', is_compound: true, difficulty: 'intermediate' },

    // ═══════════════════════════════════════════════════════════
    // GAP-FILLING: added to ensure 5+ per pattern per difficulty
    // ═══════════════════════════════════════════════════════════

    // Hinge (beginner gap)
    { id: 'glute_bridge', name: 'Glute Bridge', emoji: '', muscle_group: 'glutes', secondary_muscles: ['legs'], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '15', default_weight: 'BW', is_compound: true, difficulty: 'beginner' },
    { id: 'back_extension', name: 'Back Extension', emoji: '', muscle_group: 'back', secondary_muscles: ['glutes'], category: 'bodyweight', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['machine'], default_sets: 3, default_reps: '12', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'good_morning', name: 'Good Morning', emoji: '', muscle_group: 'back', secondary_muscles: ['legs', 'glutes'], category: 'barbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['barbell'], default_sets: 3, default_reps: '10', default_weight: '45 lb', is_compound: true, difficulty: 'intermediate' },

    // Vertical pull (beginner + intermediate gap)
    { id: 'straight_arm_pulldown', name: 'Straight-Arm Pulldown', emoji: '', muscle_group: 'back', secondary_muscles: ['core'], category: 'cable', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['cable'], default_sets: 3, default_reps: '12', default_weight: '30 lb', is_compound: false, difficulty: 'beginner' },
    { id: 'close_grip_lat_pulldown', name: 'Close-Grip Lat Pulldown', emoji: '', muscle_group: 'back', secondary_muscles: ['biceps'], category: 'machine', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['machine'], default_sets: 3, default_reps: '10', default_weight: '80 lb', is_compound: true, difficulty: 'beginner' },

    // Horizontal pull (more machine variety)
    { id: 'chest_supported_row', name: 'Chest-Supported Row', emoji: '', muscle_group: 'back', secondary_muscles: ['biceps'], category: 'dumbbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell', 'bench'], default_sets: 3, default_reps: '10', default_weight: '30 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'single_arm_cable_row', name: 'Single-Arm Cable Row', emoji: '', muscle_group: 'back', secondary_muscles: ['biceps', 'core'], category: 'cable', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['cable'], default_sets: 3, default_reps: '10 ea', default_weight: '30 lb', is_compound: true, difficulty: 'beginner' },

    // Carry (beginner gap)
    { id: 'db_farmer_walk', name: 'DB Farmer Walk', emoji: '', muscle_group: 'full_body', secondary_muscles: ['core', 'grip'], category: 'dumbbell', style_tags: ['traditional', 'hybrid', 'crossfit'], exclusion_tags: [], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '40 yd', default_weight: '30 lb ea', is_compound: true, difficulty: 'beginner' },
    { id: 'plate_carry', name: 'Plate Carry', emoji: '', muscle_group: 'full_body', secondary_muscles: ['core', 'shoulders'], category: 'bodyweight', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '50 yd', default_weight: '25 lb', is_compound: true, difficulty: 'beginner' },

    // Arm pull (intermediate gap)
    { id: 'preacher_curl', name: 'Preacher Curl', emoji: '', muscle_group: 'arms', secondary_muscles: [], category: 'dumbbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell', 'machine'], default_sets: 3, default_reps: '10', default_weight: '20 lb', is_compound: false, difficulty: 'intermediate' },
    { id: 'concentration_curl', name: 'Concentration Curl', emoji: '', muscle_group: 'arms', secondary_muscles: [], category: 'dumbbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '10 ea', default_weight: '15 lb', is_compound: false, difficulty: 'intermediate' },

    // Arm push (intermediate gap)
    { id: 'overhead_tricep_ext', name: 'Overhead Tricep Extension', emoji: '', muscle_group: 'arms', secondary_muscles: [], category: 'dumbbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '10', default_weight: '20 lb', is_compound: false, difficulty: 'intermediate' },
    { id: 'close_grip_bench', name: 'Close-Grip Bench Press', emoji: '', muscle_group: 'arms', secondary_muscles: ['chest'], category: 'barbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['barbell', 'bench'], default_sets: 3, default_reps: '8', default_weight: '75 lb', is_compound: true, difficulty: 'intermediate' },

    // Horizontal push (more machine variety for beginners)
    { id: 'incline_machine_press', name: 'Incline Machine Press', emoji: '', muscle_group: 'chest', secondary_muscles: ['shoulders', 'triceps'], category: 'machine', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['machine'], default_sets: 3, default_reps: '10', default_weight: '60 lb', is_compound: true, difficulty: 'beginner' },

    // Core (intermediate gap)
    { id: 'cable_woodchop', name: 'Cable Woodchop', emoji: '', muscle_group: 'core', secondary_muscles: ['shoulders'], category: 'cable', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['cable'], default_sets: 3, default_reps: '10 ea', default_weight: '25 lb', is_compound: false, difficulty: 'intermediate' },
    { id: 'bird_dog', name: 'Bird Dog', emoji: '', muscle_group: 'core', secondary_muscles: ['back', 'glutes'], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '10 ea', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },

    // ═══════════════════════════════════════════════════════════
    // DB HINGE EXERCISES — critical gap for DB-only users
    // ═══════════════════════════════════════════════════════════
    { id: 'db_romanian_deadlift', name: 'DB Romanian Deadlift', emoji: '', muscle_group: 'legs', secondary_muscles: ['back', 'glutes'], category: 'dumbbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '10', default_weight: '30 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'db_single_leg_deadlift', name: 'DB Single-Leg Deadlift', emoji: '', muscle_group: 'legs', secondary_muscles: ['glutes', 'core'], category: 'dumbbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '8 ea', default_weight: '20 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'single_leg_glute_bridge', name: 'Single-Leg Glute Bridge', emoji: '', muscle_group: 'glutes', secondary_muscles: ['legs'], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '10 ea', default_weight: 'BW', is_compound: true, difficulty: 'beginner' },
    { id: 'db_hip_thrust', name: 'DB Hip Thrust', emoji: '', muscle_group: 'glutes', secondary_muscles: ['legs'], category: 'dumbbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell', 'bench'], default_sets: 3, default_reps: '12', default_weight: '30 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'db_swing', name: 'DB Swing', emoji: '', muscle_group: 'full_body', secondary_muscles: ['glutes', 'legs', 'core'], category: 'dumbbell', style_tags: ['crossfit', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '15', default_weight: '25 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'db_good_morning', name: 'DB Good Morning', emoji: '', muscle_group: 'back', secondary_muscles: ['legs', 'glutes'], category: 'dumbbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '10', default_weight: '20 lb', is_compound: true, difficulty: 'intermediate' },

    // Additional DB exercises for limited-equipment users
    { id: 'db_floor_press', name: 'DB Floor Press', emoji: '', muscle_group: 'chest', secondary_muscles: ['triceps'], category: 'dumbbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '10', default_weight: '25 lb', is_compound: true, difficulty: 'beginner' },
    { id: 'db_arnold_press', name: 'DB Arnold Press', emoji: '', muscle_group: 'shoulders', secondary_muscles: ['triceps'], category: 'dumbbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell'], default_sets: 3, default_reps: '10', default_weight: '20 lb', is_compound: true, difficulty: 'intermediate' },
    { id: 'db_seal_row', name: 'DB Seal Row', emoji: '', muscle_group: 'back', secondary_muscles: ['biceps'], category: 'dumbbell', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['dumbbell', 'bench'], default_sets: 3, default_reps: '10', default_weight: '25 lb', is_compound: true, difficulty: 'beginner' },

    // ═══════════════════════════════════════════════════════════
    // Rehab / Prehab / Mobility
    // ═══════════════════════════════════════════════════════════

    // Lower leg — shin splints, ankle, calf
    { id: 'calf_stretch_wall', name: 'Calf Stretch (Wall)', emoji: '', muscle_group: 'lower_legs', secondary_muscles: [], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 2, default_reps: '30s ea', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'seated_calf_stretch', name: 'Seated Calf Stretch', emoji: '', muscle_group: 'lower_legs', secondary_muscles: [], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 2, default_reps: '30s ea', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'tibialis_raise', name: 'Tibialis Raise', emoji: '', muscle_group: 'lower_legs', secondary_muscles: [], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '15', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'ankle_circles', name: 'Ankle Circles', emoji: '', muscle_group: 'lower_legs', secondary_muscles: [], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 2, default_reps: '10 ea', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'toe_walks', name: 'Toe Walks', emoji: '', muscle_group: 'lower_legs', secondary_muscles: [], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 2, default_reps: '30 yd', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'heel_walks', name: 'Heel Walks', emoji: '', muscle_group: 'lower_legs', secondary_muscles: [], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 2, default_reps: '30 yd', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'calf_raise_bodyweight', name: 'Bodyweight Calf Raise', emoji: '', muscle_group: 'lower_legs', secondary_muscles: [], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '20', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },

    // Knee — ACL prehab, IT band, patella
    { id: 'quad_stretch', name: 'Standing Quad Stretch', emoji: '', muscle_group: 'legs', secondary_muscles: [], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 2, default_reps: '30s ea', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'knee_circles', name: 'Knee Circles', emoji: '', muscle_group: 'legs', secondary_muscles: [], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 2, default_reps: '10 ea', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'wall_sit', name: 'Wall Sit', emoji: '', muscle_group: 'legs', secondary_muscles: ['core'], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '30-60s', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'terminal_knee_ext', name: 'Terminal Knee Extension', emoji: '', muscle_group: 'legs', secondary_muscles: [], category: 'band', style_tags: ['hybrid', 'traditional'], exclusion_tags: [], equipment_required: ['band'], default_sets: 3, default_reps: '15 ea', default_weight: 'Band', is_compound: false, difficulty: 'beginner' },
    { id: 'banded_lateral_walk', name: 'Banded Lateral Walk', emoji: '', muscle_group: 'glutes', secondary_muscles: ['legs'], category: 'band', style_tags: ['bodyweight', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: ['band'], default_sets: 3, default_reps: '12 ea', default_weight: 'Band', is_compound: false, difficulty: 'beginner' },

    // Hip — flexor tightness, glute activation
    { id: 'hip_90_90', name: '90/90 Hip Stretch', emoji: '', muscle_group: 'legs', secondary_muscles: ['glutes'], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 2, default_reps: '30s ea', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'glute_stretch_seated', name: 'Seated Glute Stretch', emoji: '', muscle_group: 'glutes', secondary_muscles: [], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 2, default_reps: '30s ea', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'clam_shells', name: 'Clamshells', emoji: '', muscle_group: 'glutes', secondary_muscles: [], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '15 ea', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'fire_hydrants', name: 'Fire Hydrants', emoji: '', muscle_group: 'glutes', secondary_muscles: [], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '12 ea', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'adductor_stretch', name: 'Adductor Stretch', emoji: '', muscle_group: 'legs', secondary_muscles: [], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 2, default_reps: '30s ea', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },

    // Shoulder — rotator cuff, impingement
    { id: 'band_pull_apart', name: 'Band Pull-Apart', emoji: '', muscle_group: 'shoulders', secondary_muscles: ['back'], category: 'band', style_tags: ['traditional', 'hybrid', 'bodyweight'], exclusion_tags: [], equipment_required: ['band'], default_sets: 3, default_reps: '15', default_weight: 'Band', is_compound: false, difficulty: 'beginner' },
    { id: 'shoulder_ext_rotation', name: 'External Shoulder Rotation', emoji: '', muscle_group: 'shoulders', secondary_muscles: [], category: 'band', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['band'], default_sets: 3, default_reps: '12 ea', default_weight: 'Band', is_compound: false, difficulty: 'beginner' },
    { id: 'shoulder_int_rotation', name: 'Internal Shoulder Rotation', emoji: '', muscle_group: 'shoulders', secondary_muscles: [], category: 'band', style_tags: ['traditional', 'hybrid'], exclusion_tags: [], equipment_required: ['band'], default_sets: 3, default_reps: '12 ea', default_weight: 'Band', is_compound: false, difficulty: 'beginner' },
    { id: 'wall_angels', name: 'Wall Angels', emoji: '', muscle_group: 'shoulders', secondary_muscles: ['back'], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '10', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'arm_circles', name: 'Arm Circles', emoji: '', muscle_group: 'shoulders', secondary_muscles: [], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 2, default_reps: '15 ea', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'chest_doorway_stretch', name: 'Doorway Chest Stretch', emoji: '', muscle_group: 'chest', secondary_muscles: ['shoulders'], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 2, default_reps: '30s', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },

    // Back — low back pain, posture
    { id: 'cat_cow', name: 'Cat-Cow Stretch', emoji: '', muscle_group: 'back', secondary_muscles: ['core'], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 2, default_reps: '10', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'child_pose', name: "Child's Pose", emoji: '', muscle_group: 'back', secondary_muscles: ['shoulders'], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 2, default_reps: '30s', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'cobra_stretch', name: 'Cobra Stretch', emoji: '', muscle_group: 'core', secondary_muscles: ['back'], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 2, default_reps: '30s', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'superman_hold', name: 'Superman Hold', emoji: '', muscle_group: 'back', secondary_muscles: ['glutes'], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid', 'traditional'], exclusion_tags: [], equipment_required: [], default_sets: 3, default_reps: '10', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'lat_stretch', name: 'Lat Stretch', emoji: '', muscle_group: 'back', secondary_muscles: [], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 2, default_reps: '30s ea', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },

    // Wrist/forearm — for grip work, overhead pressing
    { id: 'wrist_circles', name: 'Wrist Circles', emoji: '', muscle_group: 'arms', secondary_muscles: [], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 2, default_reps: '10 ea', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
    { id: 'wrist_flexor_stretch', name: 'Wrist Flexor Stretch', emoji: '', muscle_group: 'arms', secondary_muscles: [], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 2, default_reps: '30s ea', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },

    // Neck
    { id: 'neck_stretch', name: 'Side Neck Stretch', emoji: '', muscle_group: 'shoulders', secondary_muscles: [], category: 'bodyweight', style_tags: ['bodyweight', 'hybrid'], exclusion_tags: [], equipment_required: [], default_sets: 2, default_reps: '20s ea', default_weight: 'BW', is_compound: false, difficulty: 'beginner' },
  ];
}

export function seedAlternatives() {
  return [
    // Chest press movements
    ['bench_press', 'db_bench_press'],
    ['bench_press', 'push_ups'],
    ['bench_press', 'floor_press'],
    ['db_bench_press', 'push_ups'],
    ['db_bench_press', 'floor_press'],
    ['incline_bench', 'db_incline_press'],
    ['db_fly', 'cable_fly'],

    // Squat patterns
    ['back_squat', 'front_squat'],
    ['back_squat', 'db_goblet_squat'],
    ['back_squat', 'leg_press'],
    ['back_squat', 'air_squats'],
    ['front_squat', 'db_goblet_squat'],
    ['front_squat', 'kb_goblet_squat'],
    ['jump_squats', 'box_jumps'],
    ['jump_squats', 'air_squats'],
    ['split_squat', 'db_lunges'],
    ['step_ups', 'box_step_ups'],

    // Hip hinge / posterior chain
    ['deadlift', 'trap_bar_deadlift'],
    ['deadlift', 'romanian_deadlift'],
    ['deadlift', 'sumo_deadlift'],
    ['deadlift', 'kb_swings'],
    ['trap_bar_deadlift', 'romanian_deadlift'],
    ['kb_swings', 'hip_thrust'],

    // Pull movements
    ['pull_ups', 'chin_ups'],
    ['pull_ups', 'lat_pulldown'],
    ['pull_ups', 'inverted_row'],
    ['chin_ups', 'lat_pulldown'],
    ['barbell_row', 'db_row'],
    ['barbell_row', 'cable_row'],
    ['db_row', 'cable_row'],
    ['db_row', 'inverted_row'],

    // Overhead / shoulder press
    ['overhead_press', 'db_shoulder_press'],
    ['overhead_press', 'push_press'],
    ['db_shoulder_press', 'db_push_press'],
    ['push_press', 'db_push_press'],
    ['pike_push_ups', 'handstand_push_ups'],
    ['lateral_raise', 'db_reverse_fly'],
    ['lateral_raise', 'face_pulls'],

    // Olympic lift replacements
    ['power_clean', 'db_hang_clean'],
    ['power_clean', 'trap_bar_deadlift'],
    ['power_clean', 'kb_swings'],
    ['hang_clean', 'db_hang_clean'],
    ['hang_clean', 'kb_swings'],
    ['push_jerk', 'push_press'],
    ['push_jerk', 'db_push_press'],
    ['snatch', 'db_snatches'],
    ['snatch', 'kb_snatch'],
    ['clean_and_jerk', 'db_clean_press'],
    ['clean_and_jerk', 'kb_clean_press'],

    // Full body / CrossFit movements
    ['thrusters', 'db_thrusters'],
    ['thrusters', 'wall_balls'],
    ['db_thrusters', 'kb_thruster'],
    ['wall_balls', 'db_thrusters'],
    ['burpees', 'burpee_box_jumps'],
    ['box_jumps', 'box_step_ups'],
    ['box_jumps', 'broad_jump'],
    ['double_unders', 'jump_rope'],
    ['double_unders', 'high_knees'],
    ['ball_slams', 'kb_swings'],
    ['battle_ropes', 'ball_slams'],

    // Core
    ['toes_to_bar', 'hanging_knee_raise'],
    ['toes_to_bar', 'v_ups'],
    ['v_ups', 'sit_ups'],
    ['plank', 'plank_to_pushup'],
    ['russian_twists', 'pallof_press'],
    ['ab_wheel', 'plank'],
    ['dead_bug', 'plank'],

    // Cardio
    ['rowing_machine', 'assault_bike'],
    ['rowing_machine', 'run_400m'],
    ['assault_bike', 'jump_rope'],
    ['easy_run', 'easy_jog'],
    ['interval_run', 'sprint_intervals'],
    ['long_run', 'tempo_run'],

    // Arm isolation
    ['bicep_curl', 'hammer_curl'],
    ['bicep_curl', 'cable_curl'],
    ['tricep_pushdown', 'skull_crushers'],
    ['tricep_pushdown', 'dips'],

    // Spartan / obstacle
    ['farmer_walk', 'bucket_carry'],
    ['farmer_walk', 'sandbag_carry'],
    ['sled_push', 'sled_pull'],
    ['rope_climb', 'pull_ups'],
    ['dead_hang', 'monkey_bars'],
    ['tire_flip', 'sled_push'],
  ];
}
