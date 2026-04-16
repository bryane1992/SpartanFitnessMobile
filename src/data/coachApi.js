// GritOS AI Coach API Client
// Routes through Supabase Edge Function (API key stays server-side)
// Falls back to direct Anthropic API in dev mode only

import Constants from 'expo-constants';
import { getAuthToken } from './supabase';

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || 'https://nyvanilszqnjdwmxnybd.supabase.co';
const PROXY_URL = `${SUPABASE_URL}/functions/v1/claude-proxy`;
const DIRECT_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';
const TIMEOUT = 15000;

// System prompt cached across all conversations
const SYSTEM_PROMPT = `Brief AI fitness coach. Keep responses SHORT — 2-3 sentences max. When giving multiple points, put each on its own line with a line break between them. No markdown (no **, ##, *, _). No exercise IDs or database references — those are internal.

Never diagnose injuries — suggest modifications, recommend medical professional for sharp/persistent pain.
Swap exercises ONLY from SWAP OPTIONS with exact IDs. Never invent IDs. Never swap to different muscle group.

WEIGHT ADJUSTMENT RULES:
- When user says an exercise was "easy", "too light", or they exceeded prescribed weight/reps: PROACTIVELY ask if they want to increase weight for future weeks. If they confirm, use adjustWeight action.
- When user says "too heavy", "struggling", or failed reps: suggest reducing future weight.
- adjustWeight ONLY changes FUTURE weeks — it does NOT change today's logged workout. Tell the user: "I'll bump up [exercise] for future weeks."
- Use the exercise's planExerciseId and the suggested new weight.
- Typical adjustments: +5-10 lb for upper body, +10-20 lb for lower body compounds.
- BODYWEIGHT EXERCISES (pull-ups, push-ups, dips, air squats): when user says they can't hit the prescribed REPS, use adjustReps to lower the rep target — NOT adjustWeight. "I can only do 7 pull-ups" means adjust reps to 7, not weight to 7 lb. BW exercises have weight "BW" — never adjust their weight to a number.

INJURY ORDER: 1)reduce reps 2)lighten load 40-60% 3)limit ROM 4)slow tempo 5)change grip/stance 6)swap same-muscle from SWAP OPTIONS 7)unilateral work 8)cross-train 9)skip(last resort). Always flagInjury. Suggest longer rest.

RESPONSE: Plain text for questions/advice. JSON ONLY when performing actions:
{"message":"text","actions":[...],"options":[...]}
Actions: swap(planExerciseId,newExerciseId,reason), adjustWeight(planExerciseId,newWeight,reason), adjustReps(planExerciseId,newSets,newReps,reason), flagInjury(bodyPart,severity), removeExercise(planExerciseId,reason), addNote(planExerciseId,note), swapWod(planBlockId,newWodId,reason), swapDay(date1,date2,reason), clearInjuries(reason)
When athlete wants to swap today's workout with another day, use swapDay with the two dates (YYYY-MM-DD format). Before swapping, check the WEEK SCHEDULE — don't put legs adjacent to running/sprint days, or two heavy lower-body days back-to-back. Warn the athlete if a swap creates a bad adjacency and suggest a better option. When athlete says injuries are resolved or healed, use clearInjuries.
Options: ALWAYS present 2-3 options for swaps, removals, injuries, AND WOD changes so the user can choose. Format: {"label":"WOD Name","description":"why this WOD is better","recommended":bool,"action":{"type":"swapWod","planBlockId":"id","newWodId":"wod_id","reason":"why"}}
When user wants a different WOD, suggest 2-3 alternatives from the AVAILABLE WODS list.`;

