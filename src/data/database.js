import * as SQLite from 'expo-sqlite';
import { seedExercises, seedAlternatives } from './exerciseSeed';

let db = null;

export async function getDatabase() {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('spartan_fitness.db');
  await db.execAsync('PRAGMA journal_mode = WAL;');
  return db;
}

export async function initDatabase() {
  const database = await getDatabase();

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '',
      muscle_group TEXT NOT NULL,
      secondary_muscles TEXT,
      category TEXT NOT NULL,
      style_tags TEXT NOT NULL,
      exclusion_tags TEXT,
      equipment_required TEXT,
      default_sets INTEGER DEFAULT 3,
      default_reps TEXT DEFAULT '10',
      default_weight TEXT DEFAULT 'BW',
      is_compound INTEGER DEFAULT 0,
      difficulty TEXT DEFAULT 'intermediate'
    );

    CREATE TABLE IF NOT EXISTS exercise_alternatives (
      exercise_id TEXT NOT NULL,
      alternative_id TEXT NOT NULL,
      PRIMARY KEY (exercise_id, alternative_id),
      FOREIGN KEY (exercise_id) REFERENCES exercises(id),
      FOREIGN KEY (alternative_id) REFERENCES exercises(id)
    );

    CREATE TABLE IF NOT EXISTS plan_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id TEXT NOT NULL,
      date TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      week_number INTEGER NOT NULL,
      phase TEXT NOT NULL,
      title TEXT NOT NULL,
      focus TEXT,
      color TEXT,
      emoji TEXT DEFAULT '',
      is_rest_day INTEGER DEFAULT 0,
      is_completed INTEGER DEFAULT 0,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS plan_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_day_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT,
      time_cap TEXT,
      is_amrap INTEGER DEFAULT 0,
      has_gps INTEGER DEFAULT 0,
      amrap_rounds TEXT,
      FOREIGN KEY (plan_day_id) REFERENCES plan_days(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS plan_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_block_id INTEGER NOT NULL,
      exercise_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      sets TEXT,
      reps TEXT,
      weight TEXT,
      rest TEXT,
      notes TEXT,
      is_completed INTEGER DEFAULT 0,
      actual_weight TEXT,
      actual_reps TEXT,
      swapped_from TEXT,
      FOREIGN KEY (plan_block_id) REFERENCES plan_blocks(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    );

    CREATE TABLE IF NOT EXISTS workout_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      plan_day_id INTEGER,
      title TEXT,
      phase TEXT,
      duration_minutes INTEGER,
      exercises_completed INTEGER,
      exercises_total INTEGER,
      notes TEXT,
      snapshot TEXT
    );

    CREATE TABLE IF NOT EXISTS run_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      run_type TEXT NOT NULL,
      total_time INTEGER NOT NULL,
      total_distance REAL NOT NULL,
      avg_pace REAL,
      splits TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_plan_days_date ON plan_days(date);
    CREATE INDEX IF NOT EXISTS idx_plan_days_plan_id ON plan_days(plan_id);
    CREATE INDEX IF NOT EXISTS idx_plan_blocks_day ON plan_blocks(plan_day_id);
    CREATE INDEX IF NOT EXISTS idx_plan_exercises_block ON plan_exercises(plan_block_id);
    CREATE INDEX IF NOT EXISTS idx_run_history_date ON run_history(date);
  `);

  // Seed exercises if empty
  const count = await database.getFirstAsync('SELECT COUNT(*) as count FROM exercises');
  if (count.count === 0) {
    await seedExerciseData(database);
  }

  return database;
}

async function seedExerciseData(database) {
  const exercises = seedExercises();
  const alternatives = seedAlternatives();

  // Insert exercises in batches
  for (const ex of exercises) {
    await database.runAsync(
      `INSERT OR IGNORE INTO exercises (id, name, emoji, muscle_group, secondary_muscles, category, style_tags, exclusion_tags, equipment_required, default_sets, default_reps, default_weight, is_compound, difficulty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ex.id, ex.name, ex.emoji || '', ex.muscle_group,
        JSON.stringify(ex.secondary_muscles || []),
        ex.category,
        JSON.stringify(ex.style_tags),
        JSON.stringify(ex.exclusion_tags || []),
        JSON.stringify(ex.equipment_required || []),
        ex.default_sets || 3,
        ex.default_reps || '10',
        ex.default_weight || 'BW',
        ex.is_compound ? 1 : 0,
        ex.difficulty || 'intermediate',
      ]
    );
  }

  // Insert alternatives (bidirectional)
  for (const alt of alternatives) {
    await database.runAsync(
      'INSERT OR IGNORE INTO exercise_alternatives (exercise_id, alternative_id) VALUES (?, ?)',
      [alt[0], alt[1]]
    );
    await database.runAsync(
      'INSERT OR IGNORE INTO exercise_alternatives (exercise_id, alternative_id) VALUES (?, ?)',
      [alt[1], alt[0]]
    );
  }
}

