// AI Plan Reviewer — uses Claude to evaluate generated plans
// Sends the full plan + profile to a "fitness expert" agent that rates and critiques it
// Used in dev/testing only — not in production plan generation

import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001'; // Haiku for fast review

function getApiKey() {
  return Constants.expoConfig?.extra?.claudeApiKey
    || Constants.manifest?.extra?.claudeApiKey
    || null;
}

const REVIEWER_SYSTEM = `You are a professional fitness instructor and certified S&C coach with 15+ years of experience programming for athletes from beginners to competitors. You've trained bodybuilders, obstacle racers, powerlifters, endurance athletes, and general population clients.

You are reviewing an AI-generated workout plan. Evaluate it like you would if a new trainer handed you their client's program for review.

EVALUATION CRITERIA:

1. SPLIT BALANCE (0-10): Are muscle groups trained evenly? Push:pull ratio reasonable? Any muscle group neglected or overtrained?

2. EXERCISE SELECTION (0-10): Do exercises match the day's focus? Are they appropriate for the athlete's experience and equipment? Any exercises that don't belong on their assigned day?

3. WEIGHT PROGRESSION (0-10): Do weights increase appropriately across phases? Are starting weights reasonable for stated working weights? Is the progression realistic for the experience level? Does Race Prep/taper maintain intensity while reducing volume?

4. PHASE STRUCTURE (0-10): Are phases in correct order? Are deload weeks present and properly placed? Do rep/set schemes match phases (Foundation=3x10, Build=3x8, Peak=3x6)?

5. SESSION TIME (0-10): Do block durations fit the stated session length? Are WOD days lean enough? Are rest days in the right places?

6. WOD QUALITY (0-10): Are WODs real named benchmarks? Are movements correct for each WOD? Are WODs appropriate for the phase (no hero WODs in Foundation)? Is variety adequate?

7. EQUIPMENT COMPLIANCE (0-10): Does every exercise use only equipment the athlete has? Any exercises requiring equipment not listed?

8. GOAL ALIGNMENT (0-10): Does the plan actually serve the athlete's stated goals? Pure bulk = no cardio. Racer = runs + carries. Beginner = simple movements.

FORMAT YOUR RESPONSE AS:

OVERALL SCORE: X/10

SPLIT BALANCE: X/10
[Brief analysis]

EXERCISE SELECTION: X/10
[Brief analysis]

WEIGHT PROGRESSION: X/10
[Brief analysis]

PHASE STRUCTURE: X/10
[Brief analysis]

SESSION TIME: X/10
[Brief analysis]

WOD QUALITY: X/10
[Brief analysis]

EQUIPMENT COMPLIANCE: X/10
[Brief analysis]

GOAL ALIGNMENT: X/10
[Brief analysis]

TOP 3 ISSUES (most impactful fixes):
1. [Issue + specific fix]
2. [Issue + specific fix]
3. [Issue + specific fix]

WHAT'S WORKING WELL:
- [Positive point]
- [Positive point]
- [Positive point]

Be specific. Name exercises, days, and weeks when pointing out issues. Don't be generous — rate like a real coach reviewing a real program.`;

export async function reviewPlan(planDays, userProfile, onProgress) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No API key for reviewer');

  if (onProgress) onProgress('Building review context...');

  // Build a condensed plan summary for the reviewer
  const planSummary = buildPlanSummary(planDays, userProfile);

  if (onProgress) onProgress('AI reviewer analyzing plan...');

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: REVIEWER_SYSTEM,
      messages: [{ role: 'user', content: planSummary }],
    }),
  });

  if (!response.ok) throw new Error(`Reviewer API ${response.status}`);
  const data = await response.json();
  const review = data.content?.[0]?.text || 'No review generated';

  if (data.usage) {
    console.log(`[Reviewer] Tokens in:${data.usage.input_tokens} out:${data.usage.output_tokens}`);
  }

  console.log('[Reviewer] Review complete');
  return review;
}

function buildPlanSummary(planDays, profile) {
  const lines = [];

  // Profile
  lines.push('=== ATHLETE PROFILE ===');
  lines.push(`Experience: ${profile.experience || '?'} | Sex: ${profile.sex || '?'} | Weight: ${profile.weight || '?'} lb | BMI: ${profile.bmi || '?'}`);
  lines.push(`Goals: ${(profile.goals || []).join(', ')}`);
  lines.push(`Body Comp: ${(profile.bodyCompGoals || []).join(', ')}`);
  lines.push(`Days/week: ${profile.trainingDaysPerWeek} | Session: ${profile.sessionDuration || 60} min`);
  lines.push(`Equipment: ${(profile.equipment || []).join(', ')}`);
  if (profile.equipmentDetails?.barbell?.maxWeight) lines.push(`Barbell max: ${profile.equipmentDetails.barbell.maxWeight} lb`);
  if (profile.equipmentDetails?.dumbbells?.maxWeight) lines.push(`DB max: ${profile.equipmentDetails.dumbbells.maxWeight} lb`);
  if (profile.workingWeights) {
    const ww = Object.entries(profile.workingWeights).map(([k, v]) => `${k}: ${v} lb`).join(', ');
    lines.push(`Working weights (8-10RM): ${ww}`);
  }
  if (profile.additionalNotes) lines.push(`Notes: ${profile.additionalNotes}`);
  if (profile.hasRaceDate) lines.push(`Race: ${profile.raceType || 'event'} on ${profile.eventDate}`);
  lines.push('');

  // Plan structure
  lines.push('=== PLAN STRUCTURE ===');
  const totalWeeks = Math.max(...planDays.map(d => d.week_number || 0), 0);
  const phases = [...new Set(planDays.filter(d => !d.is_rest_day).map(d => d.phase))];
  lines.push(`Total weeks: ${totalWeeks} | Phases: ${phases.join(' → ')}`);
  lines.push('');

  // Week-by-week summary (condensed)
  let currentWeek = 0;
  for (const day of planDays) {
    if (day.week_number !== currentWeek) {
      currentWeek = day.week_number;
      lines.push(`--- WEEK ${currentWeek} (${day.phase || '?'}) ---`);
    }

    if (day.is_rest_day) {
      lines.push(`  REST`);
      continue;
    }

    const blocks = day.blocks || [];
    const blockSummaries = [];
    for (const block of blocks) {
      const exercises = (block.exercises || []).map(e => {
        const weight = e.weight ? ` @ ${e.weight}` : '';
        return `${e.name || e.exercise_id} ${e.sets || ''}${weight}`;
      });
      if (exercises.length > 0) {
        blockSummaries.push(`[${block.name || block.type}] ${exercises.join(', ')}`);
      }
    }
    lines.push(`  ${day.title || 'Training'}: ${blockSummaries.join(' | ')}`);
  }

  return lines.join('\n');
}
