import * as SQLite from 'expo-sqlite';
import { seedExercises, seedAlternatives } from './exerciseSeed';
import { getWods } from './wodSeed';
import { getSugarWods } from './sugarWodData';
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

    CREATE TABLE IF NOT EXISTS plan_rationales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id TEXT NOT NULL,
      generation_number INTEGER DEFAULT 1,
      archetype TEXT,
      exercise_selections TEXT,
      wod_selections TEXT,
      rationales TEXT,
      excluded_rationale TEXT,
      user_feedback TEXT,
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

  // Seed WODs — always use SugarWOD verified data
  const sugarWods = getSugarWods();
  const wodCount = await database.getFirstAsync('SELECT COUNT(*) as count FROM wods');
  // Always reseed WODs from latest bundled SugarWOD data to ensure accuracy
  const needsReseed = true;
  if (needsReseed) {
    // Old seed data or missing — replace with SugarWOD verified data
    if (sugarWods && sugarWods.length > 0) {
      await database.runAsync('DELETE FROM wods');
      await seedSugarWodData(database, sugarWods);
      console.log('[DB] Replaced old WOD seed with SugarWOD verified data');
    } else if (!wodCount || wodCount.count === 0) {
      await seedWodData(database);
    }
  }

  // Schema migrations (idempotent — try each, ignore if already exists)
  const migrations = [
    "ALTER TABLE exercises ADD COLUMN source TEXT DEFAULT 'seed'",
    "ALTER TABLE exercises ADD COLUMN gif_url TEXT",
    "ALTER TABLE exercises ADD COLUMN instructions TEXT",
    "ALTER TABLE exercises ADD COLUMN target_muscles TEXT",
    "ALTER TABLE exercises ADD COLUMN body_parts TEXT",
    "ALTER TABLE exercises ADD COLUMN api_id TEXT",
    "ALTER TABLE exercises ADD COLUMN description TEXT",
    "ALTER TABLE plan_blocks ADD COLUMN amrap_rounds TEXT",
    "ALTER TABLE plan_blocks ADD COLUMN wod_elapsed INTEGER",
    "ALTER TABLE plan_blocks ADD COLUMN has_gps INTEGER DEFAULT 0",
    `CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      duration_minutes INTEGER,
      distance_miles REAL,
      pace TEXT,
      exercises TEXT,
      score TEXT,
      score_type TEXT,
      calories_est INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS custom_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      title TEXT,
      raw_input TEXT,
      duration_minutes INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS custom_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      exercise_seed_id TEXT,
      exercise_name TEXT NOT NULL,
      muscle_group TEXT,
      category TEXT NOT NULL DEFAULT 'strength',
      sets INTEGER,
      reps TEXT,
      weight_lbs REAL,
      duration_minutes INTEGER,
      distance_miles REAL,
      intensity TEXT,
      wod_id TEXT,
      wod_score TEXT,
      wod_score_type TEXT,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES custom_sessions(id) ON DELETE CASCADE
    )`,
    "CREATE INDEX IF NOT EXISTS idx_custom_entries_session ON custom_entries(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_custom_entries_exercise ON custom_entries(exercise_seed_id)",
    "CREATE INDEX IF NOT EXISTS idx_custom_sessions_date ON custom_sessions(date DESC)",
  ];
  for (const sql of migrations) {
    try { await database.runAsync(sql); } catch (e) { /* column already exists or table exists */ }
  }

  // NOTE: v2.exercisedb.io URL wipe removed — free API is down, no replacement source

  // Data migration: rename generic 'Dynamic Stretching' to a useful name
  try {
    await database.runAsync(
      "UPDATE exercises SET name = 'Arm Circles + Leg Swings' WHERE id = 'dynamic_stretching' AND (name = 'Dynamic Stretching' OR name = 'Arm Circles + Leg Swings + Torso Twists')"
    );
  } catch (e) { /* ignore */ }

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

