// Plan Validator
// Validates generated plans against known failure modes
// Returns a score (0-10) and list of violations
// Used as a safety net — should catch 0 issues in a well-built plan

export function validateGeneratedPlan(planData, userProfile, strategy) {
  const violations = [];

  // ── Equipment utilization ──
  const equip = (userProfile.equipment || []).map(e => e.toLowerCase());
  if (equip.some(e => /barbell|squat rack/i.test(e))) {
    const hasBarbellExercise = planData.exercises.some(e => e.category === 'barbell');
    if (!hasBarbellExercise) {
      violations.push({ severity: 'critical', rule: 'BARBELL_UNUSED', message: 'User has barbell but plan contains no barbell exercises' });
    }
  }

  // ── Weight sanity ──
  const ww = userProfile.workingWeights;
  if (ww) {
    for (const ex of planData.exercises) {
      const w = parseFloat(ex.weight);
      if (isNaN(w) || w <= 0) continue;

      // Check compounds aren't absurdly light
      if (ex.is_compound && ex.category === 'barbell' && w < 25 && !ex.isDeload) {
        violations.push({ severity: 'warning', rule: 'WEIGHT_TOO_LOW', message: `${ex.name} at ${w}lb seems too light for barbell compound` });
      }

      // Check weights don't exceed equipment limits
      if (ex.category === 'barbell' && userProfile.equipmentDetails?.barbell?.maxWeight) {
        const max = parseFloat(userProfile.equipmentDetails.barbell.maxWeight);
        if (w > max) {
          violations.push({ severity: 'critical', rule: 'EXCEEDS_EQUIPMENT', message: `${ex.name} at ${w}lb exceeds barbell max ${max}lb` });
        }
      }
    }
  }

  // ── Progressive overload — same exercise should trend up (except deloads) ──
  const byExercise = {};
  for (const ex of planData.exercises) {
    const w = parseFloat(ex.weight);
    if (isNaN(w) || w <= 0) continue;
    if (!byExercise[ex.exerciseId]) byExercise[ex.exerciseId] = [];
    byExercise[ex.exerciseId].push({ week: ex.week, weight: w, isDeload: ex.isDeload });
  }
  for (const [id, entries] of Object.entries(byExercise)) {
    const sorted = entries.sort((a, b) => a.week - b.week);
    for (let i = 1; i < sorted.length; i++) {
      if (!sorted[i].isDeload && sorted[i].weight < sorted[i - 1].weight && !sorted[i - 1].isDeload) {
        violations.push({
          severity: 'warning', rule: 'REGRESSION',
          message: `${id} drops from ${sorted[i - 1].weight}lb (wk${sorted[i - 1].week}) to ${sorted[i].weight}lb (wk${sorted[i].week})`,
        });
        break; // one violation per exercise is enough
      }
    }
  }

  // ── Race distance ──
  if (planData.targetDistance) {
    const maxRunDist = Math.max(0, ...planData.runs.map(r => parseFloat(r.distance) || 0));
    if (maxRunDist < planData.targetDistance * 0.90) {
      violations.push({ severity: 'critical', rule: 'RACE_DISTANCE_NOT_REACHED', message: `Longest run ${maxRunDist}mi but target is ${planData.targetDistance}mi` });
    }
  }

  // ── Required movements for race ──
  if (planData.raceReqs?.must_include) {
    for (const movement of planData.raceReqs.must_include) {
      const found = planData.exercises.some(e => e.exerciseId === movement || e.name?.toLowerCase().includes(movement.replace('_', ' ')));
      if (!found) {
        violations.push({ severity: 'warning', rule: 'MISSING_RACE_MOVEMENT', message: `Race requires ${movement} but not found in plan` });
      }
    }
  }

  // ── Pull-ups check for Spartan ──
  if (planData.raceReqs?.must_include?.includes('pull_ups')) {
    const pullUpCount = planData.exercises.filter(e => /pull.?up|chin.?up/i.test(e.name || '')).length;
    if (pullUpCount === 0) {
      violations.push({ severity: 'critical', rule: 'NO_PULL_UPS', message: 'Spartan race requires pull-ups but none in plan' });
    }
  }

  // ── Score ──
  const criticalCount = violations.filter(v => v.severity === 'critical').length;
  const warningCount = violations.filter(v => v.severity === 'warning').length;
  const score = Math.max(0, 10 - (criticalCount * 2) - (warningCount * 0.5));

  return { score: Math.round(score * 10) / 10, violations, pass: criticalCount === 0 };
}

// Log validation results
export function logValidation(result) {
  if (result.violations.length === 0) {
    console.log(`[Plan Validator] PASS (${result.score}/10) — no issues`);
  } else {
    console.warn(`[Plan Validator] Score: ${result.score}/10, ${result.violations.length} issues:`);
    for (const v of result.violations) {
      const icon = v.severity === 'critical' ? 'CRITICAL' : 'WARNING';
      console.warn(`  [${icon}] ${v.rule}: ${v.message}`);
    }
  }
}
