import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import usePerformanceStore from '../store/usePerformanceStore';

const PHASE_COLORS = {
  foundation: '#FF4136',
  build: '#FF851B',
  peak: '#FFDC00',
  'race prep': '#01FF70',
  race_prep: '#01FF70',
};

const RUN_TYPE_COLORS = {
  INTERVALS: '#FF4136',
  TEMPO: '#FF851B',
  FARTLEK: '#FFDC00',
  LONG_RUN: '#0074D9',
  EASY: '#01FF70',
  RACE_PACE: '#B10DC9',
};

// Format per-set reps for display: "10,9,9,7" → "10/9/9/7" with target comparison
function formatRepsDisplay(actualReps, prescribedSets) {
  if (!actualReps) return String(prescribedSets || '');
  const reps = String(actualReps);
  if (reps.includes(',')) {
    // Per-set data — show as slash-separated
    return reps.split(',').map(r => r.trim()).join('/');
  }
  return reps;
}

function formatTime(seconds) {
  if (!seconds || seconds <= 0) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function PerformanceTracker() {
  const {
    completedWorkouts,
    totalWorkouts,
    completionRate,
    exercisesLogged,
    totalRuns,
    totalRunDistance,
    personalRecords,
    runHistory,
    biggestGains,
    weeklyProgress,
    weekOverWeekLifts,
    runProgression,
    exerciseSearchResults,
    selectedExerciseId,
    selectedExerciseHistory,
    isLoading,
    isLoadingExercise,
    loadDashboard,
    searchExercises,
    loadExerciseHistory,
    clearExerciseHistory,
  } = usePerformanceStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSection, setExpandedSection] = useState(null);
  const [activeTab, setActiveTab] = useState('lifts'); // lifts, runs, prs

  // Reload stats every time the tab is focused
  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [])
  );

  const handleSearch = useCallback((text) => {
    setSearchQuery(text);
    searchExercises(text);
  }, []);

  const handleExerciseTap = (exerciseId) => {
    if (selectedExerciseId === exerciseId) {
      clearExerciseHistory();
    } else {
      loadExerciseHistory(exerciseId);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FF4136" />
          <Text style={styles.loadingText}>Loading stats...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>STATS</Text>
          <Text style={styles.headerSub}>Your progression at a glance</Text>
        </View>

        {/* Quick Stats Row */}
        <View style={styles.statsGrid}>
          <MiniStat value={String(completedWorkouts)} label="WORKOUTS" color="#FF4136" />
          <MiniStat value={`${totalRunDistance.toFixed(1)}`} label="MILES RUN" color="#0074D9" />
          <MiniStat value={String(exercisesLogged)} label="LOGGED" color="#FF851B" />
          <MiniStat value={`${completionRate}%`} label="COMPLETE" color="#01FF70" />
        </View>

        {/* Tab Selector */}
        <View style={styles.tabRow}>
          {['lifts', 'runs', 'prs'].map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'lifts' ? 'LIFTS' : tab === 'runs' ? 'RUNS' : 'PRs'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ═══ LIFTS TAB ═══ */}
        {activeTab === 'lifts' ? (
          <View>
            {/* Week vs Week Comparison */}
            {weekOverWeekLifts.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>THIS WEEK vs LAST WEEK</Text>
                {weekOverWeekLifts.map((lift) => (
                  <View key={lift.exercise_id} style={styles.liftCompareRow}>
                    <View style={styles.liftInfo}>
                      <Text style={styles.liftName}>{String(lift.exercise_name)}</Text>
                      <Text style={styles.liftWeights}>
                        {lift.lastWeek > 0 ? `${lift.lastWeek} lb` : '--'}{' \u2192 '}{lift.thisWeek > 0 ? `${lift.thisWeek} lb` : '--'}
                      </Text>
                    </View>
                    <View style={[styles.deltaChip, { backgroundColor: lift.delta > 0 ? 'rgba(1,255,112,0.1)' : lift.delta < 0 ? 'rgba(255,65,54,0.1)' : 'rgba(255,255,255,0.05)' }]}>
                      <Text style={[styles.deltaText, { color: lift.delta > 0 ? '#01FF70' : lift.delta < 0 ? '#FF4136' : 'rgba(255,255,255,0.3)' }]}>
                        {lift.delta > 0 ? `+${lift.delta}` : lift.delta === 0 ? '=' : `${lift.delta}`} lb
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>THIS WEEK vs LAST WEEK</Text>
                <Text style={styles.emptyText}>Complete exercises with logged weights to see comparisons</Text>
              </View>
            )}

            {/* Biggest Gains */}
            {biggestGains.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>BIGGEST STRENGTH GAINS</Text>
                {biggestGains.map((g) => (
                  <TouchableOpacity key={g.exercise_id} style={styles.gainRow} onPress={() => handleExerciseTap(g.exercise_id)}>
                    <View style={[styles.accentBar, { backgroundColor: '#01FF70' }]} />
                    <View style={styles.gainContent}>
                      <Text style={styles.gainName}>{String(g.exercise_name)}</Text>
                      <Text style={styles.gainRange}>{`${g.from} \u2192 ${g.to} lb`}</Text>
                    </View>
                    <Text style={styles.gainAmount}>{`+${g.gain} lb`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {/* Inline Exercise History */}
            {selectedExerciseId && selectedExerciseHistory.length > 0 && activeTab === 'lifts' ? (
              <View style={styles.historyPanel}>
                <View style={styles.historyPanelHeader}>
                  <Text style={styles.historyPanelTitle}>WEIGHT PROGRESSION</Text>
                  <TouchableOpacity onPress={clearExerciseHistory}>
                    <Text style={styles.closeBtn}>CLOSE</Text>
                  </TouchableOpacity>
                </View>
                {isLoadingExercise ? (
                  <ActivityIndicator size="small" color="#FF4136" />
                ) : (
                  selectedExerciseHistory.map((entry, i) => {
                    const repsDisplay = formatRepsDisplay(entry.actual_reps, entry.sets);
                    const targetReps = parseInt((entry.sets || '').match(/x(\d+)/)?.[1]) || 0;
                    const actualNums = (entry.actual_reps || '').split(',').map(r => parseInt(r.trim())).filter(r => !isNaN(r));
                    const allHit = targetReps > 0 && actualNums.length > 0 && actualNums.every(r => r >= targetReps);
                    const anyMissed = targetReps > 0 && actualNums.some(r => r < targetReps - 1);
                    return (
                      <View key={i} style={styles.historyRow}>
                        <Text style={styles.historyDate}>{entry.week_number ? `Wk${entry.week_number}` : String(entry.date || '').slice(5)}</Text>
                        <Text style={styles.historyWeight}>{String(entry.actual_weight || '--')}</Text>
                        <Text style={[styles.historyReps, allHit && { color: '#01FF70' }, anyMissed && { color: '#FF4136' }]}>{repsDisplay}</Text>
                        <Text style={styles.historyTarget}>{entry.sets || ''}</Text>
                      </View>
                    );
                  })
                )}
              </View>
            ) : null}

            {/* Weekly Progress */}
            {weeklyProgress.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>WEEKLY PROGRESS</Text>
                <View style={styles.weeklyGrid}>
                  {weeklyProgress.map((week) => {
                    const pct = week.total_days > 0 ? (week.completed_days / week.total_days) * 100 : 0;
                    const phaseColor = PHASE_COLORS[week.phase?.toLowerCase()] || '#FF4136';
                    return (
                      <View key={week.week_number} style={styles.weekCell}>
                        <View style={styles.weekBarTrack}>
                          <View style={[styles.weekBarFill, { height: `${Math.max(pct, 3)}%`, backgroundColor: phaseColor }]} />
                        </View>
                        <Text style={[styles.weekLabel, pct === 100 && { color: phaseColor }]}>{`W${week.week_number}`}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ═══ RUNS TAB ═══ */}
        {activeTab === 'runs' ? (
          <View>
            {/* Run Progression Chart */}
            {runProgression.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>RUN PROGRESSION</Text>
                <View style={styles.runChart}>
                  {runProgression.map((week, i) => {
                    const maxDist = Math.max(...runProgression.map(w => w.total_distance || 0), 1);
                    const barHeight = ((week.total_distance || 0) / maxDist) * 100;
                    return (
                      <View key={i} style={styles.runChartBar}>
                        <View style={styles.runBarTrack}>
                          <View style={[styles.runBarFill, { height: `${Math.max(barHeight, 3)}%` }]} />
                        </View>
                        <Text style={styles.runBarDist}>{(week.total_distance || 0).toFixed(1)}</Text>
                        <Text style={styles.runBarLabel}>{`W${week.week_num}`}</Text>
                      </View>
                    );
                  })}
                </View>
                {/* Pace trend */}
                <View style={styles.paceRow}>
                  {runProgression.length >= 2 ? (() => {
                    const first = runProgression[0];
                    const last = runProgression[runProgression.length - 1];
                    const paceDelta = (last.avg_pace || 0) - (first.avg_pace || 0);
                    return (
                      <>
                        <Text style={styles.paceTrend}>AVG PACE TREND</Text>
                        <Text style={[styles.paceValue, { color: paceDelta < 0 ? '#01FF70' : paceDelta > 0 ? '#FF4136' : '#fff' }]}>
                          {first.avg_pace > 0 ? `${first.avg_pace.toFixed(1)}` : '--'}{' \u2192 '}{last.avg_pace > 0 ? `${last.avg_pace.toFixed(1)}` : '--'} min/mi
                        </Text>
                      </>
                    );
                  })() : null}
                </View>
              </View>
            ) : (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>RUN PROGRESSION</Text>
                <Text style={styles.emptyText}>Complete runs to see your progression</Text>
              </View>
            )}

            {/* Recent Runs */}
            <View style={styles.section}>
              <TouchableOpacity onPress={() => setExpandedSection(expandedSection === 'runs' ? null : 'runs')}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>RECENT RUNS</Text>
                  <Text style={styles.sectionCount}>{totalRuns > 0 ? String(totalRuns) : '--'}</Text>
                </View>
              </TouchableOpacity>
              {runHistory.length === 0 ? (
                <Text style={styles.emptyText}>Complete a run to see history</Text>
              ) : (
                runHistory.slice(0, expandedSection === 'runs' ? 20 : 5).map((run) => {
                  const typeColor = RUN_TYPE_COLORS[run.run_type] || '#fff';
                  return (
                    <View key={run.id} style={styles.runRow}>
                      <View style={[styles.accentBar, { backgroundColor: typeColor }]} />
                      <View style={styles.runContent}>
                        <Text style={[styles.runType, { color: typeColor }]}>{String(run.run_type || '').replace('_', ' ')}</Text>
                        <Text style={styles.runDate}>{String(run.date || '')}</Text>
                      </View>
                      <View style={styles.runStats}>
                        <Text style={styles.runStatVal}>{`${run.total_distance.toFixed(2)} mi`}</Text>
                        <Text style={styles.runStatSub}>{formatTime(run.total_time)}</Text>
                      </View>
                      <View style={styles.runPace}>
                        <Text style={styles.runStatVal}>{run.avg_pace > 0 ? `${run.avg_pace.toFixed(1)}` : '--'}</Text>
                        <Text style={styles.runStatSub}>min/mi</Text>
                      </View>
                    </View>
                  );
                })
              )}
              {runHistory.length > 5 && expandedSection !== 'runs' ? (
                <TouchableOpacity onPress={() => setExpandedSection('runs')}>
                  <Text style={styles.viewAll}>VIEW ALL</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* ═══ PRs TAB ═══ */}
        {activeTab === 'prs' ? (
          <View>
            {/* All-Time PRs */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>ALL-TIME PERSONAL RECORDS</Text>
                <Text style={styles.sectionCount}>{personalRecords.length > 0 ? String(personalRecords.length) : '--'}</Text>
              </View>
              {personalRecords.length === 0 ? (
                <Text style={styles.emptyText}>Log exercises with weight to track PRs</Text>
              ) : (
                personalRecords.slice(0, expandedSection === 'prs' ? 30 : 10).map((pr) => (
                  <TouchableOpacity
                    key={pr.exercise_id}
                    style={styles.prRow}
                    onPress={() => handleExerciseTap(pr.exercise_id)}
                  >
                    <View style={[styles.accentBar, { backgroundColor: '#FF4136' }]} />
                    <View style={styles.prContent}>
                      <Text style={styles.prName}>{String(pr.exercise_name || '')}</Text>
                      <Text style={styles.prDate}>{String(pr.date || '')}</Text>
                    </View>
                    <View style={styles.prWeightBox}>
                      <Text style={styles.prWeight}>{`${pr.best_weight}`}</Text>
                      <Text style={styles.prWeightUnit}>lb</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
              {personalRecords.length > 10 && expandedSection !== 'prs' ? (
                <TouchableOpacity onPress={() => setExpandedSection('prs')}>
                  <Text style={styles.viewAll}>VIEW ALL {personalRecords.length} RECORDS</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Inline Exercise History */}
            {selectedExerciseId && selectedExerciseHistory.length > 0 && activeTab === 'prs' ? (
              <View style={styles.historyPanel}>
                <View style={styles.historyPanelHeader}>
                  <Text style={styles.historyPanelTitle}>WEIGHT PROGRESSION</Text>
                  <TouchableOpacity onPress={clearExerciseHistory}>
                    <Text style={styles.closeBtn}>CLOSE</Text>
                  </TouchableOpacity>
                </View>
                {isLoadingExercise ? (
                  <ActivityIndicator size="small" color="#FF4136" />
                ) : (
                  selectedExerciseHistory.map((entry, i) => {
                    const repsDisplay = formatRepsDisplay(entry.actual_reps, entry.sets);
                    const targetReps = parseInt((entry.sets || '').match(/x(\d+)/)?.[1]) || 0;
                    const actualNums = (entry.actual_reps || '').split(',').map(r => parseInt(r.trim())).filter(r => !isNaN(r));
                    const allHit = targetReps > 0 && actualNums.length > 0 && actualNums.every(r => r >= targetReps);
                    const anyMissed = targetReps > 0 && actualNums.some(r => r < targetReps - 1);
                    return (
                      <View key={i} style={styles.historyRow}>
                        <Text style={styles.historyDate}>{entry.week_number ? `Wk${entry.week_number}` : String(entry.date || '').slice(5)}</Text>
                        <Text style={styles.historyWeight}>{String(entry.actual_weight || '--')}</Text>
                        <Text style={[styles.historyReps, allHit && { color: '#01FF70' }, anyMissed && { color: '#FF4136' }]}>{repsDisplay}</Text>
                        <Text style={styles.historyTarget}>{entry.sets || ''}</Text>
                      </View>
                    );
                  })
                )}
              </View>
            ) : null}

            {/* Exercise Search */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>SEARCH EXERCISE HISTORY</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search exercises..."
                placeholderTextColor="rgba(255,255,255,0.2)"
                value={searchQuery}
                onChangeText={handleSearch}
              />
              {exerciseSearchResults.map((ex) => (
                <TouchableOpacity
                  key={ex.id}
                  style={[styles.searchRow, selectedExerciseId === ex.id ? styles.searchRowActive : null]}
                  onPress={() => handleExerciseTap(ex.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.searchName}>{String(ex.name)}</Text>
                    <Text style={styles.searchMeta}>{`${String(ex.muscle_group || '')} / ${String(ex.category || '')}`}</Text>
                  </View>
                  <Text style={styles.searchArrow}>{selectedExerciseId === ex.id ? '\u25BC' : '\u25B6'}</Text>
                </TouchableOpacity>
              ))}

              {selectedExerciseId && exerciseSearchResults.some(e => e.id === selectedExerciseId) && selectedExerciseHistory.length > 0 ? (
                <View style={styles.historyPanel}>
                  {isLoadingExercise ? (
                    <ActivityIndicator size="small" color="#FF4136" />
                  ) : (
                    selectedExerciseHistory.map((entry, i) => (
                      <View key={i} style={styles.historyRow}>
                        <Text style={styles.historyDate}>{String(entry.date || '')}</Text>
                        <Text style={styles.historyWeight}>{String(entry.actual_weight || '--')}</Text>
                        <Text style={styles.historyReps}>{formatRepsDisplay(entry.actual_reps, entry.sets)}</Text>
                      </View>
                    ))
                  )}
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════
// Mini Stat Component
// ═══════════════════════════════════════════════════════════════

function MiniStat({ value, label, color }) {
  return (
    <View style={styles.miniStat}>
      <Text style={[styles.miniStatValue, { color }]}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontFamily: 'monospace', marginTop: 12 },

  // Header
  header: { padding: 16, paddingBottom: 4 },
  headerTitle: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 3 },
  headerSub: { color: 'rgba(255,255,255,0.2)', fontSize: 11, fontFamily: 'monospace', marginTop: 2 },

  // Quick Stats
  statsGrid: { flexDirection: 'row', paddingHorizontal: 12, marginTop: 8, marginBottom: 4 },
  miniStat: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  miniStatValue: { fontSize: 22, fontWeight: '900', fontFamily: 'monospace' },
  miniStatLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 8, fontWeight: '700', letterSpacing: 1.2, marginTop: 2 },

  // Tabs
  tabRow: { flexDirection: 'row', marginHorizontal: 12, marginTop: 8, marginBottom: 4, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 3 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  tabActive: { backgroundColor: 'rgba(255,65,54,0.15)' },
  tabText: { color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  tabTextActive: { color: '#FF4136' },

  // Sections
  section: { marginHorizontal: 12, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  sectionCount: { color: 'rgba(255,255,255,0.2)', fontSize: 11, fontFamily: 'monospace', marginBottom: 10 },
  emptyText: { color: 'rgba(255,255,255,0.15)', fontSize: 12, fontStyle: 'italic', textAlign: 'center', paddingVertical: 16 },
  viewAll: { color: '#FF4136', fontSize: 10, fontWeight: '700', letterSpacing: 1, textAlign: 'center', marginTop: 10, fontFamily: 'monospace' },

  // Accent bar (left border indicator)
  accentBar: { width: 3, height: '100%', minHeight: 30, borderRadius: 2, marginRight: 10 },

  // Lift Comparison
  liftCompareRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  liftInfo: { flex: 1 },
  liftName: { color: '#fff', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  liftWeights: { color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  deltaChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  deltaText: { fontSize: 14, fontWeight: '800', fontFamily: 'monospace' },

  // Gains
  gainRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  gainContent: { flex: 1 },
  gainName: { color: '#fff', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  gainRange: { color: 'rgba(255,255,255,0.25)', fontSize: 10, fontFamily: 'monospace', marginTop: 2 },
  gainAmount: { color: '#01FF70', fontSize: 15, fontWeight: '800', fontFamily: 'monospace' },

  // Weekly Progress
  weeklyGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', minHeight: 80 },
  weekCell: { width: `${100 / 8}%`, alignItems: 'center', height: 80, justifyContent: 'flex-end' },
  weekBarTrack: { width: 6, flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden', justifyContent: 'flex-end' },
  weekBarFill: { width: '100%', borderRadius: 3, minHeight: 2 },
  weekLabel: { color: 'rgba(255,255,255,0.2)', fontSize: 7, fontFamily: 'monospace', marginTop: 3 },

  // Run Chart
  runChart: { flexDirection: 'row', alignItems: 'flex-end', height: 100, marginBottom: 8 },
  runChartBar: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  runBarTrack: { width: 10, flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 5, overflow: 'hidden', justifyContent: 'flex-end' },
  runBarFill: { width: '100%', borderRadius: 5, backgroundColor: '#0074D9', minHeight: 2 },
  runBarDist: { color: 'rgba(255,255,255,0.4)', fontSize: 8, fontFamily: 'monospace', marginTop: 2 },
  runBarLabel: { color: 'rgba(255,255,255,0.2)', fontSize: 7, fontFamily: 'monospace', marginTop: 1 },
  paceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  paceTrend: { color: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  paceValue: { fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },

  // Run History
  runRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  runContent: { flex: 1 },
  runType: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  runDate: { color: 'rgba(255,255,255,0.2)', fontSize: 10, fontFamily: 'monospace', marginTop: 2 },
  runStats: { alignItems: 'flex-end', marginRight: 12 },
  runPace: { alignItems: 'flex-end', minWidth: 45 },
  runStatVal: { color: '#fff', fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  runStatSub: { color: 'rgba(255,255,255,0.2)', fontSize: 9, fontFamily: 'monospace' },

  // PRs
  prRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  prContent: { flex: 1 },
  prName: { color: '#fff', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  prDate: { color: 'rgba(255,255,255,0.2)', fontSize: 10, fontFamily: 'monospace', marginTop: 2 },
  prWeightBox: { flexDirection: 'row', alignItems: 'baseline' },
  prWeight: { color: '#FF4136', fontSize: 18, fontWeight: '900', fontFamily: 'monospace' },
  prWeightUnit: { color: 'rgba(255,65,54,0.5)', fontSize: 10, fontWeight: '700', marginLeft: 2 },

  // History Panel
  historyPanel: { marginHorizontal: 12, marginTop: 4, marginBottom: 8, backgroundColor: 'rgba(255,65,54,0.03)', borderWidth: 1, borderColor: 'rgba(255,65,54,0.1)', borderRadius: 8, padding: 10 },
  historyPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  historyPanelTitle: { color: '#FF4136', fontSize: 10, fontWeight: '700', letterSpacing: 1, fontFamily: 'monospace' },
  closeBtn: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '700', letterSpacing: 0.5, fontFamily: 'monospace' },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  historyDate: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'monospace', width: 85 },
  historyWeight: { color: '#FF4136', fontSize: 13, fontWeight: '700', fontFamily: 'monospace', width: 65 },
  historyReps: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: 'monospace', flex: 1 },
  historyTarget: { color: 'rgba(255,255,255,0.15)', fontSize: 9, fontFamily: 'monospace', width: 40, textAlign: 'right' },

  // Exercise Search
  searchInput: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, color: '#fff', fontSize: 13, fontFamily: 'monospace', marginBottom: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  searchRowActive: { backgroundColor: 'rgba(255,65,54,0.05)' },
  searchName: { color: '#fff', fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  searchMeta: { color: 'rgba(255,255,255,0.2)', fontSize: 10, fontFamily: 'monospace', marginTop: 2 },
  searchArrow: { color: 'rgba(255,255,255,0.15)', fontSize: 10 },
});
