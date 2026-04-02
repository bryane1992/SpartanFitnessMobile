import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Vibration } from 'react-native';

export default function WodTimer({ type, timeCap, onComplete }) {
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [currentMinute, setCurrentMinute] = useState(0);
  const timerRef = useRef(null);
  const startTime = useRef(null);
  const pausedAt = useRef(0);

  // Parse time cap (e.g., "10 min" → 600 seconds)
  const totalSeconds = (() => {
    const match = (timeCap || '').match(/(\d+)/);
    return match ? parseInt(match[1]) * 60 : 600; // default 10 min
  })();

  const wodType = (type || '').toUpperCase();
  const isCountdown = /AMRAP|EMOM/.test(wodType);
  const isEMOM = /EMOM/.test(wodType);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const start = () => {
    startTime.current = Date.now() - (pausedAt.current * 1000);
    setIsRunning(true);
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime.current) / 1000);
      setSeconds(elapsed);

      // EMOM minute beep
      if (isEMOM) {
        const minute = Math.floor(elapsed / 60);
        if (minute !== currentMinute) {
          setCurrentMinute(minute);
          Vibration.vibrate(200);
        }
      }

      // Time's up for countdown timers
      if (isCountdown && elapsed >= totalSeconds) {
        clearInterval(timerRef.current);
        setIsRunning(false);
        Vibration.vibrate([200, 100, 200, 100, 200]);
        if (onComplete) onComplete(elapsed);
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
    setCurrentMinute(0);
    pausedAt.current = 0;
    startTime.current = null;
    setIsRunning(false);
  };

  const stop = () => {
    clearInterval(timerRef.current);
    setIsRunning(false);
    if (onComplete) onComplete(seconds);
  };

  // Display time
  const displaySeconds = isCountdown ? Math.max(0, totalSeconds - seconds) : seconds;
  const mins = Math.floor(displaySeconds / 60);
  const secs = displaySeconds % 60;
  const timeStr = `${mins}:${String(secs).padStart(2, '0')}`;
  const progress = isCountdown ? Math.min(1, seconds / totalSeconds) : 0;

  return (
    <View style={styles.container}>
      {/* Type label */}
      <Text style={styles.typeLabel}>{wodType} {isCountdown ? `${Math.ceil(totalSeconds / 60)} MIN` : 'FOR TIME'}</Text>

      {/* Timer display */}
      <Text style={[styles.timer, isCountdown && seconds >= totalSeconds && styles.timerDone]}>
        {timeStr}
      </Text>

      {/* EMOM minute indicator */}
      {isEMOM && isRunning ? (
        <Text style={styles.minuteLabel}>MINUTE {currentMinute + 1}</Text>
      ) : null}

      {/* Progress bar for countdown */}
      {isCountdown ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      ) : null}

      {/* Controls */}
      <View style={styles.controls}>
        {!isRunning && seconds === 0 ? (
          <TouchableOpacity style={styles.startBtn} onPress={start}>
            <Text style={styles.startBtnText}>START</Text>
          </TouchableOpacity>
        ) : isRunning ? (
          <>
            <TouchableOpacity style={styles.pauseBtn} onPress={pause}>
              <Text style={styles.btnText}>PAUSE</Text>
            </TouchableOpacity>
            {!isCountdown ? (
              <TouchableOpacity style={styles.stopBtn} onPress={stop}>
                <Text style={styles.btnText}>FINISH</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.startBtn} onPress={start}>
              <Text style={styles.startBtnText}>RESUME</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resetBtn} onPress={reset}>
              <Text style={styles.btnText}>RESET</Text>
            </TouchableOpacity>
          </>
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
    marginVertical: 4,
    alignItems: 'center',
  },
  typeLabel: {
    color: '#FF4136',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 8,
  },
  timer: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '900',
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  timerDone: {
    color: '#01FF70',
  },
  minuteLabel: {
    color: '#FF4136',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 4,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FF4136',
    borderRadius: 2,
  },
  controls: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 10,
  },
  startBtn: {
    backgroundColor: 'rgba(255,65,54,0.2)',
    borderWidth: 1,
    borderColor: '#FF4136',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  startBtnText: {
    color: '#FF4136',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
  },
  pauseBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  stopBtn: {
    backgroundColor: 'rgba(1,255,112,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(1,255,112,0.3)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  resetBtn: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  btnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
