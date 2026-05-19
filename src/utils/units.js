// GritOS Unit Conversion
// Store everything in imperial (lb, miles) internally.
// Convert at display time based on user preference.

import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const UNITS_KEY = 'userUnits';
let cachedUnits = 'imperial'; // in-memory cache for sync access

// Load once at startup
AsyncStorage.getItem(UNITS_KEY).then(v => { if (v) cachedUnits = v; });

// ═══════════════════════════════════════════════
// Getters / Setters
// ═══════════════════════════════════════════════

export function getUnits() {
  return cachedUnits; // 'imperial' or 'metric'
}

export function isMetric() {
  return cachedUnits === 'metric';
}

export async function setUnits(system) {
  cachedUnits = system;
  await AsyncStorage.setItem(UNITS_KEY, system);
}

// ═══════════════════════════════════════════════
// React hook — re-renders when units change
// ═══════════════════════════════════════════════

export function useUnits() {
  const [units, setUnitsState] = useState(cachedUnits);

  useEffect(() => {
    AsyncStorage.getItem(UNITS_KEY).then(v => {
      if (v && v !== units) setUnitsState(v);
    });
  }, []);

  const toggle = async () => {
    const next = units === 'imperial' ? 'metric' : 'imperial';
    cachedUnits = next;
    setUnitsState(next);
    await AsyncStorage.setItem(UNITS_KEY, next);
  };

  return { units, isMetric: units === 'metric', toggle, setUnits: async (s) => { cachedUnits = s; setUnitsState(s); await AsyncStorage.setItem(UNITS_KEY, s); } };
}

// ═══════════════════════════════════════════════
// Weight conversions (internal = lb)
// ═══════════════════════════════════════════════

const LB_TO_KG = 0.453592;
const KG_TO_LB = 2.20462;

// Display a weight string — handles "BW", "Assisted", numbers
export function displayWeight(weightStr) {
  if (!weightStr) return '';
  const s = String(weightStr).trim();
  // Non-numeric or non-weight strings pass through unchanged
  if (/^(BW|bodyweight|assisted|band|none)/i.test(s)) return s;
  if (/pace|effort|%|cool|warm|build|conversational|race|tempo|easy|hard|stretch|mobility/i.test(s)) return s;
  // Strip " lb" / " kg" suffix if present
  const num = parseFloat(s);
  if (isNaN(num)) return s;

  if (isMetric()) {
    const kg = roundWeight(num * LB_TO_KG, true);
    return `${kg} kg`;
  }
  return `${num} lb`;
}

// Parse user input weight back to internal lb
export function parseInputWeight(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^(BW|bodyweight)/i.test(s)) return 'BW';
  const num = parseFloat(s);
  if (isNaN(num)) return s;

  if (isMetric()) {
    // User entered kg, convert to lb for storage
    return Math.round(num * KG_TO_LB);
  }
  return num;
}

// Round weight to practical increments
export function roundWeight(weight, metric = false) {
  if (metric) {
    // Metric: round to nearest 2.5 kg for light, 5 kg for heavy
    if (weight <= 20) return Math.round(weight / 2.5) * 2.5;
    return Math.round(weight / 5) * 5;
  }
  // Imperial: round to nearest 2.5 lb for light, 5 lb for heavy
  if (weight <= 25) return Math.round(weight / 2.5) * 2.5;
  return Math.round(weight / 5) * 5;
}

// ═══════════════════════════════════════════════
// Distance conversions (internal = miles)
// ═══════════════════════════════════════════════

const MI_TO_KM = 1.60934;
const KM_TO_MI = 0.621371;

export function displayDistance(miles, decimals = 2) {
  if (isMetric()) {
    return `${(miles * MI_TO_KM).toFixed(decimals)} km`;
  }
  return `${miles.toFixed(decimals)} mi`;
}

export function displayPace(paceMinPerMile) {
  if (isMetric()) {
    const paceMinPerKm = paceMinPerMile * KM_TO_MI;
    const mins = Math.floor(paceMinPerKm);
    const secs = Math.round((paceMinPerKm - mins) * 60);
    return `${mins}:${String(secs).padStart(2, '0')} /km`;
  }
  const mins = Math.floor(paceMinPerMile);
  const secs = Math.round((paceMinPerMile - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')} /mi`;
}

// Parse user body weight input to lb for storage
export function parseBodyWeight(input) {
  const num = parseFloat(input);
  if (isNaN(num)) return null;
  if (isMetric()) return Math.round(num * KG_TO_LB);
  return num;
}

// Display body weight
export function displayBodyWeight(lbs) {
  if (!lbs) return '';
  if (isMetric()) return `${Math.round(lbs * LB_TO_KG)} kg`;
  return `${lbs} lb`;
}

// Convert inline distance text (e.g., "1.5 mi", "400m", "3 mi") in any string
export function convertDistanceText(text) {
  if (!text || !isMetric()) return text;
  const s = String(text);
  // "1.5 mi" → "2.4 km"
  return s.replace(/(\d+\.?\d*)\s*mi\b/gi, (_, num) => {
    const km = (parseFloat(num) * 1.60934).toFixed(1);
    return `${km} km`;
  });
}

// Weight unit label
export function weightUnit() {
  return isMetric() ? 'kg' : 'lb';
}

// Distance unit label
export function distanceUnit() {
  return isMetric() ? 'km' : 'mi';
}

// iPad responsive content width — caps content at 600px centered on larger screens
import { Dimensions } from 'react-native';
export function contentWidth() {
  const w = Dimensions.get('window').width;
  return w > 600 ? 600 : w;
}
export const isTablet = () => Dimensions.get('window').width >= 768;
