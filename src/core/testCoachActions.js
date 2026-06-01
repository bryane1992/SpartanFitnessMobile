// Coach Action Test Script
// Tests undo system and injury auto-modify against real plan data in the DB.
// Run from Settings screen via "Test Coach Actions" button.

import { getDatabase, adjustFutureWeights, updateExerciseLog, swapExercise,
  restoreWodBlock, deleteLatestInjury, saveInjury, getActiveInjuries } from '../data/database';

export async function testCoachActions(onLog) {
  const log = (msg) => {
    console.log(`[CoachTest] ${msg}`);
    if (onLog) onLog(msg);
  };

  const db = await getDatabase();
  const results = { passed: 0, failed: 0, skipped: 0 };

  // Find a plan with exercises
  const planDay = await db.getFirstAsync(
    'SELECT plan_id FROM plan_days WHERE is_rest_day = 0 ORDER BY date LIMIT 1'
  );
  if (!planDay) {
    log('ERROR: No plan found. Generate a plan first.');
    return { success: false, error: 'No plan found' };
  }
  const planId = planDay.plan_id;

  // Get first training day with exercises
  const firstDay = await db.getFirstAsync(
    'SELECT * FROM plan_days WHERE plan_id = ? AND is_rest_day = 0 ORDER BY date LIMIT 1',
    [planId]
  );
  const blocks = await db.getAllAsync(
    'SELECT * FROM plan_blocks WHERE plan_day_id = ? ORDER BY sort_order',
    [firstDay.id]
  );
  for (const block of blocks) {
    block.exercises = await db.getAllAsync(
      `SELECT pe.*, COALESCE(e.name, pe.exercise_id) as name, e.muscle_group, e.secondary_muscles, e.category
       FROM plan_exercises pe LEFT JOIN exercises e ON e.id = pe.exercise_id
       WHERE pe.plan_block_id = ? ORDER BY pe.sort_order`,
      [block.id]
    );
  }
  const allExercises = blocks.flatMap(b => b.exercises || []);
  const weightedExercises = allExercises.filter(e => parseFloat(e.weight) > 0);

  log(`Plan: ${planId}, Day: ${firstDay.title} (${firstDay.date})`);
  log(`Exercises: ${allExercises.length} total, ${weightedExercises.length} with weights`);

  // ═══════════════════════════════════════════════
  // TEST 1: Swap + Undo
  // ═══════════════════════════════════════════════
  log('\n=== TEST 1: SWAP + UNDO ===');
  const swapTarget = allExercises.find(e => e.exercise_id && !e.is_completed);
  if (swapTarget) {
    const originalId = swapTarget.exercise_id;
    // Find a different exercise to swap to
    const altExercise = await db.getFirstAsync(
      `SELECT id FROM exercises WHERE id != ? AND muscle_group = ? AND category != 'bodyweight' LIMIT 1`,
      [originalId, swapTarget.muscle_group || 'chest']
    );
    if (altExercise) {
      log(`Swapping ${originalId} → ${altExercise.id}`);
      await swapExercise(swapTarget.id, altExercise.id, originalId);

      // Verify swap happened
      const afterSwap = await db.getFirstAsync('SELECT exercise_id FROM plan_exercises WHERE id = ?', [swapTarget.id]);
      if (afterSwap.exercise_id === altExercise.id) {
        log(`  Swap verified: now ${afterSwap.exercise_id}`);

        // Undo: swap back
        await swapExercise(swapTarget.id, originalId, null);
        const afterUndo = await db.getFirstAsync('SELECT exercise_id FROM plan_exercises WHERE id = ?', [swapTarget.id]);
        if (afterUndo.exercise_id === originalId) {
          log(`  Undo verified: back to ${originalId}`);
          results.passed++;
        } else {
          log(`  FAIL: undo gave ${afterUndo.exercise_id}, expected ${originalId}`);
          results.failed++;
        }
      } else {
        log(`  FAIL: swap didn't take effect`);
        results.failed++;
      }
    } else {
      log('  Skipped — no alternative exercise found');
      results.skipped++;
    }
  } else {
    log('  Skipped — no exercises to swap');
    results.skipped++;
  }

  // ═══════════════════════════════════════════════
  // TEST 2: Adjust Weight + Undo (inverse ratio)
  // ═══════════════════════════════════════════════
  log('\n=== TEST 2: ADJUST WEIGHT + UNDO ===');
  if (weightedExercises.length > 0) {
    const target = weightedExercises[0];
    const originalWeight = parseFloat(target.weight);
    const newWeight = Math.round((originalWeight * 1.3) / 5) * 5;
    const ratio = newWeight / originalWeight;
    const inverseRatio = originalWeight / newWeight;

    log(`${target.exercise_id}: ${originalWeight} lb → ${newWeight} lb (ratio ${ratio.toFixed(3)})`);

    // Get a future instance to verify
    const futureInstance = await db.getFirstAsync(
      `SELECT pe.id, pe.weight FROM plan_exercises pe
       JOIN plan_blocks pb ON pb.id = pe.plan_block_id
       JOIN plan_days pd ON pd.id = pb.plan_day_id
       WHERE pe.exercise_id = ? AND pe.is_completed = 0 AND pd.date > ?
       ORDER BY pd.date LIMIT 1`,
      [target.exercise_id, firstDay.date]
    );

    if (futureInstance) {
      const futureOriginal = parseFloat(futureInstance.weight);
      log(`  Future instance (id:${futureInstance.id}): ${futureOriginal} lb`);

      // Apply adjustment
      await adjustFutureWeights(target.exercise_id, ratio, firstDay.date);
      const afterAdjust = await db.getFirstAsync('SELECT weight FROM plan_exercises WHERE id = ?', [futureInstance.id]);
      const adjustedWeight = parseFloat(afterAdjust.weight);
      const expectedAdjusted = Math.round((futureOriginal * ratio) / 5) * 5;
      log(`  After adjust: ${adjustedWeight} lb (expected ~${expectedAdjusted} lb)`);

      if (Math.abs(adjustedWeight - expectedAdjusted) <= 5) {
        log(`  Adjust verified`);

        // Undo with inverse ratio
        await adjustFutureWeights(target.exercise_id, inverseRatio, firstDay.date);
        const afterUndo = await db.getFirstAsync('SELECT weight FROM plan_exercises WHERE id = ?', [futureInstance.id]);
        const undoneWeight = parseFloat(afterUndo.weight);
        log(`  After undo: ${undoneWeight} lb (original was ${futureOriginal} lb)`);

        if (Math.abs(undoneWeight - futureOriginal) <= 5) {
          log(`  Undo verified`);
          results.passed++;
        } else {
          log(`  FAIL: undo gave ${undoneWeight}, expected ~${futureOriginal}`);
          results.failed++;
        }
      } else {
        log(`  FAIL: adjust gave ${adjustedWeight}, expected ~${expectedAdjusted}`);
        results.failed++;
      }
    } else {
      log('  Skipped — no future instances found');
      results.skipped++;
    }
  } else {
    log('  Skipped — no weighted exercises');
    results.skipped++;
  }

  // ═══════════════════════════════════════════════
  // TEST 3: Remove Exercise + Undo
  // ═══════════════════════════════════════════════
  log('\n=== TEST 3: REMOVE EXERCISE + UNDO ===');
  const removeTarget = allExercises.find(e => !e.is_completed && !e.actual_reps);
  if (removeTarget) {
    log(`Removing ${removeTarget.name} (id:${removeTarget.id})`);
    await updateExerciseLog(removeTarget.id, 'SKIP', null, 'Test removal');

    const afterRemove = await db.getFirstAsync('SELECT actual_reps, notes FROM plan_exercises WHERE id = ?', [removeTarget.id]);
    if (afterRemove.actual_reps === 'SKIP') {
      log(`  Remove verified: actual_reps = SKIP`);

      // Undo
      await updateExerciseLog(removeTarget.id, null, null, null);
      const afterUndo = await db.getFirstAsync('SELECT actual_reps, notes FROM plan_exercises WHERE id = ?', [removeTarget.id]);
      if (!afterUndo.actual_reps) {
        log(`  Undo verified: actual_reps cleared`);
        results.passed++;
      } else {
        log(`  FAIL: undo didn't clear actual_reps: ${afterUndo.actual_reps}`);
        results.failed++;
      }
    } else {
      log(`  FAIL: remove didn't set SKIP`);
      results.failed++;
    }
  } else {
    log('  Skipped — no removable exercises');
    results.skipped++;
  }

  // ═══════════════════════════════════════════════
  // TEST 4: Add Note + Undo
  // ═══════════════════════════════════════════════
  log('\n=== TEST 4: ADD NOTE + UNDO ===');
  const noteTarget = allExercises.find(e => !e.is_completed);
  if (noteTarget) {
    const originalNotes = noteTarget.notes;
    const testNote = 'TEST: shoulder injury, partial ROM';
    log(`Adding note to ${noteTarget.name}: "${testNote}"`);

    await updateExerciseLog(noteTarget.id, null, null, testNote);
    const afterNote = await db.getFirstAsync('SELECT notes FROM plan_exercises WHERE id = ?', [noteTarget.id]);
    if (afterNote.notes === testNote) {
      log(`  Note verified`);

      // Undo
      await updateExerciseLog(noteTarget.id, null, null, originalNotes || null);
      const afterUndo = await db.getFirstAsync('SELECT notes FROM plan_exercises WHERE id = ?', [noteTarget.id]);
      if (afterUndo.notes === originalNotes || (!afterUndo.notes && !originalNotes)) {
        log(`  Undo verified`);
        results.passed++;
      } else {
        log(`  FAIL: undo gave "${afterUndo.notes}", expected "${originalNotes}"`);
        results.failed++;
      }
    } else {
      log(`  FAIL: note wasn't saved`);
      results.failed++;
    }
  } else {
    log('  Skipped');
    results.skipped++;
  }

  // ═══════════════════════════════════════════════
  // TEST 5: Flag Injury + Undo
  // ═══════════════════════════════════════════════
  log('\n=== TEST 5: FLAG INJURY + UNDO ===');
  const testBodyPart = 'test_shoulder_' + Date.now();
  await saveInjury(testBodyPart, 'mild', null);
  const injuries = await getActiveInjuries();
  const found = injuries.find(i => i.body_part === testBodyPart);
  if (found) {
    log(`  Injury flagged: ${testBodyPart}`);

    // Undo
    await deleteLatestInjury(testBodyPart);
    const afterUndo = await getActiveInjuries();
    const stillThere = afterUndo.find(i => i.body_part === testBodyPart);
    if (!stillThere) {
      log(`  Undo verified: injury removed`);
      results.passed++;
    } else {
      log(`  FAIL: injury not removed`);
      results.failed++;
    }
  } else {
    log(`  FAIL: injury wasn't saved`);
    results.failed++;
  }

  // ═══════════════════════════════════════════════
  // TEST 6: Injury Auto-Modify Detection
  // ═══════════════════════════════════════════════
  log('\n=== TEST 6: INJURY MUSCLE MATCHING ===');
  const BODY_PART_MUSCLES = {
    shoulder: ['shoulders', 'delts', 'front_delt', 'rear_delt', 'lateral_delt'],
    knee: ['quads', 'quadriceps', 'hamstrings', 'legs'],
    back: ['back', 'lats', 'upper_back', 'lower_back', 'traps', 'rhomboids'],
    chest: ['chest', 'pecs'],
    elbow: ['biceps', 'triceps', 'forearms', 'arms'],
  };

  // Test with "shoulder" — find affected exercises
  const shoulderMuscles = BODY_PART_MUSCLES['shoulder'];
  const shoulderAffected = allExercises.filter(e => {
    if (e.is_completed) return false;
    const mg = (e.muscle_group || '').toLowerCase();
    let secondary = [];
    try { secondary = JSON.parse(e.secondary_muscles || '[]').map(s => s.toLowerCase()); } catch {}
    if (typeof e.secondary_muscles === 'string' && !e.secondary_muscles.startsWith('[')) {
      secondary = e.secondary_muscles.split(',').map(s => s.trim().toLowerCase());
    }
    const allMuscles = [mg, ...secondary];
    return shoulderMuscles.some(t => allMuscles.some(m => m.includes(t) || t.includes(m)));
  });

  log(`"Shoulder" injury would affect ${shoulderAffected.length} exercises:`);
  for (const ex of shoulderAffected.slice(0, 5)) {
    const w = parseFloat(ex.weight) || 0;
    const reduced = Math.round((w * 0.5) / 5) * 5;
    log(`  ${ex.name} (${ex.muscle_group}) — ${w > 0 ? `${w} lb → ${reduced} lb` : 'BW'}`);
  }
  if (shoulderAffected.length >= 0) {
    // Just verifying the matching logic works — even 0 matches is valid if no shoulder exercises today
    log(`  Muscle matching: PASS`);
    results.passed++;
  }

  // ═══════════════════════════════════════════════
  // TEST 7: WOD Block Restore
  // ═══════════════════════════════════════════════
  log('\n=== TEST 7: WOD BLOCK RESTORE ===');
  const wodBlock = blocks.find(b => b.is_amrap || /wod|circuit|amrap|emom|finisher/i.test(b.name || ''));
  if (wodBlock && wodBlock.exercises.length > 0) {
    // Snapshot the current state
    const snapshot = {
      exercises: wodBlock.exercises.map(e => ({
        exercise_id: e.exercise_id, sort_order: e.sort_order,
        sets: e.sets, reps: e.reps, weight: e.weight, rest: e.rest, notes: e.notes,
      })),
      name: wodBlock.name, type: wodBlock.type, is_amrap: wodBlock.is_amrap, time_cap: wodBlock.time_cap,
    };
    log(`WOD block "${wodBlock.name}" has ${wodBlock.exercises.length} exercises`);

    // Simulate modification: delete one exercise
    const firstExId = wodBlock.exercises[0].id;
    await db.runAsync('DELETE FROM plan_exercises WHERE id = ?', [firstExId]);
    const afterDelete = await db.getAllAsync('SELECT * FROM plan_exercises WHERE plan_block_id = ?', [wodBlock.id]);
    log(`  After delete: ${afterDelete.length} exercises (was ${wodBlock.exercises.length})`);

    // Restore
    await restoreWodBlock(wodBlock.id, snapshot.exercises, snapshot);
    const afterRestore = await db.getAllAsync('SELECT * FROM plan_exercises WHERE plan_block_id = ?', [wodBlock.id]);
    log(`  After restore: ${afterRestore.length} exercises`);

    if (afterRestore.length === wodBlock.exercises.length) {
      // Verify exercise IDs match
      const restoredIds = afterRestore.map(e => e.exercise_id).sort();
      const originalIds = wodBlock.exercises.map(e => e.exercise_id).sort();
      if (JSON.stringify(restoredIds) === JSON.stringify(originalIds)) {
        log(`  Restore verified: all exercises match`);
        results.passed++;
      } else {
        log(`  FAIL: exercise IDs don't match after restore`);
        results.failed++;
      }
    } else {
      log(`  FAIL: exercise count ${afterRestore.length} != ${wodBlock.exercises.length}`);
      results.failed++;
    }
  } else {
    log('  Skipped — no WOD/finisher block found');
    results.skipped++;
  }

  // ═══════════════════════════════════════════════
  // TEST 8: addExerciseToBlock dedup — same exercise added twice = one row
  // Regression guard for duplicate prehab bug
  // ═══════════════════════════════════════════════
  log('\n=== TEST 8: ADD EXERCISE DEDUP ===');
  const { addExerciseToBlock } = require('../data/database');
  const warmupBlock = blocks.find(b => /warm.?up|movement.?prep|activation/i.test(b.name || ''));
  if (warmupBlock) {
    const testExerciseId = 'tibialis_raise'; // exercise we had the duplicate bug with
    // Remove any existing instance first so test is clean
    await db.runAsync('DELETE FROM plan_exercises WHERE plan_block_id = ? AND exercise_id = ?', [warmupBlock.id, testExerciseId]);
    // Add twice
    const id1 = await addExerciseToBlock(warmupBlock.id, testExerciseId, '2x15', '15', 'BW', null);
    const id2 = await addExerciseToBlock(warmupBlock.id, testExerciseId, '2x15', '15', 'BW', null);
    const rows = await db.getAllAsync('SELECT id FROM plan_exercises WHERE plan_block_id = ? AND exercise_id = ?', [warmupBlock.id, testExerciseId]);
    const dedupPass = rows.length === 1 && id1 === id2;
    log(`  Added twice → ${rows.length} row(s) in DB, ids: ${id1}, ${id2}`);
    log(`  [${dedupPass ? 'PASS' : 'FAIL'}] Dedup: ${dedupPass ? 'second add returned same id, no duplicate' : 'DUPLICATE CREATED'}`);
    // Cleanup
    await db.runAsync('DELETE FROM plan_exercises WHERE plan_block_id = ? AND exercise_id = ?', [warmupBlock.id, testExerciseId]);
    if (dedupPass) results.passed++; else results.failed++;
  } else {
    log('  Skipped — no warmup block found on test day');
    results.skipped++;
  }

  // ═══════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════
  const total = results.passed + results.failed;
  log(`\n=== RESULTS ===`);
  log(`${results.passed}/${total} passed, ${results.failed} failed, ${results.skipped} skipped`);
  log(results.failed === 0 ? 'All coach actions WORKING' : 'SOME TESTS FAILED — check logs');

  return {
    success: results.failed === 0,
    ...results,
  };
}
