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
import { saveCoachMessage, getCoachMessages, getActiveInjuries, saveInjury, getAlternatives, updateExerciseLog, getPlanRationales } from '../data/database';
import useWorkoutStore from '../store/useWorkoutStore';

const QUICK_ACTIONS = [
  { label: 'Swap this', prompt: 'I need to swap the current exercise for something else.' },
  { label: 'Too heavy', prompt: 'This weight feels too heavy. Can you adjust it down?' },
  { label: 'Too easy', prompt: 'This is too easy. Can you make it harder?' },
  { label: 'Short on time', prompt: "I'm short on time. Can you trim this workout to the essentials?" },
  { label: 'How am I doing?', prompt: "How's my progress looking? Give me a quick summary." },
  { label: 'Form check', prompt: 'Give me form cues for my current exercise.' },
];

export default function CoachChat({ visible, onClose, workout, sessionId }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey, setApiKey] = useState('bundled'); // Always available, uses bundled key
  const scrollRef = useRef(null);

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

      // Gather alternatives — filter out exercises already in today's workout
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
                // Filter out exercises already in today's workout
                const filtered = alts.filter(a => !todayExerciseIds.has(a.id));
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

      const context = {
        profile: parsedProfile,
        workout: workout,
        injuries: injuries,
        alternatives: alternatives,
        rationales: rationales,
      };

      // Send to Claude (last 6 messages for context)
      const recentMsgs = newMessages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const keyToUse = apiKey === 'bundled' ? null : apiKey; // null = use bundled key
      const response = await sendCoachMessage(keyToUse, recentMsgs, context);

      // Save assistant response
      await saveCoachMessage(sessionId, 'assistant', response.message, response.actions);

      // Execute immediate actions (non-option ones like flagInjury)
      if (response.actions && response.actions.length > 0) {
        try {
          await executeActions(response.actions);
        } catch (actionErr) {
          console.error('[AI Coach] Action execution failed:', actionErr);
        }
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response.message,
        actions: response.actions,
        options: response.options || [],
      }]);
    } catch (e) {
      console.error('Coach error:', e);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Having trouble connecting. Try again in a moment.',
        actions: [],
      }]);
    }

    setIsLoading(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const executeActions = async (actions) => {
    const store = useWorkoutStore.getState();
    for (let action of actions) {
      // Normalize action format — Claude sometimes nests as { "swap": {...} } instead of { "type": "swap", ... }
      if (!action.type) {
        const key = Object.keys(action).find(k => ['swap', 'adjustWeight', 'adjustReps', 'flagInjury', 'removeExercise', 'addNote'].includes(k));
        if (key) {
          action = { type: key, ...action[key] };
        }
      }
      console.log('[AI Coach] Executing action:', action.type, action);
      try {
        switch (action.type) {
          case 'swap':
            if (action.planExerciseId && action.newExerciseId) {
              const peId = parseInt(action.planExerciseId) || action.planExerciseId;
              console.log(`[AI Coach] Swapping plan_exercise ${peId} → ${action.newExerciseId}`);
              await store.swapExercise(peId, action.newExerciseId, null);
            } else {
              console.warn('[AI Coach] Swap missing IDs:', action);
            }
            break;
          case 'adjustWeight':
            if (action.planExerciseId && action.newWeight) {
              const peIdW = parseInt(action.planExerciseId) || action.planExerciseId;
              await updateExerciseLog(peIdW, null, action.newWeight, action.reason || null);
              await store.loadTodayWorkout();
            }
            break;
          case 'adjustReps':
            if (action.planExerciseId) {
              const peIdR = parseInt(action.planExerciseId) || action.planExerciseId;
              const setsReps = action.newSets && action.newReps ? `${action.newSets}x${action.newReps}` : null;
              await updateExerciseLog(peIdR, setsReps, null, action.reason || null);
              await store.loadTodayWorkout();
            }
            break;
          case 'removeExercise':
            if (action.planExerciseId) {
              const peIdRm = parseInt(action.planExerciseId) || action.planExerciseId;
              await updateExerciseLog(peIdRm, 'SKIP', null, action.reason || 'Removed by AI Coach');
              await store.loadTodayWorkout();
            }
            break;
          case 'addNote':
            if (action.planExerciseId && action.note) {
              await updateExerciseLog(action.planExerciseId, null, null, action.note);
              await store.loadTodayWorkout();
            }
            break;
          case 'flagInjury':
            if (action.bodyPart) {
              await saveInjury(action.bodyPart, action.severity || 'mild', null);
            }
            break;
        }
      } catch (e) {
        console.error('Error executing action:', action.type, e);
      }
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
                {msg.actions && msg.actions.length > 0 ? (
                  <View style={styles.actionsList}>
                    {msg.actions.filter(a => a && a.type).map((a, j) => (
                      <View key={j} style={styles.actionCard}>
                        <Text style={styles.actionType}>{String(a.type || '').toUpperCase()}</Text>
                        <Text style={styles.actionReason}>{String(a.reason || a.bodyPart || a.note || a.newWeight || 'Done')}</Text>
                      </View>
                    ))}
                  </View>
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