async function seedSugarWodData(database, wods) {
  for (const w of wods) {
    try {
      await database.runAsync(
        `INSERT OR REPLACE INTO wods (id, name, category, type, description, movements, scheme, time_cap, rx_weight, difficulty, estimated_time, equipment, tips)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [w.id, w.name, w.category, w.type, w.description || '',
         JSON.stringify(w.movements), w.scheme || '', w.timeCap || '',
         w.rxWeight || '', w.difficulty || 'intermediate',
         w.estimatedTime || '', JSON.stringify(w.equipment || []), w.tips || '']
      );
    } catch { /* skip duplicates */ }
  }
  console.log(`[DB] Seeded ${wods.length} SugarWOD verified WODs`);
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

export async function addExerciseToBlock(planBlockId, exerciseId, sets, reps, weight, notes) {
  const database = await getDatabase();
  const existing = await database.getAllAsync(
    'SELECT sort_order FROM plan_exercises WHERE plan_block_id = ? ORDER BY sort_order DESC LIMIT 1',
    [planBlockId]
  );
  const nextOrder = existing.length > 0 ? (existing[0].sort_order + 1) : 0;
  const result = await database.runAsync(
    `INSERT INTO plan_exercises (plan_block_id, exercise_id, sort_order, sets, reps, weight, rest, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [planBlockId, exerciseId, nextOrder, sets || '2x15', reps || '15', weight || 'BW', null, notes || null]
  );
  return result.lastInsertRowId;
}

export async function getWorkoutForDate(date, planId) {
  const database = await getDatabase();
  const day = planId
    ? await database.getFirstAsync('SELECT * FROM plan_days WHERE date = ? AND plan_id = ?', [date, planId])
    : await database.getFirstAsync('SELECT * FROM plan_days WHERE date = ? ORDER BY id DESC', [date]);
  if (!day) return null;

  const blocks = await database.getAllAsync(
    'SELECT * FROM plan_blocks WHERE plan_day_id = ? ORDER BY sort_order',
    [day.id]
  );

  for (const block of blocks) {
    const exercises = await database.getAllAsync(
      `SELECT pe.*, COALESCE(e.name, REPLACE(REPLACE(REPLACE(pe.exercise_id, '_', ' '), 'db ', 'DB '), 'kb ', 'KB ')) as name, e.emoji, e.muscle_group, e.secondary_muscles, e.category
       FROM plan_exercises pe
       LEFT JOIN exercises e ON e.id = pe.exercise_id
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

  const PHASE_LABELS = { foundation: 'FOUNDATION', build: 'BUILD', peak: 'PEAK', race_prep: 'RACE PREP' };
  let currentWeek = 0;
  for (const day of days) {
    if (day.week_number !== currentWeek) {
      currentWeek = day.week_number;
      const phaseLabel = PHASE_LABELS[day.phase] || (day.phase || '').toUpperCase();
      lines.push(`\n━━━ WEEK ${currentWeek} — ${phaseLabel} ━━━━━━━━━━━━`);
    }

    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayName = dayNames[day.day_of_week] || '';
    lines.push(`\n${dayName} — ${day.title}`);

    if (day.is_rest_day) {
      lines.push('  Rest & Recovery');
      continue;
    }

    const blocks = await database.getAllAsync(
      'SELECT * FROM plan_blocks WHERE plan_day_id = ? ORDER BY sort_order',
      [day.id]
    );

    for (const block of blocks) {
      const isAmrap = block.is_amrap ? ' AMRAP' : '';
      const timeCap = block.time_cap ? ` ${block.time_cap}` : '';
      lines.push(`\n  ${block.name}${isAmrap}${timeCap}`);

      const exercises = await database.getAllAsync(
        `SELECT pe.*, e.name FROM plan_exercises pe
         JOIN exercises e ON e.id = pe.exercise_id
         WHERE pe.plan_block_id = ? ORDER BY pe.sort_order`,
        [block.id]
      );

      for (const ex of exercises) {
        const weight = ex.weight && ex.weight !== 'BW' ? ` @ ${ex.weight}` : ex.weight === 'BW' ? ' (BW)' : '';
        const rest = ex.rest ? ` | rest ${ex.rest}` : '';
        let line = `    ${ex.name} — ${ex.sets}${weight}${rest}`;
        // Show actual logged data if completed
        if (ex.is_completed && (ex.actual_weight || ex.actual_reps)) {
          const actual = [];
          if (ex.actual_reps) actual.push(`reps: ${ex.actual_reps}`);
          if (ex.actual_weight) actual.push(`weight: ${ex.actual_weight}`);
          line += ` [LOGGED: ${actual.join(', ')}]`;
        }
        if (ex.notes && !/^RPE/i.test(ex.notes)) line += ` (${ex.notes})`;
        lines.push(line);
      }
    }
  }

  lines.push('\n═══════════════════════════════════════');
  lines.push('Generated by GritOS');
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
    'UPDATE plan_exercises SET is_completed = 0 WHERE id = ?',
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

  // Get equipment limits from user profile
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  let equipMax = null;
  try {
    const profileStr = await AsyncStorage.getItem('userProfile');
    if (profileStr) {
      const profile = JSON.parse(profileStr);
      const ed = profile.equipmentDetails || {};
      // Determine cap based on exercise's equipment type
      const ex = await database.getFirstAsync('SELECT category FROM exercises WHERE id = ?', [exerciseId]);
      const cat = ex?.category || '';
      if (cat === 'barbell' && ed.barbell?.maxWeight) equipMax = parseFloat(ed.barbell.maxWeight);
      else if (cat === 'dumbbell' && ed.dumbbells?.maxWeight) equipMax = parseFloat(ed.dumbbells.maxWeight);
    }
  } catch { /* no profile */ }

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
    let newWeight = Math.round(currentWeight * ratio / 5) * 5;
    // Hard ceiling: never exceed equipment max
    if (equipMax && newWeight > equipMax) newWeight = Math.round(equipMax / 5) * 5;
    await database.runAsync('UPDATE plan_exercises SET weight = ? WHERE id = ?', [`${newWeight} lb`, ex.id]);
    updated++;
  }

  console.log(`[Autoregulate] Scaled ${exerciseId} by ${ratio.toFixed(2)}x for ${updated} future exercises${equipMax ? ` (cap: ${equipMax} lb)` : ''}`);
  return updated;
}

// Restore a WOD block to its previous state (for undo)
export async function restoreWodBlock(planBlockId, exercises, blockMeta) {
  const database = await getDatabase();
  // Delete current exercises
  await database.runAsync('DELETE FROM plan_exercises WHERE plan_block_id = ?', [planBlockId]);
  // Restore block metadata
  if (blockMeta) {
    await database.runAsync(
      'UPDATE plan_blocks SET name = ?, type = ?, is_amrap = ?, time_cap = ? WHERE id = ?',
      [blockMeta.name, blockMeta.type, blockMeta.is_amrap, blockMeta.time_cap, planBlockId]
    );
  }
  // Re-insert saved exercises
  for (const ex of exercises) {
    await database.runAsync(
      `INSERT INTO plan_exercises (plan_block_id, exercise_id, sort_order, sets, reps, weight, rest, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [planBlockId, ex.exercise_id, ex.sort_order, ex.sets, ex.reps, ex.weight, ex.rest, ex.notes]
    );
  }
}

// Delete the most recent injury for a body part (for undo)
export async function deleteLatestInjury(bodyPart) {
  const database = await getDatabase();
  await database.runAsync(
    'DELETE FROM injuries WHERE id = (SELECT id FROM injuries WHERE body_part = ? ORDER BY id DESC LIMIT 1)',
    [bodyPart]
  );
}

// Upgrade future exercises to use newly available equipment
// Swaps existing exercises with better alternatives that require the new equipment
// Only touches future unfinished exercises — completed workouts stay unchanged
export async function upgradeExercisesForNewEquipment(addedEquipment, exerciseSwapMap) {
  const database = await getDatabase();
  const today = new Date().toISOString().split('T')[0];
  let totalSwaps = 0;

  for (const [oldExId, newExId] of Object.entries(exerciseSwapMap)) {
    // Only swap where the new exercise doesn't already exist on the same DAY
    // Prevents: bench press as main lift AND bench press as accessory
    const result = await database.runAsync(
      `UPDATE plan_exercises SET exercise_id = ?, notes = 'Upgraded for new equipment'
       WHERE exercise_id = ?
         AND is_completed = 0
         AND plan_block_id IN (
           SELECT pb.id FROM plan_blocks pb
           JOIN plan_days pd ON pd.id = pb.plan_day_id
           WHERE pd.date > ?
           AND pd.id NOT IN (
             SELECT pd2.id FROM plan_days pd2
             JOIN plan_blocks pb2 ON pb2.plan_day_id = pd2.id
             JOIN plan_exercises pe2 ON pe2.plan_block_id = pb2.id
             WHERE pe2.exercise_id = ?
           )
         )`,
      [newExId, oldExId, today, newExId]
    );
    if (result.changes > 0) {
      console.log(`[Equipment Upgrade] ${oldExId} → ${newExId}: ${result.changes} exercises swapped`);
      totalSwaps += result.changes;
    }
  }

  // Cleanup: remove duplicate exercises on the same day
  // After all swaps, some days might have the same exercise in multiple blocks
  const duplicates = await database.getAllAsync(
    `SELECT pe.id, pe.exercise_id, pb.plan_day_id, pe.sort_order
     FROM plan_exercises pe
     JOIN plan_blocks pb ON pb.id = pe.plan_block_id
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     WHERE pd.date > ? AND pe.is_completed = 0
     ORDER BY pb.plan_day_id, pe.exercise_id, pe.sort_order`,
    [today]
  );

  const seenPerDay = {};
  let dupsRemoved = 0;
  for (const row of duplicates) {
    const key = `${row.plan_day_id}_${row.exercise_id}`;
    if (seenPerDay[key]) {
      // Duplicate — delete this one (keep the first occurrence)
      await database.runAsync('DELETE FROM plan_exercises WHERE id = ?', [row.id]);
      dupsRemoved++;
    } else {
      seenPerDay[key] = true;
    }
  }
  if (dupsRemoved > 0) {
    console.log(`[Equipment Upgrade] Removed ${dupsRemoved} same-day duplicates`);
  }

  // Also check for similar exercises (same movement pattern) in the same block
  // e.g., DB Bench + Barbell Bench in the same MAIN LIFTS block
  const blockExercises = await database.getAllAsync(
    `SELECT pe.id, pe.exercise_id, pe.plan_block_id, e.muscle_group, e.is_compound
     FROM plan_exercises pe
     JOIN plan_blocks pb ON pb.id = pe.plan_block_id
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     JOIN exercises e ON e.id = pe.exercise_id
     WHERE pd.date > ? AND pe.is_completed = 0
     ORDER BY pe.plan_block_id, pe.sort_order`,
    [today]
  );

  const seenPerBlock = {};
  let blockDupsRemoved = 0;
  for (const row of blockExercises) {
    // Key by block + muscle group + compound status (catches bench + DB bench in same block)
    const key = `${row.plan_block_id}_${row.muscle_group}_${row.is_compound}`;
    if (seenPerBlock[key]) {
      // Same muscle group compound in same block — remove the duplicate
      await database.runAsync('DELETE FROM plan_exercises WHERE id = ?', [row.id]);
      blockDupsRemoved++;
    } else {
      seenPerBlock[key] = true;
    }
  }
  if (blockDupsRemoved > 0) {
    console.log(`[Equipment Upgrade] Removed ${blockDupsRemoved} same-block muscle group duplicates`);
  }

  return totalSwaps;
}

// Replace a WOD block's exercises with a different WOD
// Swap WOD on a specific date — Charlie uses this for future days where he doesn't have planBlockId
export async function swapWodOnDate(date, newWodId) {
  const database = await getDatabase();
  let block = await database.getFirstAsync(
    `SELECT pb.id FROM plan_blocks pb
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     WHERE pd.date = ? AND pb.is_amrap = 1
     ORDER BY pb.sort_order LIMIT 1`,
    [date]
  );
  if (!block) {
    // No WOD block on this day — create one after the warmup block
    const day = await database.getFirstAsync(
      `SELECT pd.id FROM plan_days pd WHERE pd.date = ? LIMIT 1`, [date]
    );
    if (!day) return false;
    // Pick sort_order after existing blocks
    const maxOrder = await database.getFirstAsync(
      `SELECT MAX(sort_order) as maxOrd FROM plan_blocks WHERE plan_day_id = ?`, [day.id]
    );
    const sortOrder = (maxOrder?.maxOrd ?? 0) + 1;
    const result = await database.runAsync(
      `INSERT INTO plan_blocks (plan_day_id, name, type, sort_order, is_amrap, has_gps)
       VALUES (?, 'WOD', 'CIRCUIT', ?, 1, 0)`,
      [day.id, sortOrder]
    );
    block = { id: result.lastInsertRowId };
  }
  return swapWodBlock(block.id, newWodId);
}

export async function clearWarmupOnDate(date) {
  const database = await getDatabase();
  await database.runAsync(
    `DELETE FROM plan_exercises WHERE plan_block_id IN (
       SELECT pb.id FROM plan_blocks pb
       JOIN plan_days pd ON pd.id = pb.plan_day_id
       WHERE pd.date = ?
         AND (LOWER(pb.name) LIKE '%warm%' OR LOWER(pb.name) LIKE '%movement%'
              OR LOWER(pb.name) LIKE '%activation%' OR LOWER(pb.name) LIKE '%prep%')
     )`,
    [date]
  );
  return true;
}

export async function clearStrengthOnDate(date) {
  const database = await getDatabase();
  // Delete exercises from all non-warmup, non-WOD, non-cooldown blocks on this date
  await database.runAsync(
    `DELETE FROM plan_exercises WHERE plan_block_id IN (
       SELECT pb.id FROM plan_blocks pb
       JOIN plan_days pd ON pd.id = pb.plan_day_id
       WHERE pd.date = ?
         AND pb.is_amrap = 0
         AND LOWER(pb.name) NOT LIKE '%warm%'
         AND LOWER(pb.name) NOT LIKE '%cool%'
         AND LOWER(pb.name) NOT LIKE '%stretch%'
         AND LOWER(pb.name) NOT LIKE '%mobility%'
         AND LOWER(pb.name) NOT LIKE '%active recovery%'
     )`,
    [date]
  );
  return true;
}

export async function removeWodOnDate(date, label) {
  const database = await getDatabase();
  const block = await database.getFirstAsync(
    `SELECT pb.id FROM plan_blocks pb
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     WHERE pd.date = ? AND pb.is_amrap = 1
     ORDER BY pb.sort_order LIMIT 1`,
    [date]
  );
  if (!block) return false;
  await database.runAsync('DELETE FROM plan_exercises WHERE plan_block_id = ?', [block.id]);
  await database.runAsync(
    'UPDATE plan_blocks SET name = ?, is_amrap = 0 WHERE id = ?',
    [label || 'Active Recovery', block.id]
  );
  return true;
}

// Add exercise to warmup/cooldown block on a specific date
export async function addExerciseOnDate(date, exerciseId, sets, reps, weight, notes, blockPreference = 'warmup') {
  const database = await getDatabase();
  let block = null;

  if (blockPreference === 'main') {
    // Target accessory block first, then main lift block, then any non-WOD non-warmup block
    block = await database.getFirstAsync(
      `SELECT pb.id FROM plan_blocks pb
       JOIN plan_days pd ON pd.id = pb.plan_day_id
       WHERE pd.date = ? AND (LOWER(pb.name) LIKE '%accessor%' OR LOWER(pb.name) LIKE '%arm%' OR LOWER(pb.name) LIKE '%core%' OR LOWER(pb.name) LIKE '%finish%')
       ORDER BY pb.sort_order LIMIT 1`,
      [date]
    );
    if (!block) {
      block = await database.getFirstAsync(
        `SELECT pb.id FROM plan_blocks pb
         JOIN plan_days pd ON pd.id = pb.plan_day_id
         WHERE pd.date = ? AND LOWER(pb.name) NOT LIKE '%warm%' AND LOWER(pb.name) NOT LIKE '%cool%'
           AND LOWER(pb.name) NOT LIKE '%wod%' AND LOWER(pb.name) NOT LIKE '%amrap%'
           AND LOWER(pb.name) NOT LIKE '%emom%' AND LOWER(pb.name) NOT LIKE '%circuit%'
         ORDER BY pb.sort_order LIMIT 1`,
        [date]
      );
    }
  } else {
    // Default: warmup block
    block = await database.getFirstAsync(
      `SELECT pb.id FROM plan_blocks pb
       JOIN plan_days pd ON pd.id = pb.plan_day_id
       WHERE pd.date = ? AND (LOWER(pb.name) LIKE '%warm%' OR LOWER(pb.name) LIKE '%movement%' OR LOWER(pb.name) LIKE '%activation%' OR LOWER(pb.name) LIKE '%prep%')
       ORDER BY pb.sort_order LIMIT 1`,
      [date]
    );
  }

  if (!block) {
    // Final fallback: first block on that day
    block = await database.getFirstAsync(
      `SELECT pb.id FROM plan_blocks pb
       JOIN plan_days pd ON pd.id = pb.plan_day_id
       WHERE pd.date = ?
       ORDER BY pb.sort_order LIMIT 1`,
      [date]
    );
  }
  if (!block) return null;
  return addExerciseToBlock(block.id, exerciseId, sets, reps, weight, notes);
}

export async function swapWodBlock(planBlockId, newWodId) {
  const database = await getDatabase();

  // Get the new WOD data
  const wod = await database.getFirstAsync('SELECT * FROM wods WHERE id = ?', [newWodId]);
  if (!wod) return false;

  // Delete existing exercises in this block
  await database.runAsync('DELETE FROM plan_exercises WHERE plan_block_id = ?', [planBlockId]);

  // Parse movements and insert exercises — allow intentional duplicates (e.g. Murph's 2 mile runs)
  const movements = JSON.parse(wod.movements || '[]');
  let sortOrder = 0;
  for (let i = 0; i < movements.length; i++) {
    const movement = movements[i];
    // Detect distance movements: "1 mile Run", "400m Run", etc.
    const distMatch = movement.match(/^(\d+(?:\.\d+)?)\s*(mile|km|m\b|meter|yard)s?\s*(run|row|swim)?/i);
    let reps, name;
    if (distMatch) {
      // Normalize to standard abbreviations so convertDistanceText handles unit switching
      const unit = /mile/i.test(distMatch[2]) ? 'mi' : /km/i.test(distMatch[2]) ? 'km' : distMatch[2].toLowerCase();
      reps = `${distMatch[1]} ${unit}`;
      name = distMatch[3] ? `${distMatch[3]} (${reps})` : movement;
    } else {
      const repMatch = movement.match(/^(\d+)\s+(.+)$/);
      reps = repMatch ? repMatch[1] : '10';
      name = repMatch ? repMatch[2].replace(/\s*\([^)]+\)/, '').trim() : movement;
    }

    const exerciseId = mapWodMovementToId(name);
    await database.runAsync(
      `INSERT INTO plan_exercises (plan_block_id, exercise_id, sort_order, sets, reps, weight, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [planBlockId, exerciseId, sortOrder, `1x${reps}`, reps, wod.rx_weight || 'BW',
       sortOrder === 0 ? `${wod.name} — ${wod.type}${wod.time_cap ? ` (${wod.time_cap})` : ''}: ${wod.description || ''}` : null]
    );
    sortOrder++;
  }

  // Update block name, type, and time cap to match new WOD
  const wodType = wod.type || 'CIRCUIT';
  const isAmrap = /amrap|emom|for time|for reps/i.test(wodType) ? 1 : 0;
  await database.runAsync(
    'UPDATE plan_blocks SET name = ?, type = ?, is_amrap = ?, time_cap = ? WHERE id = ?',
    [`WOD: ${wod.name}`, wodType, isAmrap, wod.time_cap || wod.estimated_time || '10 min', planBlockId]
  );

  console.log(`[WOD Swap] Block ${planBlockId} → ${wod.name} (${movements.length} movements)`);
  return true;
}

function mapWodMovementToId(name) {
  const n = name.toLowerCase().replace(/[-_]/g, ' ');
  if (n.includes('pull up') || n.includes('pullup')) return 'pull_ups';
  if (n.includes('push up') || n.includes('pushup')) return 'push_ups';
  if (n.includes('sit up') || n.includes('situp')) return 'sit_ups';
  if (n.includes('air squat') || n.includes('squat')) return 'air_squats';
  if (n.includes('burpee')) return 'burpees';
  if (n.includes('sit up') || n.includes('situp')) return 'sit_ups';
  if (n.includes('kb swing') || n.includes('kettlebell')) return 'kb_swings';
  if (n.includes('goblet')) return 'db_goblet_squat';
  if (n.includes('mountain')) return 'mountain_climbers';
  if (n.includes('step')) return 'step_ups';
  if (n.includes('lunge')) return 'db_walking_lunges';
  if (n.includes('deadlift')) return 'deadlift';
  if (n.includes('thruster')) return 'barbell_thrusters';
  if (n.includes('clean')) return 'power_clean';
  if (n.includes('press')) return 'push_ups';
  if (n.includes('row')) return 'easy_run';
  if (n.includes('run')) return 'easy_run';
  return 'burpees';
}

export async function saveAmrapRounds(planBlockId, rounds, elapsed = null) {
  const database = await getDatabase();
  if (elapsed != null) {
    await database.runAsync(
      'UPDATE plan_blocks SET amrap_rounds = ?, wod_elapsed = ? WHERE id = ?',
      [rounds, elapsed, planBlockId]
    );
  } else {
    await database.runAsync(
      'UPDATE plan_blocks SET amrap_rounds = ? WHERE id = ?',
      [rounds, planBlockId]
    );
  }
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
       AND e.category != 'cardio'
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

// WOD progression — AMRAP rounds from plan_blocks over time
export async function getWodProgression() {
  const database = await getDatabase();
  return database.getAllAsync(
    `SELECT pb.name as wod_name, pb.type as wod_type, pb.amrap_rounds, pb.time_cap, pb.wod_elapsed,
            pd.week_number, pd.date, pd.phase,
            (SELECT GROUP_CONCAT(
               COALESCE(e.name, pe.exercise_id) || ' @ ' || COALESCE(pe.actual_weight, pe.weight),
               ' / ')
             FROM plan_exercises pe
             LEFT JOIN exercises e ON e.id = pe.exercise_id
             WHERE pe.plan_block_id = pb.id
               AND (pe.actual_weight IS NOT NULL OR pe.weight IS NOT NULL)
               AND COALESCE(pe.actual_weight, pe.weight) != 'BW'
               AND (e.category IS NULL OR e.category != 'cardio')
            ) as exercise_weights,
            (SELECT GROUP_CONCAT(COALESCE(e.name, pe.exercise_id) || ' × ' || pe.reps, ', ')
             FROM plan_exercises pe
             LEFT JOIN exercises e ON e.id = pe.exercise_id
             WHERE pe.plan_block_id = pb.id
            ) as movements
     FROM plan_blocks pb
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     WHERE pb.is_amrap = 1
       AND pd.is_completed = 1
       AND (
         (pb.amrap_rounds IS NOT NULL AND pb.amrap_rounds != '')
         OR (pb.wod_elapsed IS NOT NULL AND pb.wod_elapsed > 0)
       )
     ORDER BY pd.date ASC`
  );
}

// WOD stats summary — total WODs completed, best rounds, recent scores
export async function getWodStats() {
  const database = await getDatabase();

  // Count from plan_blocks (in-plan WODs)
  const planWods = await database.getFirstAsync(
    `SELECT COUNT(*) as total
     FROM plan_blocks pb
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     WHERE pb.is_amrap = 1 AND pd.is_completed = 1`
  );

  // Count from wod_history (standalone WOD library)
  const libraryWods = await database.getFirstAsync(
    'SELECT COUNT(*) as total FROM wod_history'
  );

  // Best AMRAP rounds
  const bestAmrap = await database.getFirstAsync(
    `SELECT pb.name as wod_name, MAX(CAST(pb.amrap_rounds AS INTEGER)) as best_rounds, pb.time_cap
     FROM plan_blocks pb
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     WHERE pb.is_amrap = 1
       AND pb.amrap_rounds IS NOT NULL
       AND pb.amrap_rounds != ''
       AND pd.is_completed = 1`
  );

  // Recent wod_history entries
  const recentScores = await database.getAllAsync(
    `SELECT wh.wod_id, w.name as wod_name, wh.score, wh.score_type, wh.rx, wh.date
     FROM wod_history wh
     LEFT JOIN wods w ON w.id = wh.wod_id
     ORDER BY wh.date DESC
     LIMIT 10`
  );

  return {
    totalPlanWods: planWods?.total || 0,
    totalLibraryWods: libraryWods?.total || 0,
    bestAmrap,
    recentScores,
  };
}

export async function updateBlockRunType(blockId, runType) {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE plan_blocks SET type = ? WHERE id = ?',
    [runType, blockId]
  );
}

export async function getCardioExercisesForDate(date) {
  const database = await getDatabase();
  return database.getAllAsync(
    `SELECT pe.id, pe.exercise_id, e.name, e.category
     FROM plan_exercises pe
     JOIN plan_blocks pb ON pb.id = pe.plan_block_id
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     JOIN exercises e ON e.id = pe.exercise_id
     WHERE pd.date = ? AND e.category = 'cardio'`,
    [date]
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

  // Use RapidAPI (paid, HQ GIFs) as primary
  const firstPage = await fetchPagedExercises(0);
  const total = firstPage.total;

  totalInserted += await insertExerciseBatch(database, firstPage.data);
  if (onProgress) onProgress(totalInserted, total);

  const totalPages = Math.ceil(total / 100);
  for (let page = 1; page < totalPages; page++) {
    try {
      const pageData = await fetchPagedExercises(page);
      totalInserted += await insertExerciseBatch(database, pageData.data);
      if (onProgress) onProgress(totalInserted, total);
    } catch (e) {
      console.log(`[Sync] Paused at page ${page}: ${e.message}. Saved ${totalInserted} exercises.`);
      break;
    }
  }

  // After syncing ExerciseDB exercises, update seed exercises with matching GIFs
  if (totalInserted > 0) {
    await linkSeedExerciseGifs(database);
    await AsyncStorage.setItem('lastExerciseSync', new Date().toISOString());
  }
  return totalInserted;
}

// After sync, find GIFs for seed exercises by matching names to synced ExerciseDB exercises
async function linkSeedExerciseGifs(database) {
  const SEED_TO_EXDB = {
    bench_press: 'barbell bench press',
    incline_bench: 'incline barbell bench press',
    back_squat: 'barbell full squat',
    front_squat: 'barbell front squat',
    deadlift: 'barbell deadlift',
    overhead_press: 'barbell standing military press',
    barbell_row: 'barbell bent over row',
    sumo_deadlift: 'barbell sumo deadlift',
    romanian_deadlift: 'barbell romanian deadlift',
    close_grip_bench: 'close grip barbell bench press',
    push_press: 'barbell push press',
    power_clean: 'barbell power clean',
    barbell_curl: 'barbell curl',
    barbell_hip_thrust: 'barbell hip thrust',
    good_morning: 'barbell good morning',
    barbell_lunge: 'barbell lunge',
    db_bench_press: 'dumbbell bench press',
    db_incline_press: 'dumbbell incline bench press',
    db_shoulder_press: 'dumbbell shoulder press',
    db_row: 'dumbbell bent over row',
    bicep_curl: 'dumbbell bicep curl',
    hammer_curl: 'dumbbell hammer curl',
    db_chest_fly: 'dumbbell fly',
    lateral_raise: 'dumbbell lateral raise',
    db_lunge: 'dumbbell lunge',
    goblet_squat: 'dumbbell goblet squat',
    db_rdl: 'dumbbell romanian deadlift',
    skull_crushers: 'dumbbell lying triceps extension',
    overhead_tricep_ext: 'dumbbell overhead triceps extension',
    tricep_kickback: 'dumbbell kickback',
    concentration_curl: 'dumbbell concentration curl',
    db_arnold_press: 'dumbbell arnold press',
    db_reverse_fly: 'dumbbell reverse fly',
    bulgarian_split_squat: 'dumbbell bulgarian split squat',
    step_ups: 'dumbbell step-up',
    db_walking_lunge: 'dumbbell walking lunge',
    db_thrusters: 'dumbbell thruster',
    push_ups: 'push-up',
    pull_ups: 'pull-up',
    chin_ups: 'chin-up',
    dips: 'chest dip',
    air_squats: 'bodyweight squat',
    burpees: 'burpee',
    mountain_climbers: 'mountain climber',
    sit_ups: 'sit-up',
    plank: 'front plank',
    bird_dog: 'bird dog',
    dead_bug: 'dead bug',
    v_ups: 'v-up',
    russian_twists: 'russian twist',
    box_jumps: 'box jump',
    glute_bridge: 'glute bridge march',
    pike_push_ups: 'pike push-up',
    inverted_row: 'inverted row',
    bench_dips: 'bench dip',
    lat_pulldown: 'cable wide-grip lat pulldown',
    cable_row: 'cable seated row',
    cable_fly: 'cable fly',
    cable_tricep_pushdown: 'cable pushdown',
    cable_bicep_curl: 'cable curl',
    cable_face_pulls: 'cable face pull',
    cable_lateral_raise: 'cable lateral raise',
    leg_press: 'leg press',
    leg_extension: 'leg extension',
    leg_curl: 'leg curl',
    machine_chest_press: 'machine chest press',
    kb_swing: 'kettlebell swing',
    kb_goblet_squat: 'kettlebell goblet squat',
    farmer_walk: 'farmer walk',
    barbell_thrusters: 'barbell thruster',
  };

  let linked = 0;
  for (const [seedId, exdbName] of Object.entries(SEED_TO_EXDB)) {
    try {
      const match = await database.getFirstAsync(
        "SELECT gif_url FROM exercises WHERE gif_url IS NOT NULL AND LOWER(name) = ? AND source = 'exercisedb' LIMIT 1",
        [exdbName.toLowerCase()]
      );
      if (match?.gif_url) {
        await database.runAsync('UPDATE exercises SET gif_url = ? WHERE id = ? AND (gif_url IS NULL OR gif_url = "")', [match.gif_url, seedId]);
        linked++;
      }
    } catch { /* skip */ }
  }
  console.log(`[Sync] Linked ${linked} seed exercises to HQ GIFs`);
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
// Activity Log (freeform activity tracking)
// ═══════════════════════════════════════════════════════════════

export async function saveActivity(activity) {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO activity_log (date, type, title, description, duration_minutes, distance_miles, pace, exercises, score, score_type, calories_est, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      activity.date || new Date().toISOString().split('T')[0],
      activity.type || 'workout',
      activity.title || 'Activity',
      activity.description || null,
      activity.duration_minutes || null,
      activity.distance_miles || null,
      activity.pace || null,
      activity.exercises ? JSON.stringify(activity.exercises) : null,
      activity.score || null,
      activity.score_type || null,
      activity.calories_est || null,
      activity.notes || null,
    ]
  );
  return result.lastInsertRowId;
}

export async function getActivityLog(limit = 30) {
  const database = await getDatabase();
  return database.getAllAsync(
    'SELECT * FROM activity_log ORDER BY date DESC, created_at DESC LIMIT ?',
    [limit]
  );
}

export async function getActivityStats() {
  const database = await getDatabase();
  const total = await database.getFirstAsync('SELECT COUNT(*) as count FROM activity_log');
  const thisWeek = await database.getFirstAsync(
    "SELECT COUNT(*) as count FROM activity_log WHERE date >= date('now', '-7 days')"
  );
  const totalDuration = await database.getFirstAsync(
    'SELECT COALESCE(SUM(duration_minutes), 0) as total FROM activity_log'
  );
  const totalDistance = await database.getFirstAsync(
    'SELECT COALESCE(SUM(distance_miles), 0) as total FROM activity_log WHERE distance_miles > 0'
  );
  return {
    totalActivities: total?.count || 0,
    thisWeekActivities: thisWeek?.count || 0,
    totalDurationMinutes: totalDuration?.total || 0,
    totalDistanceMiles: totalDistance?.total || 0,
  };
}

export async function deleteActivity(id) {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM activity_log WHERE id = ?', [id]);
}

// ═══════════════════════════════════════════════════════════════
// Custom Workout Sessions (structured logging with entries)
// ═══════════════════════════════════════════════════════════════

export async function saveCustomSession(session) {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO custom_sessions (date, source, title, raw_input, duration_minutes, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      session.date || new Date().toISOString().split('T')[0],
      session.source || 'manual',
      session.title || 'Workout',
      session.raw_input || null,
      session.duration_minutes || null,
      session.notes || null,
    ]
  );
  const sessionId = result.lastInsertRowId;

  // Insert entries
  console.log(`[CustomSession] Saved session ${sessionId}: "${session.title}", ${session.entries?.length || 0} entries`);
  if (session.entries?.length > 0) {
    for (let i = 0; i < session.entries.length; i++) {
      const e = session.entries[i];
      await database.runAsync(
        `INSERT INTO custom_entries (session_id, exercise_seed_id, exercise_name, muscle_group, category,
         sets, reps, weight_lbs, duration_minutes, distance_miles, intensity, wod_id, wod_score, wod_score_type, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, e.exercise_seed_id || null, e.exercise_name || 'Unknown', e.muscle_group || null,
         e.category || 'strength', e.sets || null, e.reps || null, e.weight_lbs || null,
         e.duration_minutes || null, e.distance_miles || null, e.intensity || null,
         e.wod_id || null, e.wod_score || null, e.wod_score_type || null, i]
      );
    }
  }
  return sessionId;
}

export async function getCustomSessions(limit = 30) {
  const database = await getDatabase();
  const sessions = await database.getAllAsync(
    'SELECT * FROM custom_sessions ORDER BY date DESC, created_at DESC LIMIT ?', [limit]
  );
  for (const s of sessions) {
    s.entries = await database.getAllAsync(
      'SELECT * FROM custom_entries WHERE session_id = ? ORDER BY sort_order', [s.id]
    );
  }
  return sessions;
}

export async function deleteCustomSession(id) {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM custom_entries WHERE session_id = ?', [id]);
  await database.runAsync('DELETE FROM custom_sessions WHERE id = ?', [id]);
}

// Unified exercise history — merges plan logs + custom logs for a given exercise
export async function getUnifiedExerciseHistory(exerciseSeedId, limit = 30) {
  const database = await getDatabase();
  // Plan exercises
  const planRows = await database.getAllAsync(
    `SELECT pe.actual_weight as weight, pe.actual_reps as reps, pe.sets, pd.date, pd.week_number, 'plan' as source
     FROM plan_exercises pe
     JOIN plan_blocks pb ON pb.id = pe.plan_block_id
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     WHERE pe.exercise_id = ? AND pe.is_completed = 1 AND pe.actual_weight IS NOT NULL
     ORDER BY pd.date DESC LIMIT ?`,
    [exerciseSeedId, limit]
  );
  // Custom entries
  const customRows = await database.getAllAsync(
    `SELECT ce.weight_lbs as weight, ce.reps, ce.sets, cs.date, NULL as week_number, 'custom' as source
     FROM custom_entries ce
     JOIN custom_sessions cs ON cs.id = ce.session_id
     WHERE ce.exercise_seed_id = ? AND ce.weight_lbs IS NOT NULL
     ORDER BY cs.date DESC LIMIT ?`,
    [exerciseSeedId, limit]
  );
  // Merge and sort by date
  return [...planRows, ...customRows]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, limit);
}

// Unified PR board — best weight across plan + custom for each exercise
export async function getUnifiedPersonalRecords() {
  const database = await getDatabase();
  // Plan PRs
  const planPRs = await database.getAllAsync(
    `SELECT pe.exercise_id as exercise_seed_id, e.name as exercise_name,
            MAX(CAST(pe.actual_weight AS REAL)) as best_weight, pd.date
     FROM plan_exercises pe
     JOIN plan_blocks pb ON pb.id = pe.plan_block_id
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     JOIN exercises e ON e.id = pe.exercise_id
     WHERE pe.is_completed = 1 AND pe.actual_weight IS NOT NULL
       AND pe.actual_weight != '' AND pe.actual_weight != 'BW'
       AND CAST(pe.actual_weight AS REAL) > 0
     GROUP BY pe.exercise_id`
  );
  // Custom PRs — include entries with OR without exercise_seed_id
  const customPRs = await database.getAllAsync(
    `SELECT ce.exercise_seed_id, ce.exercise_name,
            MAX(ce.weight_lbs) as best_weight, cs.date
     FROM custom_entries ce
     JOIN custom_sessions cs ON cs.id = ce.session_id
     WHERE ce.weight_lbs > 0
     GROUP BY COALESCE(ce.exercise_seed_id, ce.exercise_name)`
  );
  // Merge — keep best across both sources, key by seed_id or name
  const prMap = {};
  for (const pr of [...planPRs, ...customPRs]) {
    const key = pr.exercise_seed_id || pr.exercise_name;
    if (!prMap[key] || pr.best_weight > prMap[key].best_weight) {
      prMap[key] = pr;
    }
  }
  return Object.values(prMap).sort((a, b) => b.best_weight - a.best_weight);
}

// Muscle group volume distribution — weekly sets by muscle group from plan + custom
export async function getMuscleGroupVolume(weeks = 8) {
  const database = await getDatabase();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeks * 7);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  // Plan volume by muscle group per week
  const planVol = await database.getAllAsync(
    `SELECT pd.week_number, e.muscle_group, COUNT(*) as total_sets
     FROM plan_exercises pe
     JOIN plan_blocks pb ON pb.id = pe.plan_block_id
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     JOIN exercises e ON e.id = pe.exercise_id
     WHERE pe.is_completed = 1 AND pd.date >= ?
     GROUP BY pd.week_number, e.muscle_group`,
    [cutoffStr]
  );

  // Custom volume by muscle group per week
  const customVol = await database.getAllAsync(
    `SELECT strftime('%W', cs.date) as week_num, ce.muscle_group,
            SUM(COALESCE(ce.sets, 1)) as total_sets
     FROM custom_entries ce
     JOIN custom_sessions cs ON cs.id = ce.session_id
     WHERE cs.date >= ? AND ce.muscle_group IS NOT NULL
     GROUP BY week_num, ce.muscle_group`,
    [cutoffStr]
  );

  return { plan: planVol, custom: customVol };
}

