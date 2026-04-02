// v5 Menu Builder
// Filters exercise and WOD pools BEFORE sending to Claude
// Claude picks from the menu — can't hallucinate or pick inappropriate exercises
// Uses seed exercises for Claude's prompt (compact) + ExerciseDB for pool expansion

import { seedExercises, getMovementPattern } from '../data/exerciseSeed';
import { getWods, getWodMetadata } from '../data/wodSeed';
import { canDoBodyweightPull, canDoBarbell } from './abilityFilter';
import { getExercisesByFilter } from '../data/database';

// ═══════════════════════════════════════════════════════════════
// Exercise Menu — filtered by equipment, ability, difficulty
// ═══════════════════════════════════════════════════════════════

export function buildExerciseMenu(userProfile, archetype) {
  // Use seed only — no ExerciseDB. Wrap in try to handle any property access issues.
  let exercises;
  try {
    exercises = seedExercises();
  } catch (e) {
    console.error('[MenuBuilder] Failed to load seed exercises:', e.message);
    return [];
  }
  const userEquip = new Set((userProfile.equipment || []).map(e => e.toLowerCase()));
  const notes = (userProfile.additionalNotes || '').toLowerCase();
  const cantRun = /can'?t run|no running|don'?t run|unable to run/i.test(notes);
  const excludes = new Set(userProfile.exclusions || []);
  const canPull = canDoBodyweightPull(userProfile);
  const canBB = canDoBarbell(userProfile);

  // Equipment mapping: user's onboarding selections → what exercise requires
  const equipMap = {
    dumbbells: ['dumbbell'], barbell: ['barbell', 'bench'],
    squat_rack: ['rack', 'barbell'], bench: ['bench'],
    pull_up_bar: ['pull_up_bar'], kettlebell: ['kettlebell'],
    cables: ['cable'], machines: ['machine'],
    bands: ['band'], outdoor: ['outdoor'],
  };
  const availableEquip = new Set();
  for (const eq of userEquip) {
    const mapped = equipMap[eq] || [];
    mapped.forEach(m => availableEquip.add(m));
  }
  // Bodyweight always available
  availableEquip.add('bodyweight');

  console.log(`[MenuBuilder] Exercise source check: count=${exercises.length}, first has difficulty=${typeof exercises[0]?.difficulty}`);

  const filtered = exercises.filter(ex => {
    try {
    // Equipment check
    const required = ex.equipment_required || [];
    if (required.length > 0 && !required.every(r => availableEquip.has(r))) return false;

    // Exclusion tags
    const exTags = ex.exclusion_tags || [];
    if (exTags.some(t => excludes.has(t))) return false;

    // Ability checks
    const pattern = getMovementPattern(ex);
    if (/pull_ups|chin_ups|muscle_ups/i.test(ex.id) && !canPull) return false;
    if (/^dips$/i.test(ex.id) && !canPull) return false;
    if (pattern === 'olympic' && excludes.has('olympic_lift')) return false;
    if (pattern === 'olympic' && userProfile.experience === 'beginner') return false;

    // For overweight_beginner: exclude barbell compounds from the menu entirely
    // Claude can't pick what it can't see — machines and cables only
    if (archetype?.exerciseComplexity === 'simple' && ex.category === 'barbell') return false;

    // Also exclude advanced bodyweight for beginners
    if (archetype?.exerciseComplexity === 'simple' && /push_press|push_jerk|handstand|pistol|muscle_up/i.test(ex.id)) return false;

    // Running filter
    if (cantRun && pattern === 'cardio' && /run|jog|sprint/i.test(ex.name)) return false;

    // Difficulty filter for beginners — exclude advanced exercises
    const exDiff = (ex.difficulty || 'intermediate').toLowerCase();
    if (userProfile.experience === 'beginner' && exDiff === 'advanced') return false;
    if (userProfile.experience === 'beginner' && exDiff === 'elite') return false;

    // Heavy beginner specific exclusions
    const bodyWeight = parseFloat(userProfile.weight) || 0;
    if (userProfile.experience === 'beginner' && bodyWeight > 200) {
      if (/toes_to_bar|hanging_knee_raise|inverted_row/i.test(ex.id)) return false;
    }

    // Skip warmup/cooldown exercises from the main menu
    if (pattern === 'warmup') return false;

    return true;
    } catch (filterErr) {
      console.error(`[MenuBuilder] Error filtering exercise ${ex.id}:`, filterErr.message);
      return false;
    }
  });

  // Format for Claude prompt — compact, one line per exercise
  return filtered.map(ex => ({
    id: ex.id,
    name: ex.name || ex.id,
    pattern: getMovementPattern(ex),
    equipment: ex.category || 'bodyweight',
    difficulty: (ex.difficulty || 'intermediate').toLowerCase(),
  }));
}

