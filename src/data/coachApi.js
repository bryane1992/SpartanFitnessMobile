// Claude AI Coach API Client
// Uses Claude Sonnet 4.6 via Anthropic API

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6-20250514';
const TIMEOUT = 8000;

// System prompt cached across all conversations
const SYSTEM_PROMPT = `You are the Spartan Fitness AI Coach — a concise, knowledgeable, motivating personal trainer.

RULES:
- Keep responses under 3 sentences unless explaining form/technique
- Be direct and actionable, like a real coach talking between sets
- Never diagnose injuries — suggest alternatives and recommend seeing a medical professional for persistent/sharp pain
- Use the user's actual workout context to give specific advice
- When suggesting exercise swaps, pick from the available alternatives provided

RESPONSE FORMAT:
Always respond with valid JSON:
{
  "message": "Your coaching text here (shown to user)",
  "actions": []
}

Available action types:
- {"type": "swap", "planExerciseId": N, "newExerciseId": "id", "reason": "text"}
- {"type": "adjustWeight", "planExerciseId": N, "newWeight": "X lb", "reason": "text"}
- {"type": "adjustReps", "planExerciseId": N, "newSets": "3", "newReps": "8", "reason": "text"}
- {"type": "flagInjury", "bodyPart": "shoulder", "severity": "mild|moderate|severe"}
- {"type": "removeExercise", "planExerciseId": N, "reason": "text"}
- {"type": "addNote", "planExerciseId": N, "note": "text"}

If no actions needed, return empty actions array.`;

export async function sendCoachMessage(apiKey, messages, context) {
  const userContext = buildContext(context);

  const anthropicMessages = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  // Prepend context as first user message if not already there
  if (anthropicMessages.length === 1) {
    anthropicMessages[0].content = `${userContext}\n\nUser says: ${anthropicMessages[0].content}`;
  }

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
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: anthropicMessages,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '';

    // Parse JSON response
    try {
      const parsed = JSON.parse(text);
      return {
        message: parsed.message || text,
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      };
    } catch {
      // If not valid JSON, return as plain text
      return { message: text, actions: [] };
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
    if (p.equipmentDetails) {
      if (p.equipmentDetails.barbell?.maxWeight) parts.push(`Barbell max: ${p.equipmentDetails.barbell.maxWeight} lbs`);
      if (p.equipmentDetails.kettlebell?.weights) parts.push(`Kettlebells: ${p.equipmentDetails.kettlebell.weights} lbs`);
      if (p.equipmentDetails.dumbbells?.weights) parts.push(`Dumbbells: ${p.equipmentDetails.dumbbells.weights} lbs`);
    }
  }

  if (context.workout) {
    const w = context.workout;
    parts.push(`\nCURRENT WORKOUT: "${w.title}" (${w.focus})`);
    if (w.blocks) {
      for (const block of w.blocks) {
        parts.push(`Block: ${block.name} (${block.type})`);
        if (block.exercises) {
          for (const ex of block.exercises) {
            const status = ex.is_completed ? 'DONE' : 'TODO';
            parts.push(`  [${status}] ${ex.name} — ${ex.sets} @ ${ex.weight || 'BW'}${ex.notes ? ' (' + ex.notes + ')' : ''} (planExerciseId: ${ex.id})`);
          }
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
