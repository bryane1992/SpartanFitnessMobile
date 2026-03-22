import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAlternatives, getExerciseById } from '../data/database';
import useWorkoutStore from '../store/useWorkoutStore';

const CATEGORY_LABELS = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  kettlebell: 'Kettlebell',
  bodyweight: 'Bodyweight',
  machine: 'Machine',
  cable: 'Cable',
  band: 'Band',
  cardio: 'Cardio',
  plyometric: 'Plyo',
};

export default function ExerciseSwapModal({ visible, exerciseId, planExerciseId, onClose }) {
  const [currentExercise, setCurrentExercise] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const swapExercise = useWorkoutStore(s => s.swapExercise);

  useEffect(() => {
    if (visible && exerciseId) {
      loadAlternatives();
    }
  }, [visible, exerciseId]);

  const loadAlternatives = async () => {
    setLoading(true);
    try {
      const exercise = await getExerciseById(exerciseId);
      setCurrentExercise(exercise);

      const profileStr = await AsyncStorage.getItem('userProfile');
      const profile = profileStr ? JSON.parse(profileStr) : {};
      const alts = await getAlternatives(exerciseId, profile);
      setAlternatives(alts);
    } catch (e) {
      console.error('Error loading alternatives:', e);
    }
    setLoading(false);
  };

  const handleSwap = async (newExerciseId) => {
    await swapExercise(planExerciseId, newExerciseId, exerciseId);
    onClose();
  };

  const renderAlternative = ({ item }) => (
    <TouchableOpacity style={styles.altCard} onPress={() => handleSwap(item.id)}>
      <View style={styles.altContent}>
        <Text style={styles.altName}>{item.name}</Text>
        <Text style={styles.altDetails}>
          {item.category} {'\u2022'} {item.muscle_group}
          {item.is_compound ? ' \u2022 Compound' : ''}
        </Text>
      </View>
      <Text style={styles.swapIcon}>{'\u2192'}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Swap Exercise</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>{'\u2715'}</Text>
            </TouchableOpacity>
          </View>

          {/* Current Exercise */}
          {currentExercise && (
            <View style={styles.currentCard}>
              <Text style={styles.currentLabel}>CURRENT</Text>
              <Text style={styles.currentName}>
                {currentExercise.name}
              </Text>
              <Text style={styles.currentDetails}>
                {currentExercise.muscle_group} {'\u2022'} {currentExercise.category}
              </Text>
            </View>
          )}

          {/* Alternatives */}
          <Text style={styles.altLabel}>SWAP TO...</Text>

          {loading ? (
            <ActivityIndicator size="large" color="#FF4136" style={{ marginTop: 20 }} />
          ) : alternatives.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No alternatives available</Text>
              <Text style={styles.emptySub}>Try adjusting your equipment or exclusion settings</Text>
            </View>
          ) : (
            <FlatList
              data={alternatives}
              renderItem={renderAlternative}
              keyExtractor={item => item.id}
              style={styles.altList}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    paddingBottom: 30,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#444',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  closeButton: {
    color: '#666',
    fontSize: 22,
    padding: 5,
  },
  currentCard: {
    backgroundColor: '#252525',
    margin: 15,
    padding: 15,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF4136',
  },
  currentLabel: {
    color: '#FF4136',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  currentName: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  currentDetails: {
    color: '#888',
    fontSize: 12,
    marginTop: 3,
  },
  altLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    paddingHorizontal: 20,
    marginTop: 5,
    marginBottom: 10,
  },
  altList: {
    paddingHorizontal: 15,
  },
  altCard: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  altContent: {
    flex: 1,
  },
  altName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  altDetails: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  swapIcon: {
    fontSize: 18,
    marginLeft: 8,
    color: '#FF4136',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 30,
  },
  emptyText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptySub: {
    color: '#666',
    fontSize: 13,
    marginTop: 5,
    textAlign: 'center',
  },
});
