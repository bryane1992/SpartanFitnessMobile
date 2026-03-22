// Core workout generation logic (adapted from web app)
// This is the heart of your training program

const PHASES = [
  { name: "FOUNDATION", weeks: [1, 4], color: "#FF4136", desc: "Rebuild base, run to 3mi, muscle memory" },
  { name: "BUILD", weeks: [5, 8], color: "#FF851B", desc: "Push heavier, 5K+ runs, bulk arms & chest" },
  { name: "PEAK", weeks: [9, 12], color: "#B10DC9", desc: "Heaviest phase, 8K+ runs, max definition" },
  { name: "RACE PREP", weeks: [13, 15], color: "#01FF70", desc: "Taper, race-pace 10K, obstacle simulation" },
];

const getPhase = (week) => {
  return PHASES.find(p => week >= p.weeks[0] && week <= p.weeks[1]) || PHASES[0];
};

const isBenchmarkWeek = (week) => {
  return [4, 8, 12].includes(week);
};

// Generate a complete week of workouts
export function generateWeek(week, previousWeek, userProfile = null) {
  const phase = getPhase(week);
  const p = phase.name;
  const isBenchmark = isBenchmarkWeek(week);
  
  // Adjust based on user profile
  const experienceMultiplier = userProfile?.experience === 'beginner' ? 0.7 :
                               userProfile?.experience === 'intermediate' ? 0.9 :
                               userProfile?.experience === 'advanced' ? 1.0 :
                               userProfile?.experience === 'elite' ? 1.2 : 0.9;
  
  const hasGymAccess = userProfile?.equipment?.includes('full_gym') || 
                       userProfile?.equipment?.includes('home_gym');
  
  // Progression helper - increases weight by 5% each week
  const calculateProgression = (previousWeight, fallback, max = 155) => {
    if (!previousWeight) return fallback;
    return Math.min(Math.round(previousWeight * 1.05 / 5) * 5, max);
  };
  
  // Base weights by phase (adjusted by experience level)
  const benchPress = Math.round((p === "FOUNDATION" ? 75 : p === "BUILD" ? 90 : p === "PEAK" ? 105 : 95) * experienceMultiplier / 5) * 5;
  const squat = Math.round((p === "FOUNDATION" ? 85 : p === "BUILD" ? 105 : p === "PEAK" ? 120 : 105) * experienceMultiplier / 5) * 5;
  const dumbbellMon = Math.round((p === "FOUNDATION" ? 30 : p === "BUILD" ? 35 : p === "PEAK" ? 40 : 35) * experienceMultiplier / 5) * 5;
  
  // Running parameters
  const intervals = p === "FOUNDATION" ? 4 : p === "BUILD" ? 6 : p === "PEAK" ? 8 : 6;
  const shortRun = p === "FOUNDATION" ? "2-2.5 mi" : p === "BUILD" ? "3-3.5 mi" : p === "PEAK" ? "4-5 mi" : "3-4 mi";
  const longRun = p === "FOUNDATION" ? "2.5-3 mi" : p === "BUILD" ? "4-4.5 mi" : p === "PEAK" ? "5-6.5 mi" : "6-6.5 mi (10K pace)";
  
  // Workout themes by phase
  const themes = {
    FOUNDATION: ["GARAGE WARRIOR", "ROAD WORK", "ARMOR UP", "LEGS & GUNS", "DISTANCE DAY"],
    BUILD: ["MASS MONDAY", "SPEED WORK", "GUN SHOW", "HEAVY CARRY", "LONG HAUL"],
    PEAK: ["PEAK POWER", "RACE PACE", "MAX UPPER", "MAX LOWER", "DISTANCE PR"],
    "RACE PREP": ["SHARP & READY", "RACE REHEARSAL", "MAINTAIN", "OBSTACLE READY", "FINAL LONG"]
  };
  
  const weekThemes = themes[p] || themes.FOUNDATION;
  
  return {
    monday: generateMonday(week, phase, isBenchmark, benchPress, squat, dumbbellMon, weekThemes[0]),
    tuesday: generateTuesday(week, phase, intervals, shortRun, weekThemes[1]),
    wednesday: generateWednesday(week, phase, isBenchmark, weekThemes[2]),
    thursday: generateThursday(week, phase, weekThemes[3]),
    friday: generateFriday(week, phase, longRun, weekThemes[4])
  };
}

