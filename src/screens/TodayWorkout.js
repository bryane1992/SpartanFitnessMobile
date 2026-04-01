import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useWorkoutStore from '../store/useWorkoutStore';
import ExerciseSwapModal from './ExerciseSwapModal';
import ExerciseDetailModal from '../components/ExerciseDetailModal';
import CoachChat from '../components/CoachChat';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function TodayWorkout({ navigation }) {
  const {
    todayWorkout: workout,
    selectedDate,
    isLoading,
    loadTodayWorkout,
    loadWorkoutForDate,
    toggleExercise,
    updateExerciseLog,
    saveAmrapRounds,
    completeDay,
  } = useWorkoutStore();

  const [expandedBlocks, setExpandedBlocks] = useState({});
  const [swapModal, setSwapModal] = useState(null);
  const [detailExerciseId, setDetailExerciseId] = useState(null);
  const [coachVisible, setCoachVisible] = useState(false);

  useEffect(() => {
    loadTodayWorkout();
  }, []);

  useEffect(() => {
    if (workout && workout.blocks) {
      const expanded = {};
      workout.blocks.forEach((_, i) => { expanded[i] = true; });
      setExpandedBlocks(expanded);
    }
  }, [workout?.id]);

  const toggleBlock = (idx) => {
    setExpandedBlocks(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const goToDay = (offset) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + offset);
    loadWorkoutForDate(date.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    loadWorkoutForDate(new Date().toISOString().split('T')[0]);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FF4136" />
          <Text style={styles.loadingText}>Loading workout...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!workout) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.emptyTitle}>No workout for this day</Text>
          <Text style={styles.emptySub}>
            {selectedDate === new Date().toISOString().split('T')[0]
              ? 'Complete onboarding to generate your plan.'
              : 'Try navigating to a training day.'}
          </Text>
          <TouchableOpacity style={styles.todayButton} onPress={goToToday}>
            <Text style={styles.todayButtonText}>GO TO TODAY</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isRestDay = !!workout.is_rest_day;
  const isCompleted = !!workout.is_completed;
  const dateObj = new Date(selectedDate + 'T12:00:00');
  const dayLabel = DAY_LABELS[dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1];
  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  const dayNavContent = (
    <View style={styles.dayNav}>
      <TouchableOpacity onPress={() => goToDay(-1)} style={styles.navArrow}>
        <Text style={styles.navArrowText}>{'<'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={goToToday}>
        <Text style={styles.navDate}>
          {isToday ? 'TODAY' : `${dayLabel} \u2022 ${selectedDate}`}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => goToDay(1)} style={styles.navArrow}>
        <Text style={styles.navArrowText}>{'>'}</Text>
      </TouchableOpacity>
    </View>
  );

  if (isRestDay) {
    return (
      <SafeAreaView style={styles.container}>
        {dayNavContent}
        <View style={styles.centerContainer}>
          <Text style={styles.restTitle}>REST DAY</Text>
          <Text style={styles.restSub}>Recovery & mobility</Text>
          <Text style={styles.restTip}>Stretch, foam roll, or go for a light walk</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {dayNavContent}

        {/* Header */}
        <View style={[styles.header, { borderLeftColor: workout.color || '#FF4136' }]}>
          <Text style={styles.phaseText}>{String(workout.focus || '')}</Text>
          <Text style={styles.titleText}>{String(workout.title || '')}</Text>
          {isCompleted ? (
            <View style={styles.completedBadge}>
              <Text style={styles.completedBadgeText}>COMPLETED</Text>
            </View>
          ) : null}
        </View>

        {/* Workout Blocks */}
        {workout.blocks ? workout.blocks.map((block, blockIndex) => {
          const isOpen = !!expandedBlocks[blockIndex];
          const exercises = Array.isArray(block.exercises) ? block.exercises : [];
          const doneCount = exercises.filter(e => !!e.is_completed).length;
          const totalCount = exercises.length;
          const progress = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;
          const blockColor = workout.color || '#FF4136';
          const hasGps = !!block.has_gps;
          const isAmrap = !!block.is_amrap;

          return (
            <View key={block.id || blockIndex} style={styles.block}>
              {/* Progress bar */}
              <View style={styles.blockProgress}>
                <View style={[styles.blockProgressFill, { width: `${progress}%`, backgroundColor: blockColor }]} />
              </View>

              {/* Block header */}
              <TouchableOpacity style={styles.blockHeader} onPress={() => toggleBlock(blockIndex)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.blockName}>{String(block.name || '')}</Text>
                  <Text style={styles.blockType}>{`${block.type || ''}${isAmrap && block.time_cap ? ` \u2022 AMRAP ${block.time_cap}` : isAmrap ? ' \u2022 AMRAP' : ''}`}</Text>
                </View>
                <View style={styles.blockRight}>
                  {hasGps ? (
                    <TouchableOpacity
                      style={styles.trackRunBtn}
                      onPress={() => navigation.navigate('Run', { date: selectedDate })}
                    >
                      <Text style={styles.trackRunText}>TRACK RUN</Text>
                    </TouchableOpacity>
                  ) : null}
                  <Text style={styles.blockCount}>{`${doneCount}/${totalCount}`}</Text>
                  <Text style={styles.expandIcon}>{isOpen ? '\u25BC' : '\u25B6'}</Text>
                </View>
              </TouchableOpacity>

              {/* Exercises */}
              {isOpen ? (
                <View style={styles.exerciseList}>
                  {exercises.map((exercise, exIndex) => (
                    <ExerciseRow
                      key={exercise.id || exIndex}
                      exercise={exercise}
                      blockColor={blockColor}
                      onToggle={() => toggleExercise(exercise.id, !!exercise.is_completed)}
                      onLogChange={(field, value) => {
                        const reps = field === 'reps' ? value : (exercise.actual_reps || '');
                        const weight = field === 'weight' ? value : (exercise.actual_weight || '');
                        const notes = field === 'notes' ? value : (exercise.notes || '');
                        updateExerciseLog(exercise.id, reps, weight, notes);
                      }}
                      onLongPress={() => {
                        setSwapModal({
                          planExerciseId: exercise.id,
                          exerciseId: exercise.exercise_id,
                        });
                      }}
                      onNamePress={() => setDetailExerciseId(exercise.exercise_id)}
                    />
                  ))}

                  {/* AMRAP rounds input */}
                  {isAmrap ? (
                    <View style={styles.amrapRow}>
                      <Text style={styles.amrapLabel}>AMRAP ROUNDS</Text>
                      <View style={styles.amrapInputs}>
                        <TextInput
                          style={styles.amrapInput}
                          placeholder="Rounds"
                          placeholderTextColor="rgba(1,255,112,0.3)"
                          keyboardType="numeric"
                          defaultValue={block.amrap_rounds ? String(block.amrap_rounds).split('+')[0] : ''}
                          onEndEditing={(e) => {
                            const existing = block.amrap_rounds ? String(block.amrap_rounds) : '';
                            const reps = existing.includes('+') ? existing.split('+')[1] : '';
                            saveAmrapRounds(block.id, `${e.nativeEvent.text}${reps ? '+' + reps : ''}`);
                          }}
                        />
                        <Text style={styles.amrapPlus}>+</Text>
                        <TextInput
                          style={styles.amrapInput}
                          placeholder="Reps"
                          placeholderTextColor="rgba(1,255,112,0.3)"
                          keyboardType="numeric"
                          defaultValue={block.amrap_rounds && String(block.amrap_rounds).includes('+') ? String(block.amrap_rounds).split('+')[1] : ''}
                          onEndEditing={(e) => {
                            const existing = block.amrap_rounds ? String(block.amrap_rounds) : '';
                            const rounds = existing.includes('+') ? existing.split('+')[0] : existing;
                            saveAmrapRounds(block.id, `${rounds}+${e.nativeEvent.text}`);
                          }}
                        />
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        }) : null}

        {/* Complete Day Button */}
        {!isCompleted && workout.blocks && workout.blocks.length > 0 ? (
          <TouchableOpacity style={styles.completeDayButton} onPress={() => completeDay(workout.id)}>
            <Text style={styles.completeDayText}>COMPLETE WORKOUT</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Long press exercise to swap</Text>
        </View>
      </ScrollView>

      {swapModal ? (
        <ExerciseSwapModal
          visible={true}
          exerciseId={swapModal.exerciseId}
          planExerciseId={swapModal.planExerciseId}
          onClose={() => setSwapModal(null)}
        />
      ) : null}

      <ExerciseDetailModal
        visible={!!detailExerciseId}
        exerciseId={detailExerciseId}
        onClose={() => setDetailExerciseId(null)}
      />

      {/* AI Coach floating button */}
      {workout && !isRestDay ? (
        <TouchableOpacity style={styles.coachFab} onPress={() => setCoachVisible(true)}>
          <Text style={styles.coachFabText}>AI</Text>
        </TouchableOpacity>
      ) : null}

      <CoachChat
        visible={coachVisible}
        onClose={() => setCoachVisible(false)}
        workout={workout}
        sessionId={workout ? `workout-${workout.id}-${selectedDate}` : null}
      />
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════
// Exercise Row Component with logging
// ═══════════════════════════════════════════════════════════════

function ExerciseRow({ exercise, blockColor, onToggle, onLogChange, onLongPress, onNamePress }) {
  const isDone = !!exercise.is_completed;
  const name = String(exercise.name || 'Exercise');
  const sets = String(exercise.sets || '');
  const weight = exercise.weight ? String(exercise.weight) : '';
  const rest = exercise.rest ? String(exercise.rest) : '';
  const swapped = exercise.swapped_from ? ' (swapped)' : '';

  return (
    <View>
      <TouchableOpacity
        style={[
          styles.exerciseRow,
          { borderLeftColor: isDone ? 'rgba(255,255,255,0.08)' : blockColor },
          isDone ? styles.exerciseRowDone : null,
        ]}
        onPress={onToggle}
        onLongPress={onLongPress}
      >
        {/* Checkbox */}
        <View style={[styles.checkbox, isDone ? { backgroundColor: blockColor, borderColor: 'transparent' } : null]}>
          {isDone ? <Text style={styles.checkIcon}>{'\u2713'}</Text> : null}
        </View>

        {/* Exercise info */}
        <View style={styles.exerciseContent}>
          <View style={styles.exerciseTopRow}>
            <Text
              style={[styles.exerciseName, isDone ? styles.exerciseNameDone : null]}
              numberOfLines={1}
            >{`${name}${swapped}`}</Text>
            <Text style={[styles.exerciseRx, { color: blockColor }, isDone ? styles.exerciseRxDone : null]}>{sets}</Text>
          </View>
          <Text style={styles.exerciseLoad}>{rest ? `${weight} \u2014 ${rest}` : weight}</Text>
        </View>

        {/* GIF/Demo button */}
        <TouchableOpacity style={styles.demoBtn} onPress={onNamePress}>
          <Text style={styles.demoBtnText}>GIF</Text>
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Log inputs - shown when checked */}
      {isDone ? (
        <View style={styles.logRow}>
          <TextInput
            style={styles.logInput}
            placeholder="Reps"
            placeholderTextColor="rgba(255,255,255,0.2)"
            defaultValue={String(exercise.actual_reps || '')}
            onEndEditing={(e) => onLogChange('reps', e.nativeEvent.text)}
          />
          <TextInput
            style={styles.logInput}
            placeholder="Weight"
            placeholderTextColor="rgba(255,255,255,0.2)"
            defaultValue={String(exercise.actual_weight || '')}
            onEndEditing={(e) => onLogChange('weight', e.nativeEvent.text)}
          />
          <TextInput
            style={[styles.logInput, { flex: 1.5 }]}
            placeholder="Note"
            placeholderTextColor="rgba(255,255,255,0.2)"
            defaultValue={String(exercise.notes || '')}
            onEndEditing={(e) => onLogChange('notes', e.nativeEvent.text)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontFamily: 'monospace',
    marginTop: 12,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  emptySub: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  todayButton: {
    backgroundColor: '#FF4136',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 6,
    marginTop: 20,
  },
  todayButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
  // Day Nav
  dayNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  navArrow: { padding: 8 },
  navArrowText: { color: 'rgba(255,255,255,0.4)', fontSize: 18, fontWeight: '300' },
  navDate: { color: '#fff', fontSize: 12, fontWeight: '600', letterSpacing: 1.5, fontFamily: 'monospace' },
  // Header
  header: {
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    borderLeftWidth: 4,
  },
  phaseText: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '600', letterSpacing: 1.2, fontFamily: 'monospace', textTransform: 'uppercase' },
  titleText: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 0.5, marginTop: 4, textTransform: 'uppercase' },
  completedBadge: { backgroundColor: 'rgba(76,175,80,0.1)', borderWidth: 1, borderColor: 'rgba(76,175,80,0.2)', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 4, marginTop: 8, alignSelf: 'flex-start' },
  completedBadgeText: { color: '#4CAF50', fontSize: 10, fontWeight: '700', letterSpacing: 1, fontFamily: 'monospace' },
  // Rest
  restTitle: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: 1 },
  restSub: { color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 6 },
  restTip: { color: 'rgba(255,255,255,0.15)', fontSize: 12, marginTop: 20, fontStyle: 'italic' },
  // Blocks
  block: {
    margin: 10,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  blockProgress: { height: 2, backgroundColor: 'rgba(255,255,255,0.04)' },
  blockProgressFill: { height: '100%', borderRadius: 1 },
  blockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  blockName: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  blockType: { color: 'rgba(255,255,255,0.2)', fontSize: 9, marginTop: 2, letterSpacing: 1.1, textTransform: 'uppercase', fontFamily: 'monospace' },
  blockRight: { flexDirection: 'row', alignItems: 'center' },
  trackRunBtn: {
    backgroundColor: '#0074D9',
    borderWidth: 1,
    borderColor: '#fff',
    borderRadius: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 10,
  },
  trackRunText: { color: '#fff', fontSize: 10, fontWeight: '700', fontFamily: 'monospace', letterSpacing: 0.5 },
  blockCount: { color: 'rgba(255,255,255,0.2)', fontSize: 10, fontFamily: 'monospace', marginRight: 8 },
  expandIcon: { color: 'rgba(255,255,255,0.2)', fontSize: 10 },
  // Exercises
  exerciseList: { paddingHorizontal: 12, paddingBottom: 10 },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 4,
    borderRadius: 7,
    borderLeftWidth: 3,
  },
  exerciseRowDone: { opacity: 0.45, backgroundColor: 'rgba(255,255,255,0.01)' },
  checkbox: {
    width: 19,
    height: 19,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkIcon: { color: '#000', fontSize: 11, fontWeight: '800' },
  coachFab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF4136',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#FF4136',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  coachFabText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  exerciseContent: { flex: 1, marginRight: 8 },
  demoBtn: {
    backgroundColor: 'rgba(255,65,54,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,65,54,0.25)',
    borderRadius: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignSelf: 'center',
  },
  demoBtnText: {
    color: '#FF4136',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    fontFamily: 'monospace',
  },
  exerciseTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  exerciseName: { color: '#fff', fontSize: 13, fontWeight: '500', letterSpacing: 0.4, textTransform: 'uppercase', flex: 1 },
  exerciseNameDone: { textDecorationLine: 'line-through', color: 'rgba(255,255,255,0.4)' },
  exerciseRx: { fontSize: 11, fontWeight: '600', fontFamily: 'monospace', marginLeft: 8 },
  exerciseRxDone: { opacity: 0.4 },
  exerciseLoad: { fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 2 },
  // Log inputs
  logRow: {
    flexDirection: 'row',
    paddingHorizontal: 41,
    paddingBottom: 6,
    paddingTop: 2,
  },
  logInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 5,
    paddingVertical: 5,
    paddingHorizontal: 8,
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: 11,
    marginRight: 5,
  },
  // AMRAP
  amrapRow: {
    padding: 10,
    marginTop: 4,
    backgroundColor: 'rgba(1,255,112,0.04)',
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  amrapLabel: {
    color: '#01FF70',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
  amrapInputs: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  amrapInput: {
    width: 55,
    backgroundColor: 'rgba(1,255,112,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(1,255,112,0.2)',
    borderRadius: 5,
    paddingVertical: 5,
    paddingHorizontal: 8,
    color: '#01FF70',
    fontFamily: 'monospace',
    fontSize: 12,
    textAlign: 'center',
  },
  amrapPlus: {
    color: '#01FF70',
    fontSize: 14,
    fontWeight: '700',
    marginHorizontal: 6,
  },
  // Complete Day
  completeDayButton: { backgroundColor: '#FF4136', margin: 12, padding: 14, borderRadius: 8, alignItems: 'center' },
  completeDayText: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 1.5, fontFamily: 'monospace' },
  footer: { padding: 16, alignItems: 'center' },
  footerText: { color: 'rgba(255,255,255,0.15)', fontSize: 10, fontFamily: 'monospace' },
});
