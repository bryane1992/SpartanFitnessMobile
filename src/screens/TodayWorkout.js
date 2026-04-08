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
import WodTimer from '../components/WodTimer';

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
    lastAdjustment,
    pendingAdjustment,
    confirmAdjustment,
    dismissAdjustment,
  } = useWorkoutStore();

  const [expandedBlocks, setExpandedBlocks] = useState({});
  const [swapModal, setSwapModal] = useState(null);
  const [detailExerciseId, setDetailExerciseId] = useState(null);
  // Coach chat moved to global App.js — available on all screens
  const [repSuggestion, setRepSuggestion] = useState(null); // coach suggestion for rep drop-off

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
      {pendingAdjustment ? (
        <View style={styles.adjustmentPrompt}>
          <Text style={styles.adjustmentPromptTitle}>WEIGHT ADJUSTMENT</Text>
          <Text style={styles.adjustmentPromptText}>
            {`You logged ${pendingAdjustment.actual} on ${pendingAdjustment.exerciseName} (prescribed ${pendingAdjustment.prescribed}) — ${pendingAdjustment.pctDiff}% ${pendingAdjustment.direction}.`}
          </Text>
          <Text style={styles.adjustmentPromptSub}>Scale future workouts to match?</Text>
          <View style={styles.adjustmentButtons}>
            <TouchableOpacity style={styles.adjustmentBtnYes} onPress={confirmAdjustment}>
              <Text style={styles.adjustmentBtnYesText}>YES, ADJUST</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.adjustmentBtnNo} onPress={dismissAdjustment}>
              <Text style={styles.adjustmentBtnNoText}>KEEP AS-IS</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      {repSuggestion ? (
        <View style={styles.adjustmentPrompt}>
          <Text style={styles.adjustmentPromptTitle}>COACH SUGGESTION</Text>
          <Text style={styles.adjustmentPromptText}>{repSuggestion.message}</Text>
          <View style={styles.adjustmentButtons}>
            {repSuggestion.options.map((opt, i) => (
              <TouchableOpacity
                key={i}
                style={i === 0 ? styles.adjustmentBtnYes : styles.adjustmentBtnNo}
                onPress={async () => {
                  if (opt.type === 'reduce_weight') {
                    const prescribed = parseFloat(repSuggestion.options.find(o => o.newWeight)?.newWeight);
                    const original = parseFloat(workout?.blocks?.flatMap(b => b.exercises || []).find(e => e.id === repSuggestion.planExerciseId)?.weight);
                    if (prescribed > 0 && original > 0) {
                      const { adjustFutureWeights } = require('../data/database');
                      await adjustFutureWeights(repSuggestion.exerciseId, prescribed / original);
                    }
                  }
                  setRepSuggestion(null);
                }}
              >
                <Text style={i === 0 ? styles.adjustmentBtnYesText : styles.adjustmentBtnNoText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.adjustmentBtnNo} onPress={() => setRepSuggestion(null)}>
              <Text style={styles.adjustmentBtnNoText}>DISMISS</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      {lastAdjustment ? (
        <View style={styles.adjustmentToast}>
          <Text style={styles.adjustmentText}>
            {`${lastAdjustment.exerciseName} scaled to ${lastAdjustment.newWeight} for ${lastAdjustment.count} future workout${lastAdjustment.count > 1 ? 's' : ''}`}
          </Text>
        </View>
      ) : null}
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
                  <Text style={styles.blockType}>{
                    isAmrap
                      ? `AMRAP${block.time_cap ? ` ${block.time_cap}` : ''}`
                      : `${block.type || ''}${block.time_cap ? ` \u2022 ${block.time_cap}` : ''}`
                  }</Text>
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
                      onRepDropOff={(data) => {
                        const isCompound = /bench|squat|deadlift|row|press|clean|jerk|snatch/i.test(data.exerciseName);
                        const avgReps = Math.round(data.actualReps.reduce((a, b) => a + b, 0) / data.actualReps.length);
                        const weightNum = parseFloat(data.weight) || 0;
                        const reducedWeight = `${Math.round((weightNum * 0.9) / 5) * 5} lb`;
                        const reducedReps = Math.max(3, data.targetReps - 2);

                        if (isCompound) {
                          setRepSuggestion({
                            exerciseName: data.exerciseName,
                            exerciseId: data.exerciseId,
                            planExerciseId: data.planExerciseId,
                            message: `You hit ${data.actualReps.join('/')} on ${data.exerciseName} at ${data.weight} (target: ${data.targetSets}x${data.targetReps}).`,
                            options: [
                              { label: `Drop to ${data.targetSets}x${reducedReps} at ${data.weight}`, type: 'reduce_reps', newReps: reducedReps },
                              { label: `Reduce to ${reducedWeight}, keep ${data.targetSets}x${data.targetReps}`, type: 'reduce_weight', newWeight: reducedWeight },
                            ],
                          });
                        } else {
                          setRepSuggestion({
                            exerciseName: data.exerciseName,
                            exerciseId: data.exerciseId,
                            planExerciseId: data.planExerciseId,
                            message: `${data.actualReps.join('/')} on ${data.exerciseName} at ${data.weight} (target: ${data.targetSets}x${data.targetReps}). Looks a bit heavy.`,
                            options: [
                              { label: `Adjust to ${reducedWeight}`, type: 'reduce_weight', newWeight: reducedWeight },
                            ],
                          });
                        }
                      }}
                    />
                  ))}

                  {/* WOD Timer */}
                  {isAmrap ? (
                    <WodTimer
                      type={/emom/i.test(block.name || '') || /emom/i.test(block.type || '') ? 'EMOM' : /amrap/i.test(block.type || '') ? 'AMRAP' : 'FOR TIME'}
                      timeCap={block.time_cap}
                      onRoundsChange={(roundCount) => {
                        saveAmrapRounds(block.id, `${roundCount}`);
                      }}
                      onComplete={({ elapsed, rounds: roundCount }) => {
                        saveAmrapRounds(block.id, `${roundCount}`);
                        console.log(`[WOD] Completed: ${roundCount} rounds in ${elapsed}s`);
                      }}
                    />
                  ) : null}

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

      {/* AI Coach button moved to global App.js — available on all screens */}
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════
// Exercise Row Component with logging
// ═══════════════════════════════════════════════════════════════

const NO_GIF_IDS = new Set([
  // Core holds/bodyweight with no match
  'plank', 'plank_to_pushup', 'bird_dog', 'high_knees',
  // Gymnastics/obstacle
  'dead_hang', 'monkey_bars', 'rope_climb', 'wall_climb', 'handstand_push_ups',
  // Conditioning without match
  'wall_balls', 'ball_slams', 'battle_ropes', 'broad_jump', 'double_unders',
  'burpee_box_jumps', 'assault_bike', 'rowing_machine',
  // Stretches/warmup/cooldown
  'samson_stretch', 'dynamic_stretching', 'pvc_pass_throughs', 'lunge_matrix',
  'hip_flexor_stretch', 'pigeon_pose', 'hamstring_stretch', 'shoulder_stretch',
  'thoracic_rotation', 'a_skips', 'easy_jog', 'strides', 'push_up_to_t',
  'cossack_squats',
  // Carries
  'suitcase_carry', 'kb_suitcase_carry', 'kb_carry',
  'overhead_carry', 'overhead_kb_carry', 'sandbag_carry', 'bucket_carry',
  'plate_carry', 'db_farmer_walk', 'spear_throw', 'plate_pinch',
  // Cable/other without match
  'cable_woodchop', 'cable_crunch', 'cable_fly', 'pallof_press', 'ab_wheel',
  'close_grip_lat_pulldown', 'chest_supported_row', 'single_arm_cable_row',
  'incline_machine_press', 'machine_chest_press',
  'band_assisted_pull_ups',
  // DB exercises without match
  'db_thrusters', 'db_snatches', 'db_clean_press', 'db_hang_clean',
  'db_hip_thrust', 'db_swing', 'db_good_morning', 'db_floor_press', 'db_seal_row',
  'overhead_tricep_ext', 'single_leg_glute_bridge',
  // KB without match
  'kb_clean_press', 'kb_snatch',
  // Olympic without match
  'push_jerk', 'snatch', 'clean_and_jerk', 'hang_clean',
  // Runs
  'easy_run', 'interval_run', 'sprint_intervals', 'tempo_run', 'long_run',
  'fartlek', 'run_400m',
  // Other
  'tire_flip', 'sled_push', 'sled_pull', 'toes_to_bar',
  'pistol_squats', 'floor_press',
  // Rehab without GIF
  'tibialis_raise', 'toe_walks', 'heel_walks',
  'quad_stretch', 'knee_circles', 'wall_sit', 'terminal_knee_ext', 'banded_lateral_walk',
  'hip_90_90', 'clam_shells', 'fire_hydrants', 'adductor_stretch',
  'band_pull_apart', 'shoulder_int_rotation', 'wall_angels', 'arm_circles', 'chest_doorway_stretch',
  'cat_cow', 'child_pose', 'cobra_stretch', 'superman_hold', 'lat_stretch',
  'wrist_flexor_stretch',
]);

function ExerciseRow({ exercise, blockColor, onToggle, onLogChange, onLongPress, onNamePress, onRepDropOff }) {
  const isDone = !!exercise.is_completed;
  const [isExpanded, setIsExpanded] = useState(false);
  const name = String(exercise.name || 'Exercise');
  const sets = String(exercise.sets || '');
  const weight = exercise.weight ? String(exercise.weight) : '';
  const rest = exercise.rest ? String(exercise.rest) : '';
  const swapped = exercise.swapped_from ? ' (swapped)' : '';

  // Parse target reps and sets from prescribed (e.g., "4x10" → 4 sets of 10)
  const targetReps = parseInt((sets.match(/x(\d+)/) || [])[1]) || 0;
  const targetSets = parseInt(sets) || 1;

  // Parse existing per-set data from actual_reps (e.g., "10,9,9,7")
  const existingReps = (exercise.actual_reps || '').split(',').map(r => r.trim()).filter(Boolean);
  const [setData, setSetData] = useState(() => {
    return Array.from({ length: Math.max(targetSets, 1) }, (_, i) => ({
      reps: existingReps[i] || '',
      weight: exercise.actual_weight || weight || '',
    }));
  });

  // Sync set data back to the exercise log as comma-separated values
  const syncToLog = (updatedSets) => {
    const repsStr = updatedSets.map(s => s.reps).filter(Boolean).join(',');
    const weightStr = updatedSets[0]?.weight || '';
    onLogChange('reps', repsStr);
    onLogChange('weight', weightStr);

    // Check for rep drop-off
    if (targetReps > 0 && onRepDropOff) {
      const repNums = updatedSets.map(s => parseInt(s.reps)).filter(r => !isNaN(r));
      // Only trigger after ALL sets are logged
      if (repNums.length >= targetSets) {
        const missedSets = repNums.filter(r => r < targetReps - 1).length;
        const lastSet = repNums[repNums.length - 1];
        const lastSetDrop = lastSet / targetReps;
        if (missedSets >= 2 || lastSetDrop < 0.75) {
          onRepDropOff({
            exerciseName: name, exerciseId: exercise.exercise_id,
            planExerciseId: exercise.id, targetReps, targetSets,
            actualReps: repNums, weight: exercise.weight,
          });
        }
      }
    }
  };

  const updateSet = (index, field, value) => {
    const updated = [...setData];
    updated[index] = { ...updated[index], [field]: value };
    setSetData(updated);
  };

  return (
    <View>
      <TouchableOpacity
        style={[
          styles.exerciseRow,
          { borderLeftColor: isDone ? 'rgba(255,255,255,0.08)' : blockColor },
          isDone ? styles.exerciseRowDone : null,
        ]}
        onPress={() => setIsExpanded(!isExpanded)}
        onLongPress={onLongPress}
      >
        {/* Checkbox — tap to complete */}
        <TouchableOpacity
          style={[styles.checkbox, isDone ? { backgroundColor: blockColor, borderColor: 'transparent' } : null]}
          onPress={onToggle}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {isDone ? <Text style={styles.checkIcon}>{'\u2713'}</Text> : null}
        </TouchableOpacity>

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

        {/* GIF/Demo button — hidden for exercises without GIFs */}
        {!NO_GIF_IDS.has(exercise.exercise_id) ? (
          <TouchableOpacity style={styles.demoBtn} onPress={onNamePress}>
            <Text style={styles.demoBtnText}>GIF</Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>

      {/* Per-set rows — shown when expanded (tap exercise row to expand) */}
      {isExpanded ? (
        <View style={styles.setLogContainer}>
          {setData.map((s, i) => {
            const repNum = parseInt(s.reps);
            const hitTarget = !isNaN(repNum) && repNum >= targetReps;
            const missed = !isNaN(repNum) && repNum < targetReps - 1;
            return (
              <View key={i} style={styles.setRow}>
                <Text style={styles.setLabel}>{`SET ${i + 1}`}</Text>
                <TextInput
                  style={[styles.setInput, hitTarget && styles.setInputHit, missed && styles.setInputMiss]}
                  placeholder={`${targetReps}`}
                  placeholderTextColor="rgba(255,255,255,0.15)"
                  keyboardType="number-pad"
                  defaultValue={s.reps}
                  onEndEditing={(e) => {
                    updateSet(i, 'reps', e.nativeEvent.text);
                    // Sync after last set
                    const updated = [...setData];
                    updated[i] = { ...updated[i], reps: e.nativeEvent.text };
                    syncToLog(updated);
                  }}
                />
                <Text style={styles.setDivider}>@</Text>
                <TextInput
                  style={styles.setInput}
                  placeholder={weight.replace(' lb', '')}
                  placeholderTextColor="rgba(255,255,255,0.15)"
                  keyboardType="number-pad"
                  defaultValue={s.weight.replace(' lb', '')}
                  onEndEditing={(e) => {
                    updateSet(i, 'weight', e.nativeEvent.text);
                    const updated = [...setData];
                    updated[i] = { ...updated[i], weight: e.nativeEvent.text };
                    syncToLog(updated);
                  }}
                />
                <Text style={styles.setUnit}>lb</Text>
              </View>
            );
          })}
          {/* Notes row */}
          <TextInput
            style={styles.setNoteInput}
            placeholder="Notes..."
            placeholderTextColor="rgba(255,255,255,0.15)"
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
  adjustmentPrompt: {
    backgroundColor: 'rgba(255,65,54,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,65,54,0.3)',
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 2,
    borderRadius: 10,
    padding: 14,
  },
  adjustmentPromptTitle: {
    color: '#FF4136',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  adjustmentPromptText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  adjustmentPromptSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  adjustmentButtons: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  adjustmentBtnYes: {
    flex: 1,
    backgroundColor: 'rgba(1,255,112,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(1,255,112,0.3)',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  adjustmentBtnYesText: {
    color: '#01FF70',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  adjustmentBtnNo: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  adjustmentBtnNoText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  // Per-set logging
  setLogContainer: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    marginHorizontal: 12,
    marginTop: -2,
    marginBottom: 4,
    borderRadius: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  setLabel: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 1,
    width: 42,
  },
  setInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'monospace',
    width: 55,
    textAlign: 'center',
  },
  setInputHit: {
    borderColor: 'rgba(1,255,112,0.3)',
  },
  setInputMiss: {
    borderColor: 'rgba(255,65,54,0.3)',
  },
  setDivider: {
    color: 'rgba(255,255,255,0.15)',
    fontSize: 12,
    marginHorizontal: 6,
  },
  setUnit: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    fontFamily: 'monospace',
    marginLeft: 4,
  },
  setNoteInput: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 4,
  },

  adjustmentToast: {
    backgroundColor: 'rgba(1,255,112,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(1,255,112,0.25)',
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 2,
    borderRadius: 8,
    padding: 10,
  },
  adjustmentText: {
    color: '#01FF70',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
    textAlign: 'center',
    letterSpacing: 0.3,
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
