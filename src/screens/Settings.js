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

  // Equipment upgrade swap maps — when new equipment is added, swap exercises
  const EQUIPMENT_UPGRADES = {
    pull_up_bar: {
      lat_pulldown: 'pull_ups',           // machine pull → real pull-ups
      close_grip_lat_pulldown: 'chin_ups', // close-grip → chin-ups
      band_assisted_pull_ups: 'pull_ups',  // assisted → real
    },
    barbell: {
      db_bench_press: 'bench_press',       // DB bench → barbell bench
      db_goblet_squat: 'back_squat',       // goblet → back squat
      db_romanian_deadlift: 'deadlift',    // DB RDL → barbell deadlift
      db_shoulder_press: 'overhead_press',  // DB OHP → barbell OHP
    },
    squat_rack: {
      leg_press: 'back_squat',             // leg press → rack squats
    },
    kettlebell: {
      db_swing: 'kb_swings',               // DB swing → KB swing
      db_goblet_squat: 'kb_goblet_squat',  // DB goblet → KB goblet
    },
    cables: {
      db_fly: 'cable_fly',                 // DB fly → cable fly
      reverse_fly: 'face_pulls',           // DB reverse fly → cable face pulls
    },
  };

  const saveEquipmentChanges = async () => {
    if (!profile) return;
    const oldEquip = new Set(profile.equipment || []);
    const newEquip = new Set(editEquipment);
    const added = editEquipment.filter(e => !oldEquip.has(e));
    const removed = [...oldEquip].filter(e => !newEquip.has(e));

    // Save updated profile
    const updated = { ...profile, equipment: editEquipment };
    await AsyncStorage.setItem('userProfile', JSON.stringify(updated));
    setProfile(updated);
    setShowEquipModal(false);

    if (added.length === 0 && removed.length === 0) return;

    const changes = [];
    if (added.length > 0) changes.push(`Added: ${added.join(', ')}`);
    if (removed.length > 0) changes.push(`Removed: ${removed.join(', ')}`);

    // Build swap map from added equipment
    const swapMap = {};
    for (const equip of added) {
      const upgrades = EQUIPMENT_UPGRADES[equip];
      if (upgrades) Object.assign(swapMap, upgrades);
    }
    const swapCount = Object.keys(swapMap).length;

    if (swapCount > 0 && added.length > 0) {
      Alert.alert(
        'Equipment Updated',
        `${changes.join('\n')}\n\nUpgrade future workouts to use your new ${added.join(' & ')}? This keeps your completed workouts and just swaps in better exercises going forward.`,
        [
          { text: 'Keep Current Exercises', style: 'cancel' },
          {
            text: 'Upgrade Exercises',
            onPress: async () => {
              try {
                const total = await upgradeExercisesForNewEquipment(added, swapMap);
                Alert.alert('Upgraded', `${total} exercises updated across future workouts to use your new equipment.`);
                await useWorkoutStore.getState().loadTodayWorkout();
              } catch (e) {
                console.error('Equipment upgrade error:', e);
                Alert.alert('Error', 'Failed to upgrade exercises. Try regenerating the plan.');
              }
            },
          },
        ]
      );
    } else if (removed.length > 0) {
      Alert.alert(
        'Equipment Updated',
        `${changes.join('\n')}\n\nYou removed equipment. Regenerate your plan to remove exercises that need it?`,
        [
          { text: 'Keep Current Plan', style: 'cancel' },
          {
            text: 'Regenerate Plan',
            style: 'destructive',
            onPress: async () => {
              setIsRegenerating(true);
              try {
                await initDatabase();
                await generateNewPlan(updated);
              } catch (e) {
                console.error('Error regenerating:', e);
              }
              setIsRegenerating(false);
            },
          },
        ]
      );
    } else {
      Alert.alert('Equipment Updated', changes.join('\n'));
    }
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

        {/* Profile Summary */}
        {profile && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Profile</Text>

            <View style={styles.profileCard}>
              <ProfileRow label="Goals" value={
                profile.goals
                  ? profile.goals.map(g => GOAL_LABELS[g] || g).join(', ')
                  : (GOAL_LABELS[profile.goal] || profile.goal || '')
              } />
              {profile.sex ? (
                <ProfileRow label="Sex" value={profile.sex.charAt(0).toUpperCase() + profile.sex.slice(1)} />
              ) : null}
              {profile.height ? (
                <ProfileRow label="Height" value={profile.height} />
              ) : null}
              {profile.weight ? (
                <ProfileRow label="Weight" value={`${profile.weight} lbs`} />
              ) : null}
              {profile.bmi ? (
                <ProfileRow label="BMI" value={`${profile.bmi}`} />
              ) : null}
              <ProfileRow label="Experience" value={profile.experience?.charAt(0).toUpperCase() + profile.experience?.slice(1)} />
              {profile.workingWeights && Object.keys(profile.workingWeights).length > 0 ? (
                <ProfileRow label="Working Weights" value={
                  Object.entries(profile.workingWeights)
                    .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1).replace('_', ' ')}: ${v} lb`)
                    .join(', ')
                } />
              ) : null}
              <ProfileRow label="Style" value={STYLE_LABELS[profile.workoutStyle] || profile.workoutStyle} />
              <ProfileRow label="Body Goal" value={
                profile.bodyCompGoals
                  ? profile.bodyCompGoals.map(g => BODY_COMP_LABELS[g] || g).join(', ')
                  : (BODY_COMP_LABELS[profile.bodyCompGoal] || profile.bodyCompGoal || '')
              } />
              <ProfileRow label="Days/Week" value={`${profile.trainingDaysPerWeek} days`} />
              {profile.sessionDuration ? (
                <ProfileRow label="Session" value={`${profile.sessionDuration} min`} />
              ) : null}
              <TouchableOpacity onPress={handleUpdateEquipment}>
                <ProfileRow label="Equipment" value={`${(profile.equipment || []).length} items (tap to edit)`} />
              </TouchableOpacity>
              {profile.equipmentDetails?.barbell?.maxWeight ? (
                <ProfileRow label="Barbell Max" value={`${profile.equipmentDetails.barbell.maxWeight} lbs`} />
              ) : null}
              {profile.equipmentDetails?.kettlebell?.weights ? (
                <ProfileRow label="Kettlebells" value={`${profile.equipmentDetails.kettlebell.weights} lbs`} />
              ) : null}
              {profile.equipmentDetails?.dumbbells?.maxWeight ? (
                <ProfileRow label="Dumbbells" value={`Up to ${profile.equipmentDetails.dumbbells.maxWeight} lbs each`} />
              ) : null}
              {profile.exclusions?.length > 0 && (
                <ProfileRow label="Exclusions" value={profile.exclusions.join(', ')} />
              )}
            </View>
          </View>
        )}

        {/* Plan Info */}
        {currentPlanId && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Current Plan</Text>
            <View style={styles.profileCard}>
              <ProfileRow label="Total Weeks" value={`${totalWeeks}`} />
              <ProfileRow label="Phases" value={planPhases.map(p => p.name).join(' > ')} />
            </View>
          </View>
        )}

        {/* AI Coach */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Coach</Text>
          <View style={styles.profileCard}>
            <ProfileRow label="Status" value="Active" />
            <ProfileRow label="Model" value="Claude Sonnet 4.6" />
            <ProfileRow label="Access" value="Tap AI button on any workout" />
          </View>
        </View>

        {/* Exercise Library */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exercise Library</Text>
          <View style={styles.profileCard}>
            <ProfileRow label="Exercises" value={`${exerciseCount}`} />
            <ProfileRow label="Last Sync" value={lastSync ? new Date(lastSync).toLocaleDateString() : 'Never'} />
          </View>
          <TouchableOpacity
            style={[styles.actionButton, { marginTop: 8 }]}
            onPress={handleSyncLibrary}
            disabled={isSyncing}
          >
            <View style={styles.actionContent}>
              <Text style={styles.actionLabel}>{isSyncing ? syncProgress : 'Refresh Library'}</Text>
              <Text style={styles.actionDesc}>Download latest exercises with GIF demos</Text>
            </View>
          </TouchableOpacity>
        </View>

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
              <Text style={styles.actionDesc}>Download your workout plan for offline use</Text>
            </View>
          </TouchableOpacity>

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
        </View>

        {/* Dev Tools */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dev Tools</Text>

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
        </View>

        {/* App Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.profileCard}>
            <ProfileRow label="App" value="Spartan Fitness" />
            <ProfileRow label="Version" value="1.0.0" />
          </View>
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
