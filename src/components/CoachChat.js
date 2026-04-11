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
import { saveCoachMessage, getCoachMessages, getActiveInjuries, saveInjury, getAlternatives, updateExerciseLog, adjustFutureWeights, getPlanRationales, getWodsFromDb, swapWodBlock, restoreWodBlock, deleteLatestInjury } from '../data/database';
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
  const [apiKey, setApiKey] = useState('bundled'); // Always available, uses bundled key
  const scrollRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (visible) {
      loadState();
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

      const context = {
        profile: parsedProfile,
        workout: workout,
        injuries: injuries,
        alternatives: alternatives,
        rationales: rationales,
        availableWods: availableWods,
      };

      // Send to Claude (last 6 messages for context)
      const recentMsgs = newMessages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const keyToUse = apiKey === 'bundled' ? null : apiKey; // null = use bundled key
      const response = await sendCoachMessage(keyToUse, recentMsgs, context);

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

      // Execute immediate actions AFTER state update (loadTodayWorkout can cause re-render)
      if (response.actions && response.actions.length > 0) {
        try {
          await executeActions(response.actions);
        } catch (actionErr) {
          console.error('[AI Coach] Action execution failed:', actionErr);
        }
      }
    } catch (e) {
      console.error('Coach error:', e);
      if (!mountedRef.current) return;
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Having trouble connecting. Try again in a moment.',
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

    for (let action of actions) {
      // Normalize action format — Claude sometimes nests as { "swap": {...} } instead of { "type": "swap", ... }
      if (!action.type) {
        const key = Object.keys(action).find(k => ['swap', 'swapWod', 'adjustWeight', 'adjustReps', 'flagInjury', 'removeExercise', 'addNote'].includes(k));
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
        'swapwod': 'swapWod', 'swap_wod': 'swapWod',
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
                  setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `Found ${affected.length} exercise${affected.length > 1 ? 's' : ''} targeting your ${bodyPart}. Pick how to modify:`,
                    actions: [],
                    options: injuryOptions,
                  }]);
                }
              }
            }
            break;
        }
      } catch (e) {
        console.error('Error executing action:', action.type, e);
      }
    }

    // Save undo entries
    if (undoEntries.length > 0 && !skipUndo) {
      setUndoStack(prev => [...prev.slice(-4), { id: Date.now(), actions: undoEntries }]);
    }
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

      // Remove options from this message (already chosen)
      setMessages(prev => prev.map((m, i) =>
        i === msgIndex ? { ...m, options: [], chosenOption: option.label } : m
      ));

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
              <Text style={styles.headerTitle}>AI COACH</Text>
              <Text style={styles.headerSub}>Powered by Claude</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>X</Text>
            </TouchableOpacity>
          </View>

          {/* Messages */}
          <ScrollView
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
              multiline={false}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!inputText.trim() || isLoading) && styles.sendBtnDisabled]}
              onPress={() => sendMessage(inputText)}
              disabled={!inputText.trim() || isLoading}
            >
              <Text style={styles.sendBtnText}>SEND</Text>
            </TouchableOpacity>
          </View>

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
  inputRow: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  input: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 16, color: '#fff', fontSize: 14, marginRight: 8 },
  sendBtn: { backgroundColor: '#FF4136', borderRadius: 20, paddingHorizontal: 20, justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 1 },

  noKeyBanner: { padding: 10, backgroundColor: 'rgba(255,133,27,0.1)', alignItems: 'center' },
  noKeyText: { color: '#FF851B', fontSize: 10, fontFamily: 'monospace' },
});
