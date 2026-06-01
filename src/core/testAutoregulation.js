// Autoregulation Test Script
// Generates a plan, simulates completing exercises with different weights,
// triggers adjustFutureWeights, and verifies future weeks were scaled correctly.
//
// Run from Settings screen via "Test Autoregulation" button.

import { getDatabase } from '../data/database';
import { adjustFutureWeights } from '../data/database';

export async function testAutoregulation(onLog) {
  const log = (msg) => {
    console.log(`[AutoregTest] ${msg}`);
    if (onLog) onLog(msg);
  };

  const db = await getDatabase();

  // Step 1: Find the current plan
  const planDay = await db.getFirstAsync(
    'SELECT plan_id FROM plan_days WHERE is_rest_day = 0 ORDER BY date LIMIT 1'
  );
  if (!planDay) {
    log('ERROR: No plan found. Generate a plan first, then run this test.');
    return { success: false, error: 'No plan found' };
  }
  const planId = planDay.plan_id;
  log(`Found plan: ${planId}`);

  // Step 2: Get all training days grouped by week
  const allDays = await db.getAllAsync(
    `SELECT pd.id, pd.date, pd.week_number, pd.title, pd.is_rest_day
     FROM plan_days pd WHERE pd.plan_id = ? ORDER BY pd.date`,
    [planId]
  );
  const trainingDays = allDays.filter(d => !d.is_rest_day);
  log(`Plan has ${allDays.length} total days, ${trainingDays.length} training days`);

  // Step 3: Pick a target exercise — find one that appears in multiple weeks
  // Only consider exercises from COMPOUND/ISOLATION blocks with numeric weights (not warmup/cooldown/core)
  const exerciseCounts = await db.getAllAsync(
    `SELECT pe.exercise_id, COUNT(*) as appearances, MIN(CAST(pe.weight AS REAL)) as min_weight, MAX(CAST(pe.weight AS REAL)) as max_weight
     FROM plan_exercises pe
     JOIN plan_blocks pb ON pb.id = pe.plan_block_id
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     WHERE pd.plan_id = ?
       AND pb.type IN ('COMPOUND', 'ISOLATION', 'SUPERSETS')
       AND pe.weight GLOB '[0-9]*'
       AND CAST(pe.weight AS REAL) > 0
     GROUP BY pe.exercise_id
     HAVING appearances >= 4
     ORDER BY appearances DESC`,
    [planId]
  );

  if (exerciseCounts.length === 0) {
    log('ERROR: No exercises appear 4+ times in the plan. Plan may be too short.');
    return { success: false, error: 'No recurring exercises found' };
  }

  log('\n=== RECURRING EXERCISES ===');
  for (const ex of exerciseCounts.slice(0, 8)) {
    log(`  ${ex.exercise_id}: ${ex.appearances}x, weights ${ex.min_weight} → ${ex.max_weight}`);
  }

  // Pick the most frequent compound exercise
  const targetExercise = exerciseCounts[0].exercise_id;
  log(`\nTarget exercise: ${targetExercise} (${exerciseCounts[0].appearances} appearances)`);

  // Step 4: Get all instances of this exercise across weeks
  const allInstances = await db.getAllAsync(
    `SELECT pe.id, pe.exercise_id, pe.weight, pe.sets, pe.reps, pe.is_completed, pe.actual_weight,
            pd.week_number, pd.date, pd.title
     FROM plan_exercises pe
     JOIN plan_blocks pb ON pb.id = pe.plan_block_id
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     WHERE pd.plan_id = ? AND pe.exercise_id = ?
     ORDER BY pd.date`,
    [planId, targetExercise]
  );

  log(`\n=== BEFORE AUTOREGULATION ===`);
  log(`${targetExercise} across ${allInstances.length} weeks:`);
  for (const inst of allInstances) {
    const status = inst.is_completed ? ' [DONE]' : '';
    log(`  Wk${inst.week_number} (${inst.date}): ${inst.sets} @ ${inst.weight}${status}`);
  }

  // Step 5: Simulate completing the first instance with a HIGHER weight
  const firstInstance = allInstances.find(i => !i.is_completed);
  if (!firstInstance) {
    log('ERROR: All instances already completed. Reset plan or generate a new one.');
    return { success: false, error: 'All instances completed' };
  }

  const prescribedWeight = parseFloat(firstInstance.weight);
  if (isNaN(prescribedWeight) || prescribedWeight <= 0) {
    log(`ERROR: Cannot parse prescribed weight: "${firstInstance.weight}"`);
    return { success: false, error: 'Invalid weight' };
  }

  // Simulate logging 25% heavier than prescribed
  const actualWeight = Math.round((prescribedWeight * 1.25) / 5) * 5;
  const ratio = actualWeight / prescribedWeight;

  log(`\n=== SIMULATING WORKOUT ===`);
  log(`Prescribed: ${prescribedWeight} lb`);
  log(`Actual logged: ${actualWeight} lb (+${Math.round((ratio - 1) * 100)}%)`);
  log(`Ratio: ${ratio.toFixed(3)}`);

  // Mark it as completed with the actual weight
  await db.runAsync(
    'UPDATE plan_exercises SET is_completed = 1, actual_weight = ? WHERE id = ?',
    [`${actualWeight} lb`, firstInstance.id]
  );
  // Also mark the day's date as "today" for the adjustment query
  const adjustDate = firstInstance.date;

  // Step 6: Run adjustFutureWeights
  log(`\nRunning adjustFutureWeights('${targetExercise}', ${ratio.toFixed(3)}, '${adjustDate}')...`);
  const adjustedCount = await adjustFutureWeights(targetExercise, ratio, adjustDate);
  log(`Adjusted ${adjustedCount} future instances`);

  // Step 7: Verify — re-read all instances
  const afterInstances = await db.getAllAsync(
    `SELECT pe.id, pe.exercise_id, pe.weight, pe.sets, pe.reps, pe.is_completed, pe.actual_weight,
            pd.week_number, pd.date, pd.title
     FROM plan_exercises pe
     JOIN plan_blocks pb ON pb.id = pe.plan_block_id
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     WHERE pd.plan_id = ? AND pe.exercise_id = ?
     ORDER BY pd.date`,
    [planId, targetExercise]
  );

  log(`\n=== AFTER AUTOREGULATION ===`);
  log(`${targetExercise} across ${afterInstances.length} weeks:`);
  let verified = 0;
  let failures = 0;
  for (const inst of afterInstances) {
    const before = allInstances.find(i => i.id === inst.id);
    const wasAdjusted = before && before.weight !== inst.weight;
    const marker = inst.is_completed ? ' [DONE]' : wasAdjusted ? ' [ADJUSTED]' : '';
    log(`  Wk${inst.week_number} (${inst.date}): ${inst.sets} @ ${inst.weight}${marker}`);

    // Verify adjusted instances
    if (wasAdjusted && !inst.is_completed) {
      const expectedWeight = Math.round((parseFloat(before.weight) * ratio) / 5) * 5;
      const actualAdjusted = parseFloat(inst.weight);
      if (Math.abs(actualAdjusted - expectedWeight) <= 5) {
        verified++;
      } else {
        log(`    MISMATCH: expected ~${expectedWeight} lb, got ${actualAdjusted} lb`);
        failures++;
      }
    }
  }

  // Step 8: Now simulate logging LOWER weight on a different exercise
  log(`\n=== TEST 2: LOWER WEIGHT ===`);
  const secondExercise = exerciseCounts.length > 1 ? exerciseCounts[1] : null;
  let lowerTestResult = null;

  if (secondExercise) {
    const secondInstances = await db.getAllAsync(
      `SELECT pe.id, pe.weight, pd.week_number, pd.date
       FROM plan_exercises pe
       JOIN plan_blocks pb ON pb.id = pe.plan_block_id
       JOIN plan_days pd ON pd.id = pb.plan_day_id
       WHERE pd.plan_id = ? AND pe.exercise_id = ? AND pe.is_completed = 0
       ORDER BY pd.date`,
      [planId, secondExercise.exercise_id]
    );

    if (secondInstances.length >= 2) {
      const target = secondInstances[0];
      const prescribed2 = parseFloat(target.weight);
      // Simulate logging 20% LIGHTER
      const actual2 = Math.round((prescribed2 * 0.80) / 5) * 5;
      const ratio2 = actual2 / prescribed2;

      log(`Exercise: ${secondExercise.exercise_id}`);
      log(`Prescribed: ${prescribed2} lb → Actual: ${actual2} lb (${Math.round((ratio2 - 1) * 100)}%)`);

      await db.runAsync(
        'UPDATE plan_exercises SET is_completed = 1, actual_weight = ? WHERE id = ?',
        [`${actual2} lb`, target.id]
      );

      const adjusted2 = await adjustFutureWeights(secondExercise.exercise_id, ratio2, target.date);
      log(`Adjusted ${adjusted2} future instances`);

      // Verify
      const after2 = await db.getAllAsync(
        `SELECT pe.weight, pd.week_number FROM plan_exercises pe
         JOIN plan_blocks pb ON pb.id = pe.plan_block_id
         JOIN plan_days pd ON pd.id = pb.plan_day_id
         WHERE pd.plan_id = ? AND pe.exercise_id = ? ORDER BY pd.date`,
        [planId, secondExercise.exercise_id]
      );
      log(`After adjustment:`);
      for (const inst of after2.slice(0, 6)) {
        log(`  Wk${inst.week_number}: ${inst.weight}`);
      }
      lowerTestResult = adjusted2 > 0;
    } else {
      log(`Skipped — ${secondExercise.exercise_id} has < 2 unfinished instances`);
    }
  }

  // Step 9: Undo test data — reset completed exercises back to uncompleted
  log(`\n=== CLEANUP ===`);
  // Reset the exercises we marked as completed
  await db.runAsync(
    'UPDATE plan_exercises SET is_completed = 0, actual_weight = NULL WHERE id = ?',
    [firstInstance.id]
  );
  if (secondExercise) {
    // Reset second exercise too
    await db.runAsync(
      `UPDATE plan_exercises SET is_completed = 0, actual_weight = NULL
       WHERE exercise_id = ? AND plan_block_id IN (
         SELECT pb.id FROM plan_blocks pb JOIN plan_days pd ON pd.id = pb.plan_day_id WHERE pd.plan_id = ?
       )`,
      [secondExercise.exercise_id, planId]
    );
  }
  log('Reset test exercises to uncompleted');
  log('NOTE: Adjusted weights remain — regenerate plan to fully reset');

  // ═══════════════════════════════════════════════
  // TEST 3: Today-inclusion — adjustFutureWeights must update same-day exercises
  // Regression test for the >= vs > date filter bug
  // ═══════════════════════════════════════════════
  log(`\n=== TEST 3: TODAY-INCLUSION ===`);
  let todayInclusionPass = false;
  try {
    // Find any uncompleted exercise with a numeric weight
    const todayTarget = await db.getFirstAsync(
      `SELECT pe.id, pe.exercise_id, pe.weight, pd.date
       FROM plan_exercises pe
       JOIN plan_blocks pb ON pb.id = pe.plan_block_id
       JOIN plan_days pd ON pd.id = pb.plan_day_id
       WHERE pd.plan_id = ? AND pe.is_completed = 0 AND pe.weight GLOB '[0-9]*'
       ORDER BY pd.date LIMIT 1`,
      [planId]
    );
    if (todayTarget) {
      const originalWeight = todayTarget.weight;
      log(`Target: ${todayTarget.exercise_id} on ${todayTarget.date} @ ${originalWeight}`);
      // Run with todayTarget.date as "today" — exercise should be included via >=
      await adjustFutureWeights(todayTarget.exercise_id, 1.10, todayTarget.date);
      const afterToday = await db.getFirstAsync(
        'SELECT weight FROM plan_exercises WHERE id = ?', [todayTarget.id]
      );
      todayInclusionPass = afterToday?.weight !== originalWeight;
      log(`  Before: ${originalWeight} → After: ${afterToday?.weight}`);
      log(`  [${todayInclusionPass ? 'PASS' : 'FAIL'}] Same-day exercise was ${todayInclusionPass ? '' : 'NOT '}updated`);
      // Restore original weight
      await db.runAsync('UPDATE plan_exercises SET weight = ? WHERE id = ?', [originalWeight, todayTarget.id]);
    } else {
      log('  SKIP: no uncompleted exercises with numeric weights');
    }
  } catch (e) {
    log(`  ERROR: ${e.message}`);
  }

  // Summary
  const totalTests = verified + failures + (lowerTestResult !== null ? 1 : 0) + 1;
  const passed = verified + (lowerTestResult ? 1 : 0) + (todayInclusionPass ? 1 : 0);
  log(`\n=== RESULTS ===`);
  log(`Higher weight test: ${verified} verified, ${failures} failures`);
  log(`Lower weight test: ${lowerTestResult === null ? 'skipped' : lowerTestResult ? 'PASS' : 'FAIL'}`);
  log(`Today-inclusion test: ${todayInclusionPass ? 'PASS' : 'FAIL'}`);
  log(`Total: ${passed}/${totalTests} passed`);
  log(adjustedCount > 0 ? 'Autoregulation is WORKING' : 'WARNING: No adjustments made');

  return {
    success: failures === 0 && adjustedCount > 0,
    targetExercise,
    prescribedWeight,
    actualWeight,
    adjustedCount,
    verified,
    failures,
  };
}
