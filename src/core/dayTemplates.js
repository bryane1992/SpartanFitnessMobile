// Composable Day Templates
// Builds block lists from strategy day configs
// Each day config specifies movement patterns, and the builder constructs appropriate blocks

// Movement pattern → muscle groups for exercise selection
const PATTERN_MUSCLES = {
  squat: ['legs', 'glutes'],
  hinge: ['back', 'glutes', 'legs'],
  horizontal_push: ['chest', 'shoulders'],
  horizontal_pull: ['back'],
  vertical_push: ['shoulders'],
  vertical_pull: ['back'],
  elbow_flexion: ['arms'],
  elbow_extension: ['arms'],
  carry: ['full_body', 'core'],
  core: ['core'],
  pull_up: ['back', 'arms'],
  olympic: ['full_body'],
  plyometric: ['legs', 'full_body'],
};

// Pattern → whether exercises should be compound-only
const PATTERN_COMPOUND = {
  squat: true, hinge: true, horizontal_push: true, horizontal_pull: true,
  vertical_push: true, vertical_pull: true, olympic: true,
  elbow_flexion: false, elbow_extension: false, carry: false, core: false, pull_up: true,
  plyometric: false,
};

// Phase-based sets and rep ranges
function getSetsForPhase(phase, exerciseType) {
  const SETS = {
    foundation: { compound: 3, accessory: 3, isolation: 3 },
    build:      { compound: 4, accessory: 3, isolation: 3 },
    peak:       { compound: 5, accessory: 3, isolation: 3 },
    race_prep:  { compound: 3, accessory: 2, isolation: 2 },
  };
  return SETS[phase]?.[exerciseType] || 3;
}

function getRepRangeForPhase(phase, exerciseType) {
  const REPS = {
    foundation: { compound: [8, 12], accessory: [10, 15], isolation: [12, 15] },
    build:      { compound: [5, 8],  accessory: [8, 12],  isolation: [10, 12] },
    peak:       { compound: [3, 5],  accessory: [6, 8],   isolation: [8, 10] },
    race_prep:  { compound: [5, 8],  accessory: [8, 10],  isolation: [10, 12] },
  };
  return REPS[phase]?.[exerciseType] || [8, 12];
}

// Warmup exercises matched to trained patterns
const WARMUP_POOLS = {
  lower: ['easy_jog', 'dynamic_stretching', 'air_squats', 'lunge_matrix', 'cossack_squats', 'samson_stretch'],
  upper: ['easy_jog', 'dynamic_stretching', 'push_up_to_t', 'pvc_pass_throughs', 'arm_circles', 'inchworm'],
  full: ['easy_jog', 'dynamic_stretching', 'air_squats', 'push_up_to_t', 'bear_crawl', 'high_knees'],
  run: ['easy_jog', 'dynamic_stretching', 'a_skips', 'high_knees', 'strides', 'samson_stretch'],
};

// Cooldown stretches matched to trained patterns
const COOLDOWN_POOLS = {
  lower: ['hip_flexor_stretch', 'pigeon_pose', 'hamstring_stretch', 'samson_stretch'],
  upper: ['shoulder_stretch', 'thoracic_rotation', 'pvc_pass_throughs'],
  full: ['hip_flexor_stretch', 'shoulder_stretch', 'thoracic_rotation', 'hamstring_stretch'],
  run: ['hip_flexor_stretch', 'hamstring_stretch', 'pigeon_pose', 'samson_stretch'],
};

// Classify a day config's patterns into body region
function classifyDayFocus(patterns) {
  const lower = patterns.some(p => ['squat', 'hinge', 'plyometric'].includes(p));
  const upper = patterns.some(p => ['horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull', 'pull_up'].includes(p));
  const run = patterns.some(p => p === 'run' || p === 'cardio');
  if (run) return 'run';
  if (lower && upper) return 'full';
  if (lower) return 'lower';
  if (upper) return 'upper';
  return 'full';
}

// ═══════════════════════════════════════════════════════════════
// Main builder — constructs blocks from a strategy day config
// ═══════════════════════════════════════════════════════════════