// Weekly activity summary — plan + custom combined
export async function getWeeklyActivitySummary() {
  const database = await getDatabase();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const planSessions = await database.getFirstAsync(
    `SELECT COUNT(DISTINCT pd.id) as count
     FROM plan_days pd
     JOIN plan_blocks pb ON pb.plan_day_id = pd.id
     JOIN plan_exercises pe ON pe.plan_block_id = pb.id
     WHERE pd.date >= ? AND pe.is_completed = 1`,
    [cutoffStr]
  );
  const customSessions = await database.getFirstAsync(
    'SELECT COUNT(*) as count FROM custom_sessions WHERE date >= ?', [cutoffStr]
  );
  const customCardioMin = await database.getFirstAsync(
    `SELECT COALESCE(SUM(ce.duration_minutes), 0) as total
     FROM custom_entries ce JOIN custom_sessions cs ON cs.id = ce.session_id
     WHERE cs.date >= ? AND ce.category IN ('cardio', 'sport')`,
    [cutoffStr]
  );

  return {
    planSessions: planSessions?.count || 0,
    customSessions: customSessions?.count || 0,
    customCardioMinutes: customCardioMin?.total || 0,
  };
}

// Search WODs from seed library
export async function searchWods(query) {
  const database = await getDatabase();
  return database.getAllAsync(
    `SELECT id, name, category, type, movements, scheme, difficulty, time_cap
     FROM wods WHERE name LIKE ? ORDER BY name LIMIT 20`,
    [`%${query}%`]
  );
}

