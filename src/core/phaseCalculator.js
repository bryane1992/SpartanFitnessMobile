// Phase Calculator
// Auto-divides training weeks into phases based on start date and event deadline

const PHASE_COLORS = {
  foundation: '#FF4136',
  build: '#FF851B',
  peak: '#B10DC9',
  race_prep: '#01FF70',
};

const PHASE_NAMES = {
  foundation: 'FOUNDATION',
  build: 'BUILD',
  peak: 'PEAK',
  race_prep: 'RACE PREP',
};

export function calculatePhases(startDate, eventDate) {
  const start = new Date(startDate);
  const end = new Date(eventDate);
  const totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  const totalWeeks = Math.max(4, Math.floor(totalDays / 7));

  let phases;

  if (totalWeeks >= 12) {
    // Full 4-phase plan
    const foundation = Math.min(6, Math.max(2, Math.round(totalWeeks * 0.25)));
    const build = Math.min(8, Math.max(3, Math.round(totalWeeks * 0.35)));
    const racePrepWeeks = Math.min(3, Math.max(1, Math.round(totalWeeks * 0.15)));
    const peak = totalWeeks - foundation - build - racePrepWeeks;

    phases = [
      { phase: 'foundation', weeks: foundation },
      { phase: 'build', weeks: build },
      { phase: 'peak', weeks: Math.max(2, peak) },
      { phase: 'race_prep', weeks: racePrepWeeks },
    ];
  } else if (totalWeeks >= 8) {
    // 3-phase plan
    const foundation = Math.round(totalWeeks * 0.3);
    const build = Math.round(totalWeeks * 0.4);
    const racePrepWeeks = totalWeeks - foundation - build;

    phases = [
      { phase: 'foundation', weeks: foundation },
      { phase: 'build', weeks: build },
      { phase: 'race_prep', weeks: Math.max(1, racePrepWeeks) },
    ];
  } else {
    // Short plan: 2 phases
    const foundation = Math.round(totalWeeks * 0.5);
    const racePrepWeeks = totalWeeks - foundation;

    phases = [
      { phase: 'foundation', weeks: foundation },
      { phase: 'race_prep', weeks: Math.max(1, racePrepWeeks) },
    ];
  }

  // Assign week numbers and dates
  let currentWeek = 1;
  const currentDate = new Date(start);
  const result = [];

  for (const p of phases) {
    const phaseStart = new Date(currentDate);
    const startWeek = currentWeek;
    const endWeek = currentWeek + p.weeks - 1;

    currentDate.setDate(currentDate.getDate() + p.weeks * 7);
    currentWeek += p.weeks;

    result.push({
      phase: p.phase,
      name: PHASE_NAMES[p.phase],
      emoji: '',
      color: PHASE_COLORS[p.phase],
      startWeek,
      endWeek,
      totalWeeks: p.weeks,
      startDate: phaseStart.toISOString().split('T')[0],
      endDate: new Date(currentDate.getTime() - 86400000).toISOString().split('T')[0],
    });
  }

  return {
    totalWeeks,
    startDate: startDate,
    endDate: eventDate,
    phases: result,
  };
}

export function getPhaseForWeek(phases, weekNumber) {
  return phases.find(p => weekNumber >= p.startWeek && weekNumber <= p.endWeek);
}

export function isDeloadWeek(weekNumber) {
  return weekNumber > 1 && weekNumber % 4 === 0;
}
