import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendCoachMessage } from '../data/coachApi';
import { saveCoachMessage, getCoachMessages, getActiveInjuries, saveInjury, getAlternatives, updateExerciseLog, adjustFutureWeights, getPlanRationales, getWodsFromDb, swapWodBlock, restoreWodBlock, deleteLatestInjury, swapWorkoutDays, clearAllInjuries, getWorkoutForDate, addExerciseToBlock, getRecentActualWeights, getFullPlanContext, getWodByName, swapWodOnDate, addExerciseOnDate, removeWodOnDate, clearStrengthOnDate, clearWarmupOnDate } from '../data/database';
import useWorkoutStore from '../store/useWorkoutStore';
import { buildExerciseMenu } from '../core/menuBuilder';
import { detectArchetype, adjustArchetypeForEquipment } from '../core/archetypes';

const QUICK_ACTIONS = [
  { label: 'Swap this', prompt: 'I need to swap the current exercise for something else.' },
  { label: 'Too heavy', prompt: 'This weight feels too heavy. Can you adjust it down?' },
  { label: 'Too easy', prompt: 'This is too easy. Can you make it harder?' },
  { label: 'Short on time', prompt: "I'm short on time. Can you trim this workout to the essentials?" },
  { label: 'How am I doing?', prompt: "How's my progress looking? Give me a quick summary." },
  { label: 'Form check', prompt: 'Give me form cues for my current exercise.' },
];

// Body part → muscle groups for injury matching
const BODY_PART_MUSCLES = {
  shoulder: ['shoulders', 'delts', 'front_delt', 'rear_delt', 'lateral_delt'],
  knee: ['quads', 'quadriceps', 'hamstrings', 'legs'],
  back: ['back', 'lats', 'upper_back', 'lower_back', 'traps', 'rhomboids'],
  wrist: ['forearms', 'grip', 'arms'],
  elbow: ['biceps', 'triceps', 'forearms', 'arms'],
  hip: ['hip_flexors', 'glutes', 'adductors', 'abductors', 'legs'],
  ankle: ['calves', 'tibialis', 'legs'],
  neck: ['neck', 'traps', 'upper_back'],
  chest: ['chest', 'pecs'],
};

