// ExerciseDB API Client
// Base URL: https://exercisedb-api.vercel.app/api/v1

const BASE_URL = 'https://exercisedb-api.vercel.app/api/v1';
const TIMEOUT = 10000;
const PAGE_SIZE = 100;

async function fetchWithTimeout(url, timeoutMs = TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function fetchWithRetry(url, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchWithTimeout(url);
    } catch (e) {
      if (i === retries) throw e;
    }
  }
}

export async function fetchAllExercises(onProgress) {
  // First request to get total count
  const first = await fetchWithRetry(`${BASE_URL}/exercises?limit=${PAGE_SIZE}&offset=0`);
  const total = first.metadata?.totalExercises || 1500;
  const allExercises = [...(first.data || [])];

  if (onProgress) onProgress(allExercises.length, total);

  // Fetch remaining pages
  const totalPages = Math.ceil(total / PAGE_SIZE);
  for (let page = 1; page < totalPages; page++) {
    const result = await fetchWithRetry(`${BASE_URL}/exercises?limit=${PAGE_SIZE}&offset=${page}`);
    if (result.data) {
      allExercises.push(...result.data);
    }
    if (onProgress) onProgress(allExercises.length, total);
  }

  return allExercises;
}

export async function fetchExerciseById(exerciseId) {
  const result = await fetchWithRetry(`${BASE_URL}/exercises/${exerciseId}`);
  return result.data || null;
}
