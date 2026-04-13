import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import useWorkoutStore from '../store/useWorkoutStore';
import { initDatabase, deleteAllPlanData, syncExerciseDb, getExerciseCount, exportPlanAsText, upgradeExercisesForNewEquipment } from '../data/database';
import { testArchetypes, TEST_PROFILES, getTestProfile } from '../core/testProfiles';

const STYLE_LABELS = {
  crossfit: 'CrossFit',
  traditional: 'Traditional Gym',
  bodyweight: 'Bodyweight',
  hybrid: 'Hybrid',
};

const BODY_COMP_LABELS = {
  bulk: 'Bulk Up',
  cut: 'Cut Fat',
  maintain: 'Maintain',
  endurance: 'Endurance',
};

const GOAL_LABELS = {
  build_muscle: 'Build Muscle',
  lose_fat: 'Lose Fat',
  get_stronger: 'Get Stronger',
  endurance: 'Improve Endurance',
  athletic: 'Athletic Performance',
  general_fitness: 'General Fitness',
};

const EQUIP_ICONS = {
  dumbbells: 'DB', barbell: 'BB', squat_rack: 'RK', bench: 'BN',
  pull_up_bar: 'PU', kettlebell: 'KB', cables: 'CB', machines: 'MC',
  bands: 'BD', cardio_machines: 'CM', outdoor: 'OD', rings: 'RG', jump_rope: 'JR',
  tire: 'TR', sled: 'SL',
};

const EQUIPMENT_LIST = [
  { id: 'dumbbells', label: 'Dumbbells' },
  { id: 'barbell', label: 'Barbell & Plates' },
  { id: 'squat_rack', label: 'Squat Rack' },
  { id: 'bench', label: 'Bench' },
  { id: 'pull_up_bar', label: 'Pull-Up Bar' },
  { id: 'kettlebell', label: 'Kettlebells' },
  { id: 'cables', label: 'Cable Machine' },
  { id: 'machines', label: 'Gym Machines' },
  { id: 'bands', label: 'Resistance Bands' },
  { id: 'cardio_machines', label: 'Cardio Machines' },
  { id: 'outdoor', label: 'Outdoor Space' },
  { id: 'rings', label: 'Gymnastics Rings' },
  { id: 'jump_rope', label: 'Jump Rope' },
  { id: 'tire', label: 'Tire' },
  { id: 'sled', label: 'Sled' },
];

