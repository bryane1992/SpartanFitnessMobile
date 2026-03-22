import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useWorkoutStore from '../store/useWorkoutStore';

const PHASE_LABELS = {
  foundation: 'FND',
  build: 'BLD',
  peak: 'PKE',
  race_prep: 'FIN',
};

export default function ProgressionPlan({ navigation }) {
  const {
    planPhases,
    planDays,
    totalWeeks,
    currentPlanId,
    planStartDate,
    planEndDate,
    loadPlanOverview,
    loadWorkoutForDate,
  } = useWorkoutStore();

  const [viewMode, setViewMode] = useState('week'); // 'week' | 'month' | 'phase'
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      await loadPlanOverview();
      // Find current week
      const today = new Date().toISOString().split('T')[0];
      const todayDay = planDays.find(d => d.date === today);
      if (todayDay) {
        setSelectedWeek(todayDay.week_number);
      } else {
        setSelectedWeek(1);
      }
      setIsLoaded(true);
    };
    load();
  }, [currentPlanId]);

  // Update selected week when planDays changes
  useEffect(() => {
    if (planDays.length > 0 && !selectedWeek) {
      const today = new Date().toISOString().split('T')[0];
      const todayDay = planDays.find(d => d.date === today);
      setSelectedWeek(todayDay?.week_number || 1);
    }
  }, [planDays]);

  if (!currentPlanId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No Plan Yet</Text>
          <Text style={styles.emptySub}>Complete onboarding to generate your custom workout plan!</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isLoaded || planDays.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#FF4136" />
          <Text style={styles.loadingText}>Loading plan...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Computed data
  const today = new Date().toISOString().split('T')[0];
  const completedDays = planDays.filter(d => d.is_completed && !d.is_rest_day).length;
  const trainingDays = planDays.filter(d => !d.is_rest_day).length;
  const completionPct = trainingDays > 0 ? Math.round((completedDays / trainingDays) * 100) : 0;

  const weeksArray = [];
  for (let w = 1; w <= totalWeeks; w++) {
    weeksArray.push(w);
  }

  const weekDays = planDays.filter(d => d.week_number === selectedWeek);
  const currentPhase = planPhases.find(p => selectedWeek >= p.startWeek && selectedWeek <= p.endWeek);

  const handleDayPress = (day) => {
    if (!day.is_rest_day) {
      loadWorkoutForDate(day.date);
      navigation.navigate('Workout');
    }
  };

  // ===============================================================
  // Phase Timeline
  // ===============================================================

  const renderPhaseTimeline = () => (
    <View style={styles.timeline}>
      <View style={styles.timelineBar}>
        {planPhases.map((phase, idx) => {
          const widthPct = (phase.totalWeeks / totalWeeks) * 100;
          return (
            <TouchableOpacity
              key={phase.phase}
              style={[styles.timelineSegment, { width: `${widthPct}%`, backgroundColor: phase.color }]}
              onPress={() => setSelectedWeek(phase.startWeek)}
            >
              <Text style={styles.timelineLabel} numberOfLines={1}>
                {PHASE_LABELS[phase.phase] || phase.phase.substring(0, 3).toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {/* Current position indicator */}
      <View style={styles.timelineLabels}>
        {planPhases.map(phase => {
          const widthPct = (phase.totalWeeks / totalWeeks) * 100;
          return (
            <View key={phase.phase} style={{ width: `${widthPct}%` }}>
              <Text style={[styles.timelinePhaseName, { color: phase.color }]} numberOfLines={1}>
                {phase.name}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );

  // ===============================================================
  // Stats Bar
  // ===============================================================

  const renderStats = () => (
    <View style={styles.statsRow}>
      <View style={styles.statBox}>
        <Text style={styles.statValue}>{completedDays}</Text>
        <Text style={styles.statLabel}>Done</Text>
      </View>
      <View style={styles.statBox}>
        <Text style={styles.statValue}>{trainingDays - completedDays}</Text>
        <Text style={styles.statLabel}>Left</Text>
      </View>
      <View style={styles.statBox}>
        <Text style={styles.statValue}>{completionPct}%</Text>
        <Text style={styles.statLabel}>Progress</Text>
      </View>
      <View style={styles.statBox}>
        <Text style={styles.statValue}>{totalWeeks}</Text>
        <Text style={styles.statLabel}>Weeks</Text>
      </View>
    </View>
  );

  // ===============================================================
  // Week Selector
  // ===============================================================

  const renderWeekSelector = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.weekScroll}>
      {weeksArray.map(w => {
        const phase = planPhases.find(p => w >= p.startWeek && w <= p.endWeek);
        const isCurrentWeek = w === selectedWeek;
        const weekCompleted = planDays
          .filter(d => d.week_number === w && !d.is_rest_day)
          .every(d => d.is_completed);

        return (
          <TouchableOpacity
            key={w}
            style={[
              styles.weekPill,
              isCurrentWeek && { borderColor: phase?.color || '#FF4136' },
              weekCompleted && styles.weekPillCompleted,
            ]}
            onPress={() => setSelectedWeek(w)}
          >
            <Text style={[styles.weekPillText, isCurrentWeek && { color: phase?.color || '#FF4136' }]}>
              W{w}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  // ===============================================================
  // Week Detail View
  // ===============================================================

  const renderWeekDetail = () => {
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
      <View style={styles.weekDetail}>
        <View style={styles.weekHeader}>
          <Text style={styles.weekTitle}>
            Week {selectedWeek}
          </Text>
          <Text style={[styles.weekPhase, { color: currentPhase?.color }]}>
            {currentPhase?.name}
          </Text>
        </View>

        {weekDays.map(day => {
          const dayName = dayNames[day.day_of_week];
          const isToday = day.date === today;

          return (
            <TouchableOpacity
              key={day.id}
              style={[
                styles.dayCard,
                isToday && styles.dayCardToday,
                !!day.is_completed && styles.dayCardCompleted,
              ]}
              onPress={() => handleDayPress(day)}
              disabled={!!day.is_rest_day}
            >
              <View style={styles.dayCardLeft}>
                <Text style={[styles.dayName, isToday && styles.dayNameToday]}>
                  {dayName}
                </Text>
                <Text style={styles.dayDate}>{day.date.slice(5)}</Text>
              </View>

              <View style={styles.dayCardCenter}>
                <Text style={styles.dayTitle} numberOfLines={1}>
                  {day.title}
                </Text>
                {!day.is_rest_day ? (
                  <Text style={styles.dayPhase}>{day.focus}</Text>
                ) : null}
              </View>

              <View style={styles.dayCardRight}>
                {day.is_completed ? (
                  <Text style={styles.dayStatusCompleted}>{'\u2713'}</Text>
                ) : day.is_rest_day ? (
                  <Text style={styles.dayStatus}>{'\u2014'}</Text>
                ) : isToday ? (
                  <Text style={styles.dayStatusToday}>{'\u2022'}</Text>
                ) : (
                  <Text style={styles.dayStatus}>{'\u25CB'}</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // ===============================================================
  // Main Render
  // ===============================================================

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Phase Timeline */}
        {renderPhaseTimeline()}

        {/* Stats */}
        {renderStats()}

        {/* Progress Bar */}
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${completionPct}%` }]} />
          </View>
        </View>

        {/* Week Selector */}
        {renderWeekSelector()}

        {/* Week Detail */}
        {renderWeekDetail()}

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
  },
  emptySub: {
    color: '#666',
    fontSize: 14,
    marginTop: 10,
    textAlign: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 15,
  },
  // Timeline
  timeline: {
    padding: 15,
    paddingBottom: 5,
  },
  timelineBar: {
    flexDirection: 'row',
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
  },
  timelineSegment: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  timelineLabels: {
    flexDirection: 'row',
    marginTop: 4,
  },
  timelinePhaseName: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 6,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    color: '#666',
    fontSize: 10,
    marginTop: 3,
    fontWeight: '600',
  },
  // Progress
  progressBarContainer: {
    paddingHorizontal: 15,
    marginBottom: 10,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#222',
    borderRadius: 3,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FF4136',
    borderRadius: 3,
  },
  // Week selector
  weekScroll: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  weekPill: {
    backgroundColor: '#1A1A1A',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginRight: 6,
    borderWidth: 2,
    borderColor: '#222',
  },
  weekPillCompleted: {
    backgroundColor: '#1A2A1A',
  },
  weekPillText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
  },
  // Week detail
  weekDetail: {
    padding: 12,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 5,
  },
  weekTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  weekPhase: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  dayCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222',
  },
  dayCardToday: {
    borderColor: '#FF4136',
    backgroundColor: '#1F0A0A',
  },
  dayCardCompleted: {
    opacity: 0.6,
  },
  dayCardLeft: {
    width: 45,
    alignItems: 'center',
  },
  dayName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  dayNameToday: {
    color: '#FF4136',
  },
  dayDate: {
    color: '#666',
    fontSize: 10,
    marginTop: 2,
  },
  dayCardCenter: {
    flex: 1,
    marginLeft: 12,
  },
  dayTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  dayPhase: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  dayCardRight: {
    width: 30,
    alignItems: 'center',
  },
  dayStatus: {
    fontSize: 18,
    color: '#666',
  },
  dayStatusCompleted: {
    fontSize: 18,
    color: '#4CAF50',
    fontWeight: '700',
  },
  dayStatusToday: {
    fontSize: 18,
    color: '#FF4136',
    fontWeight: '700',
  },
});
