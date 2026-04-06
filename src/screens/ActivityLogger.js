import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Modal, Vibration, Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import {
  saveCustomSession, getCustomSessions, searchSeedExercises, searchWods,
  getWodsByCategory, getWeeklyActivitySummary,
} from '../data/database';

const MODES = [
  { key: 'manual', label: 'EXERCISES' },
  { key: 'wod', label: 'WOD' },
  { key: 'freetext', label: 'DESCRIBE IT' },
];

const MUSCLE_GROUPS = ['all', 'chest', 'back', 'shoulders', 'legs', 'arms', 'core', 'full_body'];

export default function ActivityLogger({ navigation }) {
  const [mode, setMode] = useState('manual');
  const [recentSessions, setRecentSessions] = useState([]);
  const [weeklySummary, setWeeklySummary] = useState(null);

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const loadData = async () => {
    try {
      const [sessions, summary] = await Promise.all([
        getCustomSessions(10),
        getWeeklyActivitySummary(),
      ]);
      setRecentSessions(sessions);
      setWeeklySummary(summary);
    } catch (e) { console.error('ActivityLogger load error:', e); }
  };

  return (
    <SafeAreaView style={s.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>LOG WORKOUT</Text>
        {weeklySummary ? (
          <Text style={s.headerSub}>
            {weeklySummary.planSessions} plan + {weeklySummary.customSessions} custom this week
          </Text>
        ) : null}
      </View>

      {/* Mode Tabs */}
      <View style={s.modeRow}>
        {MODES.map(m => (
          <TouchableOpacity key={m.key} style={[s.modeTab, mode === m.key && s.modeTabActive]} onPress={() => setMode(m.key)}>
            <Text style={[s.modeText, mode === m.key && s.modeTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'manual' ? (
        <ManualMode navigation={navigation} onSaved={loadData} recentSessions={recentSessions} />
      ) : mode === 'wod' ? (
        <WodMode onSaved={loadData} recentSessions={recentSessions} />
      ) : (
        <FreetextMode onSaved={loadData} navigation={navigation} recentSessions={recentSessions} />
      )}
      </View>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODE 1: MANUAL — Pick exercises, log sets/reps/weight live
// ═══════════════════════════════════════════════════════════════

function ManualMode({ navigation, onSaved, recentSessions }) {
  const [isActive, setIsActive] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [exercises, setExercises] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (isActive && startTime) {
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [isActive, startTime]);

  const start = () => { setIsActive(true); setStartTime(Date.now()); setElapsed(0); setExercises([]); };

  const addExercise = (name, seedId, muscleGroup) => {
    setExercises(prev => [...prev, {
      name, seedId, muscleGroup: muscleGroup || 'full_body',
      sets: [{ weight: '', reps: '', done: false }],
    }]);
    setShowPicker(false);
  };

  const updateSet = (ei, si, field, val) => {
    setExercises(prev => {
      const u = [...prev];
      u[ei] = { ...u[ei], sets: [...u[ei].sets] };
      u[ei].sets[si] = { ...u[ei].sets[si], [field]: val };
      return u;
    });
  };

  const toggleDone = (ei, si) => {
    setExercises(prev => {
      const u = [...prev];
      u[ei] = { ...u[ei], sets: [...u[ei].sets] };
      u[ei].sets[si] = { ...u[ei].sets[si], done: !u[ei].sets[si].done };
      return u;
    });
    Vibration.vibrate(50);
  };

  const addSet = (ei) => {
    setExercises(prev => {
      const u = [...prev];
      const last = u[ei].sets[u[ei].sets.length - 1];
      u[ei] = { ...u[ei], sets: [...u[ei].sets, { weight: last?.weight || '', reps: last?.reps || '', done: false }] };
      return u;
    });
  };

  const removeExercise = (ei) => setExercises(prev => prev.filter((_, i) => i !== ei));

  const finish = async () => {
    const dur = Math.round(elapsed / 60);
    const entries = exercises.map(ex => {
      // Use checked-off sets if any, otherwise use all sets with data
      const doneSets = ex.sets.filter(s => s.done);
      const setsWithData = ex.sets.filter(s => s.weight || s.reps);
      const useSets = doneSets.length > 0 ? doneSets : setsWithData;
      const allWeights = useSets.map(s => parseFloat(s.weight) || 0);
      const maxWeight = Math.max(0, ...allWeights);
      return {
        exercise_seed_id: ex.seedId || null,
        exercise_name: ex.name,
        muscle_group: ex.muscleGroup,
        category: 'strength',
        sets: useSets.length || 1,
        reps: useSets.map(s => s.reps).filter(Boolean).join(',') || null,
        weight_lbs: maxWeight > 0 ? maxWeight : null,
      };
    }).filter(e => e.sets > 0 || e.weight_lbs > 0);

    const title = entries.length > 0
      ? entries.slice(0, 3).map(e => e.exercise_name).join(', ')
      : 'Workout';

    await saveCustomSession({
      source: 'manual',
      title: title.length > 50 ? title.substring(0, 47) + '...' : title,
      duration_minutes: dur,
      entries,
    });

    clearInterval(timerRef.current);
    setIsActive(false);
    Vibration.vibrate(300);
    const totalSets = entries.reduce((sum, e) => sum + e.sets, 0);
    Alert.alert('Workout Logged', `${dur} min \u2022 ${entries.length} exercises \u2022 ${totalSets} sets`);
    onSaved();
  };

  const fmt = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  if (!isActive) {
    return (
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={s.startWrap}>
          <TouchableOpacity style={s.startBtn} onPress={start}>
            <Text style={s.startBtnText}>START WORKOUT</Text>
            <Text style={s.startBtnSub}>Add exercises and log sets as you go</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.gpsBtn} onPress={() => navigation.navigate('GpsRunTracker')}>
            <Text style={s.gpsBtnText}>GPS RUN</Text>
          </TouchableOpacity>
        </View>
        <RecentSessions sessions={recentSessions} />
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={s.timerBar}>
        <Text style={s.timerText}>{fmt(elapsed)}</Text>
        <Text style={s.timerCount}>{exercises.length} exercises</Text>
        <TouchableOpacity style={s.finishBtn} onPress={() =>
          Alert.alert('Finish?', `${Math.round(elapsed / 60)} min`, [
            { text: 'Keep Going', style: 'cancel' },
            { text: 'Finish', style: 'destructive', onPress: finish },
          ])
        }>
          <Text style={s.finishBtnText}>FINISH</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {exercises.map((ex, ei) => (
          <View key={ei} style={s.exBlock}>
            <View style={s.exHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.exName}>{ex.name.toUpperCase()}</Text>
                {!ex.seedId ? <Text style={s.customTag}>CUSTOM</Text> : null}
              </View>
              <TouchableOpacity onPress={() => removeExercise(ei)}>
                <Text style={s.removeBtn}>X</Text>
              </TouchableOpacity>
            </View>
            <View style={s.setHeaderRow}>
              <Text style={s.setHdr}>SET</Text>
              <Text style={[s.setHdr, { flex: 1, textAlign: 'center' }]}>LBS</Text>
              <Text style={[s.setHdr, { flex: 1, textAlign: 'center' }]}>REPS</Text>
              <Text style={[s.setHdr, { width: 40 }]}> </Text>
            </View>
            {ex.sets.map((set, si) => (
              <View key={si} style={[s.setRow, set.done && s.setRowDone]}>
                <Text style={s.setNum}>{si + 1}</Text>
                <TextInput style={s.setInput} value={set.weight} onChangeText={v => updateSet(ei, si, 'weight', v)}
                  placeholder="--" placeholderTextColor="rgba(255,255,255,0.12)" keyboardType="numeric" />
                <TextInput style={s.setInput} value={set.reps} onChangeText={v => updateSet(ei, si, 'reps', v)}
                  placeholder="--" placeholderTextColor="rgba(255,255,255,0.12)" keyboardType="numeric" />
                <TouchableOpacity style={[s.checkBtn, set.done && s.checkDone]} onPress={() => toggleDone(ei, si)}>
                  <Text style={[s.checkTxt, set.done && s.checkTxtDone]}>{set.done ? '\u2713' : ''}</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={s.addSetBtn} onPress={() => addSet(ei)}>
              <Text style={s.addSetText}>+ SET</Text>
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity style={s.addExBtn} onPress={() => setShowPicker(true)}>
          <Text style={s.addExBtnText}>+ ADD EXERCISE</Text>
        </TouchableOpacity>
        <View style={{ height: 120 }} />
      </ScrollView>

      <ExercisePicker visible={showPicker} onClose={() => setShowPicker(false)} onAdd={addExercise} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// EXERCISE PICKER — Search seed catalog + custom entry
// ═══════════════════════════════════════════════════════════════

function ExercisePicker({ visible, onClose, onAdd }) {
  const [query, setQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('all');
  const [results, setResults] = useState([]);

  useEffect(() => { if (!visible) { setQuery(''); setMuscleFilter('all'); setResults([]); } }, [visible]);

  const search = async (text, muscle) => {
    setQuery(text);
    try {
      const mg = muscle === 'all' ? null : muscle;
      const matches = await searchSeedExercises(text.length >= 2 ? text : null, mg);
      setResults(matches);
    } catch (e) { console.error('Search error:', e); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.pickerOverlay}>
        <View style={s.pickerContent}>
          <View style={s.pickerHeader}>
            <Text style={s.pickerTitle}>ADD EXERCISE</Text>
            <TouchableOpacity onPress={onClose}><Text style={s.pickerClose}>X</Text></TouchableOpacity>
          </View>

          <TextInput style={s.pickerSearch} placeholder="Search exercises..." placeholderTextColor="rgba(255,255,255,0.2)"
            value={query} onChangeText={t => search(t, muscleFilter)} autoFocus />

          {/* Muscle group filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 36, marginBottom: 8 }}>
            {MUSCLE_GROUPS.map(mg => (
              <TouchableOpacity key={mg} style={[s.filterChip, muscleFilter === mg && s.filterChipActive]}
                onPress={() => { setMuscleFilter(mg); search(query, mg); }}>
                <Text style={[s.filterText, muscleFilter === mg && s.filterTextActive]}>{mg.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Custom exercise option */}
          {query.length >= 2 ? (
            <TouchableOpacity style={s.customOption} onPress={() => onAdd(query.trim(), null, null)}>
              <Text style={s.customOptionText}>Log custom: "{query}"</Text>
              <Text style={s.customOptionSub}>Not in library — log it anyway</Text>
            </TouchableOpacity>
          ) : null}

          <ScrollView style={{ maxHeight: 350 }}>
            {results.map(ex => (
              <TouchableOpacity key={ex.id} style={s.resultRow}
                onPress={() => onAdd(ex.name, ex.id, ex.muscle_group)}>
                <Text style={s.resultName}>{String(ex.name)}</Text>
                <Text style={s.resultMeta}>{String(ex.muscle_group || '').toUpperCase()} \u2022 {String(ex.category || '').toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODE 2: WOD — Pick from seed library or enter custom
// ═══════════════════════════════════════════════════════════════

function WodMode({ onSaved, recentSessions }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [wodResults, setWodResults] = useState([]);
  const [selectedWod, setSelectedWod] = useState(null);
  const [customWodText, setCustomWodText] = useState('');
  const [scoreType, setScoreType] = useState('time');
  const [score, setScore] = useState('');
  const [rx, setRx] = useState(false);
  const [notes, setNotes] = useState('');

  const handleSearch = async (text) => {
    setSearchQuery(text);
    if (text.length < 2) { setWodResults([]); return; }
    try {
      const results = await searchWods(text);
      setWodResults(results);
    } catch (e) { console.error('WOD search error:', e); }
  };

  const selectWod = (wod) => {
    setSelectedWod(wod);
    setSearchQuery('');
    setWodResults([]);
    // Auto-detect score type from WOD type
    const type = (wod.type || '').toLowerCase();
    if (type.includes('amrap')) setScoreType('rounds');
    else if (type.includes('time') || type.includes('for time')) setScoreType('time');
    else if (type.includes('emom')) setScoreType('rounds');
  };

  const parseMovements = (wod) => {
    if (!wod?.movements) return [];
    try {
      const arr = typeof wod.movements === 'string' ? JSON.parse(wod.movements) : wod.movements;
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  };

  const handleSave = async () => {
    if (!selectedWod && !customWodText.trim()) { Alert.alert('Missing', 'Select a WOD or describe one'); return; }
    if (!score.trim()) { Alert.alert('Missing', 'Enter your score'); return; }

    const wodName = selectedWod ? selectedWod.name : customWodText.split('\n')[0].substring(0, 50);
    const movements = selectedWod ? parseMovements(selectedWod) : [];

    const entries = [{
      exercise_seed_id: null,
      exercise_name: wodName,
      muscle_group: 'full_body',
      category: 'wod',
      wod_id: selectedWod?.id || null,
      wod_score: score.trim(),
      wod_score_type: scoreType,
    }];

    // Add individual movements as entries if from seed WOD
    for (const mov of movements) {
      entries.push({
        exercise_seed_id: null,
        exercise_name: typeof mov === 'string' ? mov : String(mov),
        muscle_group: 'full_body',
        category: 'wod',
      });
    }

    await saveCustomSession({
      source: 'wod',
      title: `${wodName} — ${score} ${scoreType === 'time' ? '' : scoreType}`.trim(),
      notes: [rx ? 'RX' : 'Scaled', notes].filter(Boolean).join(' \u2022 '),
      entries,
    });

    setSelectedWod(null);
    setCustomWodText('');
    setScore('');
    setNotes('');
    setRx(false);
    Vibration.vibrate(200);
    Alert.alert('WOD Logged', wodName);
    onSaved();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={s.wodWrap}>
          {/* WOD Search */}
          {!selectedWod ? (
            <>
              <Text style={s.label}>SEARCH WOD LIBRARY</Text>
              <TextInput style={s.searchInput} placeholder="Fran, Cindy, Murph..." placeholderTextColor="rgba(255,255,255,0.15)"
                value={searchQuery} onChangeText={handleSearch} />

              {wodResults.map(wod => (
                <TouchableOpacity key={wod.id} style={s.wodResult} onPress={() => selectWod(wod)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={s.wodResultName}>{String(wod.name)}</Text>
                    <Text style={s.wodResultType}>{String(wod.type || '').toUpperCase()}</Text>
                  </View>
                  <Text style={s.wodResultMovements} numberOfLines={1}>
                    {parseMovements(wod).join(' \u2022 ')}
                  </Text>
                </TouchableOpacity>
              ))}

              <Text style={[s.label, { marginTop: 20 }]}>OR DESCRIBE A CUSTOM WOD</Text>
              <TextInput style={s.wodTextInput} placeholder={"21-15-9\nThrusters 95 lb\nPull-ups"}
                placeholderTextColor="rgba(255,255,255,0.12)" value={customWodText} onChangeText={setCustomWodText}
                multiline numberOfLines={5} textAlignVertical="top" />
            </>
          ) : (
            // Selected WOD display
            <View style={s.selectedWod}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Text style={s.selectedWodName}>{selectedWod.name}</Text>
                <TouchableOpacity onPress={() => setSelectedWod(null)}>
                  <Text style={s.changeBtn}>CHANGE</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.selectedWodType}>
                {String(selectedWod.type || '').toUpperCase()}{selectedWod.time_cap ? ` \u2022 ${selectedWod.time_cap}` : ''}
              </Text>
              {selectedWod.scheme ? <Text style={s.selectedWodScheme}>{String(selectedWod.scheme)}</Text> : null}
              <View style={s.movementsList}>
                {parseMovements(selectedWod).map((mov, i) => (
                  <Text key={i} style={s.movementItem}>{'\u2022'} {typeof mov === 'string' ? mov : String(mov)}</Text>
                ))}
              </View>
            </View>
          )}

          {/* Score Entry */}
          {(selectedWod || customWodText.trim()) ? (
            <>
              <Text style={[s.label, { marginTop: 16 }]}>SCORE TYPE</Text>
              <View style={s.scoreTypeRow}>
                {['time', 'rounds', 'reps', 'load'].map(st => (
                  <TouchableOpacity key={st} style={[s.scoreTypeBtn, scoreType === st && s.scoreTypeBtnActive]}
                    onPress={() => setScoreType(st)}>
                    <Text style={[s.scoreTypeBtnText, scoreType === st && s.scoreTypeBtnTextActive]}>{st.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>YOUR SCORE</Text>
              <TextInput style={s.scoreInput}
                placeholder={scoreType === 'time' ? '12:34' : scoreType === 'rounds' ? '8 + 12' : '150'}
                placeholderTextColor="rgba(255,255,255,0.12)" value={score} onChangeText={setScore} />

              <View style={s.rxRow}>
                <TouchableOpacity style={[s.rxBtn, rx && s.rxBtnActive]} onPress={() => setRx(!rx)}>
                  <Text style={[s.rxText, rx && s.rxTextActive]}>RX</Text>
                </TouchableOpacity>
                <TextInput style={[s.scoreInput, { flex: 1, marginLeft: 10 }]} placeholder="Notes (optional)"
                  placeholderTextColor="rgba(255,255,255,0.12)" value={notes} onChangeText={setNotes} />
              </View>

              <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                <Text style={s.saveBtnText}>LOG WOD</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
        <RecentSessions sessions={recentSessions} />
        <View style={{ height: 100 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODE 3: FREETEXT — AI parses natural language
// ═══════════════════════════════════════════════════════════════

function FreetextMode({ onSaved, navigation, recentSessions }) {
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleLog = async () => {
    if (!input.trim()) return;
    setIsProcessing(true);
    try {
      const entries = await parseWithAI(input.trim());
      const title = entries.length > 0
        ? entries.slice(0, 2).map(e => e.exercise_name).join(', ')
        : input.substring(0, 40);
      const totalMin = entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);

      await saveCustomSession({
        source: 'ai_freetext',
        title: title.length > 50 ? title.substring(0, 47) + '...' : title,
        raw_input: input.trim(),
        duration_minutes: totalMin > 0 ? totalMin : null,
        entries,
      });

      setInput('');
      Vibration.vibrate(200);
      Alert.alert('Logged', title);
      onSaved();
    } catch (e) {
      console.error('Freetext error:', e);
      Alert.alert('Could not parse', 'Try describing it differently, or use the Exercises tab to log manually.');
    }
    setIsProcessing(false);
  };

  return (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={{ paddingHorizontal: 12 }}>
        <Text style={[s.label, { marginTop: 12 }]}>DESCRIBE WHAT YOU DID</Text>
        <TextInput style={s.freetextInput}
          placeholder={"I played soccer for an hour\nDid 3x10 tire flips at 200 lbs\nRan 3 miles easy pace\n50 push-ups, 50 sit-ups, 25 pull-ups"}
          placeholderTextColor="rgba(255,255,255,0.1)" value={input} onChangeText={setInput}
          multiline numberOfLines={5} textAlignVertical="top" />

        <View style={s.examplesRow}>
          {['Ran 2 miles in 18 min', '1hr pickup basketball', '100 burpees: 8:45'].map((ex, i) => (
            <TouchableOpacity key={i} style={s.exampleChip} onPress={() => setInput(ex)}>
              <Text style={s.exampleText}>{ex}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <TouchableOpacity style={s.gpsSmall} onPress={() => navigation.navigate('GpsRunTracker')}>
            <Text style={s.gpsSmallText}>GPS RUN</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.saveBtn, { flex: 1 }, !input.trim() && { opacity: 0.4 }]}
            onPress={handleLog} disabled={!input.trim() || isProcessing}>
            {isProcessing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.saveBtnText}>LOG IT</Text>}
          </TouchableOpacity>
        </View>
      </View>
      <RecentSessions sessions={recentSessions} />
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════
// AI FREETEXT PARSER
// ═══════════════════════════════════════════════════════════════

async function parseWithAI(text) {
  const apiKey = Constants.expoConfig?.extra?.claudeApiKey
    || Constants.manifest?.extra?.claudeApiKey
    || await AsyncStorage.getItem('claudeApiKey');

  if (!apiKey) return parseLocal(text);

  // Get seed exercise names for matching
  const { seedExercises } = require('../data/exerciseSeed');
  const seedList = seedExercises().map(e => `${e.id}|${e.name}|${e.muscle_group}`).join('\n');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: `Parse activity into JSON array of entries. Return ONLY valid JSON: {"entries":[...]}.
Each entry: {exercise_seed_id (from list below or null), exercise_name, muscle_group, category (strength|cardio|wod|sport|active_recovery), sets, reps, weight_lbs, duration_minutes, distance_miles, intensity (low|moderate|high)}.
Match to seed exercises when possible. For unmatched (soccer, hiking): exercise_seed_id=null, appropriate category.

SEED EXERCISES:
${seedList.substring(0, 3000)}`,
        messages: [{ role: 'user', content: text }],
      }),
    });

    if (!response.ok) throw new Error(`API ${response.status}`);
    const result = await response.json();
    const content = result.content?.[0]?.text || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.entries || [parsed];
    }
    throw new Error('No JSON');
  } catch (e) {
    console.log('[Freetext] AI failed:', e.message);
    return parseLocal(text);
  }
}

function parseLocal(text) {
  const entries = [];
  // Split by "and", commas, or newlines to find multiple activities
  const parts = text.split(/\band\b|,|\n/).map(p => p.trim()).filter(Boolean);

  for (const part of parts) {
    const lower = part.toLowerCase();
    const entry = {
      exercise_seed_id: null, exercise_name: '', muscle_group: 'full_body', category: 'strength',
      sets: null, reps: null, weight_lbs: null, duration_minutes: null, distance_miles: null, intensity: 'moderate',
    };

    // Detect category
    if (/\brun\b|\bran\b|\bjog\b|\bmile/i.test(lower)) { entry.category = 'cardio'; entry.muscle_group = 'cardio'; }
    else if (/\bsoccer\b|\bbasketball\b|\btennis\b|\bswim\b|\bhike\b|\bwalk\b|\bclimb/i.test(lower)) { entry.category = 'sport'; entry.muscle_group = 'cardio'; }
    else if (/\bbike\b|\bcycle\b|\brow\b|\belliptical/i.test(lower)) { entry.category = 'cardio'; entry.muscle_group = 'cardio'; }

    // Extract sets x reps patterns: "3 sets of 20", "3x20", "3 sets 20 reps"
    const setsRepsMatch = lower.match(/(\d+)\s*(?:sets?\s*(?:of\s*)?|x)(\d+)/);
    if (setsRepsMatch) {
      entry.sets = parseInt(setsRepsMatch[1]);
      entry.reps = setsRepsMatch[2];
    }
    // Also try "20 pushups" (just reps, no sets specified)
    if (!entry.reps) {
      const justReps = lower.match(/(\d+)\s+(?!min|hour|hr|mile|mi\b|lb|lbs|sec|set)/);
      if (justReps) entry.reps = justReps[1];
    }

    // Extract weight: "at 135", "135 lbs", "@ 200 lb"
    const weightMatch = lower.match(/(?:at\s+|@\s*)?(\d+)\s*(?:lb|lbs|pound)/);
    if (weightMatch) entry.weight_lbs = parseFloat(weightMatch[1]);

    // Extract distance
    const distMatch = lower.match(/([\d.]+)\s*(?:mile|mi\b)/);
    if (distMatch) entry.distance_miles = parseFloat(distMatch[1]);

    // Extract duration
    const minMatch = lower.match(/([\d.]+)\s*(?:min|minute)/);
    const hrMatch = lower.match(/([\d.]+)\s*(?:hr|hour)/);
    const timeMatch = lower.match(/(\d+):(\d+)\s*(?:min)?/);
    if (minMatch) entry.duration_minutes = Math.round(parseFloat(minMatch[1]));
    else if (hrMatch) entry.duration_minutes = Math.round(parseFloat(hrMatch[1]) * 60);
    else if (timeMatch) entry.duration_minutes = parseInt(timeMatch[1]) + Math.round(parseInt(timeMatch[2]) / 60);

    // Extract exercise name — strip the numbers and units
    let name = part
      .replace(/\d+\s*(?:sets?\s*(?:of\s*)?|x)\d+/gi, '')  // remove "3 sets of 20"
      .replace(/(?:at\s+|@\s*)?\d+\s*(?:lb|lbs|pound)s?/gi, '')  // remove weight
      .replace(/\d+\s*(?:min|minute|hour|hr|mile|mi)\w*/gi, '')  // remove duration/distance
      .replace(/\d+/g, '')  // remove remaining numbers
      .replace(/\s+/g, ' ').trim();
    entry.exercise_name = name.length > 0 ? name : part.substring(0, 40);

    // Calculate pace for runs
    if (entry.category === 'cardio' && entry.distance_miles && entry.duration_minutes) {
      const pm = entry.duration_minutes / entry.distance_miles;
      entry.pace = `${Math.floor(pm)}:${String(Math.round((pm % 1) * 60)).padStart(2, '0')}/mi`;
    }

    entries.push(entry);
  }

  return entries.length > 0 ? entries : [{ exercise_seed_id: null, exercise_name: text.substring(0, 60), muscle_group: 'full_body', category: 'other', sets: null, reps: null, weight_lbs: null, duration_minutes: null, distance_miles: null, intensity: 'moderate' }];
}

// ═══════════════════════════════════════════════════════════════
// RECENT SESSIONS — Expandable list with entry details
// ═══════════════════════════════════════════════════════════════

function RecentSessions({ sessions }) {
  const [expandedId, setExpandedId] = useState(null);
  if (!sessions || sessions.length === 0) return null;

  const SOURCE_COLORS = { manual: '#FF851B', wod: '#FF4136', ai_freetext: '#B10DC9' };

  return (
    <View style={s.recentSection}>
      <Text style={s.sectionLabel}>RECENT WORKOUTS</Text>
      <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
        {sessions.map(sess => {
          const isExpanded = expandedId === sess.id;
          const srcColor = SOURCE_COLORS[sess.source] || '#888';
          return (
            <TouchableOpacity key={sess.id} style={s.sessionCard} onPress={() => setExpandedId(isExpanded ? null : sess.id)} activeOpacity={0.7}>
              <View style={s.sessionHeader}>
                <View style={[s.sessionDot, { backgroundColor: srcColor }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.sessionTitle}>{String(sess.title || 'Workout')}</Text>
                  <Text style={s.sessionMeta}>
                    {String(sess.date || '')}{sess.duration_minutes ? ` \u2022 ${sess.duration_minutes}min` : ''}
                    {sess.entries?.length ? ` \u2022 ${sess.entries.length} exercises` : ''}
                  </Text>
                </View>
                <Text style={[s.sessionSource, { color: srcColor }]}>{String(sess.source || '').toUpperCase()}</Text>
              </View>

              {isExpanded && sess.entries?.length > 0 ? (
                <View style={s.sessionEntries}>
                  {sess.entries.map((entry, i) => (
                    <View key={i} style={s.entryRow}>
                      <Text style={s.entryName}>{String(entry.exercise_name || '')}</Text>
                      <View style={s.entryDetails}>
                        {entry.sets ? <Text style={s.entryDetail}>{entry.sets} sets</Text> : null}
                        {entry.reps ? <Text style={s.entryDetail}>{entry.reps} reps</Text> : null}
                        {entry.weight_lbs ? <Text style={s.entryDetailAccent}>{entry.weight_lbs} lb</Text> : null}
                        {entry.duration_minutes ? <Text style={s.entryDetail}>{entry.duration_minutes} min</Text> : null}
                        {entry.distance_miles ? <Text style={s.entryDetail}>{entry.distance_miles} mi</Text> : null}
                        {entry.wod_score ? <Text style={s.entryDetailAccent}>{entry.wod_score} {entry.wod_score_type || ''}</Text> : null}
                        {entry.intensity ? <Text style={s.entryDetail}>{entry.intensity}</Text> : null}
                        {entry.category && entry.category !== 'strength' ? <Text style={s.entryCategory}>{entry.category.toUpperCase()}</Text> : null}
                      </View>
                    </View>
                  ))}
                  {sess.notes ? <Text style={s.sessionNotes}>{sess.notes}</Text> : null}
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { padding: 16, paddingBottom: 4 },
  headerTitle: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 3 },
  headerSub: { color: 'rgba(255,255,255,0.2)', fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  modeRow: { flexDirection: 'row', marginHorizontal: 12, marginTop: 8, marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 3 },
  modeTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  modeTabActive: { backgroundColor: 'rgba(255,65,54,0.15)' },
  modeText: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  modeTextActive: { color: '#FF4136' },
  label: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 },
  sectionLabel: { color: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },

  // Session Cards
  sessionCard: { backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12, marginBottom: 8 },
  sessionHeader: { flexDirection: 'row', alignItems: 'center' },
  sessionDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  sessionTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  sessionMeta: { color: 'rgba(255,255,255,0.25)', fontSize: 10, fontFamily: 'monospace', marginTop: 2 },
  sessionSource: { fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  sessionEntries: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  entryRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.02)' },
  entryName: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  entryDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 3 },
  entryDetail: { color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: 'monospace' },
  entryDetailAccent: { color: '#FF4136', fontSize: 11, fontWeight: '700', fontFamily: 'monospace' },
  entryCategory: { color: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: '700', letterSpacing: 1, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  sessionNotes: { color: 'rgba(255,255,255,0.2)', fontSize: 10, fontStyle: 'italic', marginTop: 6 },

  // Recent
  recentSection: { paddingHorizontal: 12, paddingVertical: 10 },

  // Start
  startWrap: { padding: 24, paddingTop: 40 },
  startBtn: { backgroundColor: '#FF4136', paddingVertical: 20, borderRadius: 16, alignItems: 'center', width: '100%' },
  startBtnText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  startBtnSub: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 4 },
  gpsBtn: { marginTop: 12, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#0074D9', alignItems: 'center' },
  gpsBtnText: { color: '#0074D9', fontSize: 14, fontWeight: '800', letterSpacing: 2 },

  // Timer
  timerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  timerText: { color: '#FF4136', fontSize: 24, fontWeight: '900', fontFamily: 'monospace', flex: 1 },
  timerCount: { color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: 'monospace', marginRight: 12 },
  finishBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, backgroundColor: 'rgba(255,65,54,0.15)', borderWidth: 1, borderColor: 'rgba(255,65,54,0.3)' },
  finishBtnText: { color: '#FF4136', fontSize: 11, fontWeight: '900', letterSpacing: 1 },

  // Exercise Block
  exBlock: { marginHorizontal: 12, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', padding: 12 },
  exHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  exName: { color: '#FF4136', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  customTag: { color: 'rgba(255,255,255,0.2)', fontSize: 8, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  removeBtn: { color: 'rgba(255,255,255,0.2)', fontSize: 14, fontWeight: '700', padding: 4 },
  setHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  setHdr: { width: 30, color: 'rgba(255,255,255,0.12)', fontSize: 9, fontWeight: '700' },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  setRowDone: { opacity: 0.5 },
  setNum: { width: 30, color: 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  setInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10, color: '#fff', fontSize: 14, fontWeight: '600', fontFamily: 'monospace', textAlign: 'center', marginHorizontal: 3 },
  checkBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', marginLeft: 3 },
  checkDone: { borderColor: '#01FF70', backgroundColor: 'rgba(1,255,112,0.1)' },
  checkTxt: { fontSize: 16, color: 'rgba(255,255,255,0.2)' },
  checkTxtDone: { color: '#01FF70' },
  addSetBtn: { paddingVertical: 8, alignItems: 'center' },
  addSetText: { color: 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  addExBtn: { marginHorizontal: 12, marginTop: 12, paddingVertical: 16, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,65,54,0.2)', borderStyle: 'dashed' },
  addExBtnText: { color: '#FF4136', fontSize: 13, fontWeight: '800', letterSpacing: 1 },

  // Exercise Picker
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  pickerContent: { backgroundColor: '#1A1A1A', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: '75%' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  pickerTitle: { color: '#FF4136', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  pickerClose: { color: 'rgba(255,255,255,0.3)', fontSize: 16, fontWeight: '700', padding: 4 },
  pickerSearch: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, color: '#fff', fontSize: 14, marginBottom: 8 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginRight: 6 },
  filterChipActive: { borderColor: '#FF4136', backgroundColor: 'rgba(255,65,54,0.08)' },
  filterText: { color: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  filterTextActive: { color: '#FF4136' },
  customOption: { padding: 12, backgroundColor: 'rgba(255,65,54,0.05)', borderWidth: 1, borderColor: 'rgba(255,65,54,0.15)', borderRadius: 8, marginBottom: 8 },
  customOptionText: { color: '#FF4136', fontSize: 13, fontWeight: '700' },
  customOptionSub: { color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 2 },
  resultRow: { paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  resultName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  resultMeta: { color: 'rgba(255,255,255,0.25)', fontSize: 10, fontFamily: 'monospace', marginTop: 2 },

  // WOD Mode
  wodWrap: { padding: 12 },
  searchInput: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, color: '#fff', fontSize: 14 },
  wodResult: { padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  wodResultName: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1 },
  wodResultType: { color: '#FF4136', fontSize: 9, fontWeight: '800', letterSpacing: 1, marginLeft: 8, backgroundColor: 'rgba(255,65,54,0.08)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  wodResultMovements: { color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: 'monospace', marginTop: 4 },
  wodTextInput: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 14, color: '#fff', fontSize: 13, minHeight: 100, fontFamily: 'monospace' },
  selectedWod: { backgroundColor: 'rgba(255,65,54,0.03)', borderWidth: 1, borderColor: 'rgba(255,65,54,0.12)', borderRadius: 12, padding: 16 },
  selectedWodName: { color: '#FF4136', fontSize: 18, fontWeight: '900', letterSpacing: 1, flex: 1 },
  changeBtn: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  selectedWodType: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  selectedWodScheme: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontFamily: 'monospace', marginTop: 4 },
  movementsList: { marginTop: 8 },
  movementItem: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'monospace', marginBottom: 2 },

  // Score
  scoreTypeRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  scoreTypeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.02)' },
  scoreTypeBtnActive: { borderColor: '#FF4136', backgroundColor: 'rgba(255,65,54,0.08)' },
  scoreTypeBtnText: { color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  scoreTypeBtnTextActive: { color: '#FF4136' },
  scoreInput: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: 'monospace', marginBottom: 12 },
  rxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  rxBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)' },
  rxBtnActive: { borderColor: '#01FF70', backgroundColor: 'rgba(1,255,112,0.1)' },
  rxText: { color: 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  rxTextActive: { color: '#01FF70' },
  saveBtn: { paddingVertical: 14, alignItems: 'center', borderRadius: 10, backgroundColor: '#FF4136' },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 2 },

  // Freetext
  freetextInput: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 14, color: '#fff', fontSize: 14, minHeight: 100, marginBottom: 8 },
  examplesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  exampleChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  exampleText: { color: 'rgba(255,255,255,0.3)', fontSize: 11 },
  gpsSmall: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: '#0074D9' },
  gpsSmallText: { color: '#0074D9', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
});