export default function CoachChat({ visible, onClose, workout, sessionId }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [apiKey, setApiKey] = useState('bundled');
  const scrollRef = useRef(null);
  const mountedRef = useRef(true);
  const tier = require('../store/useSubscriptionStore').default(s => s.tier);
  const presentPaywall = require('../store/useSubscriptionStore').default(s => s.presentPaywall);
  const canUseCoach = tier !== 'free';

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (visible) {
      // Only reload from DB if no messages in memory — prevents wiping in-progress conversations
      if (messages.length === 0) loadState();
    }
  }, [visible]);

  const loadState = async () => {
    try {
      // API key is bundled — no need to load from storage
      // In production, override with user's own key if they have one
      const customKey = await AsyncStorage.getItem('claudeApiKey');
      setApiKey(customKey || 'bundled');

      // Load previous messages for this session
      if (sessionId) {
        const prev = await getCoachMessages(sessionId);
        setMessages(prev.map(m => ({
          role: m.role,
          content: m.content,
          actions: m.actions ? JSON.parse(m.actions) : [],
        })));
      }
    } catch (e) {
      console.error('Error loading coach state:', e);
    }
  };

  const sendMessage = async (text) => {
    if (!text.trim() || !apiKey || isLoading) return;

    const userMsg = { role: 'user', content: text.trim(), actions: [] };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputText('');
    setIsLoading(true);

    try {
      // Save user message
      await saveCoachMessage(sessionId, 'user', text.trim(), null);

      // Build context
      const profile = await AsyncStorage.getItem('userProfile');
      const parsedProfile = profile ? JSON.parse(profile) : null;
      const injuries = await getActiveInjuries();

      // Build constrained swap pool from archetype-filtered menu
      let allowedSwapIds = null;
      try {
        let arch = detectArchetype(parsedProfile || {});
        arch = adjustArchetypeForEquipment(arch, parsedProfile?.equipment);
        const menu = buildExerciseMenu(parsedProfile || {}, arch);
        allowedSwapIds = new Set(menu.map(e => e.id));
      } catch {}

      // Gather alternatives — filtered by constrained menu + today's workout
      const alternatives = {};
      const todayExerciseIds = new Set();
      if (workout?.blocks) {
        for (const block of workout.blocks) {
          for (const ex of (block.exercises || [])) {
            todayExerciseIds.add(ex.exercise_id || ex.id);
          }
        }
        for (const block of workout.blocks) {
          for (const ex of (block.exercises || [])) {
            if (ex.is_completed) continue;
            try {
              const alts = await getAlternatives(ex.exercise_id || ex.id, parsedProfile);
              if (alts && alts.length > 0) {
                // Filter: not in today's workout AND in the constrained menu
                const filtered = alts.filter(a =>
                  !todayExerciseIds.has(a.id) &&
                  (!allowedSwapIds || allowedSwapIds.has(a.id))
                );
                if (filtered.length > 0) {
                  alternatives[ex.id] = filtered.slice(0, 3).map(a => ({ id: a.id, name: a.name }));
                }
              }
            } catch {}
          }
        }
      }

      // Load plan rationales for coach awareness
      let rationales = null;
      try {
        const planMeta = await AsyncStorage.getItem('planMeta');
        if (planMeta) {
          const { planId } = JSON.parse(planMeta);
          if (planId) rationales = await getPlanRationales(planId);
        }
      } catch {}

      // Load available WODs for swap suggestions
      let availableWods = [];
      try {
        const { buildWodMenu } = require('../core/menuBuilder');
        let arch = detectArchetype(parsedProfile || {});
        arch = adjustArchetypeForEquipment(arch, parsedProfile?.equipment);
        availableWods = buildWodMenu(parsedProfile || {}, arch);
      } catch {}

      // Load this week's schedule for day-swap awareness
      const todayStr = new Date().toISOString().split('T')[0];
      let weekSchedule = [];
      let tomorrowWorkout = null;
      try {
        const { getDatabase: getDb } = require('../data/database');
        const db = await getDb();
        // Get 7 days starting from today
        weekSchedule = await db.getAllAsync(
          `SELECT date, title, is_rest_day FROM plan_days WHERE date >= ? ORDER BY date LIMIT 7`,
          [todayStr]
        );
        // Tomorrow's full workout for detailed context
        if (weekSchedule.length > 1) {
          tomorrowWorkout = await getWorkoutForDate(weekSchedule[1].date);
        }
      } catch {}

      let recentActualWeights = [];
      try { recentActualWeights = await getRecentActualWeights(); } catch {}

      let fullPlanContext = [];
      try {
        const { currentPlanId } = require('../store/useWorkoutStore').default.getState();
        if (currentPlanId) fullPlanContext = await getFullPlanContext(currentPlanId);
      } catch {}

      // Look up any WOD mentioned by name in user's message
      let mentionedWod = null;
      try {
        const wodMatch = text.trim().match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/);
        if (wodMatch) mentionedWod = await getWodByName(wodMatch[1]);
      } catch {}

      const context = {
        profile: parsedProfile,
        workout: workout,
        today: todayStr,
        tomorrow: tomorrowWorkout,
        weekSchedule,
        injuries: injuries,
        alternatives: alternatives,
        rationales: rationales,
        availableWods: availableWods,
        recentActualWeights,
        fullPlanContext,
        mentionedWod,
      };

      // Send to Claude (last 6 messages for context)
      const recentMsgs = newMessages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const keyToUse = apiKey === 'bundled' ? null : apiKey; // null = use bundled key
      const response = await sendCoachMessage(keyToUse, recentMsgs, context, tier);

      // Safety check: if Charlie claims to have made changes but returned no actions, append a warning
      const claimsChanges = /i've (added|swapped|moved|changed|locked|updated|adjusted)|sorted mate|done mate/i.test(response.message || '');
      if (claimsChanges && (!response.actions || response.actions.length === 0)) {
        response.message = (response.message || '') + '\n\n(Note: no changes were saved — please ask Charlie to try again.)';
      }

      // Save assistant response
      await saveCoachMessage(sessionId, 'assistant', response.message, response.actions);

      // Set message in state FIRST — before executing actions that trigger re-renders
      if (!mountedRef.current) return;
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response.message,
        actions: response.actions,
        options: response.options || [],
      }]);

      // Detect injury keywords in user's message BEFORE executing actions
      const userText = text.toLowerCase();
      const BODY_PARTS = ['shoulder', 'knee', 'back', 'wrist', 'elbow', 'hip', 'ankle', 'neck', 'chest', 'arm', 'leg', 'hamstring', 'quad', 'calf', 'shin', 'bicep', 'tricep', 'forearm', 'glute'];
      const INJURY_WORDS = ['hurt', 'hurts', 'hurting', 'pain', 'painful', 'sore', 'soreness', 'injured', 'injury', 'tweaked', 'pulled', 'strained', 'strain', 'ache', 'aching', 'tender', 'swollen', 'sharp', 'pinch', 'pinching', 'bothering'];
      const foundBodyPart = BODY_PARTS.find(bp => userText.includes(bp));
      const foundInjuryWord = INJURY_WORDS.some(w => userText.includes(w));
      const isInjuryConversation = !!(foundBodyPart && foundInjuryWord);
      const injuryMatch = isInjuryConversation ? [null, foundBodyPart] : null;
      console.log(`[AI Coach] Injury detection: bodyPart=${foundBodyPart || 'none'}, injuryWord=${foundInjuryWord}, triggered=${isInjuryConversation}`);

      // Execute immediate actions — but suppress modify actions during injury conversations
      // (let the user pick from option buttons instead of Claude auto-swapping)
      if (response.actions && response.actions.length > 0) {
        try {
          if (isInjuryConversation) {
            // Only execute flagInjury, skip swap/adjustWeight/addNote/remove — buttons handle those
            const safeActions = response.actions.filter(a => {
              const t = (a.type || '').toLowerCase();
              return t === 'flaginjury';
            });
            if (safeActions.length > 0) await executeActions(safeActions);
            console.log(`[AI Coach] Injury conversation — suppressed ${response.actions.length - safeActions.length} auto-actions, showing buttons instead`);
          } else {
            await executeActions(response.actions);
          }
        } catch (actionErr) {
          console.error('[AI Coach] Action execution failed:', actionErr);
        }
      }

      // Generate injury option buttons
      const hadInjuryAction = (response.actions || []).some(a => (a.type || '').toLowerCase() === 'flaginjury');
      if (!hadInjuryAction && injuryMatch && workout?.blocks) {
        const bodyPart = (injuryMatch[1] || '').toLowerCase();
        const targetMuscles = BODY_PART_MUSCLES[bodyPart] || [bodyPart];
        if (targetMuscles.length > 0) {
          // Find affected exercises
          const affected = [];
          for (const block of (workout.blocks || [])) {
            for (const ex of (block.exercises || [])) {
              if (ex.is_completed) continue;
              const mg = (ex.muscle_group || '').toLowerCase();
              let secondary = [];
              try { secondary = JSON.parse(ex.secondary_muscles || '[]').map(s => s.toLowerCase()); } catch {}
              if (typeof ex.secondary_muscles === 'string' && !ex.secondary_muscles.startsWith('[')) {
                secondary = ex.secondary_muscles.split(',').map(s => s.trim().toLowerCase());
              }
              const allMuscles = [mg, ...secondary];
              if (targetMuscles.some(t => allMuscles.some(m => m.includes(t) || t.includes(m)))) {
                affected.push(ex);
              }
            }
          }
          if (affected.length > 0 && mountedRef.current) {
            const injuryOptions = [];
            for (const ex of affected.slice(0, 3)) {
              const currentWeight = parseFloat(ex.weight) || 0;
              const reducedWeight = Math.round((currentWeight * 0.5) / 5) * 5;
              if (currentWeight > 0) {
                injuryOptions.push({ label: `Lighten ${ex.name} to ${reducedWeight} lb`, description: `50% reduction for ${bodyPart} safety`, recommended: true, fromInjury: true, action: { type: 'adjustWeight', planExerciseId: String(ex.id), newWeight: String(reducedWeight), reason: `Reduced for ${bodyPart} injury` } });
              }
              try {
                const { getAlternatives } = require('../data/database');
                const alts = await getAlternatives(ex.exercise_id, parsedProfile);
                const safeAlt = (alts || []).find(a => { const aMg = (a.muscle_group || '').toLowerCase(); return !targetMuscles.some(t => aMg.includes(t) || t.includes(aMg)); });
                if (safeAlt) {
                  injuryOptions.push({ label: `Swap ${ex.name} for ${safeAlt.name}`, description: `Avoids ${bodyPart}`, recommended: true, fromInjury: true, action: { type: 'swap', planExerciseId: String(ex.id), newExerciseId: safeAlt.id, reason: `Swapped to avoid ${bodyPart} injury` } });
                }
              } catch {}
              injuryOptions.push({ label: `Skip ${ex.name} today`, description: 'Remove from workout', fromInjury: true, action: { type: 'removeExercise', planExerciseId: String(ex.id), reason: `Skipped due to ${bodyPart} injury` } });
            }
            console.log(`[AI Coach] Injury options: ${injuryOptions.length} buttons for ${affected.length} exercises`);
            if (injuryOptions.length > 0) {
              setMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                  updated[lastIdx] = { ...updated[lastIdx], options: [...(updated[lastIdx].options || []), ...injuryOptions] };
                }
                return updated;
              });
            }
          }
        }
      }
    } catch (e) {
      console.error('Coach error:', e);
      if (!mountedRef.current) return;
      const msg = e.message || '';
      const content = msg.includes('403') || msg.includes('Pro subscription')
        ? 'AI Coach requires a Pro subscription. Upgrade in Settings to unlock.'
        : msg.includes('429') || msg.includes('limit')
        ? 'Weekly message limit reached. Upgrade to Elite for unlimited access.'
        : 'Having trouble connecting. Try again in a moment.';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content,
        actions: [],
      }]);
    }

    if (!mountedRef.current) return;
    setIsLoading(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const executeActions = async (actions, skipUndo = false) => {
    const store = useWorkoutStore.getState();
    const currentWorkout = store.todayWorkout; // snapshot before mutations
    const undoEntries = [];
    const failedActions = [];

    for (let action of actions) {
      // Normalize action format — Claude sometimes nests as { "swap": {...} } instead of { "type": "swap", ... }
      if (!action.type) {
        const key = Object.keys(action).find(k => ['swap', 'swapWod', 'adjustWeight', 'adjustReps', 'flagInjury', 'removeExercise', 'addNote', 'addExercise', 'swapDay', 'clearInjuries'].includes(k));
        if (key) {
          action = { type: key, ...action[key] };
        }
      }
      // Normalize type to camelCase
      const ACTION_TYPE_MAP = {
        'removeexercise': 'removeExercise', 'remove_exercise': 'removeExercise', 'remove': 'removeExercise',
        'adjustweight': 'adjustWeight', 'adjust_weight': 'adjustWeight',
        'adjustreps': 'adjustReps', 'adjust_reps': 'adjustReps',
        'flaginjury': 'flagInjury', 'flag_injury': 'flagInjury',
        'addnote': 'addNote', 'add_note': 'addNote',
        'addexercise': 'addExercise', 'add_exercise': 'addExercise',
        'swapwod': 'swapWod', 'swap_wod': 'swapWod',
        'swapwodondate': 'swapWodOnDate', 'swap_wod_on_date': 'swapWodOnDate',
        'removewodondate': 'removeWodOnDate', 'remove_wod_on_date': 'removeWodOnDate',
        'clearstrengthondate': 'clearStrengthOnDate', 'clear_strength_on_date': 'clearStrengthOnDate',
        'clearwarmupondate': 'clearWarmupOnDate', 'clear_warmup_on_date': 'clearWarmupOnDate',
        'addexerciseondate': 'addExerciseOnDate', 'add_exercise_on_date': 'addExerciseOnDate',
        'swapday': 'swapDay', 'swap_day': 'swapDay',
        'clearinjuries': 'clearInjuries', 'clear_injuries': 'clearInjuries',
      };
      if (action.type) {
        action.type = ACTION_TYPE_MAP[action.type.toLowerCase()] || action.type;
      }

      // Find exercise snapshot from current workout (before mutation)
      const peId = parseInt(action.planExerciseId) || action.planExerciseId;
      const exerciseSnapshot = currentWorkout?.blocks
        ?.flatMap(b => b.exercises || [])
        .find(e => e.id === peId);

      // When flagInjury is in the actions list, skip other modify actions (addNote, adjustWeight, adjustReps)
      // Our injury auto-modify system generates proper option cards for the user to choose from
      const hasInjuryFlag = actions.some(a => (a.type || '').toLowerCase() === 'flaginjury' || a.flagInjury);
      if (hasInjuryFlag && ['addNote', 'adjustWeight', 'adjustReps', 'removeExercise'].includes(action.type)) {
        console.log(`[AI Coach] Skipping ${action.type} — injury option cards will handle modifications`);
        continue;
      }

      console.log('[AI Coach] Executing action:', action.type, action);
      try {
        switch (action.type) {
          case 'swap':
            if (action.planExerciseId && action.newExerciseId) {
              if (exerciseSnapshot && !skipUndo) {
                undoEntries.push({ type: 'swap', planExerciseId: peId, restore: { oldExerciseId: exerciseSnapshot.exercise_id } });
              }
              console.log(`[AI Coach] Swapping plan_exercise ${peId} → ${action.newExerciseId}`);
              await store.swapExercise(peId, action.newExerciseId, null);
              await store.loadTodayWorkout();
            }
            break;
          case 'adjustWeight':
            if (action.planExerciseId && action.newWeight) {
              const exerciseInfo = exerciseSnapshot || workout?.blocks?.flatMap(b => b.exercises || []).find(e => e.id === peId);
              if (exerciseInfo) {
                const oldWeight = parseFloat(exerciseInfo.weight) || 0;
                let newWeight = parseFloat(action.newWeight) || 0;

                // Equipment ceiling
                let equipCap = null;
                try {
                  const profileStr = await AsyncStorage.getItem('userProfile');
                  if (profileStr) {
                    const prof = JSON.parse(profileStr);
                    const ed = prof.equipmentDetails || {};
                    const cat = exerciseInfo.category || '';
                    if (/barbell/i.test(cat) && ed.barbell?.maxWeight) equipCap = parseFloat(ed.barbell.maxWeight);
                    else if (/dumbbell/i.test(cat) && ed.dumbbells?.maxWeight) equipCap = parseFloat(ed.dumbbells.maxWeight);
                  }
                } catch { /* no profile */ }
                if (equipCap && newWeight > equipCap) newWeight = equipCap;

                if (oldWeight > 0 && newWeight > 0) {
                  const ratio = newWeight / oldWeight;
                  if (!skipUndo) {
                    undoEntries.push({ type: 'adjustWeight', restore: { exerciseId: exerciseInfo.exercise_id, inverseRatio: oldWeight / newWeight } });
                  }
                  const count = await adjustFutureWeights(exerciseInfo.exercise_id, ratio);
                  console.log(`[AI Coach] Adjusted ${count} future: ${exerciseInfo.exercise_id} ${oldWeight} → ${newWeight} (${ratio.toFixed(2)}x)`);
                }
              }
              await store.loadTodayWorkout();
            }
            break;
          case 'adjustReps':
            if (action.planExerciseId) {
              if (exerciseSnapshot && !skipUndo) {
                undoEntries.push({ type: 'adjustReps', planExerciseId: peId, restore: { oldSets: exerciseSnapshot.sets, oldNotes: exerciseSnapshot.notes } });
              }
              const setsReps = action.newSets && action.newReps ? `${action.newSets}x${action.newReps}` : null;
              await updateExerciseLog(peId, setsReps, null, action.reason || null);
              await store.loadTodayWorkout();
            }
            break;
          case 'removeExercise':
            if (action.planExerciseId) {
              if (exerciseSnapshot && !skipUndo) {
                undoEntries.push({ type: 'removeExercise', planExerciseId: peId, restore: { oldActualReps: exerciseSnapshot.actual_reps, oldNotes: exerciseSnapshot.notes } });
              }
              await updateExerciseLog(peId, 'SKIP', null, action.reason || 'Removed by AI Coach');
              await store.loadTodayWorkout();
            }
            break;
          case 'addNote':
            if (action.planExerciseId && action.note) {
              if (exerciseSnapshot && !skipUndo) {
                undoEntries.push({ type: 'addNote', planExerciseId: peId, restore: { oldNotes: exerciseSnapshot.notes } });
              }
              await updateExerciseLog(action.planExerciseId, null, null, action.note);
              await store.loadTodayWorkout();
            }
            break;
          case 'addExercise': {
            // Find the target block — use planBlockId if provided, else pick best block
            let blockId = parseInt(action.planBlockId) || action.planBlockId;
            if (!blockId && workout?.blocks) {
              // For prehab/mobility exercises default to warmup; for working exercises prefer accessories then main lifts
              const isPrehabExercise = /stretch|raise|circle|walk|angel|rotation|pass_through|cat_cow|child_pose|cobra|dead_bug|cossack|terminal|banded|90_90|ankle|shin|calf|inchworm|samson|bear_crawl|high_knee|a_skip|lunge_matrix|pvc|hip_flex|glute_bridge|air_squat|push_up_to_t|arm_swing|leg_swing|hip_circle|knee_circle/i.test(action.exerciseId || '');
              if (isPrehabExercise) {
                const warmupBlock = workout.blocks.find(b => /warm.?up|movement.?prep/i.test(b.name || ''));
                if (warmupBlock) blockId = warmupBlock.id;
              } else {
                // Prefer accessories block, then main lift block, then any non-WOD block
                const accessoryBlock = workout.blocks.find(b => /accessor|arm|core|finish/i.test(b.name || ''));
                const mainBlock = workout.blocks.find(b => /main|lift|strength|compound/i.test(b.name || ''));
                const fallbackBlock = workout.blocks.find(b => !b.is_amrap && !/warm.?up|cool.?down|wod|circuit|amrap|emom/i.test(b.name || ''));
                blockId = (accessoryBlock || mainBlock || fallbackBlock)?.id;
              }
            }
            if (blockId && action.exerciseId) {
              // Normalize sets — if coach sends sets="2" and reps="15", format as "2x15"
              const rawSets = action.sets ? String(action.sets) : null;
              const rawReps = action.reps ? String(action.reps) : '15';
              const formattedSets = rawSets && /^\d+$/.test(rawSets) ? `${rawSets}x${rawReps}` : (rawSets || `2x${rawReps}`);
              const newPeId = await addExerciseToBlock(blockId, action.exerciseId, formattedSets, rawReps, action.weight, action.note);
              if (!skipUndo) {
                undoEntries.push({ type: 'removeExercise', planExerciseId: newPeId, restore: { oldActualReps: null, oldNotes: null } });
              }
              await store.loadTodayWorkout();
            }
            break;
          }
          case 'swapWodOnDate': {
            if (action.date && action.newWodId) {
              const ok = await swapWodOnDate(action.date, action.newWodId);
              if (!ok) failedActions.push(`Could not find WOD block on ${action.date} to swap`);
              await store.loadTodayWorkout();
            }
            break;
          }
          case 'removeWodOnDate': {
            if (action.date) {
              const ok = await removeWodOnDate(action.date, action.label || 'Active Recovery');
              if (!ok) failedActions.push(`Could not find WOD block on ${action.date} to remove`);
              await store.loadTodayWorkout();
            }
            break;
          }
          case 'clearStrengthOnDate': {
            if (action.date) {
              await clearStrengthOnDate(action.date);
              await store.loadTodayWorkout();
            }
            break;
          }
          case 'clearWarmupOnDate': {
            if (action.date) {
              await clearWarmupOnDate(action.date);
              await store.loadTodayWorkout();
            }
            break;
          }
          case 'addExerciseOnDate': {
            if (action.date && action.exerciseId) {
              const rawSets = action.sets ? String(action.sets) : null;
              const rawReps = action.reps ? String(action.reps) : '15';
              const formattedSets = rawSets && /^\d+$/.test(rawSets) ? `${rawSets}x${rawReps}` : (rawSets || `2x${rawReps}`);
              // Detect block preference from exercise type or explicit action field
              const isPrehabEx = /stretch|raise|circle|walk|angel|rotation|pass_through|cat_cow|child_pose|cobra|dead_bug|cossack|terminal|banded|90_90|ankle|shin|calf|inchworm|samson|bear_crawl|high_knee|a_skip|lunge_matrix|pvc|hip_flex|glute_bridge|air_squat|push_up_to_t|arm_swing|leg_swing|hip_circle|knee_circle/i.test(action.exerciseId || '');
              const blockPref = action.blockPreference || (isPrehabEx ? 'warmup' : 'main');
              await addExerciseOnDate(action.date, action.exerciseId, formattedSets, rawReps, action.weight, action.note, blockPref);
              await store.loadTodayWorkout();
            }
            break;
          }
          case 'swapWod': {
            console.log('[AI Coach] swapWod action:', JSON.stringify(action));
            let blockId = parseInt(action.planBlockId) || action.planBlockId;
            if (!blockId && action.newWodId && workout?.blocks) {
              const wodBlock = workout.blocks.find(b => b.is_amrap || /wod|circuit|amrap|emom/i.test(b.name || ''));
              if (wodBlock) blockId = wodBlock.id;
            }
            if (blockId && action.newWodId) {
              // Snapshot for undo
              if (!skipUndo) {
                const wodBlock = currentWorkout?.blocks?.find(b => b.id === blockId);
                if (wodBlock) {
                  undoEntries.push({ type: 'swapWod', planBlockId: blockId, restore: {
                    exercises: (wodBlock.exercises || []).map(e => ({ exercise_id: e.exercise_id, sort_order: e.sort_order, sets: e.sets, reps: e.reps, weight: e.weight, rest: e.rest, notes: e.notes })),
                    name: wodBlock.name, type: wodBlock.type, is_amrap: wodBlock.is_amrap, time_cap: wodBlock.time_cap,
                  }});
                }
              }
              const success = await swapWodBlock(blockId, action.newWodId);
              if (success) await store.loadTodayWorkout();
            }
            break;
          }
          case 'swapDay': {
            if (action.date1 && action.date2) {
              const success = await swapWorkoutDays(action.date1, action.date2);
              if (success) {
                console.log(`[AI Coach] Swapped days: ${action.date1} <-> ${action.date2}`);
                await store.loadTodayWorkout();
                // Close coach so user sees the refreshed workout
                setTimeout(() => onClose(), 500);
              }
            }
            break;
          }
          case 'clearInjuries': {
            const cleared = await clearAllInjuries();
            console.log(`[AI Coach] Cleared ${cleared} active injuries`);
            break;
          }
          case 'flagInjury':
            if (action.bodyPart) {
              await saveInjury(action.bodyPart, action.severity || 'mild', null);
              if (!skipUndo) {
                undoEntries.push({ type: 'flagInjury', restore: { bodyPart: action.bodyPart } });
              }

              // Auto-find affected exercises and present modification options
              const bodyPart = action.bodyPart.toLowerCase();
              const targetMuscles = BODY_PART_MUSCLES[bodyPart] || [bodyPart];
              const affected = [];
              for (const block of (currentWorkout?.blocks || [])) {
                for (const ex of (block.exercises || [])) {
                  if (ex.is_completed) continue;
                  const mg = (ex.muscle_group || '').toLowerCase();
                  let secondary = [];
                  try { secondary = JSON.parse(ex.secondary_muscles || '[]').map(s => s.toLowerCase()); } catch {}
                  if (typeof ex.secondary_muscles === 'string' && !ex.secondary_muscles.startsWith('[')) {
                    secondary = ex.secondary_muscles.split(',').map(s => s.trim().toLowerCase());
                  }
                  const allMuscles = [mg, ...secondary];
                  if (targetMuscles.some(t => allMuscles.some(m => m.includes(t) || t.includes(m)))) {
                    affected.push(ex);
                  }
                }
              }

              if (affected.length > 0) {
                const injuryOptions = [];
                for (const ex of affected.slice(0, 3)) {
                  const currentWeight = parseFloat(ex.weight) || 0;
                  const reducedWeight = Math.round((currentWeight * 0.5) / 5) * 5;

                  if (currentWeight > 0) {
                    injuryOptions.push({
                      label: `Lighten ${ex.name} to ${reducedWeight} lb`,
                      description: `50% reduction for ${bodyPart} safety`,
                      recommended: true,
                      fromInjury: true,
                      action: { type: 'adjustWeight', planExerciseId: String(ex.id), newWeight: String(reducedWeight), reason: `Reduced for ${bodyPart} injury` },
                    });
                  }

                  try {
                    const { getAlternatives } = require('../data/database');
                    const profileStr = await AsyncStorage.getItem('userProfile');
                    const prof = profileStr ? JSON.parse(profileStr) : null;
                    const alts = await getAlternatives(ex.exercise_id, prof);
                    const safeAlt = (alts || []).find(a => {
                      const aMg = (a.muscle_group || '').toLowerCase();
                      return !targetMuscles.some(t => aMg.includes(t) || t.includes(aMg));
                    });
                    if (safeAlt) {
                      injuryOptions.push({
                        label: `Swap ${ex.name} for ${safeAlt.name}`,
                        description: `Avoids ${bodyPart} — different muscle group`,
                        recommended: true,
                        fromInjury: true,
                        action: { type: 'swap', planExerciseId: String(ex.id), newExerciseId: safeAlt.id, reason: `Swapped to avoid ${bodyPart} injury` },
                      });
                    }
                  } catch {}

                  injuryOptions.push({
                    label: `Skip ${ex.name} today`,
                    description: 'Remove from this workout',
                    fromInjury: true,
                    action: { type: 'removeExercise', planExerciseId: String(ex.id), reason: `Skipped due to ${bodyPart} injury` },
                  });
                }

                if (mountedRef.current) {
                  // Merge injury options into the last assistant message as button cards
                  setMessages(prev => {
                    const updated = [...prev];
                    const lastIdx = updated.length - 1;
                    if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                      updated[lastIdx] = { ...updated[lastIdx], options: [...(updated[lastIdx].options || []), ...injuryOptions] };
                    } else {
                      updated.push({ role: 'assistant', content: `Found ${affected.length} exercise${affected.length > 1 ? 's' : ''} targeting your ${bodyPart}:`, actions: [], options: injuryOptions });
                    }
                    return updated;
                  });
                }
              }
            }
            break;
        }
      } catch (e) {
        console.error('Error executing action:', action.type, e);
        failedActions.push(`${action.type} failed: ${e.message || 'unknown error'}`);
      }
    }

    // Save undo entries
    if (undoEntries.length > 0 && !skipUndo) {
      setUndoStack(prev => [...prev.slice(-4), { id: Date.now(), actions: undoEntries }]);
    }

    // Surface any failures to the user
    if (failedActions.length > 0 && mountedRef.current) {
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
          updated[lastIdx] = {
            ...updated[lastIdx],
            content: updated[lastIdx].content + `\n\n(Note: ${failedActions.join('; ')}. Ask Charlie to try again.)`,
          };
        }
        return updated;
      });
    }

    return failedActions;
  };

  const undoLastAction = async () => {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;
    const store = useWorkoutStore.getState();

    try {
      for (const action of [...entry.actions].reverse()) {
        switch (action.type) {
          case 'swap':
            if (action.planExerciseId && action.restore?.oldExerciseId) {
              await store.swapExercise(action.planExerciseId, action.restore.oldExerciseId, null);
            }
            break;
          case 'adjustWeight':
            if (action.restore?.exerciseId && action.restore?.inverseRatio) {
              await adjustFutureWeights(action.restore.exerciseId, action.restore.inverseRatio);
            }
            break;
          case 'adjustReps':
            if (action.planExerciseId) {
              await updateExerciseLog(action.planExerciseId, action.restore?.oldSets || null, null, action.restore?.oldNotes || null);
            }
            break;
          case 'removeExercise':
            if (action.planExerciseId) {
              await updateExerciseLog(action.planExerciseId, action.restore?.oldActualReps || null, null, action.restore?.oldNotes || null);
            }
            break;
          case 'addNote':
            if (action.planExerciseId) {
              await updateExerciseLog(action.planExerciseId, null, null, action.restore?.oldNotes || null);
            }
            break;
          case 'swapWod':
            if (action.planBlockId && action.restore) {
              await restoreWodBlock(action.planBlockId, action.restore.exercises, action.restore);
            }
            break;
          case 'flagInjury':
            if (action.restore?.bodyPart) {
              await deleteLatestInjury(action.restore.bodyPart);
            }
            break;
        }
      }
      await store.loadTodayWorkout();
      setUndoStack(prev => prev.slice(0, -1));
      if (mountedRef.current) {
        setMessages(prev => [...prev, {
          role: 'assistant', content: 'Undone. Your workout is back to how it was.', actions: [], options: [],
        }]);
      }
    } catch (e) {
      console.error('[AI Coach] Undo failed:', e);
    }
  };

  const selectOption = async (option, msgIndex) => {
    try {
      // Execute the action from the selected option
      if (option.action) {
        await executeActions([option.action]);
      }

      // Remove only the chosen option — keep remaining options so user can pick more
      setMessages(prev => prev.map((m, i) => {
        if (i !== msgIndex) return m;
        const remaining = (m.options || []).filter(o => o.label !== option.label);
        return { ...m, options: remaining, chosenOption: (m.chosenOption ? m.chosenOption + ', ' : '') + option.label };
      }));

      // Close coach after WOD swap or exercise swap — but NOT for injury modifications (user may have more to modify)
      if ((option.action?.type === 'swapWod' || option.action?.type === 'swap') && !option.fromInjury) {
        await useWorkoutStore.getState().loadTodayWorkout();
        const updated = useWorkoutStore.getState().todayWorkout;
        console.log('[AI Coach] Workout reloaded, WOD blocks:', updated?.blocks?.filter(b => /wod|circuit/i.test(b.name || '')).map(b => `${b.name}: ${b.exercises?.length} exs`));
        setTimeout(() => onClose(), 300);
      }

      // Add a confirmation message
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Done — ${option.label.toLowerCase()}. ${option.action?.reason || 'Updated your workout.'}`,
        actions: [],
        options: [],
      }]);
    } catch (e) {
      console.error('Error executing option:', e);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>COACH CHARLIE</Text>
              <Text style={styles.headerSub}>Powered by Claude</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>X</Text>
            </TouchableOpacity>
          </View>

          {/* Free tier gate */}
          {!canUseCoach ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
              <Text style={{ color: '#FF4136', fontSize: 16, fontWeight: '900', letterSpacing: 1, marginBottom: 12 }}>PRO FEATURE</Text>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>Unlock Coach Charlie</Text>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 28 }}>
                Get real-time coaching during your workouts, exercise swaps, weight adjustments, and injury guidance with a Pro subscription.
              </Text>
              <TouchableOpacity
                style={{ backgroundColor: '#FF4136', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 }}
                onPress={() => { onClose(); presentPaywall('Coach Charlie'); }}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 1 }}>UPGRADE TO PRO</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Messages + Quick Actions + Input — Pro/Elite only */}
          {canUseCoach ? (<><ScrollView
            ref={scrollRef}
            style={styles.messageList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Hey coach!</Text>
                <Text style={styles.emptyText}>Ask me anything about your workout, form, or training. I can swap exercises, adjust weights, and help with injuries.</Text>
              </View>
            ) : null}

            {messages.map((msg, i) => (
              <View key={i} style={[styles.msgRow, msg.role === 'user' ? styles.msgUser : styles.msgAssistant]}>
                <Text style={[styles.msgText, msg.role === 'user' ? styles.msgTextUser : styles.msgTextAssistant]}>
                  {msg.content}
                </Text>
                {i === messages.length - 1 && undoStack.length > 0 ? (
                  <TouchableOpacity style={styles.undoButton} onPress={undoLastAction}>
                    <Text style={styles.undoButtonText}>UNDO</Text>
                  </TouchableOpacity>
                ) : null}
                {msg.options && msg.options.length > 0 ? (
                  <View style={styles.optionsList}>
                    {msg.options.map((opt, j) => (
                      <TouchableOpacity
                        key={j}
                        style={[styles.optionButton, opt.recommended && styles.optionButtonRecommended]}
                        onPress={() => selectOption(opt, i)}
                      >
                        {opt.recommended ? (
                          <Text style={styles.optionRecommendedTag}>RECOMMENDED</Text>
                        ) : null}
                        <Text style={styles.optionLabel}>{opt.label}</Text>
                        <Text style={styles.optionDesc}>{opt.description}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                {msg.chosenOption ? (
                  <View style={styles.chosenTag}>
                    <Text style={styles.chosenTagText}>You chose: {msg.chosenOption}</Text>
                  </View>
                ) : null}
              </View>
            ))}

            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#FF4136" />
                <Text style={styles.loadingText}>Thinking...</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Quick Actions */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickRow} contentContainerStyle={styles.quickContent}>
            {QUICK_ACTIONS.map((qa, i) => (
              <TouchableOpacity key={i} style={styles.quickChip} onPress={() => sendMessage(qa.prompt)}>
                <Text style={styles.quickText}>{qa.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Input */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Ask your coach..."
              placeholderTextColor="rgba(255,255,255,0.2)"
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={() => sendMessage(inputText)}
              returnKeyType="send"
              multiline={true}
              blurOnSubmit={true}
              numberOfLines={3}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!inputText.trim() || isLoading) && styles.sendBtnDisabled]}
              onPress={() => sendMessage(inputText)}
              disabled={!inputText.trim() || isLoading}
            >
              <Text style={styles.sendBtnText}>SEND</Text>
            </TouchableOpacity>
          </View>
          </>) : null}

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  container: { backgroundColor: '#0A0A0A', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '75%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  headerTitle: { color: '#FF4136', fontSize: 16, fontWeight: '900', letterSpacing: 1.5 },
  headerSub: { color: 'rgba(255,255,255,0.25)', fontSize: 10, fontFamily: 'monospace', marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '700' },

  // Messages
  messageList: { flex: 1, paddingHorizontal: 14 },
  emptyState: { padding: 20, alignItems: 'center', marginTop: 20 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  emptyText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  msgRow: { marginVertical: 6, maxWidth: '85%' },
  msgUser: { alignSelf: 'flex-end' },
  msgAssistant: { alignSelf: 'flex-start' },
  msgText: { padding: 12, borderRadius: 14, fontSize: 14, lineHeight: 20 },
  msgTextUser: { backgroundColor: '#FF4136', color: '#fff', borderBottomRightRadius: 4 },
  msgTextAssistant: { backgroundColor: 'rgba(255,255,255,0.06)', color: '#fff', borderBottomLeftRadius: 4 },

  actionsList: { marginTop: 6 },
  actionCard: { backgroundColor: 'rgba(1,255,112,0.08)', borderWidth: 1, borderColor: 'rgba(1,255,112,0.2)', borderRadius: 8, padding: 8, marginBottom: 4 },
  undoButton: { backgroundColor: 'rgba(255,65,54,0.15)', borderWidth: 1, borderColor: 'rgba(255,65,54,0.4)', borderRadius: 8, padding: 8, marginTop: 4, alignItems: 'center' },
  undoButtonText: { color: '#FF4136', fontSize: 11, fontWeight: '800', letterSpacing: 1, fontFamily: 'monospace' },
  actionType: { color: '#01FF70', fontSize: 9, fontWeight: '800', letterSpacing: 1, fontFamily: 'monospace' },
  actionReason: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 },

  // Option buttons
  optionsList: { marginTop: 8, gap: 6 },
  optionButton: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: 12,
  },
  optionButtonRecommended: {
    borderColor: '#FF4136',
    backgroundColor: 'rgba(255,65,54,0.08)',
  },
  optionRecommendedTag: {
    color: '#FF4136',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 4,
    fontFamily: 'monospace',
  },
  optionLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  optionDesc: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 3, lineHeight: 17 },
  chosenTag: {
    marginTop: 6,
    backgroundColor: 'rgba(1,255,112,0.08)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  chosenTagText: { color: '#01FF70', fontSize: 11, fontWeight: '700', fontFamily: 'monospace' },

  loadingRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  loadingText: { color: 'rgba(255,255,255,0.3)', fontSize: 12, marginLeft: 8, fontFamily: 'monospace' },

  // Quick Actions
  quickRow: { maxHeight: 44, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)' },
  quickContent: { paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  quickChip: { backgroundColor: 'rgba(255,65,54,0.08)', borderWidth: 1, borderColor: 'rgba(255,65,54,0.2)', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, marginRight: 8, height: 30, justifyContent: 'center', flexShrink: 0 },
  quickText: { color: '#FF4136', fontSize: 11, fontWeight: '700' },

  // Input
  inputRow: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 16, color: '#fff', fontSize: 14, marginRight: 8, minHeight: 44, maxHeight: 110, textAlignVertical: 'top' },
  sendBtn: { backgroundColor: '#FF4136', borderRadius: 20, paddingHorizontal: 20, justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 1 },

  noKeyBanner: { padding: 10, backgroundColor: 'rgba(255,133,27,0.1)', alignItems: 'center' },
  noKeyText: { color: '#FF851B', fontSize: 10, fontFamily: 'monospace' },
});
