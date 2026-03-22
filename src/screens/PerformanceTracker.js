import React, { useEffect, useState, useCallback } from 'react';
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
import usePerformanceStore from '../store/usePerformanceStore';

const PHASE_COLORS = {
  foundation: '#FF4136',
  build: '#FF851B',
  peak: '#FFDC00',
  'race prep': '#01FF70',
};

const RUN_TYPE_COLORS = {
  INTERVALS: '#FF4136',
  TEMPO: '#FF851B',
  FARTLEK: '#FFDC00',
  LONG_RUN: '#0074D9',
  EASY: '#01FF70',
  RACE_PACE: '#B10DC9',
};

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
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

  useEffect(() => {
    loadDashboard();
  }, []);

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
          <Text style={styles.headerTitle}>PERFORMANCE</Text>
          <Text style={styles.headerSub}>Track your progress</Text>
        </View>

        {/* Quick Stats Grid */}
        <View style={styles.statsGrid}>
          <StatCard label="WORKOUTS" value={String(completedWorkouts)} sub={`of ${totalWorkouts}`} color="#FF4136" />
          <StatCard label="RUNS" value={String(totalRuns)} sub={`${totalRunDistance.toFixed(1)} mi`} color="#0074D9" />
          <StatCard label="EXERCISES" value={String(exercisesLogged)} sub="logged" color="#FF851B" />
          <StatCard label="COMPLETION" value={`${completionRate}%`} sub="rate" color="#01FF70" />
        </View>

        {/* Weekly Progress */}
        {weeklyProgress.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>WEEKLY PROGRESS</Text>
            <View style={styles.weeklyContainer}>
              {weeklyProgress.map((week) => {
                const pct = week.total_days > 0 ? (week.completed_days / week.total_days) * 100 : 0;
                const phaseColor = PHASE_COLORS[week.phase?.toLowerCase()] || '#FF4136';
                return (
                  <View key={week.week_number} style={styles.weekBar}>
                    <View style={styles.weekBarTrack}>
                      <View style={[styles.weekBarFill, { height: `${pct}%`, backgroundColor: phaseColor }]} />
                    </View>
                    <Text style={styles.weekLabel}>{`W${week.week_number}`}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Personal Records */}
        <View style={styles.section}>
          <TouchableOpacity onPress={() => setExpandedSection(expandedSection === 'prs' ? null : 'prs')}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>PERSONAL RECORDS</Text>
              <Text style={styles.sectionCount}>{personalRecords.length > 0 ? String(personalRecords.length) : '--'}</Text>
            </View>
          </TouchableOpacity>
          {personalRecords.length === 0 ? (
            <Text style={styles.emptyText}>Log exercises with weight to track PRs</Text>
          ) : (
            personalRecords.slice(0, expandedSection === 'prs' ? 20 : 5).map((pr) => (
              <TouchableOpacity
                key={pr.exercise_id}
                style={styles.prRow}
                onPress={() => handleExerciseTap(pr.exercise_id)}
              >
                <View style={[styles.prBorder, { backgroundColor: '#FF4136' }]} />
                <View style={styles.prContent}>
                  <Text style={styles.prName}>{String(pr.exercise_name || '')}</Text>
                  <Text style={styles.prDate}>{String(pr.date || '')}</Text>
                </View>
                <Text style={styles.prWeight}>{`${pr.best_weight} lbs`}</Text>
              </TouchableOpacity>
            ))
          )}
          {personalRecords.length > 5 && expandedSection !== 'prs' ? (
            <TouchableOpacity onPress={() => setExpandedSection('prs')}>
              <Text style={styles.viewAll}>VIEW ALL</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Inline Exercise History (when a PR is tapped) */}
        {selectedExerciseId && selectedExerciseHistory.length > 0 ? (
          <View style={styles.exerciseDetail}>
            <View style={styles.exerciseDetailHeader}>
              <Text style={styles.exerciseDetailTitle}>WEIGHT PROGRESSION</Text>
              <TouchableOpacity onPress={clearExerciseHistory}>
                <Text style={styles.closeBtn}>CLOSE</Text>
              </TouchableOpacity>
            </View>
            {isLoadingExercise ? (
              <ActivityIndicator size="small" color="#FF4136" />
            ) : (
              selectedExerciseHistory.map((entry, i) => (
                <View key={i} style={styles.historyRow}>
                  <Text style={styles.historyDate}>{String(entry.date || '')}</Text>
                  <Text style={styles.historyWeight}>{String(entry.actual_weight || '--')}</Text>
                  <Text style={styles.historyReps}>{String(entry.actual_reps || entry.sets || '')}</Text>
                  {entry.notes ? <Text style={styles.historyNote}>{String(entry.notes)}</Text> : null}
                </View>
              ))
            )}
          </View>
        ) : null}

        {/* Biggest Gains */}
        {biggestGains.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>BIGGEST GAINS</Text>
            {biggestGains.map((g) => (
              <View key={g.exercise_id} style={styles.gainRow}>
                <View style={[styles.prBorder, { backgroundColor: '#01FF70' }]} />
                <View style={styles.gainContent}>
                  <Text style={styles.gainName}>{String(g.exercise_name)}</Text>
                  <Text style={styles.gainRange}>{`${g.from} lbs  -->  ${g.to} lbs`}</Text>
                </View>
                <Text style={styles.gainAmount}>{`+${g.gain}`}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Run History */}
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
                  <View style={[styles.prBorder, { backgroundColor: typeColor }]} />
                  <View style={styles.runContent}>
                    <Text style={[styles.runType, { color: typeColor }]}>{String(run.run_type || '').replace('_', ' ')}</Text>
                    <Text style={styles.runDate}>{String(run.date || '')}</Text>
                  </View>
                  <View style={styles.runStats}>
                    <Text style={styles.runStat}>{`${run.total_distance.toFixed(2)} mi`}</Text>
                    <Text style={styles.runStatSub}>{formatTime(run.total_time)}</Text>
                  </View>
                  <View style={styles.runPace}>
                    <Text style={styles.runStat}>{run.avg_pace > 0 ? `${run.avg_pace.toFixed(1)}` : '--'}</Text>
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

        {/* Exercise Search */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>EXERCISE HISTORY</Text>
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
              style={[
                styles.searchRow,
                selectedExerciseId === ex.id ? styles.searchRowActive : null,
              ]}
              onPress={() => handleExerciseTap(ex.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.searchName}>{String(ex.name)}</Text>
                <Text style={styles.searchMeta}>{`${String(ex.muscle_group || '')} / ${String(ex.category || '')}`}</Text>
              </View>
              <Text style={styles.searchArrow}>{selectedExerciseId === ex.id ? '\u25BC' : '\u25B6'}</Text>
            </TouchableOpacity>
          ))}

          {/* Inline history for searched exercise */}
          {selectedExerciseId && exerciseSearchResults.some(e => e.id === selectedExerciseId) && selectedExerciseHistory.length > 0 ? (
            <View style={styles.exerciseDetail}>
              {isLoadingExercise ? (
                <ActivityIndicator size="small" color="#FF4136" />
              ) : (
                selectedExerciseHistory.map((entry, i) => (
                  <View key={i} style={styles.historyRow}>
                    <Text style={styles.historyDate}>{String(entry.date || '')}</Text>
                    <Text style={styles.historyWeight}>{String(entry.actual_weight || '--')}</Text>
                    <Text style={styles.historyReps}>{String(entry.actual_reps || entry.sets || '')}</Text>
                    {entry.notes ? <Text style={styles.historyNote}>{String(entry.notes)}</Text> : null}
                  </View>
                ))
              )}
            </View>
          ) : null}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════
// Stat Card Component
// ═══════════════════════════════════════════════════════════════

function StatCard({ label, value, sub, color }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statAccent, { backgroundColor: color }]} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontFamily: 'monospace',
    marginTop: 12,
  },

  // Header
  header: {
    padding: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2,
  },
  headerSub: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    fontFamily: 'monospace',
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  statCard: {
    width: '48%',
    margin: '1%',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 14,
    overflow: 'hidden',
  },
  statAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '900',
    fontFamily: 'monospace',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 4,
  },
  statSub: {
    color: 'rgba(255,255,255,0.15)',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2,
  },

  // Sections
  section: {
    marginHorizontal: 12,
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  sectionCount: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 10,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.15)',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  viewAll: {
    color: '#FF4136',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 10,
    fontFamily: 'monospace',
  },

  // Weekly Progress
  weeklyContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 80,
  },
  weekBar: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  weekBarTrack: {
    width: 8,
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 4,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  weekBarFill: {
    width: '100%',
    borderRadius: 4,
    minHeight: 2,
  },
  weekLabel: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 7,
    fontFamily: 'monospace',
    marginTop: 4,
  },

  // Personal Records
  prRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  prBorder: {
    width: 3,
    height: '100%',
    minHeight: 30,
    borderRadius: 2,
    marginRight: 10,
  },
  prContent: {
    flex: 1,
  },
  prName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  prDate: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  prWeight: {
    color: '#FF4136',
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'monospace',
  },

  // Biggest Gains
  gainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  gainContent: {
    flex: 1,
  },
  gainName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  gainRange: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  gainAmount: {
    color: '#01FF70',
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'monospace',
  },

  // Run History
  runRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  runContent: {
    flex: 1,
  },
  runType: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  runDate: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  runStats: {
    alignItems: 'flex-end',
    marginRight: 12,
  },
  runPace: {
    alignItems: 'flex-end',
    minWidth: 45,
  },
  runStat: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  runStatSub: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 9,
    fontFamily: 'monospace',
  },

  // Exercise Search
  searchInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 13,
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  searchRowActive: {
    backgroundColor: 'rgba(255,65,54,0.05)',
  },
  searchName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  searchMeta: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  searchArrow: {
    color: 'rgba(255,255,255,0.15)',
    fontSize: 10,
  },

  // Exercise Detail (inline history)
  exerciseDetail: {
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: 'rgba(255,65,54,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,65,54,0.1)',
    borderRadius: 8,
    padding: 10,
  },
  exerciseDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  exerciseDetailTitle: {
    color: '#FF4136',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
  closeBtn: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontFamily: 'monospace',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  historyDate: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontFamily: 'monospace',
    width: 85,
  },
  historyWeight: {
    color: '#FF4136',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
    width: 65,
  },
  historyReps: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontFamily: 'monospace',
    flex: 1,
  },
  historyNote: {
    color: 'rgba(255,255,255,0.15)',
    fontSize: 9,
    fontStyle: 'italic',
    flex: 1,
  },
});
