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
import * as FileSystem from 'expo-file-system/legacy';

const GIF_CACHE_DIR = `${FileSystem.documentDirectory}exercise_gifs/`;

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
  split_squat: '0410',
  // Barbell extra
  back_extension: '0573', hip_thrust: '3562',
  // Spartan / functional
  rope_climb: '0680', tire_flip: '2459', overhead_carry: '4244',
  double_unders: '3885', pallof_press: '0979',
  // Stretches
  hamstring_stretch: '1511',
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
  // Extra
  box_jumps: '1374', machine_dip: '0009',
  calf_raise_bodyweight: '0417', hanging_knee_raise: '0010',
  // Olympic lifts
  snatch: '0067', db_snatches: '3888', kb_snatch: '0542',
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
      if (!ex) return;

      const exdbId = SEED_TO_EXDB_ID[ex.id] || ex.api_id || null;
      const apiKey = getRapidApiKey();

      console.log(`[GIF] exercise=${ex.id} exdbId=${exdbId} hasKey=${!!apiKey}`);

      // Check if GIF is already cached locally on device
      const localPath = exdbId ? `${GIF_CACHE_DIR}${exdbId}.gif` : null;
      let gifUri = null;

      if (localPath) {
        try {
          const info = await FileSystem.getInfoAsync(localPath);
          // Discard cached file if it's suspiciously small (likely a previous error response)
          if (info.exists && (info.size || 0) > 2000) {
            gifUri = localPath;
            console.log(`[GIF] Cache hit: ${localPath} (${info.size} bytes)`);
          } else if (info.exists) {
            await FileSystem.deleteAsync(localPath, { idempotent: true });
            console.log(`[GIF] Discarded bad cache (${info.size} bytes)`);
          }
        } catch {}
      }

      // Not cached — download from RapidAPI and save to device
      if (!gifUri && exdbId && apiKey) {
        try {
          await FileSystem.makeDirectoryAsync(GIF_CACHE_DIR, { intermediates: true });
          const url = `https://exercisedb.p.rapidapi.com/image?exerciseId=${exdbId}&resolution=360`;
          console.log(`[GIF] Downloading: ${url}`);
          const dl = await FileSystem.downloadAsync(
            url,
            localPath,
            { headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com' } }
          );
          console.log(`[GIF] Download result: status=${dl.status} mimeType=${dl.mimeType}`);
          if (dl.status === 200) {
            // Verify we got actual image data, not a JSON error response
            const info = await FileSystem.getInfoAsync(localPath);
            if ((info.size || 0) > 2000) {
              gifUri = localPath;
              console.log(`[GIF] Saved: ${localPath} (${info.size} bytes)`);
            } else {
              await FileSystem.deleteAsync(localPath, { idempotent: true });
              console.log(`[GIF] Response too small (${info.size} bytes) — likely an API error`);
            }
          } else {
            console.log(`[GIF] Non-200 status: ${dl.status}`);
          }
        } catch (e) {
          console.log('[GIF] Download failed:', e.message);
        }
      } else if (!apiKey) {
        console.log('[GIF] No API key — skipping download');
      } else if (!exdbId) {
        console.log(`[GIF] No ExerciseDB ID for: ${ex.id}`);
      }

      if (gifUri) ex = { ...ex, gif_url: gifUri };

      // Enrich with instructions/muscles if missing (separate from GIF, non-blocking on failure)
      const needsEnrichment = !ex.instructions || ex.instructions === '[]' || ex.instructions === 'null';
      if (needsEnrichment && exdbId && apiKey) {
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
              try {
                const database = await getDatabase();
                await database.runAsync(
                  'UPDATE exercises SET instructions = ?, target_muscles = ?, description = ? WHERE id = ?',
                  [ex.instructions, ex.target_muscles, ex.description, ex.id]
                );
              } catch {}
            }
          }
        } catch {}
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