// Strip markdown + internal IDs from responses — chat UI renders plain text
function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold** → bold
    .replace(/\*([^*]+)\*/g, '$1')      // *italic* → italic
    .replace(/__([^_]+)__/g, '$1')      // __bold__ → bold
    .replace(/_([^_]+)_/g, '$1')        // _italic_ → italic
    .replace(/^#{1,4}\s+/gm, '')        // ## heading → heading
    .replace(/^[-*]\s+/gm, '- ')        // keep list dashes clean
    .replace(/`([^`]+)`/g, '$1')        // `code` → code
    .replace(/\s*\(id:\s*\d+\)/gi, '')  // (id:24943) → removed
    .replace(/\s*\(planExerciseId:\s*\d+\)/gi, '') // (planExerciseId:123) → removed
    .replace(/\bid:\s*\d+\b/gi, '')     // id:24943 → removed
    .replace(/\s*\([a-z_]+\)/g, '')     // (bench_press) exercise IDs → removed
    .replace(/\s{2,}/g, ' ')            // collapse double spaces
    .trim();
}

// Sanitize user input — cap length, strip weird chars
function sanitizeInput(text, maxLen = 500) {
  if (!text) return '';
  // Remove control chars and excessive whitespace
  let clean = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
  // Cap length
  if (clean.length > maxLen) clean = clean.substring(0, maxLen) + '...';
  return clean;
}

export async function sendCoachMessage(apiKey, messages, context) {
  const userContext = buildContext(context);

  // Only keep last 4 messages to reduce tokens
  const recentMessages = messages.slice(-4);
  const anthropicMessages = recentMessages.map(m => ({
    role: m.role,
    content: m.role === 'user'
      ? sanitizeInput(
          m.content.includes('\nUser says: ') ? m.content.split('\nUser says: ').pop() : m.content
        )
      : m.content,
  }));

  const firstUserIdx = anthropicMessages.findIndex(m => m.role === 'user');
  if (firstUserIdx >= 0) {
    anthropicMessages[firstUserIdx].content = `${userContext}\n\nUser says: ${anthropicMessages[firstUserIdx].content}`;
  }

  console.log('[AI Coach] Context length:', userContext.length, 'chars, Messages:', anthropicMessages.length);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    // Route through Supabase proxy — requires auth
    const authToken = await getAuthToken();
    if (!authToken && !Constants.expoConfig?.extra?.claudeApiKey) {
      throw new Error('Not authenticated — please sign in');
    }
    const useProxy = !!authToken;
    const url = useProxy ? PROXY_URL : DIRECT_API_URL;
    const headers = useProxy
      ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }
      : { 'Content-Type': 'application/json', 'x-api-key': Constants.expoConfig?.extra?.claudeApiKey, 'anthropic-version': '2023-06-01' };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: anthropicMessages,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI Coach] API error:', response.status, errorText);
      throw new Error(`API ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const rawText = result.content?.[0]?.text || '';
    const usage = result.usage || {};

    console.log(`[AI Coach] Tokens — in: ${usage.input_tokens || '?'}, out: ${usage.output_tokens || '?'}`);

    // Strip markdown code fences if present
    let text = rawText.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    }
    // Extract JSON if surrounded by prose
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const jsonCandidate = text.substring(jsonStart, jsonEnd + 1);
      try {
        const parsed = JSON.parse(jsonCandidate);
        console.log('[AI Coach] JSON response with actions:', parsed.actions?.length || 0);
        return {
          message: stripMarkdown(parsed.message || text),
          actions: Array.isArray(parsed.actions) ? parsed.actions : [],
          options: Array.isArray(parsed.options) ? parsed.options : [],
        };
      } catch (parseErr) {
        // JSON parse failed — extract just the message text, skip actions
        // Don't try to regex-parse nested arrays — too error-prone
        console.warn('[AI Coach] JSON parse failed:', parseErr.message);
        const msgMatch = jsonCandidate.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (msgMatch) {
          return { message: stripMarkdown(msgMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')), actions: [], options: [] };
        }
      }
    }

    // Plain text response — no actions needed
    return { message: stripMarkdown(text), actions: [], options: [] };
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      return { message: "I'm taking a moment to think... try again in a sec.", actions: [] };
    }
    throw e;
  }
}

