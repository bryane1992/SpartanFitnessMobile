import * as SQLite from 'expo-sqlite';
import { seedExercises, seedAlternatives } from './exerciseSeed';
import { getWods } from './wodSeed';
import { fetchAllExercises, fetchPagedExercises } from './exerciseApi';
import { mapExerciseDbToLocal } from './taxonomyMap';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

    CREATE TABLE IF NOT EXISTS wod_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wod_id TEXT NOT NULL,
      date TEXT NOT NULL,
      score TEXT,
      score_type TEXT,
      rx INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wods (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      movements TEXT NOT NULL,
      scheme TEXT,
      time_cap TEXT,
      rx_weight TEXT,
      difficulty TEXT DEFAULT 'intermediate',
      estimated_time TEXT,
      equipment TEXT,
      tips TEXT
    );

    CREATE TABLE IF NOT EXISTS user_equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_type TEXT NOT NULL,
      name TEXT NOT NULL,
      max_weight REAL,
      available_weights TEXT,
      notes TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS session_rpe (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_exercise_id INTEGER NOT NULL,
      set_number INTEGER NOT NULL,
      rpe INTEGER,
      feedback TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (plan_exercise_id) REFERENCES plan_exercises(id)
    );

    CREATE TABLE IF NOT EXISTS mesocycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id TEXT NOT NULL,
      cycle_number INTEGER NOT NULL,
      phase TEXT NOT NULL,
      stimulus TEXT NOT NULL,
      start_week INTEGER NOT NULL,
      end_week INTEGER NOT NULL,
      target_intensity REAL,
      target_volume REAL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS injuries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      body_part TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'mild',
      reported_at TEXT NOT NULL,
      recovered_at TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS coach_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      actions TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_session_rpe_exercise ON session_rpe(plan_exercise_id);
    CREATE INDEX IF NOT EXISTS idx_coach_messages_session ON coach_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_injuries_active ON injuries(is_active);
    CREATE INDEX IF NOT EXISTS idx_wod_history_wod ON wod_history(wod_id);
    CREATE INDEX IF NOT EXISTS idx_plan_days_date ON plan_days(date);
    CREATE INDEX IF NOT EXISTS idx_plan_days_plan_id ON plan_days(plan_id);
    CREATE INDEX IF NOT EXISTS idx_plan_blocks_day ON plan_blocks(plan_day_id);
    CREATE INDEX IF NOT EXISTS idx_plan_exercises_block ON plan_exercises(plan_block_id);
    CREATE INDEX IF NOT EXISTS idx_run_history_date ON run_history(date);
  `);

  // Seed exercises — INSERT OR IGNORE ensures new seed exercises are added
  // without duplicating existing ones
  await seedExerciseData(database);

  // Seed WODs if empty
  const wodCount = await database.getFirstAsync('SELECT COUNT(*) as count FROM wods');
  if (wodCount.count === 0) {
    await seedWodData(database);
  }

  // Schema migration: add ExerciseDB columns (idempotent)
  const newColumns = [
    "ALTER TABLE exercises ADD COLUMN source TEXT DEFAULT 'seed'",
    "ALTER TABLE exercises ADD COLUMN gif_url TEXT",
    "ALTER TABLE exercises ADD COLUMN instructions TEXT",
    "ALTER TABLE exercises ADD COLUMN target_muscles TEXT",
    "ALTER TABLE exercises ADD COLUMN body_parts TEXT",
    "ALTER TABLE exercises ADD COLUMN api_id TEXT",
    "ALTER TABLE exercises ADD COLUMN description TEXT",
  ];
  for (const sql of newColumns) {
    try { await database.runAsync(sql); } catch (e) { /* column already exists */ }
  }

  // Data migration: remove deprecated 'heavy_barbell' exclusion tag from all exercises
  try {
    const tagged = await database.getAllAsync(
      "SELECT id, exclusion_tags FROM exercises WHERE exclusion_tags LIKE '%heavy_barbell%'"
    );
    for (const ex of tagged) {
      const tags = JSON.parse(ex.exclusion_tags || '[]').filter(t => t !== 'heavy_barbell');
      await database.runAsync(
        'UPDATE exercises SET exclusion_tags = ? WHERE id = ?',
        [JSON.stringify(tags), ex.id]
      );
    }
    if (tagged.length > 0) console.log(`[DB] Cleaned heavy_barbell tag from ${tagged.length} exercises`);
  } catch (e) { /* already clean */ }

  // Clean deprecated exclusion from user profile
  try {
    const profileStr = await AsyncStorage.getItem('userProfile');
    if (profileStr) {
      const profile = JSON.parse(profileStr);
      if (profile.exclusions?.includes('heavy_barbell')) {
        profile.exclusions = profile.exclusions.filter(e => e !== 'heavy_barbell');
        await AsyncStorage.setItem('userProfile', JSON.stringify(profile));
        console.log('[DB] Removed heavy_barbell from user profile exclusions');
      }
    }
  } catch (e) { /* no profile yet */ }

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

async function seedWodData(database) {
  const wods = getWods();
  for (const w of wods) {
    await database.runAsync(
      `INSERT OR IGNORE INTO wods (id, name, category, type, description, movements, scheme, time_cap, rx_weight, difficulty, estimated_time, equipment, tips)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [w.id, w.name, w.category, w.type, w.description || '',
       JSON.stringify(w.movements), w.scheme || '', w.timeCap || '',
       w.rxWeight || '', w.difficulty || 'intermediate',
       w.estimatedTime || '', JSON.stringify(w.equipment || []), w.tips || '']
    );
  }
  console.log(`[DB] Seeded ${wods.length} WODs`);
}

