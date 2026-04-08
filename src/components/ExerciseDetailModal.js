import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { getExerciseFullById, getDatabase } from '../data/database';
import Constants from 'expo-constants';

// Verified mapping: seed exercise ID → ExerciseDB API ID (for animated GIFs)
const SEED_TO_EXDB_ID = {
  // Barbell
  bench_press: '0025', incline_bench: '0047', back_squat: '0043', front_squat: '0024',
  deadlift: '0032', overhead_press: '0774', barbell_row: '0027', sumo_deadlift: '0117',
  romanian_deadlift: '0085', close_grip_bench: '0257', barbell_curl: '0031',
  barbell_lunge: '0054', skull_crushers: '0060', trap_bar_deadlift: '0811',
  power_clean: '0648', thrusters: '3305', good_morning: '0044',
  // Dumbbell
  db_bench_press: '0289', db_incline_press: '0314', db_shoulder_press: '0405',
  db_row: '0294', bicep_curl: '0285', hammer_curl: '0313',
  db_chest_fly: '0308', db_fly: '0308', lateral_raise: '0334',
  db_lunges: '0336', db_lunge: '0291', goblet_squat: '1760', db_goblet_squat: '1760',
  tricep_kickback: '0373', concentration_curl: '0297', db_arnold_press: '2137',
  bulgarian_split_squat: '1757', step_ups: '0809',
  db_reverse_fly: '0383', preacher_curl: '0372', db_push_press: '1700',
  db_romanian_deadlift: '1459', db_single_leg_deadlift: '1757',
  split_squat: '0097',
  // Barbell extra
  barbell_thrusters: '3305', back_extension: '0573',
  straight_arm_pulldown: '0237',
  // Bodyweight
  push_ups: '0662', pull_ups: '0652', chin_ups: '1326', dips: '0251',
  mountain_climbers: '0630', sit_ups: '0001', russian_twists: '0687',
  inverted_row: '1412', bench_dips: '0129', pike_push_ups: '0471',
  burpees: '1160', dead_bug: '0276', v_ups: '0507',
  glute_bridge: '3013', bear_crawl: '3360', jump_squats: '0514',
  muscle_ups: '0631', jump_rope: '2612', air_squats: '3533',
  // Cable/Machine
  lat_pulldown: '2330', cable_tricep_pushdown: '0201', cable_bicep_curl: '0200',
  leg_press: '0739', leg_extension: '0585', leg_curl: '0599',
  cable_face_pulls: '1356', face_pulls: '1356',
  cable_lateral_raise: '0178', cable_pull_through: '0196',
  cable_curl: '0868', cable_row: '0862',
  tricep_pushdown: '1723', machine_shoulder_press: '0603', machine_row: '1350',
  back_extension: '0573', straight_arm_pulldown: '0237',
  // Kettlebell
  kb_swing: '0549', kb_swings: '0549', kb_goblet_squat: '0534',
  farmer_walk: '2133', turkish_getup: '0551', kb_thruster: '0550',
  // Rehab/Prehab
  calf_stretch_wall: '1377', seated_calf_stretch: '1390', ankle_circles: '1368',
  glute_stretch_seated: '1424', wrist_circles: '1428', neck_stretch: '0716',
  shoulder_ext_rotation: '0863',
};

function getRapidApiKey() {
  return Constants.expoConfig?.extra?.exerciseDbApiKey
    || Constants.manifest?.extra?.exerciseDbApiKey
    || null;
}

const GITHUB_IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

