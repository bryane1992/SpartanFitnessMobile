import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { saveRunHistory } from '../data/database';

// Run type configurations with auto-segments
const RUN_CONFIGS = {
  INTERVALS: {
    name: 'INTERVAL RUN',
    segments: [
      { name: 'Warm-up', duration: 300, type: 'easy' },
      { name: 'Hard Run', duration: 120, type: 'hard', repeat: true },
      { name: 'Recovery', duration: 60, type: 'recovery', repeat: true },
      { name: 'Cool-down', duration: 300, type: 'easy' },
    ],
  },
  TEMPO: {
    name: 'TEMPO RUN',
    segments: [
      { name: 'Warm-up', duration: 300, type: 'easy' },
      { name: 'Tempo Run', duration: 1200, type: 'tempo' },
      { name: 'Cool-down', duration: 300, type: 'easy' },
    ],
  },
  FARTLEK: {
    name: 'FARTLEK RUN',
    segments: [
      { name: 'Warm-up', duration: 300, type: 'easy' },
      { name: 'Variable Pace', duration: 1500, type: 'fartlek' },
      { name: 'Cool-down', duration: 300, type: 'easy' },
    ],
  },
  LONG_RUN: {
    name: 'LONG RUN',
    segments: [
      { name: 'Steady Run', duration: 3600, type: 'steady' },
    ],
  },
  EASY: {
    name: 'EASY RUN',
    segments: [
      { name: 'Easy Run', duration: 1800, type: 'easy' },
    ],
  },
  RACE_PACE: {
    name: 'RACE PACE RUN',
    segments: [
      { name: 'Warm-up', duration: 300, type: 'easy' },
      { name: 'Race Pace', duration: 1500, type: 'hard' },
      { name: 'Cool-down', duration: 300, type: 'easy' },
    ],
  },
};

const SEGMENT_COLORS = {
  easy: '#01FF70',
  hard: '#FF4136',
  recovery: '#FFDC00',
  tempo: '#FF851B',
  fartlek: '#B10DC9',
  steady: '#0074D9',
};