// Get all WODs grouped by category
export async function getWodsByCategory() {
  const database = await getDatabase();
  return database.getAllAsync(
    'SELECT id, name, category, type, movements, scheme, difficulty, time_cap FROM wods ORDER BY category, name'
  );
}

// Search seed exercises with muscle group filter
export async function searchSeedExercises(query, muscleGroup) {
  const database = await getDatabase();
  let sql = "SELECT id, name, muscle_group, category, is_compound FROM exercises WHERE source = 'seed'";
  const params = [];
  if (query) {
    sql += ' AND name LIKE ?';
    params.push(`%${query}%`);
  }
  if (muscleGroup) {
    sql += ' AND muscle_group = ?';
    params.push(muscleGroup);
  }
  sql += ' ORDER BY name LIMIT 30';
  return database.getAllAsync(sql, params);
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

export async function clearAllInjuries() {
  const database = await getDatabase();
  const active = await database.getAllAsync('SELECT id FROM injuries WHERE is_active = 1');
  await database.runAsync('UPDATE injuries SET is_active = 0, recovered_at = ? WHERE is_active = 1', [new Date().toISOString()]);
  return active.length;
}

export async function swapWorkoutDays(date1, date2) {
  const database = await getDatabase();
  const day1 = await database.getFirstAsync('SELECT * FROM plan_days WHERE date = ?', [date1]);
  const day2 = await database.getFirstAsync('SELECT * FROM plan_days WHERE date = ?', [date2]);
  if (!day1 || !day2) return false;

  // Swap day-level fields
  await database.runAsync(
    'UPDATE plan_days SET title = ?, focus = ?, phase = ?, color = ?, emoji = ?, is_rest_day = ? WHERE id = ?',
    [day2.title, day2.focus, day2.phase, day2.color, day2.emoji, day2.is_rest_day, day1.id]
  );
  await database.runAsync(
    'UPDATE plan_days SET title = ?, focus = ?, phase = ?, color = ?, emoji = ?, is_rest_day = ? WHERE id = ?',
    [day1.title, day1.focus, day1.phase, day1.color, day1.emoji, day1.is_rest_day, day2.id]
  );

  // Swap blocks by reassigning plan_day_id
  // Use a temp id to avoid unique constraint issues
  const TEMP_ID = -999;
  await database.runAsync('UPDATE plan_blocks SET plan_day_id = ? WHERE plan_day_id = ?', [TEMP_ID, day1.id]);
  await database.runAsync('UPDATE plan_blocks SET plan_day_id = ? WHERE plan_day_id = ?', [day1.id, day2.id]);
  await database.runAsync('UPDATE plan_blocks SET plan_day_id = ? WHERE plan_day_id = ?', [day2.id, TEMP_ID]);

  return true;
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
// Plan Rationales — stores Claude's reasoning for exercise selection
// ═══════════════════════════════════════════════════════════════

export async function savePlanRationales(planId, archetype, selections) {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO plan_rationales (plan_id, archetype, exercise_selections, wod_selections, rationales, excluded_rationale)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      planId,
      archetype || '',
      JSON.stringify((selections.days || []).map(d => ({ title: d.title, compounds: d.compounds, accessories: d.accessories }))),
      JSON.stringify(selections.wodPool || []),
      JSON.stringify((selections.days || []).map(d => d.rationale || '')),
      selections.excludedRationale || '',
    ]
  );
}