export async function getWodsFromDb(filters = {}) {
  const database = await getDatabase();
  let query = 'SELECT * FROM wods WHERE 1=1';
  const params = [];

  if (filters.difficulty) {
    const levels = { beginner: 1, intermediate: 2, advanced: 3, elite: 4 };
    const maxLevel = levels[filters.difficulty] || 2;
    const allowed = Object.entries(levels).filter(([, v]) => v <= maxLevel).map(([k]) => k);
    query += ` AND difficulty IN (${allowed.map(() => '?').join(',')})`;
    params.push(...allowed);
  }
  if (filters.category) {
    query += ' AND category = ?';
    params.push(filters.category);
  }
  if (filters.type) {
    query += ' AND type = ?';
    params.push(filters.type);
  }
  if (filters.maxTime) {
    // Filter WODs shorter than maxTime minutes
    query += ' AND estimated_time != ""';
  }

  const results = await database.getAllAsync(query, params);
  return results.map(w => ({
    ...w,
    movements: JSON.parse(w.movements || '[]'),
    equipment: JSON.parse(w.equipment || '[]'),
  }));
}

export async function getWodById(wodId) {
  const database = await getDatabase();
  const w = await database.getFirstAsync('SELECT * FROM wods WHERE id = ?', [wodId]);
  if (!w) return null;
  return { ...w, movements: JSON.parse(w.movements || '[]'), equipment: JSON.parse(w.equipment || '[]') };
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

  let filtered = await database.getAllAsync(query, params);

  // Debug: check if bench press exists in DB at all
  const benchCheck = await database.getFirstAsync("SELECT id, style_tags, difficulty, equipment_required FROM exercises WHERE id = 'bench_press'");
  if (benchCheck) {
    console.log(`[DB Filter] bench_press in DB: styles=${benchCheck.style_tags} diff=${benchCheck.difficulty} equip=${benchCheck.equipment_required}`);
    const inFiltered = filtered.some(e => e.id === 'bench_press');
    console.log(`[DB Filter] bench_press passed SQL filter: ${inFiltered}, query style=${style}, difficulty=${difficulty}`);
  } else {
    console.warn('[DB Filter] bench_press NOT IN DATABASE');
  }

  // Filter out exclusions in JS (JSON array matching)
  if (exclusions && exclusions.length > 0) {
    filtered = filtered.filter(ex => {
      const tags = JSON.parse(ex.exclusion_tags || '[]');
      return !tags.some(t => exclusions.includes(t));
    });
  }

  // Filter by equipment in JS
  if (equipment && equipment.length > 0) {
    const equipmentMap = {
      dumbbells: ['dumbbell'],
      barbell: ['barbell', 'bench'],  // barbell implies bench access
      squat_rack: ['rack', 'barbell'], // rack implies barbell
      bench: ['bench'],
      pull_up_bar: ['pull_up_bar'],
      kettlebell: ['kettlebell'],
      cables: ['cable'],
      machines: ['machine'],
      bands: ['band'],
      cardio_machines: ['machine'],
      outdoor: ['outdoor'],
      full_gym: ['barbell', 'dumbbell', 'cable', 'machine', 'bench', 'rack', 'kettlebell'],
      home_gym: ['barbell', 'dumbbell', 'bench', 'kettlebell'],
      minimal: ['band', 'kettlebell'],
      bodyweight: [],
    };
    const userEquip = equipment.flatMap(e => equipmentMap[e] || []);

    // Debug: check bench press specifically
    const benchEx = filtered.find(e => e.id === 'bench_press');
    if (benchEx) {
      const req = JSON.parse(benchEx.equipment_required || '[]');
      console.log(`[DB Filter] Bench press requires: ${req.join(',')}, user has: ${userEquip.join(',')}, pass: ${req.every(r => userEquip.includes(r))}`);
    } else {
      console.log(`[DB Filter] Bench press not in results (excluded or not matching style/difficulty)`);
    }

    filtered = filtered.filter(ex => {
      const required = JSON.parse(ex.equipment_required || '[]');
      if (required.length === 0) return true;
      return required.every(r => userEquip.includes(r));
    });
  }

  return filtered;

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

  let filtered = alts.filter(ex => {
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

  // If too few alternatives, supplement with dynamic query by muscle group
  if (filtered.length < 3) {
    const exercise = await database.getFirstAsync('SELECT muscle_group FROM exercises WHERE id = ?', [exerciseId]);
    if (exercise) {
      const existingIds = filtered.map(e => e.id).concat([exerciseId]);
      const placeholders = existingIds.map(() => '?').join(',');
      const dynamic = await database.getAllAsync(
        `SELECT * FROM exercises WHERE muscle_group = ? AND id NOT IN (${placeholders}) ORDER BY RANDOM() LIMIT 15`,
        [exercise.muscle_group, ...existingIds]
      );
      filtered = filtered.concat(dynamic);
    }
  }

  return filtered;
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

export async function exportPlanAsText(planId) {
  const database = await getDatabase();
  const days = await database.getAllAsync(
    'SELECT * FROM plan_days WHERE plan_id = ? ORDER BY date',
    [planId]
  );

  const lines = [];
  lines.push('═══════════════════════════════════════');
  lines.push('         MY WORKOUT PLAN');
  lines.push('═══════════════════════════════════════\n');

  // Include onboarding profile for debugging
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const profileStr = await AsyncStorage.getItem('userProfile');
    if (profileStr) {
      const p = JSON.parse(profileStr);
      lines.push('── ATHLETE PROFILE ──');
      if (p.goals) lines.push(`Goals: ${p.goals.join(', ')}`);
      if (p.experience) lines.push(`Experience: ${p.experience}`);
      if (p.sex) lines.push(`Sex: ${p.sex}`);
      if (p.height) lines.push(`Height: ${p.height}`);
      if (p.weight) lines.push(`Weight: ${p.weight} lb`);
      if (p.bmi) lines.push(`BMI: ${p.bmi}`);
      if (p.workingWeights) {
        const ww = p.workingWeights;
        lines.push(`Working Weights (8-10RM): Bench ${ww.bench || '?'}, Squat ${ww.squat || '?'}, DL ${ww.deadlift || '?'}, OHP ${ww.overhead_press || '?'}, Row ${ww.row || '?'}`);
      }
      if (p.equipment) lines.push(`Equipment: ${p.equipment.join(', ')}`);
      if (p.equipmentDetails) {
        const d = p.equipmentDetails;
        if (d.barbell?.maxWeight) lines.push(`  Barbell max: ${d.barbell.maxWeight} lb`);
        if (d.kettlebell?.weights) lines.push(`  Kettlebells: ${d.kettlebell.weights} lb`);
        if (d.dumbbells?.maxWeight) lines.push(`  Dumbbells: up to ${d.dumbbells.maxWeight} lb/hand`);
      }
      if (p.trainingDaysPerWeek) lines.push(`Training: ${p.trainingDaysPerWeek} days/week`);
      if (p.sessionDuration) lines.push(`Session: ${p.sessionDuration} min`);
      if (p.workoutStyles) lines.push(`Styles: ${p.workoutStyles.join(', ')}`);
      if (p.bodyCompGoals) lines.push(`Body Comp: ${p.bodyCompGoals.join(', ')}`);
      if (p.exclusions?.length) lines.push(`Exclusions: ${p.exclusions.join(', ')}`);
      if (p.additionalNotes) lines.push(`Notes: ${p.additionalNotes}`);
      lines.push('');
    }
  } catch (e) {
    lines.push('(Could not load profile)\n');
  }

  let currentWeek = 0;
  for (const day of days) {
    if (day.week_number !== currentWeek) {
      currentWeek = day.week_number;
      lines.push(`\n━━━ WEEK ${currentWeek} ━━━━━━━━━━━━━━━━━━`);
      if (day.phase) lines.push(`Phase: ${day.phase}`);
    }

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayName = dayNames[day.day_of_week] || '';
    lines.push(`\n${dayName} ${day.date} — ${day.title}`);

    if (day.is_rest_day) {
      lines.push('  Rest day');
      continue;
    }

    if (day.focus) lines.push(`  ${day.focus}`);

    const blocks = await database.getAllAsync(
      'SELECT * FROM plan_blocks WHERE plan_day_id = ? ORDER BY sort_order',
      [day.id]
    );

    for (const block of blocks) {
      lines.push(`\n  [${block.name}] ${block.type || ''} ${block.time_cap || ''}`);

      const exercises = await database.getAllAsync(
        `SELECT pe.*, e.name FROM plan_exercises pe
         JOIN exercises e ON e.id = pe.exercise_id
         WHERE pe.plan_block_id = ? ORDER BY pe.sort_order`,
        [block.id]
      );

      for (const ex of exercises) {
        let line = `    ${ex.name} — ${ex.sets} @ ${ex.weight || 'BW'}`;
        if (ex.rest) line += ` rest ${ex.rest}`;
        if (ex.notes) line += ` (${ex.notes})`;
        lines.push(line);
      }
    }
  }

  lines.push('\n═══════════════════════════════════════');
  lines.push('Generated by Spartan Fitness');
  lines.push('═══════════════════════════════════════');

  return lines.join('\n');
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

// Scale prescribed weight for an exercise in all future unfinished weeks
// Uses a ratio so progressive overload is maintained (not flat replacement)
// e.g., prescribed 50 lb, actual 125 lb → ratio 2.5x → week 5 at 60 lb becomes 150 lb
export async function adjustFutureWeights(exerciseId, ratio, currentDate) {
  const database = await getDatabase();
  const today = currentDate || new Date().toISOString().split('T')[0];

  // Get all future unfinished instances with their current weights
  const futureExercises = await database.getAllAsync(
    `SELECT pe.id, pe.weight FROM plan_exercises pe
     JOIN plan_blocks pb ON pb.id = pe.plan_block_id
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     WHERE pe.exercise_id = ?
       AND pe.is_completed = 0
       AND pd.date > ?
     ORDER BY pd.date ASC`,
    [exerciseId, today]
  );

  let updated = 0;
  for (const ex of futureExercises) {
    const currentWeight = parseFloat(ex.weight);
    if (isNaN(currentWeight) || currentWeight <= 0) continue;
    const newWeight = Math.round(currentWeight * ratio / 5) * 5;
    await database.runAsync('UPDATE plan_exercises SET weight = ? WHERE id = ?', [`${newWeight} lb`, ex.id]);
    updated++;
  }

  console.log(`[Autoregulate] Scaled ${exerciseId} by ${ratio.toFixed(2)}x for ${updated} future exercises`);
  return updated;
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
  // Count days that have at least 1 completed exercise (not just fully-completed days)
  const workouts = await database.getFirstAsync(
    `SELECT COUNT(DISTINCT pd.id) as completed
     FROM plan_days pd
     JOIN plan_blocks pb ON pb.plan_day_id = pd.id
     JOIN plan_exercises pe ON pe.plan_block_id = pb.id
     WHERE pd.is_rest_day = 0 AND pe.is_completed = 1`
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
    `SELECT pe.actual_weight, pe.actual_reps, pe.notes, pe.sets, pe.weight as prescribed_weight,
            pe.reps as prescribed_reps, pd.date, pd.title as workout_title, pd.week_number
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

// Week-over-week lift comparison for major compounds
// Returns: [{ exercise_name, exercise_id, thisWeek, lastWeek, delta, pctChange }]
export async function getWeekOverWeekLifts() {
  const database = await getDatabase();
  // Get current week number
  const today = new Date().toISOString().split('T')[0];
  const currentDay = await database.getFirstAsync(
    'SELECT week_number FROM plan_days WHERE date <= ? ORDER BY date DESC LIMIT 1', [today]
  );
  const currentWeek = currentDay?.week_number || 1;
  const prevWeek = currentWeek - 1;
  if (prevWeek < 1) return [];

  // Get best logged weight per exercise for current and previous week
  const rows = await database.getAllAsync(
    `SELECT pe.exercise_id, e.name as exercise_name, e.is_compound,
            pd.week_number,
            MAX(CAST(COALESCE(pe.actual_weight, pe.weight) AS REAL)) as best_weight
     FROM plan_exercises pe
     JOIN plan_blocks pb ON pb.id = pe.plan_block_id
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     JOIN exercises e ON e.id = pe.exercise_id
     WHERE pd.week_number IN (?, ?)
       AND COALESCE(pe.actual_weight, pe.weight) IS NOT NULL
       AND COALESCE(pe.actual_weight, pe.weight) != 'BW'
       AND COALESCE(pe.actual_weight, pe.weight) != ''
       AND CAST(COALESCE(pe.actual_weight, pe.weight) AS REAL) > 0
       AND e.is_compound = 1
     GROUP BY pe.exercise_id, pd.week_number
     ORDER BY best_weight DESC`,
    [currentWeek, prevWeek]
  );

  // Pair up this week vs last week
  const byExercise = {};
  for (const row of rows) {
    if (!byExercise[row.exercise_id]) {
      byExercise[row.exercise_id] = { name: row.exercise_name, thisWeek: null, lastWeek: null };
    }
    if (row.week_number === currentWeek) byExercise[row.exercise_id].thisWeek = row.best_weight;
    if (row.week_number === prevWeek) byExercise[row.exercise_id].lastWeek = row.best_weight;
  }

  const results = [];
  for (const [id, data] of Object.entries(byExercise)) {
    if (data.thisWeek === null && data.lastWeek === null) continue;
    const tw = data.thisWeek || data.lastWeek;
    const lw = data.lastWeek || data.thisWeek;
    const delta = tw - lw;
    const pctChange = lw > 0 ? Math.round((delta / lw) * 100) : 0;
    results.push({ exercise_id: id, exercise_name: data.name, thisWeek: tw, lastWeek: lw, delta, pctChange });
  }

  return results.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8);
}

// Run progression — weekly distance and pace trends
export async function getRunProgression() {
  const database = await getDatabase();
  return database.getAllAsync(
    `SELECT strftime('%W', date) as week_num,
            strftime('%Y', date) as year,
            COUNT(*) as run_count,
            SUM(total_distance) as total_distance,
            AVG(total_distance) as avg_distance,
            AVG(avg_pace) as avg_pace,
            MIN(avg_pace) as best_pace,
            MAX(total_distance) as longest_run
     FROM run_history
     WHERE total_distance > 0
     GROUP BY year, week_num
     ORDER BY year ASC, week_num ASC
     LIMIT 16`
  );
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

export async function getRunExercisesForDate(date) {
  const database = await getDatabase();
  const block = await database.getFirstAsync(
    `SELECT pb.id FROM plan_blocks pb
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     WHERE pd.date = ? AND pb.has_gps = 1
     LIMIT 1`,
    [date]
  );
  if (!block) return null;
  return database.getAllAsync(
    `SELECT pe.*, e.name FROM plan_exercises pe
     JOIN exercises e ON e.id = pe.exercise_id
     WHERE pe.plan_block_id = ? ORDER BY pe.sort_order`,
    [block.id]
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

// ═══════════════════════════════════════════════════════════════
// ExerciseDB Sync
// ═══════════════════════════════════════════════════════════════

export async function syncExerciseDb(onProgress) {
  const database = await getDatabase();
  let totalInserted = 0;

  // Fetch and save one page at a time so progress is never lost
  const firstPage = await fetchPagedExercises(0);
  const total = firstPage.total;

  // Insert first page
  totalInserted += await insertExerciseBatch(database, firstPage.data);
  if (onProgress) onProgress(totalInserted, total);

  // Fetch remaining pages
  const totalPages = Math.ceil(total / 100);
  for (let page = 1; page < totalPages; page++) {
    try {
      const pageData = await fetchPagedExercises(page);
      totalInserted += await insertExerciseBatch(database, pageData.data);
      if (onProgress) onProgress(totalInserted, total);
    } catch (e) {
      // Rate limited or error — save what we have and stop
      console.log(`Sync paused at page ${page}: ${e.message}. Saved ${totalInserted} exercises.`);
      break;
    }
  }

  if (totalInserted > 0) {
    await AsyncStorage.setItem('lastExerciseSync', new Date().toISOString());
  }
  return totalInserted;
}

async function insertExerciseBatch(database, apiExercises) {
  if (!apiExercises || apiExercises.length === 0) return 0;
  let count = 0;
  await database.execAsync('BEGIN TRANSACTION');
  try {
    for (const apiEx of apiExercises) {
      const ex = mapExerciseDbToLocal(apiEx);
      await database.runAsync(
        `INSERT OR REPLACE INTO exercises
         (id, name, emoji, muscle_group, secondary_muscles, category, style_tags,
          exclusion_tags, equipment_required, default_sets, default_reps, default_weight,
          is_compound, difficulty, source, gif_url, instructions, target_muscles, body_parts, api_id, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ex.id, ex.name, ex.emoji, ex.muscle_group, ex.secondary_muscles,
          ex.category, ex.style_tags, ex.exclusion_tags, ex.equipment_required,
          ex.default_sets, ex.default_reps, ex.default_weight, ex.is_compound,
          ex.difficulty, ex.source, ex.gif_url, ex.instructions,
          ex.target_muscles, ex.body_parts, ex.api_id, ex.description || null,
        ]
      );
      count++;
    }
    await database.execAsync('COMMIT');
  } catch (e) {
    await database.execAsync('ROLLBACK');
    console.error('Error inserting batch:', e);
  }
  return count;
}

export async function getExerciseCount() {
  const database = await getDatabase();
  const row = await database.getFirstAsync('SELECT COUNT(*) as count FROM exercises');
  return row.count;
}

export async function getExerciseFullById(exerciseId) {
  const database = await getDatabase();
  return database.getFirstAsync('SELECT * FROM exercises WHERE id = ?', [exerciseId]);
}

// ═══════════════════════════════════════════════════════════════
// WOD History
// ═══════════════════════════════════════════════════════════════

export async function saveWodResult(wodId, score, scoreType, rx, notes) {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT INTO wod_history (wod_id, date, score, score_type, rx, notes) VALUES (?, ?, ?, ?, ?, ?)',
    [wodId, new Date().toISOString().split('T')[0], score, scoreType, rx ? 1 : 0, notes]
  );
}

