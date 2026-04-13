// AI Plan Reviewer — uses Claude to evaluate generated plans
// Sends the full plan + profile to a "fitness expert" agent that rates and critiques it
// Used in dev/testing only — not in production plan generation

import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthToken } from '../data/supabase';

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || 'https://nyvanilszqnjdwmxnybd.supabase.co';
const PROXY_URL = `${SUPABASE_URL}/functions/v1/claude-proxy`;
const DIRECT_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

const REVIEWER_SYSTEM = `You are a professional fitness instructor and certified S&C coach with 15+ years of experience programming for athletes from beginners to competitors. You've trained bodybuilders, obstacle racers, powerlifters, endurance athletes, and general population clients.

You are reviewing an AI-generated workout plan. Evaluate it like a real S&C coach reviewing a program for a paying client.

IMPORTANT CONTEXT:
- The plan includes a WEEKLY SPLIT ANALYSIS showing actual muscle group frequency. Use THIS to evaluate split balance, not day titles (titles are cosmetic).
- KEY LIFT PROGRESSION shows start → mid → end weights for main lifts. Evaluate progression from these numbers.
- Dumbbell exercises may be capped at the athlete's stated DB max — if an exercise stays at the same weight, check if that weight equals the DB max before calling it "no progression."
- WODs are optional. If the athlete doesn't want cardio/conditioning, scoring WOD quality as 0 is WRONG. Score N/A or skip it. Only score WODs if the athlete has conditioning goals.
- Deload weeks intentionally reduce weight by 25% and sets to 2. This is by design, not a flaw. The FINAL WEEK is often a deload — evaluate peak performance from the week BEFORE the last deload, not the deload itself.
- For bodybuilding splits, 2 back days (one width-focused, one thickness-focused) is standard and intentional — not "excessive back."
- When evaluating weight progression, compare peak phase weights (not deload weights) to starting weights.
- For obstacle race / hybrid plans: sprint days and carry days ARE leg work. Don't count them as "0 leg days" — sprints train quads/glutes, carries train posterior chain. A plan with 1 dedicated leg day + 1 sprint day + 1 carry day = ~3 lower body exposures per week.
- When a lift stays at the barbell max weight for the entire plan, it's because the equipment ceiling prevents progression. The plan adds tempo/AMRAP-last-set notes to compensate. This is correct behavior, not a plateau.
- WODs are timed blocks (typically 10-15 min), not unlimited — Cindy runs for 10-20 min, not "until you finish 5 rounds." The session time calculation already accounts for WOD duration.

EVALUATION CRITERIA (rate 0-10 each):

1. SPLIT BALANCE: Use the split analysis numbers. Is push:pull ratio ≤ 2:1? Are legs trained 2x/week for hypertrophy? All major groups hit?
2. EXERCISE SELECTION: Do main lifts match day focus? Any isolation exercises (curls, lateral raises) misplaced as main lifts? Are exercises appropriate for experience level?
3. WEIGHT PROGRESSION: Are starting weights near the stated working weight (8-10RM)? Do weights increase ~5-10% between phases? Is progression realistic for the experience level (advanced lifters gain slower)?
4. PHASE STRUCTURE: Correct order? Deloads every 3-4 weeks? Rep schemes match (Foundation 3x10, Build 3x8, Peak 3x6)?
5. SESSION TIME: Does estimated exercise count fit the stated session length?
6. WOD QUALITY: Only rate if athlete has conditioning goals. Pure bulk/strength = skip this or rate N/A.
7. EQUIPMENT COMPLIANCE: Every exercise matches equipment list?
8. GOAL ALIGNMENT: Does the program serve what the athlete actually asked for?

FORMAT: OVERALL X/10, then each category with 1-2 lines. End with TOP 3 ISSUES + WHAT WORKS WELL. Keep under 500 words total. Be concise.`;