export default function Settings({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [exerciseCount, setExerciseCount] = useState(0);
  const [lastSync, setLastSync] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  const [claudeKey, setClaudeKey] = useState('');
  const [hasClaudeKey, setHasClaudeKey] = useState(false);
  const [showEquipModal, setShowEquipModal] = useState(false);
  const [editEquipment, setEditEquipment] = useState([]);
  const { generateNewPlan, totalWeeks, planPhases, currentPlanId } = useWorkoutStore();

  useEffect(() => {
    loadProfile();
    loadLibraryInfo();
    loadClaudeKey();
  }, []);

  const loadClaudeKey = async () => {
    const key = await AsyncStorage.getItem('claudeApiKey');
    setHasClaudeKey(!!key);
  };

  const saveClaudeKey = async () => {
    if (claudeKey.trim()) {
      await AsyncStorage.setItem('claudeApiKey', claudeKey.trim());
      setHasClaudeKey(true);
      setClaudeKey('');
      Alert.alert('Saved', 'AI Coach is now enabled!');
    }
  };

  const loadProfile = async () => {
    try {
      const str = await AsyncStorage.getItem('userProfile');
      if (str) setProfile(JSON.parse(str));
    } catch (e) {
      console.error('Error loading profile:', e);
    }
  };

  const loadLibraryInfo = async () => {
    try {
      const count = await getExerciseCount();
      setExerciseCount(count);
      const syncDate = await AsyncStorage.getItem('lastExerciseSync');
      setLastSync(syncDate);
    } catch (e) {
      console.error('Error loading library info:', e);
    }
  };

  const handleSyncLibrary = async () => {
    setIsSyncing(true);
    setSyncProgress('Starting...');
    try {
      const count = await syncExerciseDb((fetched, total) => {
        setSyncProgress(`${fetched}/${total} exercises`);
      });
      setSyncProgress(`Done! ${count} exercises synced`);
      await loadLibraryInfo();
    } catch (e) {
      setSyncProgress('Sync failed — check connection');
      console.error('Sync error:', e);
    }
    setTimeout(() => {
      setIsSyncing(false);
      setSyncProgress('');
    }, 2000);
  };

  const handleUpdateEquipment = () => {
    setEditEquipment(profile?.equipment || []);
    setShowEquipModal(true);
  };

  const toggleEditEquip = (id) => {
    setEditEquipment(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  const saveEquipmentChanges = async () => {
    if (!profile) return;
    const oldEquip = new Set(profile.equipment || []);
    const added = editEquipment.filter(e => !oldEquip.has(e));
    const removed = [...oldEquip].filter(e => !new Set(editEquipment).has(e));

    // Save updated profile
    const updated = { ...profile, equipment: editEquipment };
    await AsyncStorage.setItem('userProfile', JSON.stringify(updated));
    setProfile(updated);
    setShowEquipModal(false);

    if (added.length === 0 && removed.length === 0) return;

    const changes = [];
    if (added.length > 0) changes.push(`Added: ${added.join(', ')}`);
    if (removed.length > 0) changes.push(`Removed: ${removed.join(', ')}`);

    // Build swap map from newly available exercises using movement pattern matching
    // For each exercise in the current plan, check if a better version is now available
    const { seedExercises, getMovementPattern } = require('../data/exerciseSeed');
    const allExercises = seedExercises();

    // Equipment mapping for filter
    const equipMap = {
      dumbbells: ['dumbbell'], barbell: ['barbell', 'bench'], squat_rack: ['rack', 'barbell'],
      bench: ['bench'], pull_up_bar: ['pull_up_bar'], kettlebell: ['kettlebell'],
      cables: ['cable'], machines: ['machine'], bands: ['band'],
    };
    const newAvailEquip = new Set();
    editEquipment.forEach(eq => (equipMap[eq] || []).forEach(m => newAvailEquip.add(m)));
    newAvailEquip.add('bodyweight');

    const oldAvailEquip = new Set();
    [...oldEquip].forEach(eq => (equipMap[eq] || []).forEach(m => oldAvailEquip.add(m)));
    oldAvailEquip.add('bodyweight');

    // Find exercises that are newly available (require equipment the user just added)
    const newlyAvailable = allExercises.filter(ex => {
      const req = ex.equipment_required || [];
      if (req.length === 0) return false; // bodyweight — already available
      const availableNow = req.every(r => newAvailEquip.has(r));
      const availableBefore = req.every(r => oldAvailEquip.has(r));
      return availableNow && !availableBefore; // newly unlocked
    });

    if (newlyAvailable.length === 0) {
      Alert.alert('Equipment Updated', `${changes.join('\n')}\n\nNo new exercises unlocked. Equipment saved for future plans.`);
      return;
    }

    // Build swap map: for each newly available exercise, find what it could replace
    // Match by movement pattern — pull-ups replace lat pulldowns, barbell squat replaces goblet squat
    const UPGRADE_PRIORITY = { barbell: 4, kettlebell: 3, dumbbell: 2, machine: 2, cable: 2, bodyweight: 1 };
    const swapMap = {};
    const swapDescriptions = [];

    for (const newEx of newlyAvailable) {
      const pattern = getMovementPattern(newEx);
      if (!pattern || pattern === 'warmup' || pattern === 'cardio') continue;

      // Find current plan exercises with the same pattern but lower equipment priority
      const candidates = allExercises.filter(old => {
        if (old.id === newEx.id) return false;
        if (getMovementPattern(old) !== pattern) return false;
        const oldPri = UPGRADE_PRIORITY[old.category] || 1;
        const newPri = UPGRADE_PRIORITY[newEx.category] || 1;
        return newPri > oldPri; // new exercise uses better equipment
      });

      for (const old of candidates) {
        if (!swapMap[old.id]) {
          swapMap[old.id] = newEx.id;
          swapDescriptions.push(`${old.name} → ${newEx.name}`);
          if (swapDescriptions.length >= 8) break;
        }
      }
      if (swapDescriptions.length >= 8) break;
    }

    console.log(`[Equipment] Newly available: ${newlyAvailable.map(e => e.id).join(', ')}`);
    console.log(`[Equipment] Swap map: ${JSON.stringify(swapMap)}`);
    console.log(`[Equipment] Descriptions: ${swapDescriptions.join(', ')}`);

    if (Object.keys(swapMap).length === 0) {
      Alert.alert('Equipment Updated', `${changes.join('\n')}\n\n${newlyAvailable.length} new exercises unlocked! They'll appear in your next plan.`);
      return;
    }

    Alert.alert(
      'Upgrade Exercises?',
      `${changes.join('\n')}\n\n${newlyAvailable.length} new exercises unlocked. Suggested swaps:\n\n${swapDescriptions.join('\n')}\n\nApply to future workouts?`,
      [
        { text: 'Save for Next Plan', style: 'cancel' },
        {
          text: 'Apply Swaps',
          onPress: async () => {
            try {
              console.log('[Equipment] Applying swaps:', JSON.stringify(swapMap));
              const total = await upgradeExercisesForNewEquipment(added, swapMap);
              console.log(`[Equipment] Total swapped: ${total}`);
              Alert.alert('Done', `${total} exercises upgraded across future workouts.`);
              await useWorkoutStore.getState().loadTodayWorkout();
            } catch (e) {
              console.error('Upgrade error:', e);
              Alert.alert('Error', 'Swap failed. New exercises saved for next plan.');
            }
          },
        },
      ]
    );
  };

  const handleRegenerate = () => {
    Alert.alert(
      'Regenerate Plan',
      'This will rebuild your entire workout plan. Completed workouts are saved to history. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            setIsRegenerating(true);
            try {
              await initDatabase();
              await generateNewPlan(profile);
            } catch (e) {
              console.error('Error regenerating:', e);
              Alert.alert('Error', 'Failed to regenerate plan. Please try again.');
            }
            setIsRegenerating(false);
          },
        },
      ]
    );
  };

  const handleExportPlan = async () => {
    try {
      const planId = currentPlanId;
      if (!planId) {
        Alert.alert('No Plan', 'Generate a plan first before exporting.');
        return;
      }
      const text = await exportPlanAsText(planId);
      const fileUri = FileSystem.documentDirectory + 'workout-plan.txt';
      await FileSystem.writeAsStringAsync(fileUri, text);
      await Sharing.shareAsync(fileUri, { mimeType: 'text/plain', dialogTitle: 'Share Workout Plan' });
    } catch (e) {
      console.error('Export error:', e);
      Alert.alert('Export Failed', 'Could not export plan. Try again.');
    }
  };

  const handleRestartOnboarding = () => {
    Alert.alert(
      'Redo Onboarding',
      'This will take you back to the onboarding flow to update all your preferences and generate a fresh plan.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: "Let's go",
          onPress: async () => {
            // Wipe all plan data from database
            await deleteAllPlanData();
            await AsyncStorage.removeItem('onboardingComplete');
            await AsyncStorage.removeItem('userProfile');
            await AsyncStorage.removeItem('planMeta');
            useWorkoutStore.getState().resetStore();
            navigation.replace('Onboarding');
          },
        },
      ]
    );
  };

  if (isRegenerating) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.regeneratingContainer}>
          <Text style={styles.regeneratingTitle}>Regenerating Plan</Text>
          <ActivityIndicator size="large" color="#FF4136" style={{ marginTop: 20 }} />
          <Text style={styles.regeneratingSub}>Rebuilding your workouts...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
        </View>

        {/* Profile */}
        {profile && (
          <>
            {/* Body Stats */}
            <View style={styles.statCardsRow}>
              {profile.weight ? (
                <View style={styles.statCard}>
                  <Text style={styles.statCardValue}>{profile.weight}</Text>
                  <Text style={styles.statCardUnit}>LBS</Text>
                </View>
              ) : null}
              {profile.height ? (
                <View style={styles.statCard}>
                  <Text style={styles.statCardValue}>{profile.height}</Text>
                  <Text style={styles.statCardUnit}>HEIGHT</Text>
                </View>
              ) : null}
              <View style={styles.statCard}>
                <Text style={styles.statCardValue}>{profile.trainingDaysPerWeek}</Text>
                <Text style={styles.statCardUnit}>DAYS/WK</Text>
              </View>
              {profile.sessionDuration ? (
                <View style={styles.statCard}>
                  <Text style={styles.statCardValue}>{profile.sessionDuration}</Text>
                  <Text style={styles.statCardUnit}>MIN</Text>
                </View>
              ) : null}
            </View>

            {/* Goals */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Goals</Text>
              <View style={styles.pillRow}>
                {(profile.goals || [profile.goal]).filter(Boolean).map((g, i) => (
                  <View key={i} style={styles.goalPill}>
                    <Text style={styles.goalPillText}>{GOAL_LABELS[g] || g}</Text>
                  </View>
                ))}
                {(profile.bodyCompGoals || [profile.bodyCompGoal]).filter(Boolean).map((g, i) => (
                  <View key={`bc-${i}`} style={[styles.goalPill, styles.goalPillSecondary]}>
                    <Text style={styles.goalPillSecondaryText}>{BODY_COMP_LABELS[g] || g}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.pillRow}>
                <View style={styles.infoPill}>
                  <Text style={styles.infoPillText}>{(profile.experience || 'beginner').toUpperCase()}</Text>
                </View>
                <View style={styles.infoPill}>
                  <Text style={styles.infoPillText}>{STYLE_LABELS[profile.workoutStyle] || profile.workoutStyle || ''}</Text>
                </View>
              </View>
            </View>

            {/* Working Weights */}
            {profile.workingWeights && Object.keys(profile.workingWeights).length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Working Weights</Text>
                <View style={styles.weightsGrid}>
                  {Object.entries(profile.workingWeights).map(([lift, weight]) => (
                    <View key={lift} style={styles.weightCard}>
                      <Text style={styles.weightValue}>{weight}</Text>
                      <Text style={styles.weightLabel}>{lift.replace('_', ' ').toUpperCase()}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Equipment */}
            <View style={styles.section}>
              <TouchableOpacity onPress={handleUpdateEquipment}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionTitle}>Equipment</Text>
                  <Text style={styles.editLink}>EDIT</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.equipGrid}>
                {(profile.equipment || []).map((eq, i) => {
                  const icon = EQUIP_ICONS[eq] || '?';
                  const label = EQUIPMENT_LIST.find(e => e.id === eq)?.label || eq;
                  return (
                    <View key={i} style={styles.equipCard}>
                      <Text style={styles.equipIcon}>{icon}</Text>
                      <Text style={styles.equipCardLabel}>{label}</Text>
                    </View>
                  );
                })}
              </View>
              {profile.equipmentDetails?.barbell?.maxWeight ? (
                <Text style={styles.equipDetail}>Barbell max: {profile.equipmentDetails.barbell.maxWeight} lbs</Text>
              ) : null}
              {profile.equipmentDetails?.dumbbells?.maxWeight ? (
                <Text style={styles.equipDetail}>Dumbbells up to {profile.equipmentDetails.dumbbells.maxWeight} lbs each</Text>
              ) : null}
              {profile.equipmentDetails?.kettlebell?.weights ? (
                <Text style={styles.equipDetail}>Kettlebells: {profile.equipmentDetails.kettlebell.weights} lbs</Text>
              ) : null}
            </View>
          </>
        )}

        {/* Plan Info */}
        {currentPlanId && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Current Plan</Text>
            <View style={styles.profileCard}>
              <ProfileRow label="Total Weeks" value={`${totalWeeks}`} />
              <ProfileRow label="Phases" value={planPhases.map(p => p.name).join(' > ')} />
              {profile?.hasRaceDate && profile?.eventDate ? (
                <ProfileRow label="Race Day" value={(() => {
                  const d = new Date(profile.eventDate);
                  const weeksOut = Math.max(0, Math.floor((d - new Date()) / (1000 * 60 * 60 * 24 * 7)));
                  return `${d.toLocaleDateString()} (${weeksOut} weeks)`;
                })()} />
              ) : null}
              {profile?.raceType ? (
                <ProfileRow label="Race" value={profile.raceType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} />
              ) : null}
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>

          <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('ExerciseLibrary')}>
            <View style={styles.actionContent}>
              <Text style={styles.actionLabel}>Exercise Library</Text>
              <Text style={styles.actionDesc}>Browse 1500+ exercises with GIF demos</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('WodLibrary')}>
            <View style={styles.actionContent}>
              <Text style={styles.actionLabel}>WOD Library</Text>
              <Text style={styles.actionDesc}>Classic CrossFit WODs — track your scores</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleExportPlan}>
            <View style={styles.actionContent}>
              <Text style={styles.actionLabel}>Export Plan</Text>
              <Text style={styles.actionDesc}>Share your workout plan as text</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Dev Tools — hidden in production builds */}
        {__DEV__ ? <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dev Tools</Text>

          <TouchableOpacity style={styles.actionButton} onPress={handleRegenerate}>
            <View style={styles.actionContent}>
              <Text style={styles.actionLabel}>Regenerate Plan</Text>
              <Text style={styles.actionDesc}>Rebuild plan with current preferences</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleRestartOnboarding}>
            <View style={styles.actionContent}>
              <Text style={styles.actionLabel}>Redo Onboarding</Text>
              <Text style={styles.actionDesc}>Change all preferences from scratch</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => {
            const results = testArchetypes();
            const passCount = results.filter(r => r.passed).length;
            Alert.alert('Archetype Tests', `${passCount}/${results.length} passed. Check console for details.`);
          }}>
            <View style={styles.actionContent}>
              <Text style={styles.actionLabel}>Test Archetypes</Text>
              <Text style={styles.actionDesc}>Run archetype detection on 7 test profiles</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={async () => {
            try {
              const { getSugarWods } = require('../data/sugarWodData');
              const { getDatabase: getDb } = require('../data/database');
              const db = await getDb();
              await db.runAsync('DELETE FROM wods');
              const wods = getSugarWods();
              let count = 0;
              for (const w of wods) {
                try {
                  await db.runAsync(
                    `INSERT OR IGNORE INTO wods (id, name, category, type, description, movements, scheme, time_cap, rx_weight, difficulty, estimated_time, equipment, tips)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [w.id, w.name, w.category, w.type, w.description || '',
                     JSON.stringify(w.movements), w.scheme || '', w.timeCap || '',
                     w.rxWeight || '', w.difficulty || 'intermediate',
                     w.estimatedTime || '', JSON.stringify(w.equipment || []), w.tips || '']
                  );
                  count++;
                } catch { /* skip */ }
              }
              Alert.alert('Done', `Loaded ${count} verified WODs (Girls + Heroes) from SugarWOD data.`);
            } catch (e) {
              console.error('WOD reseed error:', e);
              Alert.alert('Error', e.message);
            }
          }}>
            <View style={styles.actionContent}>
              <Text style={styles.actionLabel}>Reset WOD Library</Text>
              <Text style={styles.actionDesc}>Replace WODs with 266 verified SugarWOD benchmarks</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={async () => {
            try {
              Alert.alert('Seeding...', 'Creating 8 weeks of workout history...');
              const { seedTestWorkoutData } = require('../core/seedTestData');
              await seedTestWorkoutData();
              Alert.alert('Done', 'Seeded 8 weeks of workout history with weight progressions, runs, and AMRAP scores. Check the Stats tab!');
            } catch (e) {
              console.error('Seed error:', e);
              Alert.alert('Error', e.message);
            }
          }}>
            <View style={styles.actionContent}>
              <Text style={styles.actionLabel}>Seed Test Data</Text>
              <Text style={styles.actionDesc}>Create 8 weeks of workout history for stats testing</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => {
            const keys = Object.keys(TEST_PROFILES);
            Alert.alert('Generate Test Plan', 'Pick a profile to generate:', keys.map(key => ({
              text: TEST_PROFILES[key].label,
              onPress: async () => {
                const profile = getTestProfile(key);
                if (!profile) return;
                try {
                  Alert.alert('Generating...', `Building plan for: ${TEST_PROFILES[key].label}`);
                  const { generateAIPlan } = require('../core/aiPlanGenerator');
                  const result = await generateAIPlan(profile, (status) => console.log(`[Test] ${status}`));
                  Alert.alert('Done', `Plan "${result.planName}" generated: ${result.totalWeeks} weeks`);
                } catch (e) {
                  Alert.alert('Error', e.message);
                  console.error('Test plan error:', e);
                }
              },
            })).concat({ text: 'Cancel', style: 'cancel' }));
          }}>
            <View style={styles.actionContent}>
              <Text style={styles.actionLabel}>Generate Test Plan</Text>
              <Text style={styles.actionDesc}>Build a plan for a test profile (check console)</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={async () => {
            try {
              const { getDatabase: getDb } = require('../data/database');
              const db = await getDb();
              const profileStr = await AsyncStorage.getItem('userProfile');
              if (!profileStr) { Alert.alert('No Profile', 'Complete onboarding first.'); return; }
              const prof = JSON.parse(profileStr);
              const planId = currentPlanId;
              if (!planId) { Alert.alert('No Plan', 'Generate a plan first.'); return; }

              Alert.alert('Reviewing...', 'AI fitness expert is analyzing your plan...');

              // Load plan data
              const days = await db.getAllAsync('SELECT * FROM plan_days WHERE plan_id = ? ORDER BY week_number, day_of_week', [planId]);
              for (const day of days) {
                day.blocks = await db.getAllAsync('SELECT * FROM plan_blocks WHERE plan_day_id = ? ORDER BY sort_order', [day.id]);
                for (const block of day.blocks) {
                  block.exercises = await db.getAllAsync(
                    'SELECT pe.*, COALESCE(e.name, pe.exercise_id) as name FROM plan_exercises pe LEFT JOIN exercises e ON e.id = pe.exercise_id WHERE pe.plan_block_id = ? ORDER BY pe.sort_order',
                    [block.id]
                  );
                }
              }

              const { reviewPlan } = require('../core/planReviewer');
              const review = await reviewPlan(days, prof);
              console.log('[Review]\n' + review);
              Alert.alert('AI Review Complete', review.substring(0, 500) + (review.length > 500 ? '...\n\nFull review in console.' : ''));
            } catch (e) {
              console.error('Review error:', e);
              Alert.alert('Error', e.message);
            }
          }}>
            <View style={styles.actionContent}>
              <Text style={styles.actionLabel}>AI Review Plan</Text>
              <Text style={styles.actionDesc}>Have an AI fitness expert critique your current plan</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, { borderColor: '#FF4136', borderWidth: 1 }]} onPress={async () => {
            try {
              Alert.alert('Full Suite', 'Generates 4 plans + AI reviews + 5 coach conversations.\nTakes ~5-8 min. Results saved to file.\n\nContinue?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Run', onPress: async () => {
                  try {
                    const { runPlanSuite } = require('../core/testPlanSuite');
                    const result = await runPlanSuite(
                      (msg) => console.log(msg),
                      (status) => console.log(`[Suite] ${status}`)
                    );
                    const planSummary = result.scores.map(s =>
                      `${s.label.substring(0, 30)}: ${s.score ? s.score + '/10' : 'ERR'}`
                    ).join('\n');
                    const coachSummary = (result.coachResults || []).map(r =>
                      `${r.label}: ${r.error ? 'ERR' : r.failed === 0 ? 'PASS' : 'FAIL'}`
                    ).join('\n');
                    Alert.alert(
                      `Suite Complete — Plans ${result.average}/10 | Coach ${result.coachPassed}/${result.coachTotal}`,
                      `Plans:\n${planSummary}\n\nCoach:\n${coachSummary}\n\nFull results in console.`
                    );
                  } catch (e) {
                    console.error('Suite error:', e);
                    Alert.alert('Error', e.message);
                  }
                }},
              ]);
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          }}>
            <View style={styles.actionContent}>
              <Text style={[styles.actionLabel, { color: '#FF4136' }]}>Full Plan Suite</Text>
              <Text style={styles.actionDesc}>4 plans + AI review + 5 coach conversations, save results to file</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={async () => {
            try {
              Alert.alert('Generating...', 'Building 4 short plans (4/5/6/8 weeks)...\nThis takes ~2 min.');
              const { testShortPlans } = require('../core/testShortPlans');
              const result = await testShortPlans(
                (msg) => console.log(msg),
                (status) => console.log(`[ShortPlanTest] ${status}`)
              );
              const summary = result.plans.map(p =>
                p.error ? `${p.label}: ERROR` : `${p.label}: ${p.passed}/${p.passed + p.failed}`
              ).join('\n');
              Alert.alert(
                result.success ? 'Short Plans PASS' : 'Issues Found',
                `${result.passed}/${result.passed + result.failed} checks passed\n\n${summary}\n\nFull log in console.`
              );
            } catch (e) {
              console.error('Short plan test error:', e);
              Alert.alert('Error', e.message);
            }
          }}>
            <View style={styles.actionContent}>
              <Text style={styles.actionLabel}>Test Short Plans</Text>
              <Text style={styles.actionDesc}>Generate 4/5/6/8-week plans and validate phases</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={async () => {
            try {
              Alert.alert('Testing...', 'Running coach action tests...');
              const { testCoachActions } = require('../core/testCoachActions');
              const result = await testCoachActions((msg) => console.log(msg));
              if (result.success) {
                Alert.alert('Coach Actions WORKING',
                  `${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped\n\nUndo, injury matching, WOD restore all verified.\nCheck console for details.`
                );
              } else {
                Alert.alert('Test Issues', `${result.passed} passed, ${result.failed} FAILED, ${result.skipped} skipped.\nCheck console.`);
              }
            } catch (e) {
              console.error('Coach test error:', e);
              Alert.alert('Error', e.message);
            }
          }}>
            <View style={styles.actionContent}>
              <Text style={styles.actionLabel}>Test Coach Actions</Text>
              <Text style={styles.actionDesc}>Test undo, injury auto-modify, WOD restore</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={async () => {
            try {
              Alert.alert('Testing...', 'Simulating workouts and checking autoregulation...');
              const { testAutoregulation } = require('../core/testAutoregulation');
              const result = await testAutoregulation((msg) => console.log(msg));
              if (result.success) {
                Alert.alert('Autoregulation WORKS',
                  `${result.targetExercise}: prescribed ${result.prescribedWeight} lb, logged ${result.actualWeight} lb\n` +
                  `${result.adjustedCount} future weeks adjusted\n` +
                  `${result.verified} verifications passed\n\nCheck console for full log.`
                );
              } else {
                Alert.alert('Test Issue', result.error || `${result.failures} verification failures. Check console.`);
              }
            } catch (e) {
              console.error('Autoreg test error:', e);
              Alert.alert('Error', e.message);
            }
          }}>
            <View style={styles.actionContent}>
              <Text style={styles.actionLabel}>Test Autoregulation</Text>
              <Text style={styles.actionDesc}>Simulate logging different weights and verify future adjustments</Text>
            </View>
          </TouchableOpacity>
        </View> : null}

        {/* App Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.profileCard}>
            <ProfileRow label="App" value="GritOS" />
            <ProfileRow label="Version" value="1.0.0" />
          </View>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <TouchableOpacity style={[styles.actionButton, { borderColor: '#FF4136', borderWidth: 1 }]} onPress={() => {
            Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign Out', style: 'destructive', onPress: async () => {
                try {
                  const { supabase } = require('../data/supabase');
                  await supabase.auth.signOut();
                } catch (e) {
                  console.error('Sign out error:', e);
                }
              }},
            ]);
          }}>
            <View style={styles.actionContent}>
              <Text style={[styles.actionLabel, { color: '#FF4136' }]}>Sign Out</Text>
              <Text style={styles.actionDesc}>Log out of your GritOS account</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Equipment Update Modal */}
      <Modal visible={showEquipModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>UPDATE EQUIPMENT</Text>
            <Text style={styles.modalSub}>Select all equipment you currently have</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {EQUIPMENT_LIST.map(eq => (
                <TouchableOpacity
                  key={eq.id}
                  style={[styles.equipItem, editEquipment.includes(eq.id) && styles.equipItemSelected]}
                  onPress={() => toggleEditEquip(eq.id)}
                >
                  <Text style={[styles.equipLabel, editEquipment.includes(eq.id) && styles.equipLabelSelected]}>{eq.label}</Text>
                  {editEquipment.includes(eq.id) ? <Text style={styles.equipCheck}>{'\u2713'}</Text> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowEquipModal(false)}>
                <Text style={styles.modalBtnText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnSave} onPress={saveEquipmentChanges}>
                <Text style={styles.modalBtnSaveText}>SAVE CHANGES</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ProfileRow({ label, value }) {
  return (
    <View style={styles.profileRow}>
      <Text style={styles.profileLabel}>{label}</Text>
      <Text style={styles.profileValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    padding: 20,
    paddingTop: 10,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
  },
  section: {
    paddingHorizontal: 15,
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  editLink: {
    color: '#FF4136',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Stat Cards (body stats row)
  statCardsRow: {
    flexDirection: 'row',
    marginHorizontal: 15,
    marginBottom: 16,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  statCardValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    fontFamily: 'monospace',
  },
  statCardUnit: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 3,
  },

  // Goal Pills
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  goalPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,65,54,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,65,54,0.2)',
  },
  goalPillText: {
    color: '#FF4136',
    fontSize: 12,
    fontWeight: '700',
  },
  goalPillSecondary: {
    backgroundColor: 'rgba(1,255,112,0.06)',
    borderColor: 'rgba(1,255,112,0.15)',
  },
  goalPillSecondaryText: {
    color: '#01FF70',
    fontSize: 12,
    fontWeight: '700',
  },
  infoPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  infoPillText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Working Weights
  weightsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  weightCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    minWidth: 80,
    borderWidth: 1,
    borderColor: 'rgba(255,65,54,0.1)',
  },
  weightValue: {
    color: '#FF4136',
    fontSize: 22,
    fontWeight: '900',
    fontFamily: 'monospace',
  },
  weightLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 4,
  },

  // Equipment Grid
  equipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  equipCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    minWidth: 70,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  equipIcon: {
    color: '#FF4136',
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'monospace',
  },
  equipCardLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  equipDetail: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    marginTop: 8,
    fontFamily: 'monospace',
  },

  profileCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 5,
    overflow: 'hidden',
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
  },
  profileLabel: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  profileValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    flex: 1.5,
    textAlign: 'right',
  },
  actionButton: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionContent: {
    flex: 1,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  actionDesc: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  apiKeyInput: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  regeneratingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  regeneratingTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
  },
  regeneratingSub: {
    color: '#888',
    fontSize: 15,
    marginTop: 15,
  },
  // Equipment modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalTitle: { color: '#FF4136', fontSize: 16, fontWeight: '900', letterSpacing: 2, marginBottom: 4 },
  modalSub: { color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: 'monospace', marginBottom: 16 },
  equipItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8, marginBottom: 4, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  equipItemSelected: { borderColor: '#FF4136', backgroundColor: 'rgba(255,65,54,0.06)' },
  equipLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
  equipLabelSelected: { color: '#fff' },
  equipCheck: { color: '#FF4136', fontSize: 16, fontWeight: '900' },
  modalButtons: { flexDirection: 'row', marginTop: 16, gap: 10 },
  modalBtnCancel: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalBtnSave: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, backgroundColor: 'rgba(255,65,54,0.15)', borderWidth: 1, borderColor: 'rgba(255,65,54,0.3)' },
  modalBtnText: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  modalBtnSaveText: { color: '#FF4136', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
});