export async function getWorkoutLog(limit = 30) {
  const database = await getDatabase();
  const rows = await database.getAllAsync(
    `SELECT pd.date, pd.title, pd.week_number, pd.phase,
            COALESCE(e.name, pe.exercise_id) as exercise_name,
            pe.sets, pe.weight as prescribed, pe.actual_weight, pe.actual_reps, pe.notes
     FROM plan_days pd
     JOIN plan_blocks pb ON pb.plan_day_id = pd.id
     JOIN plan_exercises pe ON pe.plan_block_id = pb.id
     LEFT JOIN exercises e ON e.id = pe.exercise_id
     WHERE pd.is_completed = 1
       AND pe.is_completed = 1
       AND (e.category IS NULL OR e.category != 'cardio')
       AND pe.actual_weight IS NOT NULL
       AND pe.actual_weight != ''
       AND pe.actual_weight != 'BW'
     ORDER BY pd.date DESC, pb.sort_order, pe.sort_order
     LIMIT ?`,
    [limit * 10]
  );
  // Group by date
  const byDate = {};
  for (const row of rows) {
    if (!byDate[row.date]) byDate[row.date] = { date: row.date, title: row.title, week: row.week_number, phase: row.phase, exercises: [] };
    byDate[row.date].exercises.push(row);
  }
  return Object.values(byDate).slice(0, limit);
}