export function buildDayBlocks(dayConfig, phase, sessionMinutes = 60) {
  const blocks = [];
  const allPatterns = [
    ...(dayConfig.primary_patterns || []),
    ...(dayConfig.secondary_patterns || []),
  ];
  const focus = classifyDayFocus(allPatterns);

  // Remaining time budget
  let timeLeft = sessionMinutes;

  // ── WARMUP (always, 8 min) ──
  const warmupPool = WARMUP_POOLS[focus] || WARMUP_POOLS.full;
  blocks.push({
    name: 'WARM-UP',
    type: 'MOVEMENT PREP',
    duration: '8 min',
    isWarmup: true,
    exerciseCount: 4,
    warmupPool,
    muscleGroups: ['full_body'],
  });
  timeLeft -= 8;

  // ── PRIMARY COMPOUNDS (20-25 min) ──
  if (dayConfig.primary_patterns && dayConfig.primary_patterns.length > 0) {
    const muscleGroups = new Set();
    let compoundsOnly = true;
    let olympicOnly = false;

    for (const pattern of dayConfig.primary_patterns) {
      const muscles = PATTERN_MUSCLES[pattern] || ['full_body'];
      muscles.forEach(m => muscleGroups.add(m));
      if (pattern === 'olympic') olympicOnly = true;
    }

    const exerciseCount = Math.min(3, dayConfig.primary_patterns.length + 1);
    const dur = olympicOnly ? 20 : 25;

    blocks.push({
      name: olympicOnly ? 'OLYMPIC LIFTS' : 'MAIN LIFTS',
      type: 'COMPOUND',
      duration: `${dur} min`,
      exerciseCount,
      muscleGroups: Array.from(muscleGroups),
      compoundsOnly,
      olympicOnly,
      patterns: dayConfig.primary_patterns,
    });
    timeLeft -= dur;
  }

  // ── SECONDARY / ACCESSORIES (10-12 min) ──
  if (dayConfig.secondary_patterns && dayConfig.secondary_patterns.length > 0 && timeLeft > 15) {
    const muscleGroups = new Set();
    for (const pattern of dayConfig.secondary_patterns) {
      const muscles = PATTERN_MUSCLES[pattern] || ['full_body'];
      muscles.forEach(m => muscleGroups.add(m));
    }

    blocks.push({
      name: 'ACCESSORIES',
      type: 'ISOLATION',
      duration: '12 min',
      exerciseCount: Math.min(3, dayConfig.secondary_patterns.length + 1),
      muscleGroups: Array.from(muscleGroups),
      compoundsOnly: false,
      patterns: dayConfig.secondary_patterns,
    });
    timeLeft -= 12;
  }

  // ── ARM FINISHER (8 min, if strategy says so) ──
  if (dayConfig.arm_finisher && timeLeft > 12) {
    blocks.push({
      name: 'ARM BLASTER',
      type: 'SUPERSETS',
      duration: '8 min',
      exerciseCount: 2,
      muscleGroups: ['arms'],
      compoundsOnly: false,
      patterns: ['elbow_flexion', 'elbow_extension'],
      superset: true,
    });
    timeLeft -= 8;
  }

  // ── CORE BLOCK (8 min, if strategy says so) ──
  if (dayConfig.core_block && timeLeft > 12) {
    blocks.push({
      name: 'CORE',
      type: 'CIRCUIT',
      duration: '8 min',
      exerciseCount: 3,
      muscleGroups: ['core'],
      compoundsOnly: false,
      patterns: ['core'],
    });
    timeLeft -= 8;
  }

  // ── RUN BLOCK (if day has a run) ──
  if (dayConfig.run && timeLeft > 10) {
    const runDur = dayConfig.run.type === 'long_run' ? 35 : 25;
    blocks.push({
      name: dayConfig.run.label || 'RUN',
      type: dayConfig.run.type?.toUpperCase() || 'EASY',
      duration: `${Math.min(runDur, timeLeft - 6)} min`,
      isRun: true,
      hasGps: true,
      runType: dayConfig.run.type,
      exerciseCount: 3,
      muscleGroups: ['cardio'],
    });
    timeLeft -= runDur;
  }

  // ── WOD BLOCK (if day has conditioning) ──
  if (dayConfig.wod && timeLeft > 8) {
    const wodDur = Math.min(15, Math.max(8, timeLeft - 6));
    blocks.push({
      name: 'WOD',
      type: dayConfig.wod.type || 'AMRAP',
      duration: `${wodDur} min`,
      isWod: true,
      exerciseCount: 4,
      muscleGroups: ['full_body'],
      wodFilter: dayConfig.wod.filter || {},
    });
    timeLeft -= wodDur;
  }

  // ── COOLDOWN (always, 5-6 min) ──
  if (sessionMinutes >= 45) {
    const cooldownPool = COOLDOWN_POOLS[focus] || COOLDOWN_POOLS.full;
    blocks.push({
      name: 'COOLDOWN',
      type: 'MOBILITY',
      duration: '5 min',
      isCooldown: true,
      exerciseCount: cooldownPool.length,
      cooldownPool,
      muscleGroups: [],
    });
  }

  return blocks;
}

