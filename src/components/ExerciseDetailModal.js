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

const API_BASE = 'https://exercisedb-api.vercel.app/api/v1';

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

      // If exercise already has gif_url (ExerciseDB exercise), we're good
      if (ex?.gif_url) {
        setExercise(ex);
        setGifLoading(true);
        return;
      }

      if (!ex) return;

      // Seed exercise without gif — expand abbreviations for search
      const NAME_EXPANSIONS = {
        'db': 'dumbbell', 'kb': 'kettlebell', 'bb': 'barbell', 'ez': 'ez-bar',
      };
      let searchName = (ex.name || '').toLowerCase();
      for (const [abbr, full] of Object.entries(NAME_EXPANSIONS)) {
        searchName = searchName.replace(new RegExp(`^${abbr}\\s+`, 'i'), `${full} `);
      }

      // Try local DB first
      const database = await getDatabase();
      let match = await database.getFirstAsync(
        "SELECT gif_url, instructions, target_muscles FROM exercises WHERE gif_url IS NOT NULL AND LOWER(name) LIKE ? LIMIT 1",
        [`%${searchName}%`]
      );

      // If no local match, try the API directly (single request)
      if (!match) {
        try {
          const encoded = encodeURIComponent(searchName.split(' ').slice(0, 3).join(' '));
          const response = await fetch(`${API_BASE}/exercises?search=${encoded}&limit=1`);
          if (response.ok) {
            const result = await response.json();
            if (result.data?.[0]?.gifUrl) {
              const apiEx = result.data[0];
              match = {
                gif_url: apiEx.gifUrl,
                instructions: JSON.stringify(apiEx.instructions || []),
                target_muscles: JSON.stringify(apiEx.targetMuscles || []),
              };
            }
          }
        } catch (e) {
          // Offline or rate limited — that's OK, show placeholder
        }
      }

      if (match) {
        ex = { ...ex, gif_url: match.gif_url, instructions: match.instructions || ex.instructions, target_muscles: match.target_muscles || ex.target_muscles };
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
                  <Text style={styles.placeholderHint}>Sync exercises in Settings for GIF demos</Text>
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