export async function getFullPlanContext(planId) {
  const database = await getDatabase();
  // Get all plan days past + future with exercise summaries
  const days = await database.getAllAsync(
    `SELECT pd.date, pd.title, pd.week_number, pd.phase, pd.is_rest_day, pd.is_completed,
            GROUP_CONCAT(
              CASE WHEN pb.is_amrap = 1 THEN pb.name
                   ELSE COALESCE(e.name, pe.exercise_id) || ' ' || COALESCE(pe.actual_weight, pe.weight, '') || 'lb x' || COALESCE(pe.actual_reps, pe.reps, '')
              END, ' | '
            ) as summary
     FROM plan_days pd
     LEFT JOIN plan_blocks pb ON pb.plan_day_id = pd.id
     LEFT JOIN plan_exercises pe ON pe.plan_block_id = pb.id
     LEFT JOIN exercises e ON e.id = pe.exercise_id
     WHERE pd.plan_id = ?
       AND (e.category IS NULL OR e.category != 'cardio')
     GROUP BY pd.id
     ORDER BY pd.date`,
    [planId]
  );
  return days;
}

export async function getWodByName(name) {
  const database = await getDatabase();
  return database.getFirstAsync(
    `SELECT * FROM wods WHERE LOWER(name) LIKE LOWER(?) LIMIT 1`,
    [`%${name}%`]
  );
}

