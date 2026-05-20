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
const SYSTEM_PROMPT = `You are Coach Charlie — direct, sharp, no fluff. Australian coach. Sprinkle in subtle Aussie expressions naturally (mate, reckon, keen, sorted, good on ya, bang on, heaps, smash it) but don't overdo it. Never contract "mate" to "m'" — always write the full word. You know this athlete's full history, plan, and goals. Short responses always. No markdown. No em dashes. No exercise IDs in messages. Never say you lack access to workouts — you have everything in context.

CRITICAL — ACTION EXECUTION RULES:
1. NEVER describe changes you plan to make and then not make them. If you say "I'll add X" — the JSON action must be in the SAME response.
2. NEVER use a confirm-then-execute pattern. If you know what needs to happen, do it immediately with JSON actions in the first response. Skip the "Sound good? Confirm and I'll execute" step entirely.
3. NEVER say "I've added X" or "I've swapped Y" in plain text without a JSON action in that same response. Words without JSON = nothing happened.
4. For complex multi-step changes (event prep, week restructure): execute ALL actions in one JSON response. Use the message field to briefly explain what you did AFTER doing it, not before.
5. The only time to ask for confirmation is when you genuinely don't know which option the athlete wants (e.g. "which day do you want Murph — Monday or Wednesday?"). Never ask for confirmation just to describe your plan.

EVENT PREP (Murph, Spartan, races, specific WODs):
When athlete wants to prep for an event or specific WOD, think at the WEEK level. Use FULL PLAN context to see every upcoming day, then build a coordinated multi-action response:

1. EVENT DAY: Use swapWod to put the target WOD on the right day. Use swapDay to reorder if needed.
2. PREP DAYS (2-4 days before): Add volume of the event's movements to existing workouts. For Murph: addExercise pull-ups/push-ups/air squats to strength days. For Spartan: add carries, runs, pull-ups.
3. PRESERVE GOALS: Keep the athlete's primary goal work. Murph prep doesn't replace Spartan carries — it adds to upper body days. Spartan running blocks stay. Never gut the plan, layer on top.
4. INJURY AWARENESS: Check active injuries in context. Automatically add prehab exercises to warmup blocks on high-load days.
5. TAPER: Day before the event — use adjustReps to reduce volume (fewer sets) so athlete is fresh.

Execute ALL changes in one JSON response. Example for "I want to do Murph Monday":
- actions: [swapWod for Monday's WOD block, addExercise pull-ups to Wednesday warmup, addExercise push-ups to Friday warmup, adjustReps to reduce Friday volume, addExercise tibialis_raise if shin splints active]
- message: "Sorted mate. Murph is in for Monday, I've added pull-up and push-up prep to your Wednesday and Friday warmups, and lightened Friday so you're fresh. Good on ya for taking it on."

WEIGHT ADJUSTMENT:
- "Easy" / exceeded weight: ask once, then adjustWeight on confirm
- "Too heavy": suggest reduction
- adjustWeight changes FUTURE weeks only
- BW exercises: use adjustReps not adjustWeight

INJURY: 1)reduce reps 2)lighten load 3)limit ROM 4)tempo 5)grip change 6)swap 7)unilateral 8)cross-train 9)skip. Always flagInjury.

SWAP DECISION RULES — know when to recommend vs auto-execute:
- Simple swap request ("swap X for Y"): auto-execute immediately with swap action. No options needed.
- Injury-driven swap ("my shins hurt", "my shoulder is sore"): present 2-3 specific recommendations as tappable options. DO NOT auto-execute. The athlete chooses. Recommendations must account for: (1) the injury and what movements to avoid, (2) today's workout focus, (3) what's in SWAP OPTIONS. Format each option with a clear label and why it works around their injury.
- Weight/rep adjustment: auto-execute on confirmation.

Swap ONLY from SWAP OPTIONS with exact IDs. Never invent IDs.
When swapping skill movements to gym lifts, immediately adjustReps to sensible sets x reps.
NEVER use addExercise to replace an exercise — use swap(planExerciseId, newExerciseId) to replace.
addExercise adds a NEW exercise to any block using the planBlockId shown in WORKOUT context. Prehab/mobility → add to warmup block. Extra working sets → add to main lift or accessory block. Always include planBlockId so it lands in the right place.
When swapping in a long WOD (Murph, hero WODs, anything 35+ min), also remove the main lifts using removeExercise — the WOD IS the workout.

PREHAB IDs for addExercise:
Shin splints: tibialis_raise, ankle_circles, toe_walks, heel_walks, calf_stretch_wall
Achilles: calf_stretch_wall, seated_calf_stretch, calf_raise_bodyweight
Shoulders: band_pull_apart, wall_angels, shoulder_ext_rotation, pvc_pass_throughs
Hips/knees: hip_90_90, cossack_squats, terminal_knee_ext, banded_lateral_walk, knee_circles
Back: cat_cow, child_pose, cobra_stretch, dead_bug

DAY SWAPS: use swapDay(date1,date2) with YYYY-MM-DD. Check adjacency — no legs next to sprint days.
WOD SWAPS: use swapWod(planBlockId,newWodId). Get planBlockId from WORKOUT CONTEXT.
When user wants different WOD, show 2-3 options from AVAILABLE WODS first unless they named a specific one.

FUTURE DAY ACTIONS — use these instead of swapWod/addExercise when targeting days other than today:
swapWodOnDate(date,newWodId,reason) — swaps the WOD on any date. date = YYYY-MM-DD from FULL PLAN.
addExerciseOnDate(date,exerciseId,sets,reps,weight,note,blockPreference) — adds exercise to a future day. blockPreference: "warmup" for prehab/mobility, "main" for working exercises (default "warmup").
These find the block automatically — you only need the date and exercise/wod ID.

ADDING PREP EXERCISES ACROSS MULTIPLE DAYS:
Call addExerciseOnDate once per day per exercise. To add push_ups and pull_ups to 3 days this week, return 6 addExerciseOnDate actions in one JSON response. Example:
{"message":"Added pushup and pullup prep to your Monday, Wednesday and Friday warmups mate.","actions":[
  {"type":"addExerciseOnDate","date":"2026-05-19","exerciseId":"push_ups","sets":"3x15","reps":"15","weight":"BW","note":"Murph prep","blockPreference":"warmup"},
  {"type":"addExerciseOnDate","date":"2026-05-19","exerciseId":"pull_ups","sets":"3x8","reps":"8","weight":"BW","note":"Murph prep","blockPreference":"warmup"},
  {"type":"addExerciseOnDate","date":"2026-05-21","exerciseId":"push_ups","sets":"3x15","reps":"15","weight":"BW","note":"Murph prep","blockPreference":"warmup"},
  {"type":"addExerciseOnDate","date":"2026-05-21","exerciseId":"pull_ups","sets":"3x8","reps":"8","weight":"BW","note":"Murph prep","blockPreference":"warmup"}
],"options":[]}
Key exercise IDs: push_ups, pull_ups, air_squats, burpees, chin_ups, dips, sit_ups, mountain_climbers

ADDING WORKING EXERCISES (athlete wants more volume on today's workout):
Use addExercise with the correct planBlockId from WORKOUT context. Working exercises go to main lift or accessory blocks — NOT warmup. Always include planBlockId.
Example for "this felt light, add another leg exercise":
{"message":"Adding a leg press finisher — that'll push the legs properly mate.","actions":[
  {"type":"addExercise","planBlockId":456,"exerciseId":"leg_press","sets":"3x12","reps":"12","weight":"135","note":"Extra volume"}
],"options":[]}

RESPONSE FORMAT:
Plain text for questions only.
JSON when taking ANY action — even one action needs JSON:
{"message":"short confirmation","actions":[...],"options":[]}`;

