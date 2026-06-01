// Full Plan + Coach Test Suite
// Generates 4 plans across key archetypes, runs AI reviewer on each,
// then tests the AI coach with real workout conversations.
// Saves all results to a single file.
//
// Run from Settings screen via "Full Plan Suite" button.

import { getDatabase } from '../data/database';
import { TEST_PROFILES, getTestProfile } from './testProfiles';
import { sendCoachMessage } from '../data/coachApi';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 5 key profiles covering the main archetypes + short-plan regression
const SUITE_PROFILES = [
  'beginner_female_fat_loss',   // overweight_beginner — upper/lower, finishers, no WODs
  'spartan_intermediate',       // obstacle_racer — sport-specific, WODs, runs
  'bodybuilder_male',           // hypertrophy — PPL 6-day, no conditioning
  'beginner_male_dumbbells',    // general_fitness — full body 3-day, DB-only
  'short_5week_race',           // short plan regression — peak weights must not exceed working × 1.15
];

// Coach test scenarios — dynamically built from today's actual workout exercises
function buildCoachScenarios(workout) {
  const exercises = (workout?.blocks || []).flatMap(b => b.exercises || []).filter(e => !e.is_completed);
  const mainLift = exercises.find(e => parseFloat(e.weight) > 0) || exercises[0];
  const liftName = mainLift?.name || 'the exercise';

  return [
    {
      label: 'Swap request',
      message: `I need to swap ${liftName} for something else, my shoulder hurts`,
      expectInResponse: /swap|alternative|shoulder|modify|reduce|option/i,
    },
    {
      label: 'Too heavy',
      message: `${liftName} feels way too heavy, I can only do about 60% of the prescribed weight`,
      expectInResponse: /adjust|reduce|lower|cut|drop|lighter|60/i,
    },
    {
      label: 'Too easy',
      message: `${liftName} is way too easy, I did 15 reps when it said 10 and it felt like nothing`,
      expectInResponse: /increase|bump|heavier|harder|more|weight|progress/i,
    },
    {
      label: 'Form check',
      message: `Give me form cues for ${liftName}`,
      expectInResponse: /form|grip|position|back|brace|control|rep|set|core|squeeze|slow/i,
    },
    {
      label: 'Workout summary',
      message: "How's today's workout looking? Give me a quick rundown of what I'm doing",
      expectInResponse: /workout|exercise|set|rep|block|warm|main|today/i,
    },
  ];
}

