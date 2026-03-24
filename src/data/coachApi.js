// Claude AI Coach API Client
// Uses Claude Sonnet 4.6 via Anthropic API

import Constants from 'expo-constants';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001'; // Haiku for fast, cheap coaching responses
const TIMEOUT = 10000; // Haiku is faster, shorter timeout

// Read from app config (sourced from .env), fallback to bundled key
const BUNDLED_API_KEY = Constants.expoConfig?.extra?.claudeApiKey
  || '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';

// System prompt cached across all conversations
const SYSTEM_PROMPT = `Concise AI fitness coach. Under 3 sentences unless explaining form. Direct and actionable.

Never diagnose injuries — suggest modifications, recommend medical professional for sharp/persistent pain.
Swap exercises ONLY from SWAP OPTIONS with exact IDs. Never invent IDs. Never swap to different muscle group.

INJURY ORDER: 1)reduce reps 2)lighten load 40-60% 3)limit ROM 4)slow tempo 5)change grip/stance 6)swap same-muscle from SWAP OPTIONS 7)unilateral work 8)cross-train 9)skip(last resort). Always flagInjury. Suggest longer rest.

RESPONSE: Plain text for questions/advice. JSON ONLY when performing actions:
{"message":"text","actions":[...],"options":[...]}
Actions: swap(planExerciseId,newExerciseId,reason), adjustWeight(planExerciseId,newWeight,reason), adjustReps(planExerciseId,newSets,newReps,reason), flagInjury(bodyPart,severity), removeExercise(planExerciseId,reason), addNote(planExerciseId,note)
Options (injuries only): {"label":"text","description":"why","recommended":bool,"action":{...}} 2-4 options.`;

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

    // Strip markdown code fences if present
    let text = rawText.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    }

    // Try JSON parse — if it fails, it's a plain text response (which is fine)
    if (text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text);
        console.log('[AI Coach] JSON response with actions:', parsed.actions?.length || 0);
        return {
          message: parsed.message || text,
          actions: Array.isArray(parsed.actions) ? parsed.actions : [],
          options: Array.isArray(parsed.options) ? parsed.options : [],
        };
      } catch (parseErr) {
        console.warn('[AI Coach] JSON parse failed:', parseErr.message);
      }
    }

    // Plain text response — no actions needed
    return { message: rawText, actions: [], options: [] };
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
    const goals = (p.goals || [p.goal]).join(', ');
    parts.push(`USER: Goals: ${goals}, Exp: ${p.experience}, Style: ${p.workoutStyle}, Body: ${p.bodyCompGoal}`);
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