// Verified mapping: seed exercise ID → GitHub exercise DB image folder name
const SEED_TO_IMAGE = {
  // Barbell compounds
  bench_press: 'Barbell_Bench_Press_-_Medium_Grip',
  incline_bench: 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  back_squat: 'Barbell_Squat',
  front_squat: 'Front_Squat_Clean_Grip',
  deadlift: 'Barbell_Deadlift',
  overhead_press: 'Standing_Military_Press',
  barbell_row: 'Bent_Over_Barbell_Row',
  sumo_deadlift: 'Sumo_Deadlift',
  romanian_deadlift: 'Romanian_Deadlift',
  close_grip_bench: 'Close-Grip_Barbell_Bench_Press',
  push_press: 'Push_Press',
  power_clean: 'Power_Clean',
  barbell_curl: 'Barbell_Curl',
  barbell_hip_thrust: 'Barbell_Hip_Thrust',
  good_morning: 'Good_Morning',
  barbell_lunge: 'Barbell_Lunge',
  barbell_thrusters: 'Barbell_Squat', // closest
  // Dumbbell
  db_bench_press: 'Dumbbell_Bench_Press',
  db_incline_press: 'Hammer_Grip_Incline_DB_Bench_Press',
  db_shoulder_press: 'Dumbbell_Shoulder_Press',
  db_row: 'Bent_Over_Two-Dumbbell_Row',
  bicep_curl: 'Dumbbell_Bicep_Curl',
  hammer_curl: 'Hammer_Curls',
  db_chest_fly: 'Dumbbell_Flyes',
  lateral_raise: 'Side_Lateral_Raise',
  db_lunge: 'Dumbbell_Lunges',
  goblet_squat: 'Goblet_Squat',
  db_rdl: 'Stiff-Legged_Dumbbell_Deadlift',
  skull_crushers: 'Lying_Dumbbell_Tricep_Extension',
  overhead_tricep_ext: 'Standing_Dumbbell_Triceps_Extension',
  tricep_kickback: 'Tricep_Dumbbell_Kickback',
  concentration_curl: 'Concentration_Curls',
  db_arnold_press: 'Arnold_Dumbbell_Press',
  db_reverse_fly: 'Seated_Bent-Over_Rear_Delt_Raise',
  bulgarian_split_squat: 'Split_Squats',
  step_ups: 'Barbell_Step_Ups',
  db_walking_lunge: 'Bodyweight_Walking_Lunge',
  db_thrusters: 'Dumbbell_Squat',
  // Bodyweight
  push_ups: 'Push-Ups_-_Close_Triceps_Position',
  pull_ups: 'Scapular_Pull-Up',
  chin_ups: 'Chin-Up',
  dips: 'Dips_-_Chest_Version',
  air_squats: 'Bodyweight_Squat',
  burpees: 'Frog_Sit-Ups',
  mountain_climbers: 'Mountain_Climbers',
  sit_ups: 'Sit-Up',
  plank: 'Plank',
  bird_dog: null,
  dead_bug: null,
  v_ups: 'Jackknife_Sit-Up',
  russian_twists: 'Russian_Twist',
  box_jumps: 'Front_Box_Jump',
  glute_bridge: 'Butt_Lift_Bridge',
  pike_push_ups: 'Handstand_Push-Ups',
  inverted_row: 'Inverted_Row',
  bench_dips: 'Bench_Dips',
  high_knees: null,
  bear_crawl: 'Bear_Crawl',
  // Cable/Machine
  lat_pulldown: 'Wide-Grip_Lat_Pulldown',
  cable_row: 'Seated_Cable_Rows',
  cable_fly: 'Flat_Bench_Cable_Flyes',
  cable_tricep_pushdown: 'Triceps_Pushdown',
  cable_bicep_curl: 'Cable_Hammer_Curls_-_Rope_Attachment',
  cable_face_pulls: 'Face_Pull',
  cable_lateral_raise: 'Cable_Seated_Lateral_Raise',
  cable_woodchop: null,
  cable_crunch: null,
  leg_press: 'Leg_Press',
  leg_extension: 'Leg_Extensions',
  leg_curl: 'Lying_Leg_Curls',
  machine_chest_press: 'Machine_Bench_Press',
  machine_shoulder_press: 'Leverage_Shoulder_Press',
  machine_row: null,
  // Kettlebell
  kb_swing: 'One-Arm_Kettlebell_Swings',
  kb_goblet_squat: 'Goblet_Squat',
  farmer_walk: 'Farmers_Walk',
  // Olympic
  hang_power_clean: 'Power_Clean',
};

