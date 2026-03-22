// ExerciseDB API Client
// Base URL: https://exercisedb-api.vercel.app/api/v1

const BASE_URL = 'https://exercisedb-api.vercel.app/api/v1';
const TIMEOUT = 15000;
const PAGE_SIZE = 200;
const DELAY_BETWEEN_REQUESTS = 1500; // 1.5s between requests to avoid 429

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, timeoutMs = TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
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
        // Exponential backoff: 3s, 6s, 12s
        const backoff = 3000 * Math.pow(2, i);
        console.log(`Rate limited, waiting ${backoff / 1000}s before retry...`);
        await sleep(backoff);
        if (i === retries) throw e;
      } else {
        if (i === retries) throw e;
        await sleep(1000);
      }
    }
  }
}

export async function fetchAllExercises(onProgress) {
  // First request to get total count
  const first = await fetchWithRetry(`${BASE_URL}/exercises?limit=${PAGE_SIZE}&offset=0`);
  const total = first.metadata?.totalExercises || 1500;
  const allExercises = [...(first.data || [])];

  if (onProgress) onProgress(allExercises.length, total);

  // Fetch remaining pages with delay between each
  const totalPages = Math.ceil(total / PAGE_SIZE);
  for (let page = 1; page < totalPages; page++) {
    await sleep(DELAY_BETWEEN_REQUESTS);
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