// Format exercise menu for prompt — token efficient
export function formatExerciseMenu(menu) {
  const lines = ['EXERCISES (pick by ID, one per line):'];
  for (const ex of menu) {
    lines.push(`${ex.id}|${ex.name}|${ex.pattern}|${ex.equipment}`);
  }
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// WOD Menu — filtered by tier, movements, equipment
// ═══════════════════════════════════════════════════════════════

export function buildWodMenu(userProfile, archetype) {
  let wods;
  try {
    wods = getWods();
  } catch (e) {
    console.error('[MenuBuilder] Failed to load WODs:', e.message);
    return [];
  }
  const notes = (userProfile.additionalNotes || '').toLowerCase();
  const cantRun = /can'?t run|no running|don'?t run|unable to run/i.test(notes);
  const canPull = canDoBodyweightPull(userProfile);
  const maxTier = archetype?.maxWodDifficulty || 3;
  const userEquip = new Set((userProfile.equipment || []).map(e => e.toLowerCase()));

  console.log(`[MenuBuilder] WOD source check: first wod has difficulty=${typeof wods[0]?.difficulty}, estimatedTime=${typeof wods[0]?.estimatedTime}`);

  const filtered = wods.filter(wod => {
    let meta;
    try {
      meta = getWodMetadata(wod);
    } catch (e) {
      console.error(`[MenuBuilder] getWodMetadata failed for ${wod.id || wod.name}: ${e.message}`);
      return false;
    }

    // Tier filter
    const tierNum = { beginner: 1, intermediate: 2, advanced: 3 }[meta.tier] || 2;
    if (tierNum > maxTier) return false;

    // Movement ability
    if (meta.containsPullUps && !canPull) return false;
    if (meta.containsRunning && cantRun) return false;
    if (meta.containsOlympic && userProfile.experience === 'beginner') return false;

    // Equipment
    const wodEquip = wod.equipment || [];
    const hasEquip = wodEquip.length === 0 || wodEquip.every(eq =>
      userEquip.has(eq) || eq === 'none' || eq === 'bodyweight' || eq === 'pull_up_bar'
    );
    if (!hasEquip) return false;

    return true;
  });

  // Format for Claude prompt
  return filtered.map(wod => {
    const meta = getWodMetadata(wod);
    return {
      id: wod.id,
      name: wod.name,
      type: wod.type,
      tier: meta.tier,
      totalReps: meta.totalEstimatedReps,
      movements: (wod.movements || []).map(m => m.replace(/\([^)]+\)/g, '').trim()).join(', '),
    };
  });
}

// Format WOD menu for prompt — token efficient
export function formatWodMenu(menu) {
  const lines = ['WODS (pick by ID):'];
  for (const wod of menu) {
    lines.push(`${wod.id}|${wod.name}|${wod.type}|${wod.tier}|~${wod.totalReps} reps|${wod.movements}`);
  }
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// Full exercise pool for rotation — seed + quality ExerciseDB
// Used by expandPool() to add variety beyond Claude's picks
// ═══════════════════════════════════════════════════════════════

export async function buildFullExercisePool(userProfile, archetype) {
  try {
    // Get ALL exercises from DB (seed + ExerciseDB) filtered by equipment
    const allExercises = await getExercisesByFilter({
      style: null,
      exclusions: userProfile.exclusions || [],
      equipment: userProfile.equipment || [],
      difficulty: null,
    });

    // Filter out junk ExerciseDB exercises
    const quality = allExercises.filter(ex => {
      const name = ex.name || '';
      // Hard exclude obscure exercises
      if (/\(female\)|\(male\)|v\.\s*\d|sitted/i.test(name)) return false;
      if (name.length > 40 || name.split(' ').length > 5) return false;
      if (/reverse grip|guillotine|cambered|lever |jefferson|zercher|frankenstein/i.test(name)) return false;

      // For beginners, only allow beginner/intermediate difficulty
      if (userProfile.experience === 'beginner') {
        if (ex.difficulty === 'advanced' || ex.difficulty === 'elite') return false;
      }

      return true;
    });

    // Add movement pattern to each
    return quality.map(ex => ({
      id: ex.id,
      name: ex.name,
      pattern: getMovementPattern(ex),
      equipment: ex.category,
      source: ex.source || 'seed',
    }));
  } catch (e) {
    console.error('[MenuBuilder] Failed to build full pool:', e.message);
    return [];
  }
}