export default function RunTracker() {
  // Run config state
  const [selectedRunType, setSelectedRunType] = useState('INTERVALS');
  const [rounds, setRounds] = useState(4);
  const [builtSegments, setBuiltSegments] = useState([]);

  // Tracking state
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(0);
  const [segmentTime, setSegmentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [completedSplits, setCompletedSplits] = useState([]);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [runComplete, setRunComplete] = useState(false);

  const locationSub = useRef(null);
  const lastPosition = useRef(null);
  const segmentDistance = useRef(0);
  const timerRef = useRef(null);

  // Build segment list when run type or rounds change
  useEffect(() => {
    buildSegments();
  }, [selectedRunType, rounds]);

  const buildSegments = () => {
    const config = RUN_CONFIGS[selectedRunType];
    if (!config) return;

    const segs = [];
    if (selectedRunType === 'INTERVALS') {
      // Warm-up
      segs.push({ ...config.segments[0] });
      // Repeated intervals
      for (let i = 0; i < rounds; i++) {
        segs.push({ ...config.segments[1], name: `Hard ${i + 1}/${rounds}`, round: i + 1 });
        segs.push({ ...config.segments[2], name: `Recovery ${i + 1}/${rounds}`, round: i + 1 });
      }
      // Cool-down
      segs.push({ ...config.segments[3] });
    } else {
      config.segments.forEach(seg => segs.push({ ...seg }));
    }
    setBuiltSegments(segs);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      stopGPS();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Timer
  useEffect(() => {
    if (isRunning && !isPaused) {
      timerRef.current = setInterval(() => {
        setTotalTime(t => t + 1);
        setSegmentTime(t => t + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRunning, isPaused]);

  // Auto-advance segment when time expires
  useEffect(() => {
    const seg = builtSegments[currentSegment];
    if (seg && segmentTime >= seg.duration && isRunning && !isPaused) {
      advanceSegment();
    }
  }, [segmentTime]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDistance = (miles) => miles.toFixed(2);

  const calculateDistance = (c1, c2) => {
    const R = 3959;
    const lat1 = c1.latitude * Math.PI / 180;
    const lat2 = c2.latitude * Math.PI / 180;
    const dLat = (c2.latitude - c1.latitude) * Math.PI / 180;
    const dLon = (c2.longitude - c1.longitude) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const startGPS = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Location access is required for run tracking.');
      return false;
    }

    locationSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 3 },
      (loc) => {
        if (lastPosition.current) {
          const dist = calculateDistance(lastPosition.current.coords, loc.coords);
          if (dist < 0.5) { // ignore GPS jumps > 0.5 mi
            setTotalDistance(d => d + dist);
            segmentDistance.current += dist;
          }
        }
        lastPosition.current = loc;
        setCurrentSpeed(loc.coords.speed ? loc.coords.speed * 2.237 : 0);
        setGpsAccuracy(loc.coords.accuracy);
      }
    );
    return true;
  };

  const stopGPS = () => {
    if (locationSub.current) {
      locationSub.current.remove();
      locationSub.current = null;
    }
  };

  const advanceSegment = useCallback(() => {
    const seg = builtSegments[currentSegment];
    if (!seg) return;

    // Log completed segment
    setCompletedSplits(prev => [...prev, {
      name: seg.name,
      type: seg.type,
      time: segmentTime,
      distance: segmentDistance.current,
      pace: segmentDistance.current > 0 ? (segmentTime / 60) / segmentDistance.current : 0,
    }]);

    // Vibrate to signal segment change
    Vibration.vibrate([0, 500, 200, 500]);

    // Reset segment tracking
    segmentDistance.current = 0;
    setSegmentTime(0);

    if (currentSegment < builtSegments.length - 1) {
      setCurrentSegment(s => s + 1);
    } else {
      finishRun();
    }
  }, [currentSegment, builtSegments, segmentTime]);

  const startRun = async () => {
    const gpsOk = await startGPS();
    if (!gpsOk) return;
    setIsRunning(true);
    setIsPaused(false);
    setRunComplete(false);
    setCurrentSegment(0);
    setSegmentTime(0);
    setTotalTime(0);
    setTotalDistance(0);
    setCompletedSplits([]);
    segmentDistance.current = 0;
    lastPosition.current = null;
    Vibration.vibrate(300);
  };

  const togglePause = () => {
    if (isPaused) {
      startGPS();
      Vibration.vibrate(200);
    } else {
      stopGPS();
      Vibration.vibrate([0, 100, 100, 100]);
    }
    setIsPaused(!isPaused);
  };

  const skipSegment = () => {
    advanceSegment();
  };

  const finishRun = async () => {
    // Capture final segment split before stopping
    const finalSplits = [...completedSplits];
    const seg = builtSegments[currentSegment];
    if (seg && segmentTime > 0) {
      finalSplits.push({
        name: seg.name,
        type: seg.type,
        time: segmentTime,
        distance: segmentDistance.current,
        pace: segmentDistance.current > 0 ? (segmentTime / 60) / segmentDistance.current : 0,
      });
    }

    setIsRunning(false);
    setIsPaused(false);
    setRunComplete(true);
    stopGPS();
    Vibration.vibrate([0, 300, 200, 300, 200, 500]);

    // Persist to database
    try {
      const pace = totalDistance > 0 ? (totalTime / 60) / totalDistance : 0;
      await saveRunHistory({
        date: new Date().toISOString().split('T')[0],
        runType: selectedRunType,
        totalTime,
        totalDistance,
        avgPace: pace,
        splits: JSON.stringify(finalSplits),
      });
    } catch (e) {
      console.error('Error saving run:', e);
    }
  };

  const stopRun = () => {
    Alert.alert('Stop Run', 'Are you sure you want to stop?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Stop', style: 'destructive', onPress: finishRun },
    ]);
  };

  const resetRun = () => {
    setRunComplete(false);
    setCurrentSegment(0);
    setSegmentTime(0);
    setTotalTime(0);
    setTotalDistance(0);
    setCompletedSplits([]);
    segmentDistance.current = 0;
    lastPosition.current = null;
  };

  const currentSeg = builtSegments[currentSegment];
  const segProgress = currentSeg ? Math.min(100, (segmentTime / currentSeg.duration) * 100) : 0;
  const segColor = currentSeg ? (SEGMENT_COLORS[currentSeg.type] || '#fff') : '#fff';
  const avgPace = totalDistance > 0 ? (totalTime / 60) / totalDistance : 0;

  // ═══════════════════════════════════════════════════════════
  // SETUP SCREEN (not running)
  // ═══════════════════════════════════════════════════════════

  if (!isRunning && !runComplete) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.setupHeader}>
            <Text style={styles.setupTitle}>GPS RUN TRACKER</Text>
            <Text style={styles.setupSub}>Auto-segmented run tracking</Text>
          </View>

          {/* Run type selector */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>RUN TYPE</Text>
            {Object.entries(RUN_CONFIGS).map(([key, config]) => (
              <TouchableOpacity
                key={key}
                style={[styles.typeCard, selectedRunType === key && styles.typeCardSelected]}
                onPress={() => setSelectedRunType(key)}
              >
                <Text style={[styles.typeName, selectedRunType === key && styles.typeNameSelected]}>
                  {config.name}
                </Text>
                <Text style={styles.typeDesc}>
                  {config.segments.length} segment{config.segments.length > 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Rounds selector for intervals */}
          {selectedRunType === 'INTERVALS' && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>ROUNDS</Text>
              <View style={styles.roundsRow}>
                {[3, 4, 5, 6, 8].map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roundButton, rounds === r && styles.roundButtonSelected]}
                    onPress={() => setRounds(r)}
                  >
                    <Text style={[styles.roundText, rounds === r && styles.roundTextSelected]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Segment preview */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SEGMENTS ({builtSegments.length})</Text>
            {builtSegments.slice(0, 8).map((seg, i) => (
              <View key={i} style={styles.previewRow}>
                <View style={[styles.previewDot, { backgroundColor: SEGMENT_COLORS[seg.type] || '#666' }]} />
                <Text style={styles.previewName}>{seg.name}</Text>
                <Text style={styles.previewTime}>{formatTime(seg.duration)}</Text>
              </View>
            ))}
            {builtSegments.length > 8 && (
              <Text style={styles.moreSegments}>+{builtSegments.length - 8} more</Text>
            )}
          </View>

          {/* Start button */}
          <TouchableOpacity style={styles.startButton} onPress={startRun}>
            <Text style={styles.startButtonText}>START RUN</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // COMPLETION SCREEN
  // ═══════════════════════════════════════════════════════════

  if (runComplete) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.completeHeader}>
            <Text style={styles.completeTitle}>RUN COMPLETE</Text>
            <Text style={styles.runSavedText}>Run saved to history</Text>
          </View>

          {/* Summary stats */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryValue}>{formatTime(totalTime)}</Text>
              <Text style={styles.summaryLabel}>TOTAL TIME</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryValue}>{formatDistance(totalDistance)}</Text>
              <Text style={styles.summaryLabel}>MILES</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryValue}>{avgPace > 0 ? avgPace.toFixed(1) : '--'}</Text>
              <Text style={styles.summaryLabel}>AVG PACE</Text>
            </View>
          </View>

          {/* Splits */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SPLITS</Text>
            {completedSplits.map((split, i) => (
              <View key={i} style={[styles.splitRow, { borderLeftColor: SEGMENT_COLORS[split.type] || '#666' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.splitName}>{split.name}</Text>
                  <Text style={styles.splitType}>{split.type.toUpperCase()}</Text>
                </View>
                <View style={styles.splitStats}>
                  <Text style={styles.splitStat}>{formatTime(split.time)}</Text>
                  <Text style={styles.splitStatSub}>{formatDistance(split.distance)} mi</Text>
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.resetButton} onPress={resetRun}>
            <Text style={styles.resetButtonText}>NEW RUN</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RUNNING SCREEN
  // ═══════════════════════════════════════════════════════════

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Current segment card */}
        <View style={[styles.segmentCard, { borderColor: segColor }]}>
          <Text style={[styles.segmentName, { color: segColor }]}>
            {currentSeg?.name || ''}
          </Text>
          <Text style={styles.segmentTimer}>{formatTime(segmentTime)}</Text>

          {/* Segment progress bar */}
          <View style={styles.segProgressBar}>
            <View style={[styles.segProgressFill, { width: `${segProgress}%`, backgroundColor: segColor }]} />
          </View>

          <View style={styles.segmentMeta}>
            <Text style={styles.segmentRemaining}>
              {formatTime(Math.max(0, (currentSeg?.duration || 0) - segmentTime))} left
            </Text>
            <Text style={styles.segmentDist}>
              {formatDistance(segmentDistance.current)} mi
            </Text>
          </View>
        </View>

        {/* Total stats */}
        <View style={styles.totalStatsRow}>
          <View style={styles.totalStatBox}>
            <Text style={styles.totalStatLabel}>TOTAL TIME</Text>
            <Text style={styles.totalStatValue}>{formatTime(totalTime)}</Text>
          </View>
          <View style={styles.totalStatBox}>
            <Text style={styles.totalStatLabel}>TOTAL DIST</Text>
            <Text style={styles.totalStatValue}>{formatDistance(totalDistance)} mi</Text>
          </View>
          <View style={styles.totalStatBox}>
            <Text style={styles.totalStatLabel}>SPEED</Text>
            <Text style={styles.totalStatValue}>{currentSpeed.toFixed(1)} mph</Text>
          </View>
        </View>

        {/* GPS info */}
        <Text style={styles.gpsInfo}>
          GPS: {gpsAccuracy ? `${gpsAccuracy.toFixed(0)}m accuracy` : 'Acquiring...'}
        </Text>

        {/* Completed splits */}
        {completedSplits.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>COMPLETED SPLITS</Text>
            {completedSplits.map((split, i) => (
              <View key={i} style={styles.liveSplitRow}>
                <Text style={styles.liveSplitName}>{split.name}</Text>
                <Text style={styles.liveSplitData}>
                  {formatTime(split.time)} {'\u2022'} {formatDistance(split.distance)} mi
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Controls */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={[styles.controlBtn, { backgroundColor: isPaused ? '#01FF70' : '#FF851B' }]}
            onPress={togglePause}
          >
            <Text style={[styles.controlBtnText, isPaused && { color: '#000' }]}>
              {isPaused ? 'RESUME' : 'PAUSE'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlBtn, styles.skipBtn]}
            onPress={skipSegment}
          >
            <Text style={styles.controlBtnText}>{'SKIP \u2192'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlBtn, { backgroundColor: '#FF4136' }]}
            onPress={stopRun}
          >
            <Text style={styles.controlBtnText}>STOP</Text>
          </TouchableOpacity>
        </View>

        {/* Up next */}
        {currentSegment < builtSegments.length - 1 && (
          <View style={styles.upNext}>
            <Text style={styles.upNextLabel}>UP NEXT</Text>
            {builtSegments.slice(currentSegment + 1, currentSegment + 3).map((seg, i) => (
              <Text key={i} style={styles.upNextItem}>
                {seg.name} {'\u2022'} {formatTime(seg.duration)}
              </Text>
            ))}
          </View>
        )}

        {/* Segment counter */}
        <Text style={styles.segCounter}>
          Segment {currentSegment + 1} of {builtSegments.length}
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  // Setup screen
  setupHeader: {
    padding: 20,
    paddingTop: 10,
  },
  setupTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
  },
  setupSub: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  section: {
    paddingHorizontal: 15,
    marginBottom: 20,
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  typeCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeCardSelected: {
    borderColor: '#FF4136',
    backgroundColor: 'rgba(255,65,54,0.08)',
  },
  typeName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  typeNameSelected: {
    color: '#FF4136',
  },
  typeDesc: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  roundsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  roundButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  roundButtonSelected: {
    borderColor: '#FF4136',
    backgroundColor: 'rgba(255,65,54,0.1)',
  },
  roundText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  roundTextSelected: {
    color: '#FF4136',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 6,
    marginBottom: 4,
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  previewName: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  previewTime: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  moreSegments: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    fontFamily: 'monospace',
    textAlign: 'center',
    marginTop: 4,
  },
  startButton: {
    backgroundColor: '#FF4136',
    marginHorizontal: 15,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  // Running screen
  segmentCard: {
    margin: 15,
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  segmentName: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  segmentTimer: {
    color: '#fff',
    fontSize: 52,
    fontWeight: '700',
    fontFamily: 'monospace',
    textAlign: 'center',
    marginBottom: 12,
  },
  segProgressBar: {
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  segProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  segmentMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  segmentRemaining: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  segmentDist: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  totalStatsRow: {
    flexDirection: 'row',
    marginHorizontal: 15,
    marginBottom: 10,
  },
  totalStatBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 3,
    alignItems: 'center',
  },
  totalStatLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 9,
    fontFamily: 'monospace',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  totalStatValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  gpsInfo: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    fontFamily: 'monospace',
    textAlign: 'center',
    marginBottom: 15,
  },
  liveSplitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 5,
    marginBottom: 4,
  },
  liveSplitName: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  liveSplitData: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  controlsRow: {
    flexDirection: 'row',
    marginHorizontal: 15,
    marginTop: 10,
  },
  controlBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 3,
  },
  skipBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  controlBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  upNext: {
    margin: 15,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
  },
  upNextLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontFamily: 'monospace',
    letterSpacing: 1,
    marginBottom: 6,
  },
  upNextItem: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 3,
  },
  segCounter: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    fontFamily: 'monospace',
    textAlign: 'center',
    marginTop: 10,
  },
  // Complete screen
  completeHeader: {
    padding: 20,
    alignItems: 'center',
  },
  completeTitle: {
    color: '#01FF70',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1,
  },
  runSavedText: {
    color: 'rgba(1,255,112,0.5)',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  summaryRow: {
    flexDirection: 'row',
    marginHorizontal: 15,
    marginBottom: 20,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 14,
    marginHorizontal: 3,
    alignItems: 'center',
  },
  summaryValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  summaryLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 9,
    fontFamily: 'monospace',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 6,
    marginBottom: 5,
    borderLeftWidth: 3,
  },
  splitName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  splitType: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 9,
    fontFamily: 'monospace',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  splitStats: {
    alignItems: 'flex-end',
  },
  splitStat: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  splitStatSub: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  resetButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 15,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