// Monday - Strength Day
function generateMonday(week, phase, isBenchmark, benchPress, squat, dumbbellWeight, theme) {
  const p = phase.name;
  
  return {
    day: "MON",
    title: theme,
    color: "#FF4136",
    focus: isBenchmark ? "BENCHMARK WEEK — Test your strength!" : `${p} • Total Body Power`,
    blocks: [
      {
        name: "WARM-UP",
        type: "MOVEMENT PREP",
        time: "8 min",
        exercises: [
          { name: "Row or Run", sets: "3 min", weight: "Gradually build pace" },
          { name: "Dynamic Stretching", sets: "2 min", weight: "Full body" },
          { name: "Goblet Squats", sets: "10", weight: "Light KB" },
          { name: "Push-Up to T", sets: "10 alt", weight: "BW" }
        ]
      },
      {
        name: "POWER LIFTS",
        type: isBenchmark ? "STRENGTH TEST" : "COMPOUND MOVEMENTS",
        time: "25 min",
        exercises: [
          { name: week >= 5 ? "Deadlift" : "Trap Bar Deadlift", sets: isBenchmark ? "Build to heavy 3" : "5×5", weight: `${135} lb` },
          { name: "Bench Press", sets: isBenchmark ? "Build to heavy 5" : "5×5", weight: `${benchPress} lb` },
          { name: week >= 5 ? "Back Squat" : "Front Squat", sets: isBenchmark ? "Build to heavy 5" : "5×5", weight: `${squat} lb` }
        ]
      },
      {
        name: "ACCESSORY CIRCUIT",
        type: "SUPERSETS",
        time: "12 min",
        exercises: [
          { name: "Pull-Ups", sets: `3×${Math.min(5 + Math.floor(week / 2), 12)}`, weight: "BW" },
          { name: "Dips", sets: `3×${Math.min(8 + Math.floor(week / 2), 15)}`, weight: "BW" },
          { name: "Walking Lunges", sets: "3×10 ea", weight: `${Math.max(20, dumbbellWeight - 10)} lb DBs` }
        ]
      },
      {
        name: "CORE FINISHER",
        type: "SPARTAN CORE",
        time: "8 min",
        amrap: true,
        exercises: [
          { name: "Plank to Push-Up", sets: "10", weight: "BW" },
          { name: "V-Ups", sets: "15", weight: "BW" },
          { name: "Russian Twists", sets: "20", weight: "25 lb plate" },
          { name: "Bear Crawl", sets: "10 steps", weight: "BW" }
        ]
      }
    ]
  };
}

// Tuesday - Running + Core
function generateTuesday(week, phase, intervals, distance, theme) {
  const p = phase.name;
  const runType = p === "FOUNDATION" ? "INTERVALS" : p === "BUILD" ? (week % 2 === 0 ? "TEMPO" : "FARTLEK") : "RACE PACE";
  
  return {
    day: "TUE",
    title: theme,
    color: "#0074D9",
    focus: `${runType} • ${distance} target • Functional Core`,
    blocks: [
      {
        name: "WARM-UP",
        type: "DYNAMIC ACTIVATION",
        time: "8 min",
        exercises: [
          { name: "Easy Jog", sets: "3 min", weight: "Build pace" },
          { name: "Lunge Matrix", sets: "5 ea", weight: "All directions" },
          { name: "A-Skips", sets: "30s", weight: "Form drill" },
          { name: "Strides", sets: "3×50m", weight: "80% speed" }
        ]
      },
      {
        name: runType === "INTERVALS" ? "INTERVAL RUN" : `${runType} RUN`,
        type: "SPARTAN 10K BUILDER",
        time: p === "FOUNDATION" ? "20-25 min" : p === "BUILD" ? "25-35 min" : "30-40 min",
        hasGPS: true,
        exercises: runType === "INTERVALS" ? [
          { name: "Warm-Up Run", sets: "5 min", weight: "Easy pace" },
          { name: "Hard Interval", sets: "2 min", weight: "80-85% effort" },
          { name: "Recovery Jog", sets: "1 min", weight: "60% effort" },
          { name: `Repeat ×${intervals}`, sets: `${intervals} rounds`, weight: "Track splits" },
          { name: "Cool-Down Run", sets: "5 min", weight: "Easy jog" }
        ] : [
          { name: "Warm-Up Run", sets: "5 min", weight: "Easy pace" },
          { name: `${runType} Run`, sets: "20-25 min", weight: "Target pace" },
          { name: "Cool-Down Run", sets: "5 min", weight: "Easy jog" }
        ]
      },
      {
        name: "FUNCTIONAL CORE",
        type: "OBSTACLE PREP",
        time: "15 min",
        exercises: [
          { name: "Plank to Push-Up", sets: "3×10", weight: "BW" },
          { name: "Bear Crawl Hold", sets: `3×${20 + week * 2}s`, weight: "BW" },
          { name: "Pallof Press", sets: "3×12 ea", weight: "Band" },
          { name: "Turkish Get-Ups", sets: "3×3 ea", weight: `${week >= 5 ? 26 : 18} lb KB` }
        ]
      }
    ]
  };
}

