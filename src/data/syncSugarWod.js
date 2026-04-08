// SugarWOD Sync — fetches verified WODs from SugarWOD API
// Imports Girls + Heroes benchmarks into local wods table
// Run from Settings > Dev Tools or on app init

import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase } from './database';

const API_BASE = 'https://api.sugarwod.com/v2';

function getApiKey() {
  return Constants.expoConfig?.extra?.wodApiKey
    || Constants.manifest?.extra?.wodApiKey
    || null;
}

// Fetch all pages for a benchmark category
async function fetchCategory(category, apiKey) {
  const all = [];
  let url = `${API_BASE}/benchmarks/category/${category}`;
  while (url) {
    const response = await fetch(url, { headers: { 'Authorization': apiKey } });
    if (!response.ok) throw new Error(`SugarWOD API ${response.status}`);
    const data = await response.json();
    if (data.data) all.push(...data.data);
    url = data.links?.next || null;
    await new Promise(r => setTimeout(r, 200)); // rate limit
  }
  return all;
}

// Parse SugarWOD description into structured movements
function parseDescription(description) {
  if (!description) return { movements: [], scheme: '', type: 'FOR TIME' };

  const lines = description.split('\n').map(l => l.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean);

  // Detect format
  let type = 'FOR TIME';
  let scheme = '';
  let timeCap = null;

  if (/AMRAP/i.test(description)) {
    type = 'AMRAP';
    const timeMatch = description.match(/AMRAP\s*(?:in\s*)?(\d+)\s*min/i);
    if (timeMatch) { timeCap = `${timeMatch[1]} min`; scheme = `AMRAP ${timeMatch[1]}`; }
  } else if (/EMOM|each minute|every minute/i.test(description)) {
    type = 'EMOM';
    const timeMatch = description.match(/(\d+)\s*min/i);
    if (timeMatch) { timeCap = `${timeMatch[1]} min`; scheme = `EMOM ${timeMatch[1]}`; }
  } else if (/for load|1RM|max/i.test(description)) {
    type = 'FOR LOAD';
  } else if (/for reps|max rep/i.test(description)) {
    type = 'FOR REPS';
  }

  // Extract rep scheme
  const schemeMatch = description.match(/(\d+[-\/]\d+[-\/]?\d*)\s*reps/i);
  if (schemeMatch) scheme = schemeMatch[1];
  const roundMatch = description.match(/(\d+)\s*rounds/i);
  if (roundMatch && !scheme) scheme = `${roundMatch[1]} rounds`;

  // Extract movements (lines that look like exercises)
  const movements = lines.filter(l => {
    // Skip header lines
    if (/^(for time|amrap|emom|complete|proceed|partition|rest|start|finish|time cap|men|women)/i.test(l)) return false;
    if (l.length < 3) return false;
    // Keep lines that have exercise-like content
    return /[A-Za-z]/.test(l) && !/^\d+\s*rounds?\s*(for|of)/i.test(l);
  });

  return { movements, scheme, type, timeCap };
}