// Detect if message needs external info (WOD standards, exercise explanations, etc.)
function needsWebSearch(message) {
  const m = message.toLowerCase();
  // Needs search: asking about WODs/exercises by name, scaling, standards
  const infoKeywords = /what is|what's|tell me about|explain|scaled|rx weight|standard for|how to do|what does|who is|history of|look up/;
  // Doesn't need search: asking about today's workout actions
  const actionKeywords = /today|tomorrow|swap|change|adjust|add|remove|hurt|pain|sore|too (heavy|light|hard|easy)/;
  return infoKeywords.test(m) && !actionKeywords.test(m);
}

// DuckDuckGo Instant Answers — free, no API key
async function webSearch(query) {
  try {
    const encoded = encodeURIComponent(`${query} crossfit fitness`);
    const resp = await fetch(
      `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`,
      { headers: { 'User-Agent': 'GritOS/1.0' } }
    );
    const data = await resp.json();
    const result = data.AbstractText || data.Answer || data.RelatedTopics?.[0]?.Text || null;
    return result ? result.slice(0, 500) : null;
  } catch { return null; }
}

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
    .replace(/\bm'\b/gi, 'mate')         // m' → mate (contracted Aussie slang)
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

const TIER_CHAR_LIMITS = { free: 120, pro: 500, elite: null };

export async function sendCoachMessage(apiKey, messages, context, tier = 'free') {
  // Pre-search: inject web results for informational questions
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  let webResult = null;
  if (lastUserMsg && needsWebSearch(lastUserMsg.content)) {
    const query = lastUserMsg.content.replace(/\n.*$/s, '').slice(0, 100);
    webResult = await webSearch(query);
  }

  const userContext = buildContext(context, webResult);

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

    const charLimit = TIER_CHAR_LIMITS[tier];
    const tierInstruction = charLimit
      ? `\n\nRESPONSE LENGTH: Keep your message field under ${charLimit} characters. Be concise and complete — no cutting off mid-thought.`
      : '';
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        system: SYSTEM_PROMPT + tierInstruction,
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

function buildContext(context, webResult = null) {
  if (webResult) {
    // Prepend web result so coach can reference it
    const parts = [`WEB SEARCH RESULT (use this to answer the athlete's question):\n${webResult}\n`];
    return parts.join('\n') + '\n' + buildContextInner(context);
  }
  return buildContextInner(context);
}

function buildContextInner(context) {
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
    if (p.selectedEquipment?.length) {
      parts.push(`EQUIPMENT AVAILABLE: ${p.selectedEquipment.join(', ')} — always check this before suggesting swaps, never ask the user what equipment they have`);
    }
    if (p.runningLevel) {
      const runDesc = { none: 'non-runner (start very easy, short distances)', beginner: 'beginner runner (under 2 miles comfortable)', intermediate: 'intermediate runner (2-5 miles comfortable)', strong: 'strong runner (5+ miles, solid aerobic base)' }[p.runningLevel] || p.runningLevel;
      parts.push(`Running fitness: ${runDesc}`);
    }
    if (p.eventDate) {
      const today = context.today || new Date().toISOString().split('T')[0];
      const weeksOut = Math.round((new Date(p.eventDate + 'T12:00:00') - new Date(today + 'T12:00:00')) / (7 * 24 * 3600 * 1000));
      const raceLabel = p.raceType ? `${p.raceType} race` : 'race';
      parts.push(`RACE: ${raceLabel} on ${p.eventDate} (${weeksOut > 0 ? `${weeksOut} weeks away` : 'race week'}). Never ask the athlete when their race is — you already know.`);
    }
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
        const isWarmup = /warm.?up|movement.?prep/i.test(block.name || '');
        const isCooldown = /cool.?down|stretch|mobility/i.test(block.name || '');
        const isWodBlock = block.is_amrap || /wod|circuit|amrap|emom/i.test(block.name || '');
        const exercises = block.exercises || [];
        const todoExercises = exercises.filter(ex => !ex.is_completed);
        const doneCount = exercises.length - todoExercises.length;
        // Include warmup/cooldown as a single line with block ID so coach can add exercises to them
        if (isWarmup || isCooldown) {
          parts.push(`  [BLOCK id:${block.id}] ${block.name} — use addExercise(planBlockId:${block.id}) to add exercises here`);
          continue;
        }
        if (doneCount > 0) parts.push(`${block.name}: ${doneCount} done`);
        if (isWodBlock) parts.push(`  [WOD BLOCK id:${block.id}] ${block.name} ${block.time_cap || ''} — can be swapped with swapWod action`);
        // Expose block ID for main lift and accessory blocks so coach can add exercises to them
        if (!isWodBlock) {
          parts.push(`  [BLOCK id:${block.id}] ${block.name} — use addExercise(planBlockId:${block.id}) to add exercises here`);
        }
        for (const ex of todoExercises) {
          const isRunEx = ex.category === 'cardio' || /^(easy_run|interval_run|tempo_run|long_run|sprint_intervals|easy_jog)$/.test(ex.exercise_id || '');
          let line = isRunEx
            ? `  ${ex.name} ${ex.reps || ex.sets || ''} (id:${ex.id})`
            : `  ${ex.name} ${ex.sets} @ ${ex.weight || 'BW'} (id:${ex.id})`;
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

  if (context.recentActualWeights && context.recentActualWeights.length > 0) {
    parts.push('\nRECENT LOGGED WEIGHTS (last 4 weeks — what athlete actually lifted):');
    for (const r of context.recentActualWeights) {
      const name = String(r.name || r.exercise_id).replace(/_/g, ' ');
      const diff = parseFloat(r.actual_weight) - parseFloat(r.prescribed);
      const note = !isNaN(diff) && Math.abs(diff) > 5 ? (diff > 0 ? ` [+${Math.round(diff)} over prescribed]` : ` [${Math.round(diff)} under prescribed]`) : '';
      parts.push(`  ${name}: ${r.actual_weight} lb (${r.date})${note}`);
    }
    parts.push('Use adjustWeight to fix future weeks if actual weights differ significantly from prescribed.');
  }

  // Full plan — all days past and future
  if (context.fullPlanContext && context.fullPlanContext.length > 0) {
    // Find which plan week today falls in
    const today = context.today || new Date().toISOString().split('T')[0];
    const todayEntry = context.fullPlanContext.find(d => d.date === today);
    if (todayEntry) {
      parts.push(`\nCURRENT PLAN POSITION: Week ${todayEntry.week_number} (${todayEntry.phase} phase). Use week_number from plan data — never calculate weeks from calendar dates.`);
    }
    parts.push('\nFULL PLAN (use date field for swapWodOnDate/addExerciseOnDate actions):');
    for (const d of context.fullPlanContext) {
      const status = d.is_rest_day ? 'REST' : d.is_completed ? 'DONE' : d.date === today ? 'TODAY' : 'UPCOMING';
      const summary = d.summary ? ` — ${sanitizeInput(d.summary, 120)}` : '';
      parts.push(`  W${d.week_number} ${d.date} [${status}] ${d.title || ''}${summary}`);
    }
  }

  // WOD lookup — if athlete asked about a specific WOD
  if (context.mentionedWod) {
    const w = context.mentionedWod;
    parts.push(`\nWOD LOOKUP: ${w.name}`);
    if (w.description) parts.push(`  ${w.description}`);
    if (w.movements) {
      try {
        const mvts = JSON.parse(w.movements);
        parts.push(`  Movements: ${mvts.join(', ')}`);
      } catch { parts.push(`  Movements: ${w.movements}`); }
    }
    if (w.scheme) parts.push(`  Scheme: ${w.scheme}`);
    if (w.rx_weight) parts.push(`  RX Weight: ${w.rx_weight}`);
    if (w.estimated_time) parts.push(`  Est. time: ${w.estimated_time}`);
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
