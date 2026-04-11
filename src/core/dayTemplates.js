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
  run: ['easy_jog', 'dynamic_stretching', 'a_skips', 'high_knees', 'strides', 'tibialis_raise', 'calf_raise_bodyweight'],
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

  console.log(`[DayTemplate] Building ${dayConfig.type}: run=${!!dayConfig.run} wod=${!!dayConfig.wod} patterns=${allPatterns.join(',')}`);

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

  // ── RUN BLOCK (PRIORITY — if day has a run, reserve time FIRST) ──
  if (dayConfig.run) {
    const runDur = dayConfig.run.type === 'long_run' ? 30 : 20;
    blocks.push({
      name: dayConfig.run.label || 'RUN',
      type: dayConfig.run.type?.toUpperCase() || 'EASY',
      duration: `${runDur} min`,
      isRun: true,
      hasGps: true,
      runType: dayConfig.run.type,
      exerciseCount: 3,
      muscleGroups: ['cardio'],
    });
    timeLeft -= runDur;
  }

  // ── WOD BLOCK (PRIORITY — conditioning is core to training) ──
  if (dayConfig.wod) {
    const wodDur = Math.min(12, Math.max(8, timeLeft - 20));
    blocks.push({
      name: 'WOD',
      type: dayConfig.wod.type || 'AMRAP',
      duration: `${Math.max(8, wodDur)} min`,
      isWod: true,
      exerciseCount: 4,
      muscleGroups: ['full_body'],
      wodFilter: dayConfig.wod.filter || {},
    });
    timeLeft -= Math.max(8, wodDur);
  }

  // ── SECONDARY / ACCESSORIES (if time remains) ──
  if (dayConfig.secondary_patterns && dayConfig.secondary_patterns.length > 0 && timeLeft > 12) {
    const muscleGroups = new Set();
    for (const pattern of dayConfig.secondary_patterns) {
      const muscles = PATTERN_MUSCLES[pattern] || ['full_body'];
      muscles.forEach(m => muscleGroups.add(m));
    }

    blocks.push({
      name: 'ACCESSORIES',
      type: 'ISOLATION',
      duration: '10 min',
      exerciseCount: Math.min(3, dayConfig.secondary_patterns.length + 1),
      muscleGroups: Array.from(muscleGroups),
      compoundsOnly: false,
      patterns: dayConfig.secondary_patterns,
    });
    timeLeft -= 10;
  }

  // ── ARM FINISHER (guaranteed when requested — this is a user priority, not optional) ──
  if (dayConfig.arm_finisher) {
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

  // ── CORE BLOCK (if time remains) ──
  if (dayConfig.core_block && timeLeft > 10) {
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

export function getDefaultDayConfigs(daysPerWeek, goals, hasBarbell, hasSpartanGoal, archetype, equipment) {
  const wantChest = goals.some(g => /chest|muscle|size|build_muscle/i.test(g));
  // Arms on by default — most users benefit from arm isolation work
  // Only skip for pure endurance archetypes with no strength goals
  const isEnduranceOnly = archetype?.splitModel === 'endurance_focused' && !goals.some(g => /muscle|strong|size/i.test(g));
  const wantArms = !isEnduranceOnly;
  const splitModel = archetype?.splitModel || 'full_body_3x';

  // Check what pull patterns the user can actually do
  // vertical_pull (pull-ups, lat pulldown) requires pull-up bar or machines
  const equipSet = new Set((equipment || []).map(e => e.toLowerCase()));
  const hasVerticalPull = equipSet.has('pull_up_bar') || equipSet.has('machines') || equipSet.has('cables');
  // Use horizontal_pull (rows) when vertical_pull isn't available
  const pullPattern = hasVerticalPull ? 'vertical_pull' : 'horizontal_pull';

  // Full Body 3-4x — for beginners, general fitness, fat loss
  if (splitModel === 'full_body_3x') {
    const condStyle = archetype?.conditioningStyle || 'circuit';
    const wod = condStyle === 'none' ? null : { type: condStyle === 'circuit' ? 'CIRCUIT' : 'AMRAP' };

    if (daysPerWeek >= 4) {
      // 4 days: clean upper/lower split — each day has a single identity
      // Lower days: 2 main lifts + 1 leg accessory (3 leg exercises total)
      // Upper days: 2 main lifts (1 push + 1 pull), NO push/pull accessories to keep ratio balanced
      // Result: Legs 2x (high volume), Push 2x, Pull 2x — perfectly balanced
      return [
        { type: 'lower_a', primary_patterns: ['squat', 'hinge'], secondary_patterns: ['squat'], core_block: true, wod },
        { type: 'upper_a', primary_patterns: ['horizontal_push', 'horizontal_pull'], secondary_patterns: [], arm_finisher: wantArms, core_block: true },
        { type: 'lower_b', primary_patterns: ['hinge', 'squat'], secondary_patterns: ['hinge'], core_block: true, wod },
        { type: 'upper_b', primary_patterns: ['vertical_push', pullPattern], secondary_patterns: [], arm_finisher: wantArms, core_block: true },
      ];
    }

    // 3 days: full body each day — each day has a unique pattern pair
    const base = [
      { type: 'full_body_a', primary_patterns: ['squat', 'horizontal_push'], secondary_patterns: ['horizontal_pull'], arm_finisher: wantArms, core_block: true, wod },
      { type: 'full_body_b', primary_patterns: ['hinge', 'horizontal_pull'], secondary_patterns: ['vertical_push'], arm_finisher: wantArms, core_block: true },
      { type: 'full_body_c', primary_patterns: ['vertical_push', pullPattern], secondary_patterns: ['core'], core_block: true, wod },
    ];
    return base.slice(0, daysPerWeek);
  }

  // Full Body 5x — fat loss, general fitness with more days
  if (splitModel === 'full_body_5x') {
    const condStyle = archetype?.conditioningStyle || 'circuit';
    const wod = condStyle === 'none' ? null : { type: condStyle === 'circuit' ? 'CIRCUIT' : condStyle === 'hiit' ? 'CIRCUIT' : 'AMRAP' };
    return [
      { type: 'full_body_push', primary_patterns: ['squat', 'horizontal_push'], secondary_patterns: ['elbow_extension'], arm_finisher: true, wod },
      { type: 'full_body_pull', primary_patterns: ['hinge', 'horizontal_pull'], secondary_patterns: ['elbow_flexion'], arm_finisher: true, wod },
      { type: 'full_body_legs', primary_patterns: ['squat', 'hinge'], secondary_patterns: ['core'], core_block: true, wod },
      { type: 'full_body_upper', primary_patterns: ['horizontal_push', pullPattern], secondary_patterns: ['carry'], arm_finisher: true, wod },
      { type: 'full_body_metabolic', primary_patterns: ['hinge', 'horizontal_pull'], secondary_patterns: [], core_block: true, wod },
    ].slice(0, daysPerWeek);
  }

  // Push/Pull/Legs — hypertrophy
  if (splitModel === 'push_pull_legs') {
    if (daysPerWeek >= 6) {
      // Check if bulk/hypertrophy goals warrant extra leg volume
      const isBulk = goals.some(g => /muscle|bulk|huge|size|hypertrophy/i.test(g));
      const bodyCompBulk = archetype?.bodyCompGoal === 'bulk' || goals.includes('build_muscle');

      if (isBulk || bodyCompBulk) {
        // Hypertrophy 6-day: Chest / Back / Legs(Quad) / Shoulders+Arms / Legs(Posterior) / Back
        // Legs 2x with distinct focus (quad day + posterior day), back 2x, chest 1x, shoulders 1x
        // Total push 2x (chest + shoulders), pull 2x (back x2), legs 2x (quad + posterior)
        return [
          { type: 'chest', primary_patterns: ['horizontal_push'], secondary_patterns: ['horizontal_push'], arm_finisher: true, core_block: true },
          { type: 'back_width', primary_patterns: [pullPattern, 'horizontal_pull'], secondary_patterns: ['elbow_flexion'], arm_finisher: true, core_block: true },
          { type: 'legs_quad', primary_patterns: ['squat'], secondary_patterns: ['squat'], arm_finisher: false, core_block: true },
          { type: 'shoulders_arms', primary_patterns: ['vertical_push'], secondary_patterns: ['elbow_extension', 'elbow_flexion'], arm_finisher: true, core_block: true },
          { type: 'legs_posterior', primary_patterns: ['hinge'], secondary_patterns: ['hinge', 'squat'], arm_finisher: false, core_block: true },
          { type: 'back_thickness', primary_patterns: ['horizontal_pull'], secondary_patterns: [pullPattern, 'elbow_flexion'], arm_finisher: true, core_block: true },
        ];
      }

      // Standard PPL x2
      return [
        { type: 'push_a', primary_patterns: ['horizontal_push', 'vertical_push'], secondary_patterns: ['elbow_extension'], arm_finisher: true, core_block: true },
        { type: 'pull_a', primary_patterns: ['horizontal_pull', pullPattern], secondary_patterns: ['elbow_flexion'], arm_finisher: true, core_block: true },
        { type: 'legs_a', primary_patterns: ['squat', 'hinge'], secondary_patterns: ['squat', 'hinge'], arm_finisher: false, core_block: true },
        { type: 'push_b', primary_patterns: ['horizontal_push', 'vertical_push'], secondary_patterns: ['elbow_extension'], arm_finisher: true, core_block: true },
        { type: 'pull_b', primary_patterns: ['horizontal_pull', pullPattern], secondary_patterns: ['elbow_flexion'], arm_finisher: true, core_block: true },
        { type: 'legs_b', primary_patterns: ['squat', 'hinge'], secondary_patterns: ['squat', 'hinge'], arm_finisher: false, core_block: true },
      ];
    }
    const base = [
      { type: 'push', primary_patterns: ['horizontal_push', 'vertical_push'], secondary_patterns: ['elbow_extension'], arm_finisher: true },
      { type: 'pull', primary_patterns: ['horizontal_pull', pullPattern], secondary_patterns: ['elbow_flexion'], arm_finisher: true },
      { type: 'legs', primary_patterns: ['squat', 'hinge'], secondary_patterns: ['squat', 'hinge'], arm_finisher: false, core_block: true },
    ];
    if (daysPerWeek >= 5) {
      // 5-day PPL: Push/Pull/Legs/Legs/Pull — 2 leg days for hypertrophy, 2 pull for back
      return [...base,
        { type: 'legs_b', primary_patterns: ['hinge', 'squat'], secondary_patterns: ['hinge'], arm_finisher: false, core_block: true },
        { type: 'pull_b', primary_patterns: ['horizontal_pull', pullPattern], secondary_patterns: ['elbow_flexion'], arm_finisher: true, core_block: true }];
    }
    if (daysPerWeek >= 4) {
      return [...base, { type: 'legs_b', primary_patterns: ['squat', 'hinge'], secondary_patterns: ['squat', 'hinge'], arm_finisher: false, core_block: true }];
    }
    return base;
  }

  // Endurance focused — runners
  if (splitModel === 'endurance_focused') {
    return [
      { type: 'easy_run_strength', primary_patterns: ['squat'], secondary_patterns: ['core'], run: { type: 'easy', label: 'EASY RUN' } },
      { type: 'tempo', primary_patterns: [], secondary_patterns: [], run: { type: 'tempo', label: 'TEMPO RUN' }, core_block: true },
      { type: 'strength_core', primary_patterns: ['hinge', 'horizontal_push'], secondary_patterns: ['horizontal_pull'], arm_finisher: wantArms },
      { type: 'intervals', primary_patterns: [], secondary_patterns: [], run: { type: 'intervals', label: 'SPEED INTERVALS' }, core_block: true },
      { type: 'long_run', primary_patterns: [], secondary_patterns: [], run: { type: 'long_run', label: 'LONG RUN' } },
    ].slice(0, daysPerWeek);
  }

  const DEFAULTS = {
    // Recovery rule: max 2 heavy lower days, 48hrs apart. Sprints between heavies, not adjacent.
    // Run days: no WOD — the run IS the conditioning.
    // Racers get 2 run exposures (long + quality). Non-racers get 0 unless explicit.
    3: [
      { type: 'lower_power', primary_patterns: ['squat', 'hinge'], secondary_patterns: ['squat', 'hinge'], arm_finisher: false, core_block: true, lowerStress: 'heavy' },
      { type: 'upper_push_pull', primary_patterns: ['horizontal_push', 'horizontal_pull'], secondary_patterns: ['vertical_push'], arm_finisher: wantArms, core_block: true, wod: { type: 'AMRAP' } },
      hasSpartanGoal
        ? { type: 'endurance', primary_patterns: [], secondary_patterns: [], run: { type: 'long_run', label: 'LONG RUN' }, core_block: true }
        : { type: 'full_body_c', primary_patterns: ['hinge', 'horizontal_pull'], secondary_patterns: [], core_block: true, wod: { type: 'CIRCUIT' } },
    ],
    4: [
      { type: 'lower_power', primary_patterns: ['squat', 'hinge'], secondary_patterns: ['squat', 'hinge'], arm_finisher: false, core_block: true, lowerStress: 'heavy' },
      { type: 'upper_push', primary_patterns: ['horizontal_push', 'vertical_push'], secondary_patterns: ['elbow_extension'], arm_finisher: wantArms, core_block: true, wod: { type: 'AMRAP' } },
      hasSpartanGoal
        ? { type: 'sprint_conditioning', primary_patterns: [], secondary_patterns: [], run: { type: 'intervals', label: 'SPRINT INTERVALS' }, core_block: true, lowerStress: 'moderate' }
        : { type: 'full_body_pull', primary_patterns: ['horizontal_pull', pullPattern], secondary_patterns: ['elbow_flexion'], arm_finisher: true, wod: { type: 'CIRCUIT' } },
      hasSpartanGoal
        ? { type: 'upper_pull_endurance', primary_patterns: ['horizontal_pull', 'pull_up'], secondary_patterns: ['elbow_flexion'], arm_finisher: true, run: { type: 'long_run', label: 'LONG RUN' } }
        : { type: 'lower_hyp', primary_patterns: ['squat'], secondary_patterns: ['hinge'], core_block: true, lowerStress: 'heavy' },
    ],
    5: [
      { type: 'lower_power', primary_patterns: ['squat', 'hinge'], secondary_patterns: ['squat', 'hinge'], arm_finisher: false, core_block: true, lowerStress: 'heavy' },
      { type: 'upper_push', primary_patterns: ['horizontal_push', 'vertical_push'], secondary_patterns: ['elbow_extension'], arm_finisher: wantArms, wod: { type: 'AMRAP' }, core_block: true },
      hasSpartanGoal
        ? { type: 'sprint_conditioning', primary_patterns: [], secondary_patterns: [], run: { type: 'intervals', label: 'SPRINT INTERVALS' }, core_block: true, lowerStress: 'moderate' }
        : { type: 'full_body_c', primary_patterns: ['hinge', 'horizontal_push'], secondary_patterns: [], core_block: true, wod: { type: 'CIRCUIT' } },
      { type: 'upper_pull', primary_patterns: hasSpartanGoal ? ['pull_up', 'horizontal_pull'] : ['horizontal_pull', pullPattern], secondary_patterns: ['elbow_flexion'], arm_finisher: wantArms, core_block: true, wod: { type: 'FOR TIME' } },
      hasSpartanGoal
        ? { type: 'endurance', primary_patterns: hasSpartanGoal ? ['carry'] : [], secondary_patterns: [], run: { type: 'long_run', label: 'LONG RUN' }, core_block: true }
        : { type: 'lower_hypertrophy', primary_patterns: ['squat'], secondary_patterns: ['hinge'], core_block: true, wod: { type: 'AMRAP' }, lowerStress: 'heavy' },
    ],
    6: [
      { type: 'lower_power', primary_patterns: ['squat', 'hinge'], secondary_patterns: ['squat', 'hinge'], arm_finisher: false, core_block: true, lowerStress: 'heavy' },
      { type: 'upper_push', primary_patterns: ['horizontal_push', 'vertical_push'], secondary_patterns: ['elbow_extension'], arm_finisher: wantArms, wod: { type: 'AMRAP' }, core_block: true },
      hasSpartanGoal
        ? { type: 'sprint_conditioning', primary_patterns: [], secondary_patterns: [], run: { type: 'intervals', label: 'SPRINT INTERVALS' }, core_block: true, lowerStress: 'moderate' }
        : { type: 'full_body_c', primary_patterns: ['hinge', 'horizontal_push'], secondary_patterns: [], core_block: true, wod: { type: 'CIRCUIT' } },
      { type: 'olympic_pull', primary_patterns: ['olympic', 'pull_up'], secondary_patterns: ['elbow_flexion'], arm_finisher: true },
      { type: 'lower_hypertrophy', primary_patterns: ['squat'], secondary_patterns: ['hinge'], core_block: true, wod: { type: 'AMRAP' }, lowerStress: 'heavy' },
      hasSpartanGoal
        ? { type: 'endurance', primary_patterns: [], secondary_patterns: [], run: { type: 'long_run', label: 'LONG RUN' }, core_block: true }
        : { type: 'metabolic', primary_patterns: ['hinge'], secondary_patterns: [], core_block: true, wod: { type: 'FOR TIME' } },
    ],
  };

  return DEFAULTS[daysPerWeek] || DEFAULTS[5];
}

export { PATTERN_MUSCLES, PATTERN_COMPOUND, getSetsForPhase, getRepRangeForPhase, classifyDayFocus };