export async function getRecentActualWeights(limitDays = 28) {
  const database = await getDatabase();
  const rows = await database.getAllAsync(
    `SELECT COALESCE(e.name, pe.exercise_id) as name, pe.exercise_id, pe.actual_weight, pe.weight as prescribed, pd.date
     FROM plan_exercises pe
     JOIN plan_blocks pb ON pb.id = pe.plan_block_id
     JOIN plan_days pd ON pd.id = pb.plan_day_id
     LEFT JOIN exercises e ON e.id = pe.exercise_id
     WHERE pe.is_completed = 1
       AND pe.actual_weight IS NOT NULL
       AND pe.actual_weight != ''
       AND pe.actual_weight NOT LIKE 'BW%'
       AND CAST(pe.actual_weight AS REAL) > 0
       AND (e.category IS NULL OR e.category != 'cardio')
       AND pd.date >= date('now', '-' || ? || ' days')
     ORDER BY pd.date DESC`,
    [limitDays],
  );
  // Deduplicate — keep most recent per exercise
  const seen = {};
  const result = [];
  for (const row of rows) {
    if (!seen[row.exercise_id]) {
      seen[row.exercise_id] = true;
      result.push(row);
    }
    if (result.length >= 20) break;
  }
  return result;
}

export async function getPlanRationales(planId) {
  const database = await getDatabase();
  return database.getFirstAsync(
    'SELECT * FROM plan_rationales WHERE plan_id = ? ORDER BY created_at DESC LIMIT 1',
    [planId]
  );
}

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