// ─── CRUD Helpers ────────────────────────────────────────────

export async function getExerciseById(id) {
  const database = await getDatabase();
  return database.getFirstAsync('SELECT * FROM exercises WHERE id = ?', [id]);
}

export async function getExercisesByFilter({ muscleGroups, style, exclusions, equipment, difficulty }) {
  const database = await getDatabase();
  let query = 'SELECT * FROM exercises WHERE 1=1';
  const params = [];

  if (muscleGroups && muscleGroups.length > 0) {
    const placeholders = muscleGroups.map(() => '?').join(',');
    query += ` AND muscle_group IN (${placeholders})`;
    params.push(...muscleGroups);
  }

  if (style) {
    query += ` AND style_tags LIKE ?`;
    params.push(`%"${style}"%`);
  }

  if (difficulty) {
    const levels = { beginner: 1, intermediate: 2, advanced: 3, elite: 4 };
    const maxLevel = levels[difficulty] || 2;
    const allowed = Object.entries(levels).filter(([, v]) => v <= maxLevel).map(([k]) => k);
    const placeholders = allowed.map(() => '?').join(',');
    query += ` AND difficulty IN (${placeholders})`;
    params.push(...allowed);
  }

  const results = await database.getAllAsync(query, params);

  // Filter out exclusions in JS (JSON array matching)
  if (exclusions && exclusions.length > 0) {
    return results.filter(ex => {
      const tags = JSON.parse(ex.exclusion_tags || '[]');
      return !tags.some(t => exclusions.includes(t));
    });
  }

  // Filter by equipment in JS
  if (equipment && equipment.length > 0) {
    return results.filter(ex => {
      const required = JSON.parse(ex.equipment_required || '[]');
      if (required.length === 0) return true; // bodyweight, no equipment needed
      // Check user has at least one matching equipment category
      const equipmentMap = {
        // New specific equipment IDs
        dumbbells: ['dumbbell'],
        barbell: ['barbell'],
        squat_rack: ['rack'],
        bench: ['bench'],
        pull_up_bar: [],
        kettlebell: ['kettlebell'],
        cables: ['cable'],
        machines: ['machine'],
        bands: ['band'],
        cardio_machines: ['machine'],
        outdoor: ['outdoor'],
        // Legacy broad categories
        full_gym: ['barbell', 'dumbbell', 'cable', 'machine', 'bench', 'rack', 'kettlebell'],
        home_gym: ['barbell', 'dumbbell', 'bench', 'kettlebell'],
        minimal: ['band', 'kettlebell'],
        bodyweight: [],
      };
      const userEquip = equipment.flatMap(e => equipmentMap[e] || []);
      return required.every(r => userEquip.includes(r));
    });
  }

  return results;
}

