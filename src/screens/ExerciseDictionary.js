import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../data/database';
import ExerciseDetailModal from '../components/ExerciseDetailModal';

const MUSCLE_FILTERS = [
  { id: 'all', label: 'ALL' },
  { id: 'chest', label: 'CHEST' },
  { id: 'back', label: 'BACK' },
  { id: 'legs', label: 'LEGS' },
  { id: 'shoulders', label: 'SHOULDERS' },
  { id: 'arms', label: 'ARMS' },
  { id: 'core', label: 'CORE' },
  { id: 'full_body', label: 'FULL BODY' },
  { id: 'cardio', label: 'CARDIO' },
];

const EQUIP_FILTERS = [
  { id: 'all', label: 'ALL EQUIP' },
  { id: 'barbell', label: 'BARBELL' },
  { id: 'dumbbell', label: 'DUMBBELL' },
  { id: 'bodyweight', label: 'BODYWEIGHT' },
  { id: 'cable', label: 'CABLE' },
  { id: 'machine', label: 'MACHINE' },
  { id: 'kettlebell', label: 'KETTLEBELL' },
  { id: 'band', label: 'BAND' },
];

export default function ExerciseDictionary({ navigation }) {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('all');
  const [equipFilter, setEquipFilter] = useState('all');
  const [detailId, setDetailId] = useState(null);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    loadExercises();
  }, [muscleFilter, equipFilter, searchQuery]);

  const loadExercises = useCallback(async () => {
    setLoading(true);
    try {
      const database = await getDatabase();
      let query = 'SELECT id, name, muscle_group, category, gif_url, is_compound FROM exercises WHERE 1=1';
      const params = [];

      if (searchQuery.length >= 2) {
        query += ' AND name LIKE ?';
        params.push(`%${searchQuery}%`);
      }

      if (muscleFilter !== 'all') {
        query += ' AND muscle_group = ?';
        params.push(muscleFilter);
      }

      if (equipFilter !== 'all') {
        if (equipFilter === 'bodyweight') {
          query += " AND (category = 'bodyweight' OR equipment_required = '[]')";
        } else {
          query += ' AND category = ?';
          params.push(equipFilter);
        }
      }

      query += ' ORDER BY name ASC LIMIT 200';

      const results = await database.getAllAsync(query, params);
      setExercises(results);

      // Get total count for header
      const countResult = await database.getFirstAsync('SELECT COUNT(*) as count FROM exercises');
      setTotalCount(countResult.count);
    } catch (e) {
      console.error('Error loading exercises:', e);
    }
    setLoading(false);
  }, [muscleFilter, equipFilter, searchQuery]);

  const renderExercise = ({ item }) => (
    <TouchableOpacity style={styles.exerciseCard} onPress={() => setDetailId(item.id)}>
      {item.gif_url ? (
        <Image source={{ uri: item.gif_url }} style={styles.thumbnail} resizeMode="cover" />
      ) : (
        <View style={styles.thumbnailPlaceholder}>
          <Text style={styles.thumbnailText}>{String(item.name || '').charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.exerciseInfo}>
        <Text style={styles.exerciseName} numberOfLines={1}>{String(item.name || '')}</Text>
        <Text style={styles.exerciseMeta}>
          {`${String(item.muscle_group || '').toUpperCase()} \u2022 ${String(item.category || '').toUpperCase()}`}
          {item.is_compound ? ' \u2022 COMPOUND' : ''}
        </Text>
      </View>
      <Text style={styles.viewArrow}>{'\u25B6'}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {navigation.canGoBack() ? (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>{'< BACK'}</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={styles.headerTitle}>EXERCISE LIBRARY</Text>
        <Text style={styles.headerCount}>{`${totalCount} exercises`}</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search exercises..."
          placeholderTextColor="rgba(255,255,255,0.2)"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Muscle Group Filter */}
      <FlatList
        data={MUSCLE_FILTERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        style={styles.filterRow}
        contentContainerStyle={{ paddingHorizontal: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.filterChip, muscleFilter === item.id && styles.filterChipActive]}
            onPress={() => setMuscleFilter(item.id)}
          >
            <Text style={[styles.filterChipText, muscleFilter === item.id && styles.filterChipTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Equipment Filter */}
      <FlatList
        data={EQUIP_FILTERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        style={styles.filterRow}
        contentContainerStyle={{ paddingHorizontal: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.filterChip, styles.filterChipEquip, equipFilter === item.id && styles.filterChipEquipActive]}
            onPress={() => setEquipFilter(item.id)}
          >
            <Text style={[styles.filterChipText, styles.filterChipEquipText, equipFilter === item.id && styles.filterChipEquipTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Results count */}
      <Text style={styles.resultCount}>{`${exercises.length} results`}</Text>

      {/* Exercise List */}
      {loading ? (
        <ActivityIndicator size="large" color="#FF4136" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={exercises}
          renderItem={renderExercise}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No exercises found</Text>
              <Text style={styles.emptySub}>Try a different search or filter</Text>
            </View>
          }
        />
      )}

      <ExerciseDetailModal
        visible={!!detailId}
        exerciseId={detailId}
        onClose={() => setDetailId(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backBtn: {
    paddingVertical: 4,
    paddingRight: 12,
  },
  backBtnText: {
    color: '#FF4136',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  headerCount: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    fontFamily: 'monospace',
  },

  // Search
  searchContainer: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  searchInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 14,
  },

  // Filters
  filterRow: {
    marginBottom: 8,
    flexGrow: 0,
  },
  filterChip: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 14,
    marginRight: 6,
    minHeight: 32,
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: 'rgba(255,65,54,0.15)',
    borderColor: '#FF4136',
  },
  filterChipText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  filterChipTextActive: {
    color: '#FF4136',
  },
  filterChipEquip: {
    borderColor: 'rgba(0,116,217,0.15)',
  },
  filterChipEquipActive: {
    backgroundColor: 'rgba(0,116,217,0.15)',
    borderColor: '#0074D9',
  },
  filterChipEquipText: {
    color: 'rgba(255,255,255,0.3)',
  },
  filterChipEquipTextActive: {
    color: '#0074D9',
  },

  resultCount: {
    color: 'rgba(255,255,255,0.15)',
    fontSize: 10,
    fontFamily: 'monospace',
    paddingHorizontal: 16,
    marginBottom: 4,
  },

  // Exercise List
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 30,
  },
  exerciseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
  },
  thumbnail: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#111',
  },
  thumbnailPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: 'rgba(255,65,54,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailText: {
    color: '#FF4136',
    fontSize: 20,
    fontWeight: '900',
  },
  exerciseInfo: {
    flex: 1,
    marginLeft: 12,
  },
  exerciseName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  exerciseMeta: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 9,
    fontFamily: 'monospace',
    letterSpacing: 0.5,
    marginTop: 3,
  },
  viewArrow: {
    color: 'rgba(255,255,255,0.15)',
    fontSize: 10,
    marginLeft: 8,
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 16,
    fontWeight: '600',
  },
  emptySub: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 12,
    marginTop: 4,
  },
});