export async function getWodHistory(wodId) {
  const database = await getDatabase();
  return database.getAllAsync(
    'SELECT * FROM wod_history WHERE wod_id = ? ORDER BY date DESC',
    [wodId]
  );
}

export async function getAllCompletedWodIds() {
  const database = await getDatabase();
  const rows = await database.getAllAsync(
    'SELECT DISTINCT wod_id FROM wod_history'
  );
  return rows.map(r => r.wod_id);
}

export async function getWodBestScore(wodId) {
  const database = await getDatabase();
  return database.getFirstAsync(
    'SELECT * FROM wod_history WHERE wod_id = ? ORDER BY date DESC LIMIT 1',
    [wodId]
  );
}

// ═══════════════════════════════════════════════════════════════
// RPE / Autoregulation
// ═══════════════════════════════════════════════════════════════

export async function saveRpe(planExerciseId, setNumber, rpe, feedback) {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT INTO session_rpe (plan_exercise_id, set_number, rpe, feedback) VALUES (?, ?, ?, ?)',
    [planExerciseId, setNumber, rpe, feedback]
  );
}

export async function getRecentRpeForExercise(exerciseId, limit = 10) {
  const database = await getDatabase();
  return database.getAllAsync(
    `SELECT sr.rpe, sr.feedback, sr.set_number, pd.date
     FROM session_rpe sr
     JOIN plan_exercises pe ON pe.id = sr.plan_exercise_id
     JOIN plan_blocks pb ON pb.id = pe.plan_block_id
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     WHERE pe.exercise_id = ?
     ORDER BY pd.date DESC, sr.set_number ASC
     LIMIT ?`,
    [exerciseId, limit]
  );
}