function getSeedImageUrl(exerciseId) {
  const folder = SEED_TO_IMAGE[exerciseId];
  if (!folder) return null;
  return `${GITHUB_IMG_BASE}/${folder}/0.jpg`;
}

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function ExerciseDetailModal({ visible, exerciseId, onClose }) {
  const [exercise, setExercise] = useState(null);
  const [gifLoading, setGifLoading] = useState(true);
  const [gifError, setGifError] = useState(false);

  useEffect(() => {
    if (visible && exerciseId) {
      setGifLoading(true);
      setGifError(false);
      loadExercise();
    }
    if (!visible) {
      setExercise(null);
      setGifLoading(true);
      setGifError(false);
    }
  }, [visible, exerciseId]);

  const loadExercise = async () => {
    try {
      let ex = await getExerciseFullById(exerciseId);

      // If not in local DB, try fetching from RapidAPI
      if (!ex) {
        try {
          const rapidApiKey = Constants.expoConfig?.extra?.exerciseDbApiKey
            || Constants.manifest?.extra?.exerciseDbApiKey;
          if (rapidApiKey) {
            const response = await fetch(`https://exercisedb.p.rapidapi.com/exercises/exercise/${exerciseId}`, {
              headers: { 'X-RapidAPI-Key': rapidApiKey, 'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com' }
            });
            if (response.ok) {
              const apiEx = await response.json();
              if (apiEx) {
                ex = {
                  id: apiEx.id,
                  name: apiEx.name,
                  gif_url: null, // RapidAPI doesn't include GIF URLs — we'll resolve below
                  muscle_group: apiEx.bodyPart || '',
                  category: apiEx.equipment || 'bodyweight',
                  equipment_required: JSON.stringify([apiEx.equipment].filter(Boolean)),
                  instructions: JSON.stringify(apiEx.instructions || []),
                  target_muscles: JSON.stringify(apiEx.target ? [apiEx.target] : []),
                  secondary_muscles: JSON.stringify(apiEx.secondaryMuscles || []),
                  is_compound: (1 + (apiEx.secondaryMuscles?.length || 0)) >= 3 ? 1 : 0,
                  default_sets: 3, default_reps: '10', default_weight: 'BW',
                };
              }
            }
          }
        } catch (e) { /* offline */ }
      }

      if (!ex) return;

      // Enrich seed exercises with API data (instructions, target muscles, description)
      const exdbId = SEED_TO_EXDB_ID[ex.id] || (ex.api_id ? ex.api_id : null);
      const needsEnrichment = !ex.instructions || ex.instructions === '[]' || ex.instructions === 'null';
      if (needsEnrichment && exdbId) {
        const apiKey = getRapidApiKey();
        if (apiKey) {
          try {
            const resp = await fetch(`https://exercisedb.p.rapidapi.com/exercises/exercise/${exdbId}`, {
              headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com' }
            });
            if (resp.ok) {
              const apiData = await resp.json();
              if (apiData) {
                ex = {
                  ...ex,
                  instructions: JSON.stringify(apiData.instructions || []),
                  target_muscles: JSON.stringify(apiData.target ? [apiData.target] : []),
                  secondary_muscles: JSON.stringify(apiData.secondaryMuscles || []),
                  description: apiData.description || null,
                };
                // Cache enrichment to DB so we don't re-fetch
                try {
                  const database = await getDatabase();
                  await database.runAsync(
                    'UPDATE exercises SET instructions = ?, target_muscles = ?, description = ? WHERE id = ?',
                    [ex.instructions, ex.target_muscles, ex.description, ex.id]
                  );
                } catch { /* ignore cache failure */ }
              }
            }
          } catch { /* offline */ }
        }
      }

      // Try animated GIF from ExerciseDB paid API first
      if (!ex.gif_url) {
        const exdbId = SEED_TO_EXDB_ID[ex.id] || (ex.api_id ? ex.api_id : null);
        if (exdbId) {
          const apiKey = getRapidApiKey();
          if (apiKey) {
            try {
              const response = await fetch(
                `https://exercisedb.p.rapidapi.com/image?exerciseId=${exdbId}&resolution=720`,
                { headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com' } }
              );
              if (response.ok) {
                const blob = await response.blob();
                const dataUri = await new Promise((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result);
                  reader.readAsDataURL(blob);
                });
                if (dataUri) {
                  ex = { ...ex, gif_url: dataUri };
                }
              }
            } catch (e) {
              console.log('[GIF] API fetch failed:', e.message);
            }
          }
        }
      }

      // Fallback: GitHub static images
      if (!ex.gif_url) {
        const imageUrl = getSeedImageUrl(ex.id);
        if (imageUrl) {
          ex = { ...ex, gif_url: imageUrl };
        }
      }

      setExercise(ex);
      setGifLoading(true);
    } catch (e) {
      console.error('Error loading exercise detail:', e);
    }
  };

  if (!visible) return null;

  const instructions = exercise?.instructions ? JSON.parse(exercise.instructions) : [];
  const targetMuscles = exercise?.target_muscles ? JSON.parse(exercise.target_muscles) : [];
  const secondaryMuscles = exercise?.secondary_muscles ? JSON.parse(exercise.secondary_muscles) : [];
  const equipmentRequired = exercise?.equipment_required ? JSON.parse(exercise.equipment_required) : [];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle} numberOfLines={2}>
              {exercise ? String(exercise.name).toUpperCase() : 'LOADING...'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>X</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* GIF Demo */}
            {exercise?.gif_url && !gifError ? (
              <View style={styles.gifContainer}>
                {gifLoading ? (
                  <View style={styles.gifLoaderWrap}>
                    <ActivityIndicator size="large" color="#FF4136" />
                    <Text style={styles.gifLoadingText}>Loading demo...</Text>
                  </View>
                ) : null}
                <Image
                  source={{ uri: exercise.gif_url }}
                  style={[styles.gif, gifLoading && { position: 'absolute', opacity: 0 }]}
                  resizeMode="contain"
                  onLoad={() => setGifLoading(false)}
                  onError={() => { setGifLoading(false); setGifError(true); }}
                />
              </View>
            ) : exercise ? (
              <View style={styles.placeholderGif}>
                <Text style={styles.placeholderText}>{String(exercise.name).toUpperCase()}</Text>
                <Text style={styles.placeholderSub}>{exercise.category || ''}</Text>
                {!exercise.gif_url ? (
                  <Text style={styles.placeholderHint}>No demo image available for this exercise</Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.gifContainer}>
                <ActivityIndicator size="large" color="#FF4136" />
              </View>
            )}

            {exercise ? (
              <>
                {/* Metadata Chips */}
                <View style={styles.chipsRow}>
                  <View style={[styles.chip, styles.chipAccent]}>
                    <Text style={[styles.chipText, styles.chipTextAccent]}>
                      {String(exercise.muscle_group || '').toUpperCase()}
                    </Text>
                  </View>
                  {equipmentRequired.map((eq, i) => (
                    <View key={i} style={styles.chip}>
                      <Text style={styles.chipText}>{String(eq).toUpperCase()}</Text>
                    </View>
                  ))}
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>
                      {exercise.is_compound ? 'COMPOUND' : 'ISOLATION'}
                    </Text>
                  </View>
                  {exercise.difficulty ? (
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>{String(exercise.difficulty).toUpperCase()}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Target Muscles */}
                {targetMuscles.length > 0 ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>TARGET MUSCLES</Text>
                    <View style={styles.chipsRow}>
                      {targetMuscles.map((m, i) => (
                        <View key={i} style={styles.muscleChip}>
                          <Text style={styles.muscleChipText}>{String(m).toUpperCase()}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {secondaryMuscles.length > 0 ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>SECONDARY MUSCLES</Text>
                    <View style={styles.chipsRow}>
                      {secondaryMuscles.map((m, i) => (
                        <View key={i} style={styles.muscleChip}>
                          <Text style={styles.muscleChipText}>{String(m)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {/* Description */}
                {exercise.description ? (
                  <View style={styles.section}>
                    <Text style={styles.descriptionText}>{String(exercise.description)}</Text>
                  </View>
                ) : null}

                {/* Instructions */}
                {instructions.length > 0 ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>INSTRUCTIONS</Text>
                    {instructions.map((step, i) => {
                      // Strip "Step:N " prefix if present
                      const cleaned = String(step).replace(/^Step:\d+\s*/i, '');
                      return (
                        <View key={i} style={styles.stepRow}>
                          <View style={styles.stepNumber}>
                            <Text style={styles.stepNumberText}>{i + 1}</Text>
                          </View>
                          <Text style={styles.stepText}>{cleaned}</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {/* Defaults */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>DEFAULTS</Text>
                  <View style={styles.defaultsRow}>
                    <View style={styles.defaultBox}>
                      <Text style={styles.defaultValue}>{String(exercise.default_sets || '')}</Text>
                      <Text style={styles.defaultLabel}>SETS</Text>
                    </View>
                    <View style={styles.defaultBox}>
                      <Text style={styles.defaultValue}>{String(exercise.default_reps || '')}</Text>
                      <Text style={styles.defaultLabel}>REPS</Text>
                    </View>
                    <View style={styles.defaultBox}>
                      <Text style={styles.defaultValue}>{String(exercise.default_weight || '')}</Text>
                      <Text style={styles.defaultLabel}>LOAD</Text>
                    </View>
                  </View>
                </View>
              </>
            ) : null}

            <View style={{ height: 30 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#0A0A0A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
    flex: 1,
    marginRight: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '700',
  },

  // GIF
  gifContainer: {
    width: SCREEN_WIDTH - 2,
    height: 280,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gif: {
    width: '100%',
    height: 280,
  },
  gifLoaderWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 280,
  },
  gifLoadingText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 10,
  },
  placeholderGif: {
    width: '100%',
    height: 180,
    backgroundColor: 'rgba(255,65,54,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  placeholderSub: {
    color: 'rgba(255,255,255,0.15)',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  placeholderHint: {
    color: '#FF4136',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 12,
    letterSpacing: 0.5,
  },

  // Chips
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginRight: 6,
    marginBottom: 6,
  },
  chipAccent: {
    backgroundColor: 'rgba(255,65,54,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,65,54,0.25)',
  },
  chipText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontFamily: 'monospace',
  },
  chipTextAccent: {
    color: '#FF4136',
  },

  // Sections
  section: {
    paddingHorizontal: 14,
    marginTop: 16,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
  },

  descriptionText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    lineHeight: 20,
  },

  // Muscles
  muscleChip: {
    backgroundColor: 'rgba(1,255,112,0.06)',
    borderRadius: 5,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginRight: 6,
    marginBottom: 6,
  },
  muscleChipText: {
    color: 'rgba(1,255,112,0.6)',
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'monospace',
  },

  // Instructions
  stepRow: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,65,54,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  stepNumberText: {
    color: '#FF4136',
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  stepText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },

  // Defaults
  defaultsRow: {
    flexDirection: 'row',
  },
  defaultBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    padding: 12,
    marginRight: 8,
    alignItems: 'center',
  },
  defaultValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  defaultLabel: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 4,
  },
});