export async function getAlternatives(exerciseId, userProfile) {
  const database = await getDatabase();
  const alts = await database.getAllAsync(
    `SELECT e.* FROM exercise_alternatives ea
     JOIN exercises e ON e.id = ea.alternative_id
     WHERE ea.exercise_id = ?`,
    [exerciseId]
  );

  // Filter by user exclusions and equipment
  const exclusions = userProfile?.exclusions || [];
  const equipment = userProfile?.equipment || [];

  return alts.filter(ex => {
    const tags = JSON.parse(ex.exclusion_tags || '[]');
    if (tags.some(t => exclusions.includes(t))) return false;

    const required = JSON.parse(ex.equipment_required || '[]');
    if (required.length === 0) return true;
    const equipmentMap = {
      full_gym: ['barbell', 'dumbbell', 'cable', 'machine', 'bench', 'rack', 'kettlebell'],
      home_gym: ['barbell', 'dumbbell', 'bench', 'kettlebell'],
      minimal: ['band', 'kettlebell'],
      bodyweight: [],
      outdoor: ['outdoor'],
    };
    const userEquip = equipment.flatMap(e => equipmentMap[e] || []);
    return required.every(r => userEquip.includes(r));
  });
}

// ─── Plan CRUD ───────────────────────────────────────────────

export async function savePlanDay(day) {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO plan_days (plan_id, date, day_of_week, week_number, phase, title, focus, color, emoji, is_rest_day)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [day.planId, day.date, day.dayOfWeek, day.weekNumber, day.phase, day.title, day.focus, day.color, day.emoji || '', day.isRestDay ? 1 : 0]
  );
  return result.lastInsertRowId;
}

export async function savePlanBlock(block) {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO plan_blocks (plan_day_id, sort_order, name, type, time_cap, is_amrap, has_gps)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [block.planDayId, block.sortOrder, block.name, block.type, block.timeCap, block.isAmrap ? 1 : 0, block.hasGps ? 1 : 0]
  );
  return result.lastInsertRowId;
}

export async function savePlanExercise(exercise) {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO plan_exercises (plan_block_id, exercise_id, sort_order, sets, reps, weight, rest, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [exercise.planBlockId, exercise.exerciseId, exercise.sortOrder, exercise.sets, exercise.reps, exercise.weight, exercise.rest, exercise.notes]
  );
  return result.lastInsertRowId;
}

export async function getWorkoutForDate(date) {
  const database = await getDatabase();
  const day = await database.getFirstAsync(
    'SELECT * FROM plan_days WHERE date = ?',
    [date]
  );
  if (!day) return null;

  const blocks = await database.getAllAsync(
    'SELECT * FROM plan_blocks WHERE plan_day_id = ? ORDER BY sort_order',
    [day.id]
  );

  for (const block of blocks) {
    const exercises = await database.getAllAsync(
      `SELECT pe.*, e.name, e.emoji, e.muscle_group, e.category
       FROM plan_exercises pe
       JOIN exercises e ON e.id = pe.exercise_id
       WHERE pe.plan_block_id = ? ORDER BY pe.sort_order`,
      [block.id]
    );
    block.exercises = exercises;
  }

  return { ...day, blocks };
}

export async function getPlanDaysForWeek(planId, weekNumber) {
  const database = await getDatabase();
  return database.getAllAsync(
    'SELECT * FROM plan_days WHERE plan_id = ? AND week_number = ? ORDER BY date',
    [planId, weekNumber]
  );
}

export async function getPlanOverview(planId) {
  const database = await getDatabase();
  return database.getAllAsync(
    'SELECT id, date, day_of_week, week_number, phase, title, emoji, is_rest_day, is_completed FROM plan_days WHERE plan_id = ? ORDER BY date',
    [planId]
  );
}

export async function completeExercise(planExerciseId, actualWeight, actualReps) {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE plan_exercises SET is_completed = 1, actual_weight = ?, actual_reps = ? WHERE id = ?',
    [actualWeight, actualReps, planExerciseId]
  );
}

export async function uncompleteExercise(planExerciseId) {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE plan_exercises SET is_completed = 0, actual_weight = NULL, actual_reps = NULL WHERE id = ?',
    [planExerciseId]
  );
}

export async function updateExerciseLog(planExerciseId, actualReps, actualWeight, notes) {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE plan_exercises SET actual_reps = ?, actual_weight = ?, notes = ? WHERE id = ?',
    [actualReps, actualWeight, notes, planExerciseId]
  );
}

export async function saveAmrapRounds(planBlockId, rounds) {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE plan_blocks SET amrap_rounds = ? WHERE id = ?',
    [rounds, planBlockId]
  );
}