export async function getAverageRpeForExercise(exerciseId) {
  const database = await getDatabase();
  const row = await database.getFirstAsync(
    `SELECT AVG(sr.rpe) as avg_rpe
     FROM session_rpe sr
     JOIN plan_exercises pe ON pe.id = sr.plan_exercise_id
     WHERE pe.exercise_id = ?`,
    [exerciseId]
  );
  return row?.avg_rpe;
}

// ═══════════════════════════════════════════════════════════════
// Injury Tracking
// ═══════════════════════════════════════════════════════════════

export async function saveInjury(bodyPart, severity, notes) {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT INTO injuries (body_part, severity, reported_at, notes) VALUES (?, ?, ?, ?)',
    [bodyPart, severity, new Date().toISOString(), notes]
  );
}

export async function getActiveInjuries() {
  const database = await getDatabase();
  return database.getAllAsync('SELECT * FROM injuries WHERE is_active = 1 ORDER BY reported_at DESC');
}

export async function recoverInjury(injuryId) {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE injuries SET is_active = 0, recovered_at = ? WHERE id = ?',
    [new Date().toISOString(), injuryId]
  );
}

// ═══════════════════════════════════════════════════════════════
// Coach Messages
// ═══════════════════════════════════════════════════════════════

export async function saveCoachMessage(sessionId, role, content, actions) {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT INTO coach_messages (session_id, role, content, actions) VALUES (?, ?, ?, ?)',
    [sessionId, role, content, actions ? JSON.stringify(actions) : null]
  );
}