function buildContext(context) {
  const parts = [];

  // User's preferred units
  try {
    const { getUnits } = require('../utils/units');
    const units = getUnits();
    parts.push(`UNITS: ${units === 'metric' ? 'metric (kg, km)' : 'imperial (lb, mi)'} — always respond using these units`);
  } catch {}

  if (context.profile) {
    const p = context.profile;
    const goals = (p.goals || [p.goal]).join(', ');
    let userLine = `USER: Goals:${goals}, Exp:${p.experience}, Style:${p.workoutStyle}, Body:${p.bodyCompGoal}`;
    if (p.sex) userLine += `, Sex:${p.sex}`;
    if (p.weight) userLine += `, ${p.weight}lb`;
    if (p.height) userLine += `, ${p.height}`;
    if (p.bmi) userLine += `, BMI:${p.bmi}`;
    parts.push(userLine);
    if (p.workingWeights && Object.keys(p.workingWeights).length > 0) {
      const ww = Object.entries(p.workingWeights).map(([k, v]) => `${k}:${v}lb`).join(',');
      parts.push(`Working maxes: ${ww}`);
    }
    if (p.additionalNotes) parts.push(`Notes: ${sanitizeInput(p.additionalNotes, 300)}`);
    if (p.equipmentDetails) {
      if (p.equipmentDetails.barbell?.maxWeight) parts.push(`Barbell max: ${p.equipmentDetails.barbell.maxWeight} lbs`);
      if (p.equipmentDetails.kettlebell?.weights) parts.push(`Kettlebells: ${p.equipmentDetails.kettlebell.weights} lbs`);
      if (p.equipmentDetails.dumbbells?.maxWeight) parts.push(`Dumbbells: up to ${p.equipmentDetails.dumbbells.maxWeight} lbs per hand`);
      else if (p.equipmentDetails.dumbbells?.weights) parts.push(`Dumbbells: ${p.equipmentDetails.dumbbells.weights} lbs`);
    }
  }

  if (context.today) {
    const d = new Date(context.today + 'T12:00:00');
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    parts.push(`\nTODAY: ${days[d.getDay()]}, ${context.today}`);
  }

  if (context.workout) {
    const w = context.workout;
    parts.push(`\nWORKOUT: "${w.title}"`);
    if (w.blocks) {
      for (const block of w.blocks) {
        // Skip warmup blocks to save tokens
        if (block.name?.toUpperCase().includes('WARM')) continue;
        const isWodBlock = block.is_amrap || /wod|circuit|amrap|emom/i.test(block.name || '');
        const exercises = block.exercises || [];
        const todoExercises = exercises.filter(ex => !ex.is_completed);
        const doneCount = exercises.length - todoExercises.length;
        if (doneCount > 0) parts.push(`${block.name}: ${doneCount} done`);
        if (isWodBlock) parts.push(`  [WOD BLOCK id:${block.id}] ${block.name} ${block.time_cap || ''} — can be swapped with swapWod action`);
        for (const ex of todoExercises) {
          let line = `  ${ex.name} ${ex.sets} @ ${ex.weight || 'BW'} (id:${ex.id})`;
          if (context.alternatives && context.alternatives[ex.id]) {
            const altNames = context.alternatives[ex.id].map(a => `${a.name}(${a.id})`).join(',');
            line += ` swaps:${altNames}`;
          }
          parts.push(line);
        }
      }
    }
  }

  // Week schedule — coach sees the full week to avoid bad adjacencies when swapping
  if (context.weekSchedule && context.weekSchedule.length > 0) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    parts.push('\nWEEK SCHEDULE:');
    for (const d of context.weekSchedule) {
      const dow = days[new Date(d.date + 'T12:00:00').getDay()];
      parts.push(`  ${dow} ${d.date}: ${d.is_rest_day ? 'REST' : d.title}`);
    }
  }

  if (context.tomorrow) {
    const t = context.tomorrow;
    let tomorrowLine = `TOMORROW DETAIL: "${t.title}"`;
    if (t.date) tomorrowLine += ` (${t.date})`;
    if (t.blocks) {
      const exNames = t.blocks.flatMap(b => (b.exercises || []).map(e => e.name)).filter(Boolean);
      if (exNames.length > 0) tomorrowLine += ` — ${exNames.slice(0, 8).join(', ')}`;
    }
    parts.push(tomorrowLine);
  }

  if (context.injuries && context.injuries.length > 0) {
    parts.push(`\nACTIVE INJURIES: ${context.injuries.map(i => `${i.body_part} (${i.severity})`).join(', ')}`);
  }

  if (context.recentPrs && context.recentPrs.length > 0) {
    parts.push(`\nRECENT PRs: ${context.recentPrs.slice(0, 5).map(pr => `${pr.exercise_name}: ${pr.best_weight} lb`).join(', ')}`);
  }

  // Available WODs for swapping
  if (context.availableWods && context.availableWods.length > 0) {
    parts.push(`\nAVAILABLE WODS (for WOD swaps):`);
    for (const w of context.availableWods.slice(0, 10)) {
      const mvmts = Array.isArray(w.movements) ? w.movements.join(', ') : (w.movements || '');
      parts.push(`  ${w.id}: ${w.name} (${w.type}, ${mvmts})`);
    }
  }

  // Plan rationales — why exercises were chosen
  if (context.rationales) {
    const r = context.rationales;
    if (r.archetype) parts.push(`\nPLAN ARCHETYPE: ${r.archetype}`);
    if (r.excluded_rationale) parts.push(`EXCLUDED: ${sanitizeInput(r.excluded_rationale, 200)}`);
    try {
      const dayRationales = JSON.parse(r.rationales || '[]');
      if (dayRationales.length > 0) {
        parts.push(`EXERCISE RATIONALES: ${dayRationales.filter(Boolean).slice(0, 3).join(' | ')}`);
      }
    } catch {}
  }

  return parts.join('\n');
}