// Wednesday - CrossFit WOD
function generateWednesday(week, phase, isBenchmark, theme) {
  const p = phase.name;
  
  return {
    day: "WED",
    title: theme,
    color: "#FF851B",
    focus: p === "FOUNDATION" ? "CrossFit Fundamentals" : p === "BUILD" ? "MetCon Mayhem" : "Beast Mode WOD",
    blocks: [
      {
        name: "WARM-UP",
        type: "DYNAMIC PREP",
        time: "8 min",
        exercises: [
          { name: "Row/Bike/Run", sets: "3 min", weight: "Build intensity" },
          { name: "PVC Pass-Throughs", sets: "15", weight: "Shoulder mobility" },
          { name: "Samson Stretch", sets: "30s ea", weight: "Hip flexors" },
          { name: "Air Squats", sets: "15", weight: "Deep & controlled" }
        ]
      },
      {
        name: week >= 9 ? "STRENGTH/SKILL" : "SKILL WORK",
        type: week >= 9 ? "OLYMPIC LIFTING" : "MOVEMENT PRACTICE",
        time: "15 min",
        exercises: week >= 5 ? [
          { name: "Power Clean", sets: week >= 9 ? "5×3" : "5×5", weight: "65-115 lb" },
          { name: "Front Squat", sets: "3×8", weight: "65-95 lb" },
          week >= 9 && { name: "Push Jerk", sets: "3×5", weight: "65-95 lb" }
        ].filter(Boolean) : [
          { name: "Hang Power Clean", sets: "5×5", weight: "45 lb bar" },
          { name: "Front Squat", sets: "3×8", weight: "45 lb" }
        ]
      },
      {
        name: "WOD",
        type: isBenchmark ? "BENCHMARK TEST" : "WORKOUT OF THE DAY",
        time: p === "FOUNDATION" ? "12 min" : p === "BUILD" ? "15 min" : "20 min",
        amrap: true,
        exercises: p === "FOUNDATION" ? [
          { name: "Box Jumps", sets: "10", weight: "20\" box" },
          { name: "Push-Ups", sets: "10", weight: "BW" },
          { name: "KB Swings", sets: "15", weight: "35 lb" },
          { name: "Sit-Ups", sets: "15", weight: "BW" }
        ] : p === "BUILD" ? [
          { name: "Wall Balls", sets: "15", weight: "14 lb" },
          { name: "Pull-Ups", sets: "10", weight: "BW" },
          { name: "Box Jump Overs", sets: "10", weight: "24\" box" },
          { name: "Thrusters", sets: "10", weight: "65 lb" }
        ] : [
          { name: "Burpee Box Jumps", sets: "10", weight: "24\" box" },
          { name: "Toes to Bar", sets: "10", weight: "BW" },
          { name: "DB Snatches", sets: "10 alt", weight: "35 lb" },
          { name: "Double Unders", sets: "30", weight: "Jump rope" }
        ]
      }
    ]
  };
}

