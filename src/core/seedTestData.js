// Seed realistic test data for stats screen development
// Creates 8 weeks of completed workout history with:
// - Weight progression (bench 100→125 with a week 5 plateau)
// - Rep struggles (10,10,9,7 patterns, improving over time)
// - Run progression (1.5mi → 4mi with pace improvements)
// - Deload weeks (4, 8) with reduced volume
// - Some missed workouts (week 3 Thursday skipped)
// - AMRAP round tracking
// - Exercise variety across weeks

import { getDatabase } from '../data/database';

export async function seedTestWorkoutData() {
  const database = await getDatabase();
  console.log('[TestData] Seeding 8 weeks of workout history...');

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 56); // 8 weeks ago
  const planId = 'test-plan-stats';

  // Clear any existing test data
  try {
    const existingDays = await database.getAllAsync('SELECT id FROM plan_days WHERE plan_id = ?', [planId]);
    for (const day of existingDays) {
      const blocks = await database.getAllAsync('SELECT id FROM plan_blocks WHERE plan_day_id = ?', [day.id]);
      for (const block of blocks) {
        await database.runAsync('DELETE FROM plan_exercises WHERE plan_block_id = ?', [block.id]);
      }
      await database.runAsync('DELETE FROM plan_blocks WHERE plan_day_id = ?', [day.id]);
    }
    await database.runAsync('DELETE FROM plan_days WHERE plan_id = ?', [planId]);
    const endDate = new Date().toISOString().split('T')[0];
    await database.runAsync('DELETE FROM run_history WHERE date >= ? AND date <= ?', [startDate.toISOString().split('T')[0], endDate]);
  } catch {}

  // ═══════════════════════════════════════════════════════════════
  // Weight progression data — realistic curves with struggles
  // ═══════════════════════════════════════════════════════════════

  const BENCH_PROGRESSION = [
    // week: { weight, reps per set, notes }
    { w: 100, sets: '10,10,9,8', note: 'First session — finding working weight' },
    { w: 100, sets: '10,10,10,9', note: null },
    { w: 105, sets: '10,10,9,7', note: 'Weight jump — last set dropped' },
    { w: 75, sets: '10,10,10,10', note: 'DELOAD' },     // deload week 4
    { w: 110, sets: '10,9,8,7', note: 'Plateau — too aggressive' },
    { w: 110, sets: '10,10,9,8', note: 'Same weight — better reps' }, // plateau
    { w: 115, sets: '10,10,9,8', note: 'Broke through plateau' },
    { w: 80, sets: '10,10,10,10', note: 'DELOAD' },     // deload week 8
  ];

  const SQUAT_PROGRESSION = [
    { w: 95, sets: '10,10,10,9', note: null },
    { w: 100, sets: '10,10,9,8', note: null },
    { w: 105, sets: '10,10,10,9', note: 'Feeling strong' },
    { w: 75, sets: '10,10,10,10', note: 'DELOAD' },
    { w: 110, sets: '10,10,9,8', note: null },
    { w: 115, sets: '10,10,10,9', note: null },
    { w: 120, sets: '10,10,9,7', note: 'Heavy — grind on last set' },
    { w: 85, sets: '10,10,10,10', note: 'DELOAD' },
  ];

  const DEADLIFT_PROGRESSION = [
    { w: 135, sets: '8,8,7', note: null },
    { w: 135, sets: '8,8,8', note: 'Locked in form' },
    { w: 145, sets: '8,8,7', note: null },
    { w: 100, sets: '8,8,8', note: 'DELOAD' },
    { w: 150, sets: '8,8,7', note: null },
    { w: 155, sets: '8,7,6', note: 'Grip failing on set 3' },
    { w: 155, sets: '8,8,7', note: 'Better grip — chalk helped' },
    { w: 110, sets: '8,8,8', note: 'DELOAD' },
  ];

  const ROW_PROGRESSION = [
    { w: 65, sets: '10,10,10', note: null },
    { w: 70, sets: '10,10,9', note: null },
    { w: 75, sets: '10,10,9', note: null },
    { w: 55, sets: '10,10,10', note: 'DELOAD' },
    { w: 80, sets: '10,10,9', note: null },
    { w: 85, sets: '10,9,8', note: null },
    { w: 85, sets: '10,10,9', note: 'Same weight — improvement' },
    { w: 60, sets: '10,10,10', note: 'DELOAD' },
  ];

  const CURL_PROGRESSION = [
    { w: 20, sets: '12,12,10', note: null },
    { w: 20, sets: '12,12,12', note: null },
    { w: 25, sets: '12,10,8', note: 'Jump was too much' },
    { w: 15, sets: '12,12,12', note: 'DELOAD' },
    { w: 25, sets: '12,12,10', note: 'Getting there' },
    { w: 25, sets: '12,12,12', note: 'Full reps!' },
    { w: 30, sets: '12,10,8', note: null },
    { w: 20, sets: '12,12,12', note: 'DELOAD' },
  ];

  // ═══════════════════════════════════════════════════════════════
  // Run progression — distance and pace improving
  // ═══════════════════════════════════════════════════════════════

  const RUN_PROGRESSION = [
    { dist: 1.5, time: 900, pace: 10.0, type: 'EASY' },       // wk1: 15min, 10:00/mi
    { dist: 1.8, time: 1026, pace: 9.5, type: 'EASY' },       // wk2
    { dist: 2.0, time: 1080, pace: 9.0, type: 'INTERVALS' },  // wk3
    { dist: 1.2, time: 720, pace: 10.0, type: 'EASY' },       // wk4: deload
    { dist: 2.5, time: 1275, pace: 8.5, type: 'TEMPO' },      // wk5
    { dist: 3.0, time: 1500, pace: 8.3, type: 'LONG_RUN' },   // wk6
    { dist: 3.5, time: 1680, pace: 8.0, type: 'LONG_RUN' },   // wk7
    { dist: 2.0, time: 1020, pace: 8.5, type: 'EASY' },       // wk8: deload
  ];

  // AMRAP scores — rounds improving over time
  const AMRAP_SCORES = [4, 5, 5, 3, 6, 7, 7, 4];

  const phases = ['foundation', 'foundation', 'foundation', 'foundation', 'build', 'build', 'build', 'build'];
  const dayNames = ['LEGS & CHEST FORGE', 'POSTERIOR GRIND', 'REST', 'PULL & PRESS POWER', 'ENDURANCE BLITZ', 'REST', 'REST'];

  for (let week = 0; week < 8; week++) {
    const isDeload = week === 3 || week === 7;

    for (let dow = 0; dow < 7; dow++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + week * 7 + dow);
      const dateStr = date.toISOString().split('T')[0];
      const isTraining = dow === 0 || dow === 1 || dow === 3 || dow === 4;
      const isSkipped = week === 2 && dow === 3; // missed Thursday week 3

      const dayId = (await database.runAsync(
        `INSERT INTO plan_days (plan_id, date, day_of_week, week_number, phase, title, focus, color, emoji, is_rest_day, is_completed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`,
        [planId, dateStr, dow, week + 1, phases[week],
         isTraining ? dayNames[dow] : 'REST DAY',
         `${phases[week].toUpperCase()} • Week ${week + 1}`,
         phases[week] === 'foundation' ? '#FF4136' : '#FF851B',
         isTraining ? 0 : 1,
         isTraining && !isSkipped ? 1 : 0]
      )).lastInsertRowId;

      if (!isTraining || isSkipped) continue;

      // ── MAIN LIFTS BLOCK ──
      const mainBlockId = (await database.runAsync(
        'INSERT INTO plan_blocks (plan_day_id, sort_order, name, type, time_cap, is_amrap, has_gps) VALUES (?, 0, ?, ?, ?, 0, 0)',
        [dayId, 'MAIN LIFTS', 'COMPOUND', '25 min']
      )).lastInsertRowId;

      if (dow === 0) {
        // Monday: Bench + Squat
        const bench = BENCH_PROGRESSION[week];
        await insertExercise(database, mainBlockId, 0, 'bench_press', `3x10`, bench.sets, `${bench.w} lb`, bench.note);
        const squat = SQUAT_PROGRESSION[week];
        await insertExercise(database, mainBlockId, 1, 'back_squat', `3x10`, squat.sets, `${squat.w} lb`, squat.note);
      } else if (dow === 1) {
        // Tuesday: Deadlift + Row
        const dl = DEADLIFT_PROGRESSION[week];
        await insertExercise(database, mainBlockId, 0, 'deadlift', `3x8`, dl.sets, `${dl.w} lb`, dl.note);
        const row = ROW_PROGRESSION[week];
        await insertExercise(database, mainBlockId, 1, 'barbell_row', `3x10`, row.sets, `${row.w} lb`, row.note);
      } else if (dow === 3) {
        // Thursday: OHP + Pull-ups
        const ohpW = [55, 60, 60, 40, 65, 65, 70, 50][week];
        const ohpSets = isDeload ? '10,10,10' : ['10,10,9', '10,10,10', '10,9,8', '10,10,10', '10,10,9', '10,9,8', '10,10,9', '10,10,10'][week];
        await insertExercise(database, mainBlockId, 0, 'overhead_press', '3x10', ohpSets, `${ohpW} lb`, null);
        await insertExercise(database, mainBlockId, 1, 'pull_ups', '3x8', isDeload ? '8,8,8' : ['6,5,4', '7,6,5', '8,7,5', '8,8,8', '8,7,6', '8,8,7', '8,8,8', '8,8,8'][week], 'BW', week <= 2 ? 'Still building up' : null);
      } else if (dow === 4) {
        // Friday: Front Squat + Farmer Walk
        const fsW = [85, 90, 95, 65, 100, 105, 110, 75][week];
        await insertExercise(database, mainBlockId, 0, 'front_squat', '3x8', isDeload ? '8,8,8' : '8,8,7', `${fsW} lb`, null);
        await insertExercise(database, mainBlockId, 1, 'farmer_walk', '3x40 yd', '40 yd,40 yd,40 yd', '35 lb each', null);
      }

      // ── ARM BLASTER (Mon & Thu) ──
      if (dow === 0 || dow === 3) {
        const armBlockId = (await database.runAsync(
          'INSERT INTO plan_blocks (plan_day_id, sort_order, name, type, time_cap, is_amrap, has_gps) VALUES (?, 1, ?, ?, ?, 0, 0)',
          [dayId, 'ARM BLASTER', 'SUPERSETS', '8 min']
        )).lastInsertRowId;

        const curl = CURL_PROGRESSION[week];
        await insertExercise(database, armBlockId, 0, 'bicep_curl', '3x12', curl.sets, `${curl.w} lb`, curl.note);
        const tricW = [15, 15, 20, 10, 20, 25, 25, 15][week];
        await insertExercise(database, armBlockId, 1, 'skull_crushers', '3x12', isDeload ? '12,12,12' : '12,12,10', `${tricW} lb`, null);
      }

      // ── WOD (Tue & Fri) ──
      if (dow === 1 || dow === 4) {
        const wodBlockId = (await database.runAsync(
          'INSERT INTO plan_blocks (plan_day_id, sort_order, name, type, time_cap, is_amrap, has_gps, amrap_rounds) VALUES (?, 2, ?, ?, ?, 1, 0, ?)',
          [dayId, 'WOD: BODYWEIGHT 10', 'AMRAP', '10 min', `${AMRAP_SCORES[week]}`]
        )).lastInsertRowId;

        await insertExercise(database, wodBlockId, 0, 'air_squats', '1x10', '10', 'BW', `BODYWEIGHT 10 — AMRAP (10 min)`);
        await insertExercise(database, wodBlockId, 1, 'push_ups', '1x10', '10', 'BW', null);
        await insertExercise(database, wodBlockId, 2, 'sit_ups', '1x10', '10', 'BW', null);
      }

      // ── CORE (every day) ──
      const coreBlockId = (await database.runAsync(
        'INSERT INTO plan_blocks (plan_day_id, sort_order, name, type, time_cap, is_amrap, has_gps) VALUES (?, 3, ?, ?, ?, 0, 0)',
        [dayId, 'CORE', 'CIRCUIT', '6 min']
      )).lastInsertRowId;
      await insertExercise(database, coreBlockId, 0, 'plank', '3x30s', '30s', 'BW', null);
      await insertExercise(database, coreBlockId, 1, 'dead_bug', '3x10', '10', 'BW', null);

      // ── RUN (Friday only) ──
      if (dow === 4) {
        const run = RUN_PROGRESSION[week];
        await database.runAsync(
          `INSERT INTO run_history (date, run_type, total_distance, total_time, avg_pace, splits)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [dateStr, run.type, run.dist, run.time, run.pace, '[]']
        );
      }
    }
  }

  // ── WOD LIBRARY SCORES ──
  // Seed a few standalone WOD scores from the library
  await database.runAsync('DELETE FROM wod_history WHERE notes = ?', ['test-seed']);
  const wodScores = [
    { wod_id: 'fran', score: '4:32', score_type: 'time', rx: 0, weeksAgo: 6 },
    { wod_id: 'fran', score: '3:58', score_type: 'time', rx: 1, weeksAgo: 2 },
    { wod_id: 'helen', score: '11:45', score_type: 'time', rx: 1, weeksAgo: 5 },
    { wod_id: 'helen', score: '10:22', score_type: 'time', rx: 1, weeksAgo: 1 },
    { wod_id: 'cindy', score: '14', score_type: 'rounds', rx: 1, weeksAgo: 4 },
    { wod_id: 'cindy', score: '17', score_type: 'rounds', rx: 1, weeksAgo: 1 },
    { wod_id: 'grace', score: '5:10', score_type: 'time', rx: 0, weeksAgo: 3 },
  ];
  for (const ws of wodScores) {
    const d = new Date();
    d.setDate(d.getDate() - ws.weeksAgo * 7);
    await database.runAsync(
      'INSERT INTO wod_history (wod_id, date, score, score_type, rx, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [ws.wod_id, d.toISOString().split('T')[0], ws.score, ws.score_type, ws.rx, 'test-seed']
    );
  }

  console.log('[TestData] Seeded 8 weeks: 32 training days, 8 runs, weight progressions, AMRAP scores, 7 WOD library scores');
  return true;
}

async function insertExercise(database, blockId, sortOrder, exerciseId, sets, actualReps, weight, notes) {
  await database.runAsync(
    `INSERT INTO plan_exercises (plan_block_id, exercise_id, sort_order, sets, reps, weight, rest, notes, is_completed, actual_weight, actual_reps)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [blockId, exerciseId, sortOrder, sets, sets.split('x')[1] || '10', weight, '60-90s', notes, weight, actualReps]
  );
}