export async function reviewPlan(planDays, userProfile, onProgress) {
  if (onProgress) onProgress('Building review context...');
  const planSummary = buildPlanSummary(planDays, userProfile);
  if (onProgress) onProgress('AI reviewer analyzing plan...');

  // Route through Supabase proxy (prod) or direct API (dev fallback)
  const authToken = await getAuthToken();
  const useProxy = !!authToken;
  const url = useProxy ? PROXY_URL : DIRECT_API_URL;
  const headers = useProxy
    ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }
    : { 'Content-Type': 'application/json', 'x-api-key': Constants.expoConfig?.extra?.claudeApiKey || '', 'anthropic-version': '2023-06-01' };

  const response = await fetch(url, {
    method: 'POST',
    headers,
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
  if (profile.equipmentDetails?.dumbbells?.maxWeight) lines.push(`DB max: ${profile.equipmentDetails.dumbbells.maxWeight} lb (exercises capped at this weight — no progression above this ceiling)`);
  if (profile.workingWeights) {
    const ww = Object.entries(profile.workingWeights).map(([k, v]) => `${k}: ${v} lb`).join(', ');
    lines.push(`Working weights (8-10RM): ${ww}`);
  }
  if (profile.additionalNotes) lines.push(`Notes: ${profile.additionalNotes}`);
  if (profile.hasRaceDate) lines.push(`Race: ${profile.raceType || 'event'} on ${profile.eventDate}`);
  lines.push('');

  // Split analysis — count muscle group frequency
  lines.push('=== WEEKLY SPLIT ANALYSIS (Week 1) ===');
  const week1Days = planDays.filter(d => d.week_number === 1 && !d.is_rest_day);
  const muscleGroups = { push: 0, pull: 0, legs: 0, conditioning: 0, carry: 0 };
  for (const day of week1Days) {
    const title = (day.title || '').toLowerCase();
    const mainExercises = (day.blocks || [])
      .filter(b => /main|compound/i.test(b.name || ''))
      .flatMap(b => (b.exercises || []).map(e => e.name || e.exercise_id));

    // Push: chest press, bench, OHP, dips — but NOT leg press, lat pulldown
    if (/chest|push|shoulder/i.test(title) || mainExercises.some(e => /bench|dip|fly/i.test(e) || (/press/i.test(e) && !/leg.?press/i.test(e)))) muscleGroups.push++;
    // Pull: rows, pull-ups, lat pulldowns — deadlift is a hinge (legs), not a pull
    if (/pull|back|row/i.test(title) || mainExercises.some(e => /row|pull.?up|chin|lat.?pull|pulldown/i.test(e))) muscleGroups.pull++;
    // Legs: squats, leg press, lunges, hip thrusts — but NOT bench press, shoulder press
    if (/leg|squat|posterior|quad|ham|lower/i.test(title) || mainExercises.some(e => /squat|leg.?press|leg.?curl|leg.?ext|hip|lunge|rdl|romanian/i.test(e))) muscleGroups.legs++;
    if (/sprint|conditioning|interval/i.test(title)) muscleGroups.conditioning++;
    if (/carry|endurance/i.test(title)) muscleGroups.carry++;

    lines.push(`  ${day.title}: ${mainExercises.slice(0, 4).join(', ')}`);
  }
  lines.push(`  SPLIT: Push ${muscleGroups.push}x | Pull ${muscleGroups.pull}x | Legs ${muscleGroups.legs}x | Conditioning ${muscleGroups.conditioning}x | Carry ${muscleGroups.carry}x`);
  lines.push('');

  // Phase structure
  lines.push('=== PLAN STRUCTURE ===');
  const totalWeeks = Math.max(...planDays.map(d => d.week_number || 0), 0);
  const phaseWeeks = {};
  for (const d of planDays.filter(d => !d.is_rest_day)) {
    const ph = d.phase || 'unknown';
    if (!phaseWeeks[ph]) phaseWeeks[ph] = [];
    if (!phaseWeeks[ph].includes(d.week_number)) phaseWeeks[ph].push(d.week_number);
  }
  lines.push(`Total weeks: ${totalWeeks}`);
  for (const [ph, weeks] of Object.entries(phaseWeeks)) {
    lines.push(`  ${ph}: weeks ${weeks[0]}-${weeks[weeks.length - 1]} (${weeks.length} weeks)`);
  }
  const deloadWeeks = planDays.filter(d => /deload/i.test(d.title || '')).map(d => d.week_number);
  if (deloadWeeks.length) lines.push(`  Deload weeks: ${[...new Set(deloadWeeks)].join(', ')}`);
  lines.push('');

  // Key lift progression (sample weeks 1, mid, final)
  lines.push('=== KEY LIFT PROGRESSION ===');
  const keyLifts = ['bench_press', 'back_squat', 'deadlift', 'overhead_press', 'barbell_row'];
  for (const liftId of keyLifts) {
    const entries = [];
    for (const day of planDays) {
      if (day.is_rest_day) continue;
      for (const block of (day.blocks || [])) {
        for (const ex of (block.exercises || [])) {
          if (ex.exercise_id === liftId && ex.weight) {
            entries.push({ week: day.week_number, sets: ex.sets, weight: ex.weight, phase: day.phase });
          }
        }
      }
    }
    if (entries.length > 0) {
      const first = entries[0];
      const mid = entries[Math.floor(entries.length / 2)];
      const last = entries[entries.length - 1];
      const name = first.weight ? liftId.replace(/_/g, ' ') : liftId;
      lines.push(`  ${name}: Wk${first.week}(${first.phase}) ${first.sets}@${first.weight} → Wk${mid.week}(${mid.phase}) ${mid.sets}@${mid.weight} → Wk${last.week}(${last.phase}) ${last.sets}@${last.weight}`);
    }
  }
  lines.push('');

  // Show only weeks 1, 5, 10, final week in detail (not every week)
  lines.push('=== SAMPLE WEEKS (detail) ===');
  const sampleWeeks = [1, Math.ceil(totalWeeks * 0.3), Math.ceil(totalWeeks * 0.6), totalWeeks];
  for (const targetWeek of [...new Set(sampleWeeks)]) {
    const weekDays = planDays.filter(d => d.week_number === targetWeek);
    if (weekDays.length === 0) continue;
    lines.push(`--- WEEK ${targetWeek} (${weekDays[0]?.phase || '?'}) ---`);
    for (const day of weekDays) {
      if (day.is_rest_day) { lines.push('  REST'); continue; }
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
  }

  return lines.join('\n');
}
