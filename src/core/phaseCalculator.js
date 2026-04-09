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

export function calculatePhases(startDate, eventDate, hasRace = true) {
  const start = new Date(startDate);
  const end = new Date(eventDate);
  const totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  const totalWeeks = Math.max(4, Math.floor(totalDays / 7));

  let phases;

  if (totalWeeks >= 12) {
    if (hasRace) {
      // Race plan: Foundation → Build → Peak → Race Prep
      const racePrep = Math.min(3, Math.max(2, Math.round(totalWeeks * 0.15)));
      const peak = Math.min(4, Math.max(3, Math.round(totalWeeks * 0.20)));
      const remaining = totalWeeks - peak - racePrep;
      const foundation = Math.min(4, Math.max(3, Math.round(remaining * 0.35)));
      const build = Math.min(5, remaining - foundation);
      const excess = remaining - foundation - build;
      const finalPeak = peak + excess;
      phases = [
        { phase: 'foundation', weeks: foundation },
        { phase: 'build', weeks: Math.max(2, build) },
        { phase: 'peak', weeks: Math.max(3, finalPeak) },
        { phase: 'race_prep', weeks: racePrep },
      ];
    } else {
      // No race: Foundation → Build → Peak (no taper, cycle ends at peak)
      const foundation = Math.min(4, Math.max(3, Math.round(totalWeeks * 0.25)));
      const build = Math.min(5, Math.max(3, Math.round(totalWeeks * 0.35)));
      const peak = totalWeeks - foundation - build;
      phases = [
        { phase: 'foundation', weeks: foundation },
        { phase: 'build', weeks: build },
        { phase: 'peak', weeks: Math.max(3, peak) },
      ];
    }
  } else if (totalWeeks >= 8) {
    if (hasRace) {
      // 8-11 weeks with race: Foundation → Build → Peak → Race Prep
      const racePrep = 2;
      const peak = Math.max(2, Math.round(totalWeeks * 0.20));
      const remaining = totalWeeks - peak - racePrep;
      const foundation = Math.max(2, Math.round(remaining * 0.40));
      const build = remaining - foundation;
      phases = [
        { phase: 'foundation', weeks: foundation },
        { phase: 'build', weeks: Math.max(2, build) },
        { phase: 'peak', weeks: peak },
        { phase: 'race_prep', weeks: racePrep },
      ];
    } else {
      // 8-11 weeks, no race: Foundation → Build → Peak
      const foundation = Math.max(3, Math.round(totalWeeks * 0.35));
      const build = Math.max(2, Math.round(totalWeeks * 0.35));
      const peak = totalWeeks - foundation - build;
      phases = [
        { phase: 'foundation', weeks: foundation },
        { phase: 'build', weeks: build },
        { phase: 'peak', weeks: Math.max(1, peak) },
      ];
    }
  } else if (totalWeeks >= 6) {
    if (hasRace) {
      // 6-7 weeks with race: Foundation → Peak → Race Prep
      const racePrep = 1;
      const peak = 2;
      const foundation = totalWeeks - peak - racePrep;
      phases = [
        { phase: 'foundation', weeks: Math.max(1, foundation) },
        { phase: 'peak', weeks: peak },
        { phase: 'race_prep', weeks: racePrep },
      ];
    } else {
      // 6-7 weeks, no race: Foundation → Build
      const foundation = Math.max(3, Math.round(totalWeeks * 0.5));
      const build = totalWeeks - foundation;
      phases = [
        { phase: 'foundation', weeks: foundation },
        { phase: 'build', weeks: Math.max(1, build) },
      ];
    }
  } else if (hasRace) {
    // <6 weeks with race: Peak → Race Prep (no time for Foundation)
    const racePrep = Math.max(1, Math.round(totalWeeks * 0.3));
    const peak = totalWeeks - racePrep;

    phases = [
      { phase: 'peak', weeks: Math.max(1, peak) },
      { phase: 'race_prep', weeks: racePrep },
    ];
  } else {
    // <6 weeks, no race: Foundation only — learn movements, build habits
    // Short plans (1 month) shouldn't jump to peak intensity
    phases = [
      { phase: 'foundation', weeks: totalWeeks },
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

  console.log(`[Phases] ${totalWeeks} weeks: ${result.map(p => `${p.name}(${p.totalWeeks}w)`).join(' → ')}`);

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

// Deload weeks: end of each 4-week block
// Skip deloads for very short plans (≤5 weeks) — not enough training to warrant recovery
export function isDeloadWeek(weekNumber, totalWeeks) {
  if (totalWeeks && totalWeeks <= 5) return false;
  return weekNumber > 1 && weekNumber % 4 === 0;
}
