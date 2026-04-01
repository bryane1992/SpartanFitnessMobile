// WOD Selector — context-aware WOD filtering and selection
// Derives metadata from existing WOD fields instead of requiring manual tagging

// ═══════════════════════════════════════════════════════════════
// Derive WOD metadata from existing fields
// ═══════════════════════════════════════════════════════════════

function deriveWodMetadata(wod) {
  const movements = (wod.movements || []).map(m => m.toLowerCase()).join(' ');
  const name = (wod.name || '').toLowerCase();
  const type = (wod.type || '').toUpperCase();
  const estTime = parseInt(wod.estimatedTime) || 15;

  // Energy system
  let energySystem = 'glycolytic';
  if (estTime <= 5) energySystem = 'phosphagen';
  else if (estTime >= 20) energySystem = 'oxidative';

  // Movement patterns present
  const patterns = new Set();
  if (/squat|thruster|wall ball|pistol|lunge|goblet/i.test(movements)) patterns.add('squat');
  if (/deadlift|clean|snatch|swing|rdl|hinge/i.test(movements)) patterns.add('hinge');
  if (/push.?up|press|bench|dip|jerk/i.test(movements)) patterns.add('push');
  if (/pull.?up|chin.?up|row|muscle.?up/i.test(movements)) patterns.add('pull');
  if (/run|row|bike|ski|jump rope|double.?under/i.test(movements)) patterns.add('cardio');
  if (/burpee/i.test(movements)) patterns.add('full_body');
  if (/carry|farmer|sandbag|sled/i.test(movements)) patterns.add('carry');
  if (/sit.?up|plank|toes.?to|v.?up|hollow/i.test(movements)) patterns.add('core');
  if (/box jump|broad jump/i.test(movements)) patterns.add('plyometric');

  // Spartan relevance (0-1)
  let spartanRelevance = 0;
  if (patterns.has('pull')) spartanRelevance += 0.25;
  if (patterns.has('carry')) spartanRelevance += 0.25;
  if (patterns.has('full_body')) spartanRelevance += 0.15;
  if (patterns.has('squat')) spartanRelevance += 0.10;
  if (patterns.has('cardio')) spartanRelevance += 0.15;
  if (patterns.has('plyometric')) spartanRelevance += 0.10;
  if (/burpee|pull.?up|carry|farmer|wall ball|box jump|rope/i.test(movements)) spartanRelevance += 0.15;
  spartanRelevance = Math.min(1, spartanRelevance);

  // Difficulty (1-5)
  const diffMap = { beginner: 1, intermediate: 2, advanced: 3, elite: 4 };
  let difficulty = diffMap[wod.difficulty] || 2;
  if (estTime >= 30) difficulty = Math.min(5, difficulty + 1);

  // Tags
  const tags = [];
  if (type === 'AMRAP') tags.push('amrap');
  if (type === 'EMOM') tags.push('emom');
  if (type === 'FOR TIME') tags.push('for_time');
  if (/chipper/i.test(wod.category) || (wod.movements || []).length >= 5) tags.push('chipper');
  if (patterns.size <= 2) tags.push('couplet');
  if (patterns.size === 1) tags.push('monostructural');
  if (patterns.has('cardio') && patterns.size >= 3) tags.push('mixed_modal');
  if (/hero/i.test(wod.category)) tags.push('hero');
  if (/girl/i.test(wod.category)) tags.push('girl');

  return {
    energySystem,
    movementPatterns: Array.from(patterns),
    spartanRelevance,
    difficulty,
    tags,
    estimatedMinutes: estTime,
  };
}

// ═══════════════════════════════════════════════════════════════
// Select the best WOD for a given context
// ═══════════════════════════════════════════════════════════════

export function selectWOD(wodPool, options = {}) {
  const {
    phase = 'foundation',
    dayPatterns = [],
    userEquipment = [],
    spartanBias = 0,
    preferredTags = [],
    maxDifficultyOverride = null,
    excludeWodIds = [],
    targetMinutes = 12,
    canDoPullUps = true,       // ability filter
    canDoRunning = true,       // ability filter
  } = options;

  const equip = new Set(userEquipment.map(e => e.toLowerCase()));

  // Max difficulty by phase, capped by archetype if provided
  const phaseMax = { foundation: 2, build: 3, peak: 4, race_prep: 3 }[phase] || 3;
  const maxDifficulty = maxDifficultyOverride != null ? Math.min(phaseMax, maxDifficultyOverride) : phaseMax;

  const scored = wodPool
    .filter(wod => {
      // Must have required equipment (or be bodyweight-only)
      const wodEquip = wod.equipment || [];
      const hasEquip = wodEquip.length === 0 || wodEquip.every(eq =>
        equip.has(eq) || eq === 'none' || eq === 'bodyweight'
      );
      if (!hasEquip) return false;

      // Not already used this week
      if (excludeWodIds.includes(wod.id)) return false;

      // Ability filtering — exclude WODs with movements user can't do
      const movements = (wod.movements || []).join(' ').toLowerCase();
      if (!canDoPullUps && /pull.?up|chin.?up|muscle.?up/i.test(movements)) return false;
      if (!canDoRunning && /\brun\b|mile|800m|400m/i.test(movements)) return false;

      return true;
    })
    .map(wod => {
      const meta = deriveWodMetadata(wod);
      let score = Math.random() * 3; // slight randomness for variety

      // Difficulty match for phase
      if (meta.difficulty <= maxDifficulty) score += 5;
      if (meta.difficulty > maxDifficulty) score -= 10;

      // Avoid overlapping today's primary lift patterns
      const overlap = meta.movementPatterns.filter(p => dayPatterns.includes(p)).length;
      score -= overlap * 4;

      // Spartan relevance
      score += meta.spartanRelevance * spartanBias * 15;

      // Preferred tags
      const tagMatches = meta.tags.filter(t => preferredTags.includes(t)).length;
      score += tagMatches * 3;

      // Duration match
      const durationDiff = Math.abs(meta.estimatedMinutes - targetMinutes);
      score -= durationDiff * 0.5;

      // Phase-appropriate energy system
      const phaseEnergy = {
        foundation: 'oxidative',
        build: 'glycolytic',
        peak: 'phosphagen',
        race_prep: 'oxidative',
      }[phase];
      if (meta.energySystem === phaseEnergy) score += 3;

      return { wod, meta, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored.length > 0 ? scored[0].wod : null;
}

// Select WODs for an entire phase (3-4 unique WODs to rotate through)
export function selectPhaseWODs(wodPool, phase, count, options = {}) {
  const selected = [];
  const usedIds = [];

  for (let i = 0; i < count; i++) {
    const wod = selectWOD(wodPool, { ...options, phase, excludeWodIds: usedIds });
    if (wod) {
      selected.push(wod);
      usedIds.push(wod.id);
    }
  }

  return selected;
}

export { deriveWodMetadata };