export async function completeDay(planDayId) {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE plan_days SET is_completed = 1, completed_at = ? WHERE id = ?',
    [new Date().toISOString(), planDayId]
  );
}

export async function swapExercise(planExerciseId, newExerciseId, oldExerciseId) {
  const database = await getDatabase();
  const exercise = await database.getFirstAsync('SELECT * FROM exercises WHERE id = ?', [newExerciseId]);
  await database.runAsync(
    'UPDATE plan_exercises SET exercise_id = ?, swapped_from = ? WHERE id = ?',
    [newExerciseId, oldExerciseId, planExerciseId]
  );
  return exercise;
}

// ═══════════════════════════════════════════════════════════════
// Performance Tracker Queries
// ═══════════════════════════════════════════════════════════════

export async function saveRunHistory(run) {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO run_history (date, run_type, total_time, total_distance, avg_pace, splits)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [run.date, run.runType, run.totalTime, run.totalDistance, run.avgPace, run.splits]
  );
}

export async function getRunHistory(limit = 20) {
  const database = await getDatabase();
  return database.getAllAsync(
    'SELECT * FROM run_history ORDER BY date DESC, id DESC LIMIT ?',
    [limit]
  );
}

export async function getRunStats() {
  const database = await getDatabase();
  const row = await database.getFirstAsync(
    `SELECT COUNT(*) as totalRuns,
            COALESCE(SUM(total_distance), 0) as totalDistance,
            COALESCE(SUM(total_time), 0) as totalTime
     FROM run_history`
  );
  return row;
}

export async function getPersonalRecords() {
  const database = await getDatabase();
  return database.getAllAsync(
    `SELECT e.name as exercise_name, e.id as exercise_id,
            MAX(CAST(pe.actual_weight AS REAL)) as best_weight,
            pd.date
     FROM plan_exercises pe
     JOIN plan_blocks pb ON pb.id = pe.plan_block_id
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     JOIN exercises e ON e.id = pe.exercise_id
     WHERE pe.is_completed = 1
       AND pe.actual_weight IS NOT NULL
       AND pe.actual_weight != ''
       AND pe.actual_weight != 'BW'
       AND CAST(pe.actual_weight AS REAL) > 0
     GROUP BY pe.exercise_id
     ORDER BY best_weight DESC`
  );
}

export async function getWorkoutStats() {
  const database = await getDatabase();
  const workouts = await database.getFirstAsync(
    `SELECT COUNT(*) as completed FROM plan_days WHERE is_completed = 1 AND is_rest_day = 0`
  );
  const total = await database.getFirstAsync(
    `SELECT COUNT(*) as total FROM plan_days WHERE is_rest_day = 0`
  );
  const exercises = await database.getFirstAsync(
    `SELECT COUNT(*) as logged FROM plan_exercises WHERE is_completed = 1`
  );
  return {
    completedWorkouts: workouts.completed,
    totalWorkouts: total.total,
    completionRate: total.total > 0 ? Math.round((workouts.completed / total.total) * 100) : 0,
    exercisesLogged: exercises.logged,
  };
}

export async function getExerciseHistory(exerciseId, limit = 30) {
  const database = await getDatabase();
  return database.getAllAsync(
    `SELECT pe.actual_weight, pe.actual_reps, pe.notes, pe.sets,
            pd.date, pd.title as workout_title
     FROM plan_exercises pe
     JOIN plan_blocks pb ON pb.id = pe.plan_block_id
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     WHERE pe.exercise_id = ? AND pe.is_completed = 1
     ORDER BY pd.date DESC
     LIMIT ?`,
    [exerciseId, limit]
  );
}

export async function searchExercises(query) {
  const database = await getDatabase();
  return database.getAllAsync(
    `SELECT DISTINCT e.id, e.name, e.muscle_group, e.category
     FROM exercises e
     WHERE e.name LIKE ?
     ORDER BY e.name
     LIMIT 30`,
    [`%${query}%`]
  );
}