// Detect equipment from movement text
function detectEquipment(movements) {
  const text = movements.join(' ').toLowerCase();
  const equip = [];
  if (/barbell|deadlift|clean|snatch|jerk|thruster|press|squat.*#|squat.*lb/i.test(text)) equip.push('barbell');
  if (/kettlebell|kb|pood/i.test(text)) equip.push('kettlebell');
  if (/pull.?up|chin.?up|toes.?to.?bar|knees.?to/i.test(text)) equip.push('pull_up_bar');
  if (/ring|muscle.?up/i.test(text)) equip.push('rings');
  if (/rope climb/i.test(text)) equip.push('rope');
  if (/box jump|box step/i.test(text)) equip.push('box');
  if (/wall ball/i.test(text)) equip.push('wall_ball');
  if (/row|rower/i.test(text)) equip.push('cardio_machines');
  if (/double.?under|jump rope/i.test(text)) equip.push('jump_rope');
  if (/dumbbell|db/i.test(text)) equip.push('dumbbell');
  if (/ghd|back extension/i.test(text)) equip.push('machine');
  return equip;
}

// Detect difficulty from content
function detectDifficulty(wod, movements) {
  const text = movements.join(' ').toLowerCase();
  if (/muscle.?up|handstand|pistol|legless|triple/i.test(text)) return 'advanced';
  if (/1rm|max.*weight|bodyweight.*bench/i.test(text)) return 'advanced';
  const hasBarbell = /barbell|clean|snatch|jerk|deadlift/i.test(text);
  const highReps = movements.some(m => { const n = parseInt(m); return n > 50; });
  if (hasBarbell && highReps) return 'advanced';
  if (hasBarbell) return 'intermediate';
  return 'beginner';
}

// Detect if WOD contains running
function hasRunning(movements) {
  return movements.some(m => /\brun\b|\bmile\b|800m|400m|200m|sprint/i.test(m));
}

// Estimate duration from content
function estimateDuration(description, movements) {
  const timeMatch = description?.match(/(\d+)\s*min/i);
  if (timeMatch) return `${timeMatch[1]} min`;
  const totalReps = movements.reduce((sum, m) => {
    const n = parseInt(m);
    return sum + (isNaN(n) ? 10 : n);
  }, 0);
  if (totalReps > 200) return '15-25 min';
  if (totalReps > 100) return '8-15 min';
  return '5-10 min';
}

// Convert SugarWOD benchmark to our wods table format
function convertToLocal(sugarWod) {
  const attrs = sugarWod.attributes;
  const { movements, scheme, type, timeCap } = parseDescription(attrs.description);
  const equipment = detectEquipment(movements);
  const difficulty = detectDifficulty(sugarWod, movements);
  const estTime = estimateDuration(attrs.description, movements);

  // Generate a clean ID
  const id = 'sw_' + attrs.name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 40);

  // Extract rx weight from description
  const rxMatch = attrs.description?.match(/(\d+\/\d+)\s*(?:#|lb|lbs)/i);
  const rxWeight = rxMatch ? `${rxMatch[1]} lb` : null;

  return {
    id,
    name: attrs.name.toUpperCase(),
    category: attrs.category || 'benchmark',
    type,
    description: attrs.description?.split('\n')[0] || '',
    movements: JSON.stringify(movements),
    scheme,
    time_cap: timeCap,
    rx_weight: rxWeight,
    difficulty,
    estimated_time: estTime,
    equipment: JSON.stringify(equipment),
    tips: null,
    source: 'sugarwod',
    sugarwod_id: sugarWod.id,
  };
}

export async function syncSugarWodBenchmarks(onProgress) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('WOD_TOKEN not configured');

  const database = await getDatabase();
  let totalSynced = 0;

  // Wipe all old WODs — SugarWOD is now the single source of truth
  if (onProgress) onProgress('Clearing old WOD data...');
  await database.runAsync('DELETE FROM wods');
  console.log('[SugarWOD] Cleared old WOD table');

  // Fetch Girls + Heroes (most useful for plan generation)
  for (const category of ['girls', 'heroes']) {
    if (onProgress) onProgress(`Fetching ${category}...`);
    const wods = await fetchCategory(category, apiKey);
    if (onProgress) onProgress(`Processing ${wods.length} ${category}...`);

    for (const wod of wods) {
      const local = convertToLocal(wod);
      // Skip WODs with no parseable movements
      if (JSON.parse(local.movements).length === 0) continue;

      try {
        await database.runAsync(
          `INSERT OR REPLACE INTO wods (id, name, category, type, description, movements, scheme, time_cap, rx_weight, difficulty, estimated_time, equipment, tips)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [local.id, local.name, local.category, local.type, local.description,
           local.movements, local.scheme, local.time_cap, local.rx_weight,
           local.difficulty, local.estimated_time, local.equipment, local.tips]
        );
        totalSynced++;
      } catch (e) {
        console.warn(`[SugarWOD] Failed to insert ${local.name}:`, e.message);
      }
    }
  }

  await AsyncStorage.setItem('lastSugarWodSync', new Date().toISOString());
  console.log(`[SugarWOD] Synced ${totalSynced} verified WODs`);
  return totalSynced;
}
