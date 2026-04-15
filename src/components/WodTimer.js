import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Vibration } from 'react-native';

export default function WodTimer({ type, timeCap, onComplete, onRoundsChange }) {
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [rounds, setRounds] = useState(0);
  const [currentMinute, setCurrentMinute] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const timerRef = useRef(null);
  const startTime = useRef(null);
  const pausedAt = useRef(0);

  // Parse time cap (e.g., "10 min" → 600 seconds)
  const totalSeconds = (() => {
    const match = (timeCap || '').match(/(\d+)/);
    return match ? parseInt(match[1]) * 60 : 600;
  })();

  const wodType = (type || '').toUpperCase();
  // Detect timer mode from type — AMRAP and EMOM count down, everything else counts up
  const isAMRAP = /AMRAP/i.test(wodType) || /AMRAP/i.test(timeCap || '');
  const isEMOM = /EMOM/i.test(wodType);
  const isCountdown = isAMRAP || isEMOM;
  const isForTime = !isCountdown;

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const start = () => {
    startTime.current = Date.now() - (pausedAt.current * 1000);
    setIsRunning(true);
    setIsFinished(false);
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime.current) / 1000);
      setSeconds(elapsed);

      // EMOM minute beep
      if (isEMOM) {
        const minute = Math.floor(elapsed / 60);
        setCurrentMinute(prev => {
          if (minute !== prev) {
            Vibration.vibrate(200);
            return minute;
          }
          return prev;
        });
      }

      // Time's up
      if (isCountdown && elapsed >= totalSeconds) {
        clearInterval(timerRef.current);
        setIsRunning(false);
        setIsFinished(true);
        Vibration.vibrate([200, 100, 200, 100, 200]);
        if (onComplete) onComplete({ elapsed, rounds });
      }
    }, 1000);
  };

  const pause = () => {
    clearInterval(timerRef.current);
    pausedAt.current = seconds;
    setIsRunning(false);
  };

  const reset = () => {
    clearInterval(timerRef.current);
    setSeconds(0);
    setRounds(0);
    setCurrentMinute(0);
    setIsFinished(false);
    pausedAt.current = 0;
    startTime.current = null;
    setIsRunning(false);
  };

  const finish = () => {
    clearInterval(timerRef.current);
    setIsRunning(false);
    setIsFinished(true);
    if (onComplete) onComplete({ elapsed: seconds, rounds });
  };

  const logRound = () => {
    const newRounds = rounds + 1;
    setRounds(newRounds);
    Vibration.vibrate(100);
    if (onRoundsChange) onRoundsChange(newRounds);
  };

  // Display
  const displaySeconds = isCountdown ? Math.max(0, totalSeconds - seconds) : seconds;
  const mins = Math.floor(displaySeconds / 60);
  const secs = displaySeconds % 60;
  const timeStr = `${mins}:${String(secs).padStart(2, '0')}`;
  const progress = isCountdown ? Math.min(1, seconds / totalSeconds) : 0;

  // Color based on countdown remaining
  const timeColor = isFinished ? '#01FF70'
    : isCountdown && displaySeconds <= 30 ? '#FF4136'
    : isCountdown && displaySeconds <= 60 ? '#FF851B'
    : '#fff';

  return (
    <View style={styles.container}>
      {/* Type + time label */}
      <Text style={styles.typeLabel}>
        {wodType} {isCountdown ? `${Math.ceil(totalSeconds / 60)} MIN` : ''}
      </Text>

      {/* Timer */}
      <Text style={[styles.timer, { color: timeColor }]}>{timeStr}</Text>

      {/* EMOM minute indicator */}
      {isEMOM && isRunning ? (
        <Text style={styles.minuteLabel}>MINUTE {currentMinute + 1} of {Math.ceil(totalSeconds / 60)}</Text>
      ) : null}

      {/* Round counter — AMRAP only (For Time doesn't track rounds) */}
      {isAMRAP && (isRunning || rounds > 0) ? (
        <Text style={styles.roundCount}>{rounds} ROUND{rounds !== 1 ? 'S' : ''}</Text>
      ) : null}

      {/* Progress bar */}
      {isCountdown ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: timeColor }]} />
        </View>
      ) : null}

      {/* Controls */}
      <View style={styles.controls}>
        {!isRunning && seconds === 0 ? (
          // Not started
          <TouchableOpacity style={styles.startBtn} onPress={start}>
            <Text style={styles.startBtnText}>START</Text>
          </TouchableOpacity>
        ) : isRunning ? (
          // Running
          <>
            {/* Big ROUND button for AMRAP only */}
            {isAMRAP ? (
              <TouchableOpacity style={styles.roundBtn} onPress={logRound} activeOpacity={0.6}>
                <Text style={styles.roundBtnText}>ROUND</Text>
                <Text style={styles.roundBtnCount}>{rounds + 1}</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.secondaryControls}>
              <TouchableOpacity style={styles.pauseBtn} onPress={pause}>
                <Text style={styles.smallBtnText}>PAUSE</Text>
              </TouchableOpacity>
              {isForTime ? (
                <TouchableOpacity style={styles.finishBtn} onPress={finish}>
                  <Text style={styles.finishBtnText}>FINISH</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </>
        ) : isFinished ? (
          // Finished
          <View style={styles.finishedRow}>
            <Text style={styles.finishedText}>
              {isAMRAP ? `${rounds} rounds in ${Math.ceil(totalSeconds / 60)} min` : `Finished in ${mins}:${String(secs).padStart(2, '0')}`}
            </Text>
            <TouchableOpacity style={styles.resetBtn} onPress={reset}>
              <Text style={styles.smallBtnText}>RESET</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // Paused
          <View style={styles.secondaryControls}>
            <TouchableOpacity style={styles.startBtn} onPress={start}>
              <Text style={styles.startBtnText}>RESUME</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resetBtn} onPress={reset}>
              <Text style={styles.smallBtnText}>RESET</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,65,54,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,65,54,0.2)',
    borderRadius: 10,
    padding: 16,
    marginHorizontal: 12,
    marginVertical: 6,
    alignItems: 'center',
  },
  typeLabel: {
    color: '#FF4136',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 4,
  },
  timer: {
    fontSize: 52,
    fontWeight: '900',
    fontFamily: 'monospace',
    letterSpacing: 3,
  },
  minuteLabel: {
    color: '#FF4136',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 2,
  },
  roundCount: {
    color: '#01FF70',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 4,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  controls: {
    marginTop: 14,
    alignItems: 'center',
    width: '100%',
  },
  startBtn: {
    backgroundColor: 'rgba(255,65,54,0.2)',
    borderWidth: 1,
    borderColor: '#FF4136',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  startBtnText: {
    color: '#FF4136',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 3,
  },
  // Big round button — primary interaction during AMRAP
  roundBtn: {
    backgroundColor: 'rgba(1,255,112,0.12)',
    borderWidth: 2,
    borderColor: '#01FF70',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 40,
    marginBottom: 10,
    alignItems: 'center',
    width: '80%',
  },
  roundBtnText: {
    color: '#01FF70',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  roundBtnCount: {
    color: '#01FF70',
    fontSize: 28,
    fontWeight: '900',
    fontFamily: 'monospace',
  },
  secondaryControls: {
    flexDirection: 'row',
    gap: 10,
  },
  pauseBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  finishBtn: {
    backgroundColor: 'rgba(1,255,112,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(1,255,112,0.3)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  finishBtnText: {
    color: '#01FF70',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  resetBtn: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  smallBtnText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  finishedRow: {
    alignItems: 'center',
    gap: 10,
  },
  finishedText: {
    color: '#01FF70',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