export async function getCoachMessages(sessionId, limit = 20) {
  const database = await getDatabase();
  return database.getAllAsync(
    'SELECT * FROM coach_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?',
    [sessionId, limit]
  );
}

export async function getCoachMessageCountThisWeek() {
  const database = await getDatabase();
  const monday = new Date();
  monday.setDate(monday.getDate() - monday.getDay() + 1);
  monday.setHours(0, 0, 0, 0);
  const row = await database.getFirstAsync(
    "SELECT COUNT(*) as count FROM coach_messages WHERE role = 'user' AND created_at >= ?",
    [monday.toISOString()]
  );
  return row?.count || 0;
}

// ═══════════════════════════════════════════════════════════════
// User Equipment
// ═══════════════════════════════════════════════════════════════

export async function saveUserEquipment(items) {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM user_equipment');
  for (const item of items) {
    await database.runAsync(
      'INSERT INTO user_equipment (equipment_type, name, max_weight, available_weights, notes) VALUES (?, ?, ?, ?, ?)',
      [item.type, item.name, item.maxWeight || null, JSON.stringify(item.availableWeights || []), item.notes || null]
    );
  }
}

export async function getUserEquipment() {
  const database = await getDatabase();
  return database.getAllAsync('SELECT * FROM user_equipment ORDER BY equipment_type');
}

export async function getMaxWeightForEquipment(equipmentType) {
  const database = await getDatabase();
  const row = await database.getFirstAsync(
    'SELECT max_weight, available_weights FROM user_equipment WHERE equipment_type = ? LIMIT 1',
    [equipmentType]
  );
  return row;
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