// Thursday - Obstacle Training
function generateThursday(week, phase, theme) {
  const p = phase.name;
  
  return {
    day: "THU",
    title: theme,
    color: "#2ECC40",
    focus: p === "FOUNDATION" ? "Functional Strength" : p === "BUILD" ? "Obstacle Prep" : "Race Simulation",
    blocks: [
      {
        name: "WARM-UP",
        type: "ACTIVATE",
        time: "8 min",
        exercises: [
          { name: "Assault Bike/Row", sets: "3 min", weight: "Build intensity" },
          { name: "Bear Crawl", sets: "20 steps", weight: "Forward & back" },
          { name: "Cossack Squats", sets: "10 ea", weight: "BW" },
          { name: "Burpees", sets: "10", weight: "Get heart rate up" }
        ]
      },
      {
        name: "STRENGTH CIRCUIT",
        type: "FUNCTIONAL POWER",
        time: "20 min",
        exercises: [
          { name: week >= 5 ? "Sandbag Squat" : "Goblet Squat", sets: "3×12", weight: week >= 5 ? "60 lb bag" : "50 lb KB" },
          { name: "Tire Flips", sets: "3×5", weight: "Medium tire" },
          { name: week >= 9 ? "Rope Climb" : "Rope Pull-Ups", sets: week >= 9 ? "3×1" : "3×8", weight: "15 ft rope" },
          { name: "Sled Push", sets: "3×40 yd", weight: p === "FOUNDATION" ? "90 lb" : p === "BUILD" ? "135 lb" : "180 lb" }
        ]
      },
      {
        name: "OBSTACLE TRAINING",
        type: week >= 9 ? "RACE SPECIFIC" : "BUILD SKILLS",
        time: "15 min",
        exercises: [
          { name: "Spear Throw", sets: "10 throws", weight: "Practice form" },
          { name: "Wall Balls", sets: "3×20", weight: "20 lb" },
          { name: "Bucket Carry", sets: "2×100 yd", weight: "50 lb" },
          week >= 5 && { name: "Atlas Stone Lift", sets: "3×5", weight: "50 lb stone" }
        ].filter(Boolean)
      }
    ]
  };
}

// Friday - Long Run + Obstacles
function generateFriday(week, phase, distance, theme) {
  const p = phase.name;
  
  return {
    day: "FRI",
    title: theme,
    color: "#FFDC00",
    focus: `${distance} Obstacle Run + Grip Work`,
    blocks: [
      {
        name: "WARM-UP",
        type: "PRE-RUN ACTIVATION",
        time: "8 min",
        exercises: [
          { name: "Easy Jog", sets: "4 min", weight: "Very easy pace" },
          { name: "Dynamic Stretching", sets: "2 min", weight: "Full body" },
          { name: "Strides", sets: "3×30s", weight: "Build speed" }
        ]
      },
      {
        name: "OBSTACLE RUN",
        type: week >= 9 ? "RACE SIMULATION" : "ENDURANCE + OBSTACLES",
        time: p === "FOUNDATION" ? "25-30 min" : p === "BUILD" ? "35-40 min" : p === "PEAK" ? "45-55 min" : "50-60 min",
        hasGPS: true,
        exercises: [
          { name: "Steady Run", sets: "5-8 min", weight: "Target pace" },
          { name: "Obstacle Station 1", sets: "2 min", weight: "20 burpees + 20 squats" },
          { name: "Continue Run", sets: "5-8 min", weight: "Resume pace" },
          { name: "Obstacle Station 2", sets: "2 min", weight: "Bear crawl 20m + 10 pull-ups" },
          { name: "Final Run", sets: "5-10 min", weight: "Strong finish" }
        ]
      },
      {
        name: "GRIP & CARRY",
        type: "SPARTAN SPECIFIC",
        time: "12 min",
        exercises: [
          { name: "Dead Hang", sets: `3×${20 + week * 2}s`, weight: "From bar" },
          { name: "Farmer Walk", sets: "3×60 yd", weight: "Heavy KBs" },
          { name: "Plate Pinch", sets: "3×max", weight: "10-25 lb plates" }
        ]
      }
    ]
  };
}

// Get a specific day's workout
export function getWorkoutForDay(week, dayIndex, userProfile = null) {
  const weekWorkouts = generateWeek(week, null, userProfile);
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  return weekWorkouts[days[dayIndex]];
}

// Calculate progression for an exercise
export function calculateProgression(exerciseName, currentWeight, week) {
  // Simple 5% progression each week
  const progressionRate = 1.05;
  const roundTo = 5; // Round to nearest 5 lbs
  
  const newWeight = currentWeight * progressionRate;
  return Math.round(newWeight / roundTo) * roundTo;
}