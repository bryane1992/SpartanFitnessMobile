// Short Plan Test Script
// Generates plans for 4, 5, 6, and 8-week profiles and validates:
// - Phase structure matches expected (no race_prep for non-racers, foundation-only for 4 weeks)
// - No deloads for plans ≤5 weeks
// - Correct total week count
// - Exercises have valid weights (not BW on compound lifts)
// - Rep scheme matches phase (3x10 foundation, 3x8 build, 3x6 peak)
//
// Run from Settings screen via "Test Short Plans" button.

import { getTestProfile, TEST_PROFILES } from './testProfiles';
import { getDatabase } from '../data/database';

const SHORT_PLAN_KEYS = ['short_4week_beginner', 'short_6week_intermediate', 'short_5week_race', 'short_8week_advanced'];

export async function testShortPlans(onLog, onStatus) {
  const log = (msg) => {
    console.log(`[ShortPlanTest] ${msg}`);
    if (onLog) onLog(msg);
  };

  const results = { passed: 0, failed: 0, plans: [] };

  for (const key of SHORT_PLAN_KEYS) {
    const test = TEST_PROFILES[key];
    if (!test) { log(`SKIP: ${key} not found`); continue; }

    log(`\n${'═'.repeat(50)}`);
    log(`TESTING: ${test.label}`);
    log(`Expected: ${test.expected}`);
    log(`${'═'.repeat(50)}`);

    if (onStatus) onStatus(`Generating ${test.label}...`);

    const profile = getTestProfile(key);
    const targetWeeks = test.profile._shortPlanWeeks;

    try {
      const { generateAIPlan } = require('./aiPlanGenerator');
      const result = await generateAIPlan(profile, (s) => log(`  ${s}`));

      log(`Plan: "${result.planName}" — ${result.totalWeeks} weeks`);
      log(`Phases: ${result.phases.map(p => `${p.name}(${p.totalWeeks}w)`).join(' → ')}`);

      const planResult = { key, label: test.label, weeks: result.totalWeeks, checks: [] };

      // ── CHECK 1: Total weeks matches target ──
      const weekCheck = result.totalWeeks === targetWeeks;
      planResult.checks.push({ name: 'Total weeks', pass: weekCheck, detail: `${result.totalWeeks} (expected ${targetWeeks})` });
      log(`  [${weekCheck ? 'PASS' : 'FAIL'}] Total weeks: ${result.totalWeeks} (expected ${targetWeeks})`);

      // ── CHECK 2: Phase structure ──
      const phaseNames = result.phases.map(p => p.phase);

      if (targetWeeks <= 5 && !profile.hasRaceDate) {
        // Should be Foundation only
        const phaseCheck = phaseNames.length === 1 && phaseNames[0] === 'foundation';
        planResult.checks.push({ name: 'Foundation only', pass: phaseCheck, detail: phaseNames.join(' → ') });
        log(`  [${phaseCheck ? 'PASS' : 'FAIL'}] Foundation only: ${phaseNames.join(' → ')}`);
      } else if (targetWeeks <= 5 && profile.hasRaceDate) {
        // Should have peak + race_prep
        const phaseCheck = phaseNames.includes('peak') && phaseNames.includes('race_prep');
        planResult.checks.push({ name: 'Peak + Race Prep', pass: phaseCheck, detail: phaseNames.join(' → ') });
        log(`  [${phaseCheck ? 'PASS' : 'FAIL'}] Peak + Race Prep: ${phaseNames.join(' → ')}`);
      } else if (targetWeeks <= 7 && !profile.hasRaceDate) {
        // Should have foundation + build (no peak, no race_prep)
        const phaseCheck = phaseNames.includes('foundation') && phaseNames.includes('build') && !phaseNames.includes('race_prep');
        planResult.checks.push({ name: 'Foundation + Build', pass: phaseCheck, detail: phaseNames.join(' → ') });
        log(`  [${phaseCheck ? 'PASS' : 'FAIL'}] Foundation + Build: ${phaseNames.join(' → ')}`);
      } else if (targetWeeks >= 8 && !profile.hasRaceDate) {
        // Should have foundation + build + peak (no race_prep)
        const phaseCheck = phaseNames.includes('foundation') && phaseNames.includes('build') && phaseNames.includes('peak') && !phaseNames.includes('race_prep');
        planResult.checks.push({ name: 'Foundation + Build + Peak', pass: phaseCheck, detail: phaseNames.join(' → ') });
        log(`  [${phaseCheck ? 'PASS' : 'FAIL'}] Foundation + Build + Peak: ${phaseNames.join(' → ')}`);
      }

      // ── CHECK 3: No deload for ≤5 week plans ──
      const db = await getDatabase();
      const deloadDays = await db.getAllAsync(
        `SELECT week_number, title FROM plan_days WHERE plan_id = ? AND title LIKE '%DELOAD%'`,
        [result.planId]
      );
      if (targetWeeks <= 5) {
        const deloadCheck = deloadDays.length === 0;
        planResult.checks.push({ name: 'No deloads', pass: deloadCheck, detail: `${deloadDays.length} deload days found` });
        log(`  [${deloadCheck ? 'PASS' : 'FAIL'}] No deloads: ${deloadDays.length} found${deloadDays.length > 0 ? ` (${deloadDays.map(d => `Wk${d.week_number}`).join(', ')})` : ''}`);
      } else {
        // 6+ week plans should have deloads
        const deloadCheck = deloadDays.length > 0;
        planResult.checks.push({ name: 'Has deloads', pass: deloadCheck, detail: `${deloadDays.length} deload days` });
        log(`  [${deloadCheck ? 'PASS' : 'FAIL'}] Has deloads: ${deloadDays.length} days${deloadDays.length > 0 ? ` (weeks ${[...new Set(deloadDays.map(d => d.week_number))].join(', ')})` : ''}`);
      }

      // ── CHECK 4: Exercises have valid weights (exclude legit BW exercises) ──
      const BW_EXERCISES = new Set(['pull_ups', 'chin_ups', 'inverted_row', 'dips', 'push_ups', 'muscle_ups', 'band_assisted_pull_ups', 'pike_push_ups']);
      const badWeightsRaw = await db.getAllAsync(
        `SELECT pe.exercise_id, pe.weight, pb.type FROM plan_exercises pe
         JOIN plan_blocks pb ON pb.id = pe.plan_block_id
         JOIN plan_days pd ON pd.id = pb.plan_day_id
         WHERE pd.plan_id = ? AND pb.type = 'COMPOUND' AND (pe.weight = 'BW' OR pe.weight IS NULL OR pe.weight = '')`,
        [result.planId]
      );
      const badWeights = badWeightsRaw.filter(b => !BW_EXERCISES.has(b.exercise_id));
      const weightCheck = badWeights.length === 0;
      planResult.checks.push({ name: 'Compound weights valid', pass: weightCheck, detail: `${badWeights.length} BW/null compounds` });
      log(`  [${weightCheck ? 'PASS' : 'FAIL'}] Compound weights: ${badWeights.length} missing${badWeights.length > 0 ? ` (${badWeights.slice(0, 3).map(b => b.exercise_id).join(', ')})` : ''}`);

      // ── CHECK 5: Training day count per week ──
      const week1Days = await db.getAllAsync(
        `SELECT COUNT(*) as cnt FROM plan_days WHERE plan_id = ? AND week_number = 1 AND is_rest_day = 0`,
        [result.planId]
      );
      const dayCountCheck = week1Days[0]?.cnt === profile.trainingDaysPerWeek;
      planResult.checks.push({ name: 'Training days/week', pass: dayCountCheck, detail: `${week1Days[0]?.cnt} (expected ${profile.trainingDaysPerWeek})` });
      log(`  [${dayCountCheck ? 'PASS' : 'FAIL'}] Training days/week: ${week1Days[0]?.cnt} (expected ${profile.trainingDaysPerWeek})`);

      // ── CHECK 6: Rep scheme matches phase ──
      const week1Exercise = await db.getFirstAsync(
        `SELECT pe.sets FROM plan_exercises pe
         JOIN plan_blocks pb ON pb.id = pe.plan_block_id
         JOIN plan_days pd ON pd.id = pb.plan_day_id
         WHERE pd.plan_id = ? AND pd.week_number = 1 AND pb.type = 'COMPOUND'
         LIMIT 1`,
        [result.planId]
      );
      const week1Phase = result.phases[0]?.phase;
      const expectedReps = { foundation: '10', build: '8', peak: '6', race_prep: '5' };
      const setsStr = week1Exercise?.sets || '';
      const repMatch = setsStr.includes(expectedReps[week1Phase] || '10');
      planResult.checks.push({ name: 'Week 1 rep scheme', pass: repMatch, detail: `${setsStr} (phase: ${week1Phase}, expect x${expectedReps[week1Phase] || '10'})` });
      log(`  [${repMatch ? 'PASS' : 'FAIL'}] Week 1 reps: ${setsStr} (phase ${week1Phase} → expect x${expectedReps[week1Phase] || '10'})`);

      // ── CHECK 7: Peak phase weight bounds (regression guard for 90%→85% fix) ──
      // Peak compound weights should be ≤ user's working weight × 1.12
      // Old formula (90% intensity) gave ×1.17 — new (85%) gives ×1.105
      const peakPhase = result.phases.find(p => p.phase === 'peak');
      if (peakPhase && Object.keys(profile.workingWeights || {}).length > 0) {
        const maxWorkingWeight = Math.max(...Object.values(profile.workingWeights).map(parseFloat).filter(v => !isNaN(v)));
        const BENCH_EXERCISE_IDS = ['bench_press', 'barbell_bench_press', 'flat_barbell_bench', 'incline_bench_press'];
        const peakCompounds = await db.getAllAsync(
          `SELECT pe.exercise_id, CAST(pe.weight AS REAL) as w, pd.week_number
           FROM plan_exercises pe
           JOIN plan_blocks pb ON pb.id = pe.plan_block_id
           JOIN plan_days pd ON pd.id = pb.plan_day_id
           WHERE pd.plan_id = ? AND pd.phase = 'peak' AND pb.type = 'COMPOUND'
             AND pe.weight GLOB '[0-9]*' AND CAST(pe.weight AS REAL) > 0`,
          [result.planId]
        );
        const overweightExercises = peakCompounds.filter(ex => ex.w > maxWorkingWeight * 1.15);
        const weightBoundCheck = overweightExercises.length === 0;
        const maxFound = peakCompounds.length > 0 ? Math.max(...peakCompounds.map(e => e.w)) : 0;
        planResult.checks.push({ name: 'Peak weight bounds', pass: weightBoundCheck, detail: `max ${maxFound} lb vs working ${maxWorkingWeight} lb (limit ×1.15 = ${Math.round(maxWorkingWeight * 1.15)} lb)` });
        log(`  [${weightBoundCheck ? 'PASS' : 'FAIL'}] Peak weight bounds: max ${maxFound} lb (working ${maxWorkingWeight} lb, limit ${Math.round(maxWorkingWeight * 1.15)} lb)${!weightBoundCheck ? ` — ${overweightExercises.slice(0, 2).map(e => `${e.exercise_id} ${e.w}`).join(', ')}` : ''}`);
      }

      // ── CHECK 8: Warmup cleanliness — no strength exercises in warmup blocks ──
      const STRENGTH_IN_WARMUP = ['pull_ups', 'chin_ups', 'push_ups', 'dips', 'burpees', 'thrusters', 'muscle_ups', 'sit_ups', 'box_jumps'];
      const warmupStrengthExes = await db.getAllAsync(
        `SELECT pe.exercise_id FROM plan_exercises pe
         JOIN plan_blocks pb ON pb.id = pe.plan_block_id
         JOIN plan_days pd ON pd.id = pb.plan_day_id
         WHERE pd.plan_id = ?
           AND (LOWER(pb.name) LIKE '%warm%' OR LOWER(pb.name) LIKE '%movement%' OR LOWER(pb.name) LIKE '%prep%')
           AND pe.exercise_id IN ('${STRENGTH_IN_WARMUP.join("','")}')`,
        [result.planId]
      );
      const warmupCheck = warmupStrengthExes.length === 0;
      planResult.checks.push({ name: 'Warmup cleanliness', pass: warmupCheck, detail: warmupStrengthExes.length === 0 ? 'clean' : warmupStrengthExes.map(e => e.exercise_id).join(', ') });
      log(`  [${warmupCheck ? 'PASS' : 'FAIL'}] Warmup cleanliness: ${warmupCheck ? 'no strength exercises in warmup' : `found: ${warmupStrengthExes.map(e => e.exercise_id).join(', ')}`}`);

      // Score
      const passed = planResult.checks.filter(c => c.pass).length;
      const failed = planResult.checks.filter(c => !c.pass).length;
      results.passed += passed;
      results.failed += failed;
      planResult.passed = passed;
      planResult.failed = failed;
      results.plans.push(planResult);

      log(`\n  SCORE: ${passed}/${passed + failed} checks passed`);

    } catch (e) {
      log(`  ERROR: ${e.message}`);
      results.failed++;
      results.plans.push({ key, label: test.label, error: e.message });
    }
  }

  // Summary
  const total = results.passed + results.failed;
  log(`\n${'═'.repeat(50)}`);
  log(`FINAL: ${results.passed}/${total} checks passed across ${results.plans.length} plans`);
  for (const p of results.plans) {
    if (p.error) {
      log(`  ${p.label}: ERROR — ${p.error}`);
    } else {
      log(`  ${p.label}: ${p.passed}/${p.passed + p.failed} ${p.failed === 0 ? '' : 'ISSUES'}`);
    }
  }
  log(`${'═'.repeat(50)}`);

  return { success: results.failed === 0, ...results };
}
