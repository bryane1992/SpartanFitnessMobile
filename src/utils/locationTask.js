import * as TaskManager from 'expo-task-manager';

export const LOCATION_TASK = 'gritos-run-location';

// Module-level state shared between background task and RunTracker component
// Works because Expo background tasks run in the same JS thread
export const locationState = {
  isTracking: false,
  totalDistance: 0,
  segmentDistance: 0,
  lastPosition: null,
  currentSpeed: 0,
  onUpdate: null, // set by RunTracker to receive live updates
};

export function resetLocationState() {
  locationState.totalDistance = 0;
  locationState.segmentDistance = 0;
  locationState.lastPosition = null;
  locationState.currentSpeed = 0;
}

export function resetSegmentDistance() {
  locationState.segmentDistance = 0;
}

function haversineDistance(c1, c2) {
  const R = 3959;
  const lat1 = c1.latitude * Math.PI / 180;
  const lat2 = c2.latitude * Math.PI / 180;
  const dLat = (c2.latitude - c1.latitude) * Math.PI / 180;
  const dLon = (c2.longitude - c1.longitude) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

if (!TaskManager.isTaskDefined(LOCATION_TASK)) TaskManager.defineTask(LOCATION_TASK, ({ data, error }) => {
  if (error) { console.error('[LocationTask]', error.message); return; }
  if (!data?.locations?.length) return;

  for (const loc of data.locations) {
    const accuracy = loc.coords.accuracy || 999;
    if (accuracy > 50) continue;

    if (locationState.lastPosition) {
      const dist = haversineDistance(locationState.lastPosition.coords, loc.coords);
      const timeDelta = (loc.timestamp - (locationState.lastPosition.timestamp || 0)) / 1000;
      if (dist > 0.002 && dist < 0.1) {
        const mph = timeDelta > 0 ? (dist / timeDelta) * 3600 : 0;
        if (mph < 20) {
          locationState.totalDistance += dist;
          locationState.segmentDistance += dist;
        }
      }
    }
    locationState.lastPosition = loc;
    locationState.currentSpeed = loc.coords.speed > 0 ? loc.coords.speed * 2.237 : 0;

    if (locationState.onUpdate) locationState.onUpdate();
  }
}); // end defineTask
