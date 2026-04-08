// Plan Validator — runs after generation, before save
// Catches equipment mismatches, weight issues, structural problems
// Auto-fixes what it can, flags what it can't

import { seedExercises, getMovementPattern } from '../data/exerciseSeed';

const allSeedExercises = seedExercises();
const exerciseLookup = {};
for (const ex of allSeedExercises) exerciseLookup[ex.id] = ex;

export function validatePlan(planDays, userProfile) {
  const violations = [];
  const equipment = new Set((userProfile.equipment || []).map(e => e.toLowerCase()));
  const equipDetails = userProfile.equipmentDetails || {};
  const barbellMax = equipDetails.barbell?.maxWeight ? parseFloat(equipDetails.barbell.maxWeight) : null;
  const dbMax = equipDetails.dumbbells?.maxWeight ? parseFloat(equipDetails.dumbbells.maxWeight) : null;
  const kbWeights = equipDetails.kettlebell?.weights
    ? equipDetails.kettlebell.weights.split(',').map(w => parseFloat(w.trim())).filter(w => w > 0).sort((a, b) => a - b)
    : null;

  // Equipment mapping
  const equipMap = {
    dumbbells: ['dumbbell'], barbell: ['barbell'], squat_rack: ['rack'],
    bench: ['bench'], pull_up_bar: ['pull_up_bar'], kettlebell: ['kettlebell'],
    cables: ['cable'], machines: ['machine'], bands: ['band'],
    rings: ['rings'], jump_rope: ['jump_rope'], outdoor: ['outdoor'],
  };
  const availableEquip = new Set(['bodyweight']);
  equipment.forEach(eq => (equipMap[eq] || []).forEach(e => availableEquip.add(e)));

  // Track across plan
  const wodCounts = {};
  const weekWodTypes = {};
  let weekWodNames = {};
  const exerciseWeightsByPhase = {};

  for (const day of planDays) {
    if (day.isRestDay || day.is_rest_day) continue;
    const blocks = day.blocks || [];
    const usedMainAccessoryExercises = new Set();

    for (const block of blocks) {
      const exercises = block.exercises || [];
      const blockName = (block.name || block.type || '').toLowerCase();
      const isWarmup = /warm/i.test(blockName);
      const isCooldown = /cool/i.test(blockName);
      const isMainLift = /main|compound/i.test(blockName);
      const isAccessory = /accessor/i.test(blockName);
      const isArmBlaster = /arm/i.test(blockName) && !/warm/i.test(blockName);
      const isWod = /wod|circuit|amrap|emom/i.test(blockName);

      if (isWod) {
        const wodKey = exercises.map(e => e.exercise_id).sort().join(',') || block.name;
        wodCounts[wodKey] = (wodCounts[wodKey] || 0) + 1;
        const wk = day.week_number;
        if (!weekWodTypes[wk]) weekWodTypes[wk] = [];
        weekWodTypes[wk].push(block.type || 'CIRCUIT');

        // ── Check: Fake WOD (single exercise, not a real WOD) ──
        const uniqueMovements = new Set(exercises.map(e => e.exercise_id));
        if (uniqueMovements.size < 2) {
          violations.push({ check: 'fake_wod', severity: 'auto_fixed',
            details: `WOD "${block.name}" on wk${day.week_number} has only ${uniqueMovements.size} movement(s)`,
            fix_applied: 'Single-exercise WOD flagged' });
        }

        // ── Check: Same WOD name twice in one week ──
        const wodName = block.name || '';
        const weekKey2 = `wk${day.week_number}`;
        if (!weekWodNames[weekKey2]) weekWodNames[weekKey2] = [];
        if (weekWodNames[weekKey2].includes(wodName) && wodName !== 'WOD') {
          violations.push({ check: 'wod_same_week', severity: 'warning',
            details: `"${wodName}" appears twice in week ${day.week_number}` });
        }
        weekWodNames[weekKey2].push(wodName);

        // ── Check: WOD duration fits time budget ──
        const wodDuration = parseInt(block.time_cap) || 10;
        if (wodDuration > 20) {
          violations.push({ check: 'wod_duration', severity: 'warning',
            details: `WOD "${block.name}" is ${wodDuration} min — too long for a day with other blocks` });
        }
      }

      for (const ex of exercises) {
        const seedEx = exerciseLookup[ex.exercise_id];
        const weight = parseFloat(ex.weight) || 0;
        const pattern = seedEx ? getMovementPattern(seedEx) : null;

        // ── Check 1: Weight Cap ──
        if (weight > 0 && seedEx) {
          if (seedEx.category === 'barbell' && barbellMax && weight > barbellMax) {
            const capped = Math.round(barbellMax / 5) * 5;
            violations.push({ check: 'weight_cap', severity: 'auto_fixed',
              details: `${seedEx.name} wk${day.week_number}: ${weight}lb > barbell max ${barbellMax}lb`,
              fix_applied: `Capped at ${capped}lb`, fix: { id: ex.id, field: 'weight', value: `${capped} lb` } });
          }
          if (seedEx.category === 'dumbbell' && dbMax && weight > dbMax) {
            const capped = Math.round(dbMax / 5) * 5;
            violations.push({ check: 'weight_cap', severity: 'auto_fixed',
              details: `${seedEx.name} wk${day.week_number}: ${weight}lb > DB max ${dbMax}lb`,
              fix_applied: `Capped at ${capped}lb`, fix: { id: ex.id, field: 'weight', value: `${capped} lb` } });
          }
          if (seedEx.category === 'kettlebell' && kbWeights?.length > 0 && weight > kbWeights[kbWeights.length - 1]) {
            const closest = kbWeights[kbWeights.length - 1];
            violations.push({ check: 'weight_cap', severity: 'auto_fixed',
              details: `${seedEx.name} wk${day.week_number}: ${weight}lb > heaviest KB ${closest}lb`,
              fix_applied: `Set to ${closest}lb`, fix: { id: ex.id, field: 'weight', value: `${closest} lb` } });
          }
        }

        // ── Check 2: Equipment Match ──
        if (seedEx) {
          const required = Array.isArray(seedEx.equipment_required) ? seedEx.equipment_required : [];
          if (required.length > 0) {
            const missing = required.filter(r => !availableEquip.has(r));
            if (missing.length > 0) {
              violations.push({ check: 'equipment_match', severity: 'warning',
                details: `${seedEx.name} requires ${missing.join(', ')} — user doesn't have it` });
            }
          }
        }

        // ── Check 7: Exercise Placement ──
        if (pattern === 'warmup' && !isWarmup && !isCooldown) {
          violations.push({ check: 'exercise_placement', severity: 'auto_fixed',
            details: `${ex.exercise_id} (mobility) in ${blockName} block`,
            fix_applied: 'Removed from non-warmup block', fix: { id: ex.id, action: 'remove' } });
        }

        // ── Check 10: Duplicate Exercise Same Day ──
        // Only flag duplicates within main lift + accessory blocks (same tier)
        // Warmup, cooldown, WOD, core blocks can repeat exercises from other blocks
        const isMainOrAccessory = isMainLift || isAccessory || isArmBlaster;
        if (usedMainAccessoryExercises.has(ex.exercise_id) && isMainOrAccessory) {
          violations.push({ check: 'duplicate_exercise', severity: 'auto_fixed',
            details: `${ex.exercise_id} appears twice on wk${day.week_number} ${day.title || ''}`,
            fix_applied: 'Duplicate removed', fix: { id: ex.id, action: 'remove' } });
        }
        if (isMainOrAccessory) usedMainAccessoryExercises.add(ex.exercise_id);

        // Track weights by phase
        if (weight > 0 && seedEx?.is_compound && day.phase) {
          const key = ex.exercise_id;
          if (!exerciseWeightsByPhase[key]) exerciseWeightsByPhase[key] = {};
          const ph = day.phase.toLowerCase();
          exerciseWeightsByPhase[key][ph] = Math.max(exerciseWeightsByPhase[key][ph] || 0, weight);
        }

        // ── Check 9: Rep/Set Phase Consistency ──
        // Skip carries — they use distance (50yd, 100yd) not strength reps
        const isCarry = pattern === 'carry' || /carry|walk|farmer/i.test(ex.exercise_id || '');
        if (isMainLift && seedEx?.is_compound && ex.sets && !isCarry) {
          const m = String(ex.sets).match(/(\d+)x(\d+)/);
          if (m) {
            const reps = parseInt(m[2]);
            const phase = (day.phase || '').toLowerCase();
            const EXPECTED = { foundation: 10, build: 8, peak: 6, race_prep: 5 };
            if (EXPECTED[phase] && Math.abs(reps - EXPECTED[phase]) > 2) {
              violations.push({ check: 'rep_consistency', severity: 'warning',
                details: `${seedEx.name} wk${day.week_number} (${phase}): ${m[0]} — expected ~3x${EXPECTED[phase]}` });
            }
          }
        }
      }
    }
  }

  // ── Check 3: Phase Structure ──
  const phasesPresent = new Set(planDays.filter(d => !d.isRestDay && !d.is_rest_day).map(d => (d.phase || '').toLowerCase()));
  const hasRace = userProfile.hasRaceDate || userProfile.raceType;
  if (hasRace) {
    for (const req of ['foundation', 'build', 'peak', 'race_prep']) {
      if (!phasesPresent.has(req)) {
        violations.push({ check: 'phase_structure', severity: 'needs_regen',
          details: `Missing ${req} phase in race plan` });
      }
    }
  }
  // Phase order
  const phaseOrder = ['foundation', 'build', 'peak', 'race_prep'];
  let lastIdx = -1;
  for (const day of planDays) {
    if (day.isRestDay || day.is_rest_day) continue;
    const idx = phaseOrder.indexOf((day.phase || '').toLowerCase());
    if (idx >= 0 && idx < lastIdx) {
      violations.push({ check: 'phase_structure', severity: 'warning',
        details: `Phase order violation: ${day.phase} after later phase` });
      break;
    }
    if (idx >= 0) lastIdx = idx;
  }

  // ── Check 4: Deload Weeks ──
  const totalWeeks = Math.max(...planDays.map(d => d.week_number || 0), 0);
  if (totalWeeks >= 8) {
    const hasDeload = planDays.some(d => {
      if (d.isRestDay || d.is_rest_day) return false;
      return (d.blocks || []).some(b =>
        /main|compound/i.test(b.name || '') &&
        (b.exercises || []).some(e => { const m = String(e.sets || '').match(/(\d+)x/); return m && parseInt(m[1]) <= 2; })
      );
    });
    if (!hasDeload) {
      violations.push({ check: 'deload_week', severity: 'warning',
        details: `${totalWeeks}-week plan has no deload week` });
    }
  }

  // ── Check 6: WOD Variety ──
  const uniqueWods = Object.keys(wodCounts).length;
  const totalWodSlots = Object.values(wodCounts).reduce((a, b) => a + b, 0);
  for (const [wod, count] of Object.entries(wodCounts)) {
    if (count > 2) {
      violations.push({ check: 'wod_variety', severity: 'warning',
        details: `A WOD appears ${count} times (max 2)` });
    }
  }
  if (totalWodSlots > 6 && uniqueWods < totalWodSlots * 0.5) {
    violations.push({ check: 'wod_variety', severity: 'warning',
      details: `Only ${uniqueWods} unique WODs across ${totalWodSlots} slots` });
  }

  // ── Check 8: Weight Progression ──
  for (const [exId, phases] of Object.entries(exerciseWeightsByPhase)) {
    const f = phases.foundation || 0, b = phases.build || 0, p = phases.peak || 0, r = phases.race_prep || 0;
    if (f > 0 && b > 0 && b < f * 0.9)
      violations.push({ check: 'weight_progression', severity: 'warning', details: `${exId}: drops Foundation→Build (${f}→${b})` });
    if (b > 0 && p > 0 && p < b * 0.9)
      violations.push({ check: 'weight_progression', severity: 'warning', details: `${exId}: drops Build→Peak (${b}→${p})` });
    if (p > 0 && r > 0 && r < p * 0.85)
      violations.push({ check: 'weight_progression', severity: 'warning', details: `${exId}: Race Prep drops >15% from Peak (${p}→${r})` });
  }

  // Summary
  const autoFixed = violations.filter(v => v.severity === 'auto_fixed').length;
  const needsRegen = violations.some(v => v.severity === 'needs_regen');

  if (violations.length > 0) {
    console.log(`[Validator] ${violations.length} issues: ${autoFixed} auto-fixed, ${violations.filter(v => v.severity === 'warning').length} warnings, ${violations.filter(v => v.severity === 'needs_regen').length} need regen`);
    for (const v of violations.slice(0, 20)) {
      console.log(`  [${v.severity}] ${v.check}: ${v.details}${v.fix_applied ? ` → ${v.fix_applied}` : ''}`);
    }
    if (violations.length > 20) console.log(`  ... and ${violations.length - 20} more`);
  } else {
    console.log('[Validator] All 10 checks passed');
  }

  return { passed: !needsRegen, violations, auto_fixes_applied: autoFixed, needs_regeneration: needsRegen };
}

// Apply auto-fixes to the database
export async function applyAutoFixes(violations, database) {
  const fixes = violations.filter(v => v.severity === 'auto_fixed' && v.fix);
  let applied = 0;
  for (const v of fixes) {
    try {
      if (v.fix.field === 'weight') {
        await database.runAsync('UPDATE plan_exercises SET weight = ? WHERE id = ?', [v.fix.value, v.fix.id]);
        applied++;
      }
      if (v.fix.action === 'remove') {
        await database.runAsync('DELETE FROM plan_exercises WHERE id = ?', [v.fix.id]);
        applied++;
      }
    } catch (e) { console.error('[Validator] Fix failed:', e.message); }
  }
  console.log(`[Validator] Applied ${applied} auto-fixes`);
  return applied;
}
