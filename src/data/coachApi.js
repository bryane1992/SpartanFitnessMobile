// Claude AI Coach API Client
// Uses Claude Sonnet 4.6 via Anthropic API

import Constants from 'expo-constants';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const TIMEOUT = 15000;

// Read from app config (sourced from .env), fallback to bundled key
const BUNDLED_API_KEY = Constants.expoConfig?.extra?.claudeApiKey
  || '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';

// System prompt cached across all conversations
const SYSTEM_PROMPT = `You are the Spartan Fitness AI Coach — a concise, knowledgeable, motivating personal trainer.

RULES:
- Keep responses under 3 sentences unless explaining form/technique
- Be direct and actionable, like a real coach talking between sets
- Never diagnose injuries — suggest alternatives and recommend seeing a medical professional for persistent/sharp pain
- Use the user's actual workout context to give specific advice
- When suggesting exercise swaps, you MUST use an exercise ID from the SWAP OPTIONS listed next to each exercise. Never invent exercise IDs.
- INJURY MODIFICATION RULES — try these IN ORDER, use the first one that works:
  1. REDUCE VOLUME — fewer sets/reps first (use adjustReps action). Still trains the muscle with less stress.
  2. LIGHTEN LOAD — drop weight to 40-60% of current (use adjustWeight). Can still build strength at lower intensity.
  3. LIMIT RANGE OF MOTION — suggest pain-free ROM via addNote (e.g. half squats instead of deep squats, hang cleans instead of power cleans).
  4. SLOW DOWN / CHANGE TEMPO — add a note to move slowly and controlled, especially through the painful range.
  5. CHANGE POSITIONING — suggest grip/stance/angle adjustments via addNote (e.g. wider squat stance, neutral grip instead of supinated).
  6. SUBSTITUTE SIMILAR MOVEMENT — swap to a same-muscle-group variation from SWAP OPTIONS (e.g. trap bar deadlift for conventional, incline press for flat bench, band-assisted pullup for strict). MUST target the same muscles.
  7. UNILATERAL/ISOLATED WORK — if one side hurts, suggest single-arm/leg variation to train the non-injured side.
  8. CROSS TRAIN — suggest a different exercise mode that trains similar fitness (e.g. rower instead of running for knee pain).
  9. SKIP THE EXERCISE — use "removeExercise" ONLY as last resort when nothing above is safe.
  NEVER swap to a different muscle group. Always flag the injury with "flagInjury" action.
  When modifying for injury, also suggest LONGER REST between sets (1-3 min for strength, 30-60s for endurance).
  Always recommend seeing a medical professional if pain is sharp or persistent.

RESPONSE FORMAT:
Always respond with valid JSON:
{
  "message": "Your coaching text here (shown to user)",
  "actions": [],
  "options": []
}

ACTIONS — executed immediately (use for non-injury things like general weight/rep tweaks, or after the user picks an option):
- {"type": "swap", "planExerciseId": N, "newExerciseId": "id", "reason": "text"}
- {"type": "adjustWeight", "planExerciseId": N, "newWeight": "X lb", "reason": "text"}
- {"type": "adjustReps", "planExerciseId": N, "newSets": "3", "newReps": "8", "reason": "text"}
- {"type": "flagInjury", "bodyPart": "shoulder", "severity": "mild|moderate|severe"}
- {"type": "removeExercise", "planExerciseId": N, "reason": "text"}
- {"type": "addNote", "planExerciseId": N, "note": "text"}

OPTIONS — presented as buttons for the user to choose (use for injury modifications):
Each option: {"label": "short button text", "description": "why this helps", "recommended": true/false, "action": {action object}}
Mark your top recommendation with "recommended": true.
Give 2-4 options when the user reports pain/injury. Always include flagInjury in the actions array alongside options.

If no actions or options needed, return empty arrays.`;

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
  // Use bundled key if none provided
  if (!apiKey) apiKey = BUNDLED_API_KEY;
  const userContext = buildContext(context);

  // Only keep last 4 messages (not 6) to reduce tokens
  const recentMessages = messages.slice(-4);
  const anthropicMessages = recentMessages.map(m => ({
    role: m.role,
    // Strip old context from previous messages — only keep the user's actual text
    content: m.role === 'user'
      ? sanitizeInput(
          m.content.includes('\nUser says: ') ? m.content.split('\nUser says: ').pop() : m.content
        )
      : m.content,
  }));

  // Only prepend context to the FIRST user message in the batch
  // (system prompt + one context block is enough, Claude remembers within conversation)
  const firstUserIdx = anthropicMessages.findIndex(m => m.role === 'user');
  if (firstUserIdx >= 0) {
    anthropicMessages[firstUserIdx].content = `${userContext}\n\nUser says: ${anthropicMessages[firstUserIdx].content}`;
  }

  console.log('[AI Coach] Context length:', userContext.length, 'chars, Messages:', anthropicMessages.length);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 350,
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

    // Strip markdown code fences if present (```json ... ```)
    let text = rawText.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    }

    // Parse JSON response
    try {
      const parsed = JSON.parse(text);
      console.log('[AI Coach] Parsed actions:', JSON.stringify(parsed.actions));
      console.log('[AI Coach] Parsed options:', JSON.stringify(parsed.options));
      return {
        message: parsed.message || text,
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        options: Array.isArray(parsed.options) ? parsed.options : [],
      };
    } catch (parseErr) {
      console.warn('[AI Coach] JSON parse failed, returning as plain text:', parseErr.message);
      return { message: rawText, actions: [] };
    }
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

  if (context.profile) {
    const p = context.profile;
    parts.push(`USER PROFILE: Goal: ${p.goal}, Experience: ${p.experience}, Style: ${p.workoutStyle}, Body comp: ${p.bodyCompGoal}`);
    if (p.additionalNotes) parts.push(`USER NOTES: ${sanitizeInput(p.additionalNotes, 300)}`);
    if (p.equipmentDetails) {
      if (p.equipmentDetails.barbell?.maxWeight) parts.push(`Barbell max: ${p.equipmentDetails.barbell.maxWeight} lbs`);
      if (p.equipmentDetails.kettlebell?.weights) parts.push(`Kettlebells: ${p.equipmentDetails.kettlebell.weights} lbs`);
      if (p.equipmentDetails.dumbbells?.maxWeight) parts.push(`Dumbbells: up to ${p.equipmentDetails.dumbbells.maxWeight} lbs per hand`);
      else if (p.equipmentDetails.dumbbells?.weights) parts.push(`Dumbbells: ${p.equipmentDetails.dumbbells.weights} lbs`);
    }
  }

  if (context.workout) {
    const w = context.workout;
    parts.push(`\nWORKOUT: "${w.title}"`);
    if (w.blocks) {
      for (const block of w.blocks) {
        // Skip warmup blocks to save tokens
        if (block.name?.toUpperCase().includes('WARM')) continue;
        const exercises = block.exercises || [];
        const todoExercises = exercises.filter(ex => !ex.is_completed);
        const doneCount = exercises.length - todoExercises.length;
        if (doneCount > 0) parts.push(`${block.name}: ${doneCount} done`);
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

  if (context.injuries && context.injuries.length > 0) {
    parts.push(`\nACTIVE INJURIES: ${context.injuries.map(i => `${i.body_part} (${i.severity})`).join(', ')}`);
  }

  if (context.recentPrs && context.recentPrs.length > 0) {
    parts.push(`\nRECENT PRs: ${context.recentPrs.slice(0, 5).map(pr => `${pr.exercise_name}: ${pr.best_weight} lb`).join(', ')}`);
  }

  return parts.join('\n');
}