export async function getBiggestStrengthGains() {
  const database = await getDatabase();
  // Get exercises with 2+ logged sessions with numeric weight
  const rows = await database.getAllAsync(
    `SELECT pe.exercise_id, e.name as exercise_name,
            pe.actual_weight, pd.date
     FROM plan_exercises pe
     JOIN plan_blocks pb ON pb.id = pe.plan_block_id
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     JOIN exercises e ON e.id = pe.exercise_id
     WHERE pe.is_completed = 1
       AND pe.actual_weight IS NOT NULL
       AND pe.actual_weight != ''
       AND pe.actual_weight != 'BW'
       AND CAST(pe.actual_weight AS REAL) > 0
     ORDER BY pe.exercise_id, pd.date ASC`
  );

  // Group by exercise, calculate first vs latest weight
  const byExercise = {};
  for (const row of rows) {
    if (!byExercise[row.exercise_id]) {
      byExercise[row.exercise_id] = { name: row.exercise_name, entries: [] };
    }
    byExercise[row.exercise_id].entries.push({
      weight: parseFloat(row.actual_weight),
      date: row.date,
    });
  }

  const gains = [];
  for (const [id, data] of Object.entries(byExercise)) {
    if (data.entries.length < 2) continue;
    const first = data.entries[0].weight;
    const latest = data.entries[data.entries.length - 1].weight;
    const gain = latest - first;
    if (gain > 0) {
      gains.push({ exercise_id: id, exercise_name: data.name, gain, from: first, to: latest });
    }
  }

  return gains.sort((a, b) => b.gain - a.gain).slice(0, 5);
}

export async function getWeeklyProgress() {
  const database = await getDatabase();
  return database.getAllAsync(
    `SELECT week_number,
            COUNT(*) as total_days,
            SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END) as completed_days,
            phase
     FROM plan_days
     WHERE is_rest_day = 0
     GROUP BY week_number
     ORDER BY week_number ASC`
  );
}

export async function updateBlockRunType(blockId, runType) {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE plan_blocks SET type = ? WHERE id = ?',
    [runType, blockId]
  );
}

export async function getRunTypeForDate(date) {
  const database = await getDatabase();
  const block = await database.getFirstAsync(
    `SELECT pb.type as run_type
     FROM plan_blocks pb
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     WHERE pd.date = ? AND pb.has_gps = 1
     LIMIT 1`,
    [date]
  );
  return block ? block.run_type : null;
}

export async function deleteAllPlanData() {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM plan_exercises');
  await database.runAsync('DELETE FROM plan_blocks');
  await database.runAsync('DELETE FROM plan_days');
}

export async function deletePlan(planId) {
  const database = await getDatabase();
  // Get all day IDs for this plan
  const days = await database.getAllAsync('SELECT id FROM plan_days WHERE plan_id = ?', [planId]);
  const dayIds = days.map(d => d.id);

  if (dayIds.length > 0) {
    // Save completed workouts to history
    const completedDays = await database.getAllAsync(
      `SELECT * FROM plan_days WHERE plan_id = ? AND is_completed = 1`,
      [planId]
    );

    for (const day of completedDays) {
      const workout = await getWorkoutForDate(day.date);
      await database.runAsync(
        `INSERT INTO workout_history (date, plan_day_id, title, phase, exercises_completed, exercises_total, snapshot)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          day.date, day.id, day.title, day.phase,
          workout.blocks.reduce((sum, b) => sum + b.exercises.filter(e => e.is_completed).length, 0),
          workout.blocks.reduce((sum, b) => sum + b.exercises.length, 0),
          JSON.stringify(workout),
        ]
      );
    }

    // Delete plan data (cascading)
    for (const dayId of dayIds) {
      const blocks = await database.getAllAsync('SELECT id FROM plan_blocks WHERE plan_day_id = ?', [dayId]);
      for (const block of blocks) {
        await database.runAsync('DELETE FROM plan_exercises WHERE plan_block_id = ?', [block.id]);
      }
      await database.runAsync('DELETE FROM plan_blocks WHERE plan_day_id = ?', [dayId]);
    }
    await database.runAsync('DELETE FROM plan_days WHERE plan_id = ?', [planId]);
  }
}
