// ExerciseDB API Client (RapidAPI)
// Paid subscription — 1300+ exercises with high-quality GIFs

import Constants from 'expo-constants';

const BASE_URL = 'https://exercisedb.p.rapidapi.com';
const RAPIDAPI_HOST = 'exercisedb.p.rapidapi.com';
const TIMEOUT = 15000;
const PAGE_SIZE = 100; // max per request on RapidAPI
const DELAY_BETWEEN_REQUESTS = 500; // paid plan = generous rate limits

function getApiKey() {
  // Try expo constants (from .env via app config), then fallback
  return Constants.expoConfig?.extra?.exerciseDbApiKey
    || Constants.manifest?.extra?.exerciseDbApiKey
    || null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, timeoutMs = TIMEOUT) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('EXERCISEDB_API_KEY not configured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });
    clearTimeout(timer);
    if (response.status === 429) {
      throw new Error('RATE_LIMITED');
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchWithTimeout(url);
    } catch (e) {
      if (e.message === 'RATE_LIMITED') {
        const backoff = 3000 * Math.pow(2, i);
        console.log(`[ExerciseDB] Rate limited, waiting ${backoff / 1000}s...`);
        await sleep(backoff);
        if (i === retries) throw e;
      } else {
        if (i === retries) throw e;
        await sleep(1000);
      }
    }
  }
}

// RapidAPI returns flat arrays, paginated via ?limit=N&offset=N
export async function fetchAllExercises(onProgress) {
  const first = await fetchWithRetry(`${BASE_URL}/exercises?limit=${PAGE_SIZE}&offset=0`);
  // RapidAPI returns a flat array
  const allExercises = Array.isArray(first) ? [...first] : [];
  // Estimate total — RapidAPI doesn't return metadata, ~1300 exercises
  const estimatedTotal = 1400;

  if (onProgress) onProgress(allExercises.length, estimatedTotal);

  // Keep fetching until we get less than PAGE_SIZE results
  let page = 1;
  while (allExercises.length === page * PAGE_SIZE) {
    await sleep(DELAY_BETWEEN_REQUESTS);
    const result = await fetchWithRetry(`${BASE_URL}/exercises?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
    const data = Array.isArray(result) ? result : [];
    if (data.length === 0) break;
    allExercises.push(...data);
    if (onProgress) onProgress(allExercises.length, estimatedTotal);
    page++;
  }

  return allExercises;
}

export async function fetchPagedExercises(page) {
  if (page > 0) await sleep(DELAY_BETWEEN_REQUESTS);
  const result = await fetchWithRetry(`${BASE_URL}/exercises?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
  const data = Array.isArray(result) ? result : [];
  return {
    data,
    total: 1400, // estimate
  };
}

export async function fetchExerciseById(exerciseId) {
  const result = await fetchWithRetry(`${BASE_URL}/exercises/exercise/${exerciseId}`);
  return result || null;
}

export async function searchExercises(name) {
  const result = await fetchWithRetry(`${BASE_URL}/exercises/name/${encodeURIComponent(name)}?limit=20`);
  return Array.isArray(result) ? result : [];
}

export async function fetchByBodyPart(bodyPart) {
  const result = await fetchWithRetry(`${BASE_URL}/exercises/bodyPart/${encodeURIComponent(bodyPart)}?limit=100`);
  return Array.isArray(result) ? result : [];
}

export async function fetchByEquipment(equipment) {
  const result = await fetchWithRetry(`${BASE_URL}/exercises/equipment/${encodeURIComponent(equipment)}?limit=100`);
  return Array.isArray(result) ? result : [];
}

export async function fetchByTarget(target) {
  const result = await fetchWithRetry(`${BASE_URL}/exercises/target/${encodeURIComponent(target)}?limit=100`);
  return Array.isArray(result) ? result : [];
}

export async function fetchBodyPartList() {
  return fetchWithRetry(`${BASE_URL}/exercises/bodyPartList`);
}

export async function fetchEquipmentList() {
  return fetchWithRetry(`${BASE_URL}/exercises/equipmentList`);
}

export async function fetchTargetList() {
  return fetchWithRetry(`${BASE_URL}/exercises/targetList`);
}

export function isApiConfigured() {
  return !!getApiKey();
}