// ═══════════════════════════════════════════════════════════════
// Get default day configs based on common training splits
// ═══════════════════════════════════════════════════════════════

export function getDefaultDayConfigs(daysPerWeek, goals, hasBarbell, hasSpartanGoal) {
  const wantChest = goals.some(g => /chest|muscle|size/i.test(g));
  const wantArms = goals.some(g => /arm|muscle|size/i.test(g));

  const DEFAULTS = {
    3: [
      { type: 'lower_power', primary_patterns: ['squat', 'hinge'], secondary_patterns: ['carry'], arm_finisher: wantArms, wod: { type: 'AMRAP' } },
      { type: 'upper_push_pull', primary_patterns: ['horizontal_push', 'horizontal_pull'], secondary_patterns: ['vertical_push'], arm_finisher: true, core_block: true },
      { type: 'endurance', primary_patterns: [], secondary_patterns: [], run: { type: 'long_run', label: 'LONG RUN' }, wod: { type: 'FOR TIME' } },
    ],
    4: [
      { type: 'lower_power', primary_patterns: ['squat', 'hinge'], secondary_patterns: [], arm_finisher: wantArms, wod: { type: 'AMRAP' } },
      { type: 'upper_push', primary_patterns: ['horizontal_push', 'vertical_push'], secondary_patterns: ['elbow_extension'], arm_finisher: true, core_block: true },
      { type: 'sprint_conditioning', primary_patterns: [], secondary_patterns: [], run: { type: 'intervals', label: 'SPRINT INTERVALS' }, wod: { type: 'FOR TIME' } },
      { type: 'upper_pull_endurance', primary_patterns: ['horizontal_pull', 'pull_up'], secondary_patterns: ['elbow_flexion'], arm_finisher: true, run: { type: 'long_run', label: 'LONG RUN' } },
    ],
    5: [
      { type: 'lower_power', primary_patterns: ['squat', 'hinge'], secondary_patterns: ['carry'], arm_finisher: wantArms, wod: { type: 'AMRAP' } },
      { type: 'upper_push', primary_patterns: ['horizontal_push', 'vertical_push'], secondary_patterns: ['elbow_extension'], arm_finisher: true },
      { type: 'sprint_conditioning', primary_patterns: [], secondary_patterns: [], run: { type: 'intervals', label: 'SPRINT INTERVALS' }, wod: { type: 'FOR TIME' }, core_block: true },
      { type: 'olympic_upper_pull', primary_patterns: hasSpartanGoal ? ['pull_up', 'horizontal_pull'] : ['horizontal_pull', 'vertical_pull'], secondary_patterns: ['elbow_flexion'], arm_finisher: true, core_block: true },
      { type: 'endurance_metabolic', primary_patterns: hasSpartanGoal ? ['carry'] : [], secondary_patterns: [], run: { type: 'long_run', label: 'LONG RUN' }, wod: { type: 'FOR TIME' } },
    ],
    6: [
      { type: 'lower_power', primary_patterns: ['squat', 'hinge'], secondary_patterns: ['carry'], arm_finisher: wantArms },
      { type: 'upper_push', primary_patterns: ['horizontal_push', 'vertical_push'], secondary_patterns: ['elbow_extension'], arm_finisher: true },
      { type: 'sprint_conditioning', primary_patterns: [], secondary_patterns: [], run: { type: 'intervals', label: 'SPRINT INTERVALS' }, wod: { type: 'FOR TIME' }, core_block: true },
      { type: 'olympic_pull', primary_patterns: ['olympic', 'pull_up'], secondary_patterns: ['elbow_flexion'], arm_finisher: true },
      { type: 'lower_hypertrophy', primary_patterns: ['squat'], secondary_patterns: ['hinge'], core_block: true, wod: { type: 'AMRAP' } },
      { type: 'endurance_metabolic', primary_patterns: [], secondary_patterns: [], run: { type: 'long_run', label: 'LONG RUN' }, wod: { type: 'FOR TIME' } },
    ],
  };

  return DEFAULTS[daysPerWeek] || DEFAULTS[5];
}

export { PATTERN_MUSCLES, PATTERN_COMPOUND, getSetsForPhase, getRepRangeForPhase, classifyDayFocus };