export async function runPlanSuite(onLog, onStatus) {
  const log = (msg) => {
    console.log(`[PlanSuite] ${msg}`);
    if (onLog) onLog(msg);
  };

  const db = await getDatabase();
  const output = [];
  const scores = [];

  output.push('═══════════════════════════════════════════════════════════════');
  output.push('              GRITOS — PLAN + COACH TEST SUITE');
  output.push(`              Generated: ${new Date().toISOString().split('T')[0]}`);
  output.push('═══════════════════════════════════════════════════════════════\n');

  // ═══════════════════════════════════════════════════════
  // PART 1: PLAN GENERATION + AI REVIEW (4 profiles)
  // ═══════════════════════════════════════════════════════

  output.push('PART 1: PLAN GENERATION + AI REVIEW');
  output.push('═'.repeat(50) + '\n');

  const available = SUITE_PROFILES.filter(k => TEST_PROFILES[k]);
  log(`Generating ${available.length} plans...\n`);

  for (let idx = 0; idx < available.length; idx++) {
    const key = available[idx];
    const test = TEST_PROFILES[key];
    const profile = getTestProfile(key);
    if (!profile) continue;

    const progress = `[${idx + 1}/${available.length}]`;
    log(`${progress} ${test.label}...`);
    if (onStatus) onStatus(`${progress} Generating ${test.label}`);

    output.push('\n' + '─'.repeat(60));
    output.push(`PROFILE: ${test.label}`);
    output.push(`Key: ${key}`);
    output.push(`Expected: ${test.expected}`);
    output.push('─'.repeat(60) + '\n');

    try {
      const { generateAIPlan } = require('./aiPlanGenerator');
      const result = await generateAIPlan(profile, () => {});

      output.push(`Plan: "${result.planName}"`);
      output.push(`Weeks: ${result.totalWeeks}`);
      output.push(`Phases: ${result.phases.map(p => `${p.name}(${p.totalWeeks}w)`).join(' → ')}`);

      // Stats
      const stats = await db.getFirstAsync(
        `SELECT COUNT(*) as totalDays,
          SUM(CASE WHEN is_rest_day = 0 THEN 1 ELSE 0 END) as trainingDays,
          SUM(CASE WHEN title LIKE '%DELOAD%' THEN 1 ELSE 0 END) as deloadDays
         FROM plan_days WHERE plan_id = ?`, [result.planId]);
      const exCount = await db.getFirstAsync(
        `SELECT COUNT(DISTINCT pe.exercise_id) as cnt FROM plan_exercises pe
         JOIN plan_blocks pb ON pb.id = pe.plan_block_id JOIN plan_days pd ON pd.id = pb.plan_day_id
         WHERE pd.plan_id = ?`, [result.planId]);
      output.push(`Training: ${stats.trainingDays} days | Deloads: ${stats.deloadDays} | Exercises: ${exCount.cnt}`);

      // Plan Validator — 11 structural checks (deterministic, no API call)
      output.push('\n--- PLAN VALIDATOR ---\n');
      try {
        const { validatePlan } = require('./planValidator');
        const validatorPlanDays = await db.getAllAsync('SELECT * FROM plan_days WHERE plan_id = ? ORDER BY date', [result.planId]);
        for (const day of validatorPlanDays) {
          day.blocks = await db.getAllAsync('SELECT * FROM plan_blocks WHERE plan_day_id = ? ORDER BY sort_order', [day.id]);
          for (const block of day.blocks) {
            block.exercises = await db.getAllAsync(
              'SELECT pe.*, COALESCE(e.name, pe.exercise_id) as name FROM plan_exercises pe LEFT JOIN exercises e ON e.id = pe.exercise_id WHERE pe.plan_block_id = ? ORDER BY pe.sort_order',
              [block.id]
            );
          }
        }
        const validatorResult = validatePlan(validatorPlanDays, profile);
        const validatorIssues = (validatorResult?.issues || []);
        if (validatorIssues.length === 0) {
          output.push('Validator: PASS (all 11 checks)');
          log(`  Validator: PASS`);
        } else {
          output.push(`Validator: ${validatorIssues.length} issue(s):`);
          for (const issue of validatorIssues) output.push(`  - ${issue}`);
          log(`  Validator: ${validatorIssues.length} issues — ${validatorIssues[0]}`);
        }
      } catch (ve) {
        output.push(`Validator: ERROR — ${ve.message}`);
        log(`  Validator error: ${ve.message}`);
      }

      // AI Review
      output.push('\n--- AI REVIEW ---\n');
      const planDays = await db.getAllAsync('SELECT * FROM plan_days WHERE plan_id = ? ORDER BY date', [result.planId]);
      for (const day of planDays) {
        day.blocks = await db.getAllAsync('SELECT * FROM plan_blocks WHERE plan_day_id = ? ORDER BY sort_order', [day.id]);
        for (const block of day.blocks) {
          block.exercises = await db.getAllAsync(
            'SELECT pe.*, COALESCE(e.name, pe.exercise_id) as name FROM plan_exercises pe LEFT JOIN exercises e ON e.id = pe.exercise_id WHERE pe.plan_block_id = ? ORDER BY pe.sort_order',
            [block.id]);
        }
      }

      const { reviewPlan } = require('./planReviewer');
      const review = await reviewPlan(planDays, profile);
      output.push(review);

      const scoreMatch = review.match(/OVERALL[:\s]*(\d+(?:\.\d+)?)\s*\/\s*10/i);
      const score = scoreMatch ? parseFloat(scoreMatch[1]) : null;
      scores.push({ key, label: test.label, score, weeks: result.totalWeeks });
      log(`  ${progress} Score: ${score || '?'}/10`);

    } catch (e) {
      output.push(`[GENERATION FAILED: ${e.message}]`);
      scores.push({ key, label: test.label, score: null, error: e.message });
      log(`  ${progress} FAILED: ${e.message}`);
    }
    output.push('');
  }

  // ═══════════════════════════════════════════════════════
  // PART 2: AI COACH CONVERSATION TEST
  // ═══════════════════════════════════════════════════════

  output.push('\n' + '═'.repeat(50));
  output.push('PART 2: AI COACH CONVERSATION TEST');
  output.push('═'.repeat(50) + '\n');

  if (onStatus) onStatus('Testing AI Coach...');
  log('\nTesting AI Coach conversations...\n');

  // Load the most recent plan's first workout for context
  const latestDay = await db.getFirstAsync(
    'SELECT * FROM plan_days WHERE is_rest_day = 0 ORDER BY date LIMIT 1'
  );
  let workout = null;
  let profile = null;
  if (latestDay) {
    const blocks = await db.getAllAsync(
      'SELECT * FROM plan_blocks WHERE plan_day_id = ? ORDER BY sort_order', [latestDay.id]);
    for (const block of blocks) {
      block.exercises = await db.getAllAsync(
        `SELECT pe.*, COALESCE(e.name, pe.exercise_id) as name, e.emoji, e.muscle_group, e.secondary_muscles, e.category
         FROM plan_exercises pe LEFT JOIN exercises e ON e.id = pe.exercise_id
         WHERE pe.plan_block_id = ? ORDER BY pe.sort_order`, [block.id]);
    }
    workout = { ...latestDay, blocks };
    try {
      const profileStr = await AsyncStorage.getItem('userProfile');
      if (profileStr) profile = JSON.parse(profileStr);
    } catch {}
  }

  const coachResults = [];
  if (!workout) {
    output.push('[SKIPPED: No workout found for coach testing]');
    log('Coach test skipped — no workout found');
  } else {
    const exercises = workout.blocks?.flatMap(b => b.exercises || []) || [];
    output.push(`Workout: "${workout.title}" — ${exercises.length} exercises`);

    // Build alternatives for swap context
    let alternatives = {};
    try {
      const { getAlternatives } = require('../data/database');
      for (const ex of exercises.slice(0, 3)) {
        const alts = await getAlternatives(ex.exercise_id || ex.id, profile);
        if (alts?.length > 0) alternatives[ex.id] = alts.slice(0, 3).map(a => ({ id: a.id, name: a.name }));
      }
    } catch {}

    const scenarios = buildCoachScenarios(workout);
    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      log(`  Coach ${i + 1}/${scenarios.length}: ${scenario.label}...`);
      if (onStatus) onStatus(`Coach: ${scenario.label}`);

      output.push(`\n─── ${scenario.label.toUpperCase()} ───`);
      output.push(`User: "${scenario.message}"`);

      try {
        const messages = [{ role: 'user', content: scenario.message }];
        const response = await sendCoachMessage(null, messages, { profile, workout, injuries: [], alternatives });

        // Truncate response for output (keep first 200 chars)
        const shortReply = response.message.length > 200 ? response.message.substring(0, 200) + '...' : response.message;
        output.push(`Coach: "${shortReply}"`);
        const actionCount = (response.actions?.length || 0) + (response.options?.length || 0);
        if (actionCount > 0) output.push(`Actions/Options: ${actionCount}`);

        // Two simple checks: relevant response + not empty
        const relevant = scenario.expectInResponse.test(response.message);
        const valid = !!response.message && response.message.length > 10;
        const pass = relevant && valid;
        coachResults.push({ label: scenario.label, passed: pass ? 1 : 0, failed: pass ? 0 : 1 });

        output.push(`Result: ${pass ? 'PASS' : 'FAIL'}${!relevant ? ' (response not relevant)' : ''}`);
        log(`  Coach ${i + 1}/${scenarios.length}: ${pass ? 'PASS' : 'FAIL'}`);

      } catch (e) {
        output.push(`[ERROR: ${e.message}]`);
        coachResults.push({ label: scenario.label, passed: 0, failed: 1 });
        log(`  Coach ${i + 1}/${scenarios.length}: ERROR`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════

  output.push('\n' + '═'.repeat(60));
  output.push('                    RESULTS SUMMARY');
  output.push('═'.repeat(60) + '\n');

  // Plan scores
  output.push('PLAN GENERATION:');
  output.push('Profile                                    Weeks  Score');
  output.push('─'.repeat(55));
  for (const s of scores) {
    const name = s.label.substring(0, 42).padEnd(42);
    const weeks = s.weeks ? String(s.weeks).padStart(3) : '  ?';
    const score = s.score ? `${s.score}/10` : (s.error ? 'ERR' : '?/10');
    output.push(`${name} ${weeks}w  ${score}`);
  }
  const validScores = scores.filter(s => s.score !== null);
  const avg = validScores.length > 0 ? (validScores.reduce((sum, s) => sum + s.score, 0) / validScores.length).toFixed(1) : '?';
  output.push(`Average: ${avg}/10 across ${validScores.length} plans\n`);

  // Coach scores
  output.push('AI COACH:');
  output.push('─'.repeat(55));
  const coachPassed = coachResults.filter(r => r.passed > 0).length;
  const coachTotal = coachResults.length;
  for (const r of coachResults) {
    output.push(`  ${r.label.padEnd(22)} ${r.passed > 0 ? 'PASS' : 'FAIL'}`);
  }
  output.push(`Coach: ${coachPassed}/${coachTotal} passed\n`);

  output.push('═'.repeat(60));
  output.push(`OVERALL: Plans avg ${avg}/10 | Coach ${coachPassed}/${coachTotal}`);
  output.push('═'.repeat(60));

  // Print full results to console
  console.log('\n' + output.join('\n'));

  return {
    scores,
    average: parseFloat(avg) || 0,
    coachResults,
    coachPassed,
    coachTotal,
    failed: scores.filter(s => s.error).length,
    total: scores.length,
  };
}
