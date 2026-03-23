import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getWods, WOD_CATEGORIES } from '../data/wodSeed';
import { saveWodResult, getWodHistory, getAllCompletedWodIds } from '../data/database';

const DIFFICULTY_COLORS = {
  beginner: '#01FF70',
  intermediate: '#FFDC00',
  advanced: '#FF851B',
  elite: '#FF4136',
};

const CATEGORY_FILTERS = [
  { id: 'all', label: 'ALL' },
  { id: 'girl', label: 'THE GIRLS' },
  { id: 'hero', label: 'HERO' },
  { id: 'benchmark', label: 'BENCHMARK' },
  { id: 'amrap', label: 'AMRAP' },
  { id: 'fortime', label: 'FOR TIME' },
  { id: 'emom', label: 'EMOM' },
  { id: 'chipper', label: 'CHIPPER' },
  { id: 'open', label: 'CF OPEN' },
];

export default function WodLibrary({ navigation }) {
  const [wods] = useState(getWods());
  const [filteredWods, setFilteredWods] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [completedIds, setCompletedIds] = useState([]);
  const [selectedWod, setSelectedWod] = useState(null);
  const [wodHistory, setWodHistory] = useState([]);
  const [logModal, setLogModal] = useState(null);
  const [logScore, setLogScore] = useState('');
  const [logNotes, setLogNotes] = useState('');
  const [logRx, setLogRx] = useState(false);

  useEffect(() => {
    loadCompletedIds();
  }, []);

  useEffect(() => {
    filterWods();
  }, [categoryFilter, searchQuery, completedIds]);

  const loadCompletedIds = async () => {
    try {
      const ids = await getAllCompletedWodIds();
      setCompletedIds(ids);
    } catch (e) {
      console.error('Error loading completed WODs:', e);
    }
  };

  const filterWods = useCallback(() => {
    let filtered = [...wods];
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(w => w.category === categoryFilter);
    }
    if (searchQuery.length >= 2) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(w =>
        w.name.toLowerCase().includes(q) ||
        w.movements.some(m => m.toLowerCase().includes(q))
      );
    }
    setFilteredWods(filtered);
  }, [categoryFilter, searchQuery, wods]);

  const openWodDetail = async (wod) => {
    setSelectedWod(wod);
    try {
      const history = await getWodHistory(wod.id);
      setWodHistory(history);
    } catch (e) {
      setWodHistory([]);
    }
  };

  const handleLogResult = async () => {
    if (!logModal || !logScore.trim()) return;
    try {
      await saveWodResult(logModal.id, logScore.trim(), logModal.type, logRx, logNotes.trim());
      await loadCompletedIds();
      // Refresh history if detail is open
      if (selectedWod?.id === logModal.id) {
        const history = await getWodHistory(logModal.id);
        setWodHistory(history);
      }
      setLogModal(null);
      setLogScore('');
      setLogNotes('');
      setLogRx(false);
      Alert.alert('Saved', 'WOD result logged!');
    } catch (e) {
      console.error('Error saving WOD result:', e);
    }
  };

  const renderWod = ({ item }) => {
    const isDone = completedIds.includes(item.id);
    const diffColor = DIFFICULTY_COLORS[item.difficulty] || '#666';
    return (
      <TouchableOpacity
        style={[styles.wodCard, isDone && styles.wodCardDone]}
        onPress={() => openWodDetail(item)}
      >
        <View style={styles.wodCardHeader}>
          <View style={styles.wodCardLeft}>
            <Text style={styles.wodName}>{item.name}</Text>
            <Text style={styles.wodType}>{item.type}</Text>
          </View>
          <View style={styles.wodCardRight}>
            {isDone ? (
              <View style={styles.doneBadge}>
                <Text style={styles.doneBadgeText}>DONE</Text>
              </View>
            ) : null}
            <View style={[styles.diffBadge, { borderColor: diffColor }]}>
              <Text style={[styles.diffText, { color: diffColor }]}>{String(item.difficulty).toUpperCase()}</Text>
            </View>
          </View>
        </View>
        <Text style={styles.wodMovements} numberOfLines={2}>
          {item.movements.join(' / ')}
        </Text>
        <View style={styles.wodMeta}>
          <Text style={styles.wodMetaText}>{item.scheme}</Text>
          {item.estimatedTime ? <Text style={styles.wodMetaText}>{item.estimatedTime}</Text> : null}
          {item.rxWeight !== 'BW' ? <Text style={styles.wodMetaText}>{item.rxWeight}</Text> : null}
        </View>
        {item.equipment && item.equipment.length > 0 ? (
          <View style={styles.equipRow}>
            {item.equipment.map((eq, i) => (
              <View key={i} style={styles.equipChip}>
                <Text style={styles.equipChipText}>{String(eq).replace(/_/g, ' ').toUpperCase()}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.equipRow}>
            <View style={[styles.equipChip, styles.equipChipGreen]}>
              <Text style={[styles.equipChipText, styles.equipChipTextGreen]}>NO EQUIPMENT</Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {navigation.canGoBack() ? (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>{'< BACK'}</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={styles.headerTitle}>WOD LIBRARY</Text>
        <Text style={styles.headerCount}>
          {`${completedIds.length}/${wods.length} completed`}
        </Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search WODs or movements..."
          placeholderTextColor="rgba(255,255,255,0.2)"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Category Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
        {CATEGORY_FILTERS.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.filterChip, categoryFilter === item.id && styles.filterChipActive]}
            onPress={() => setCategoryFilter(item.id)}
          >
            <Text style={[styles.filterChipText, categoryFilter === item.id && styles.filterChipTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* WOD List */}
      <FlatList
        data={filteredWods}
        renderItem={renderWod}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No WODs found</Text>
          </View>
        }
      />

      {/* WOD Detail Modal */}
      <Modal visible={!!selectedWod} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {selectedWod ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalName}>{selectedWod.name}</Text>
                    <Text style={styles.modalType}>{`${WOD_CATEGORIES[selectedWod.category] || ''} \u2022 ${selectedWod.type}`}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedWod(null)} style={styles.closeBtn}>
                    <Text style={styles.closeBtnText}>X</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalDesc}>{selectedWod.description}</Text>

                {/* Movements */}
                <View style={styles.movementsList}>
                  {selectedWod.movements.map((m, i) => (
                    <View key={i} style={styles.movementRow}>
                      <View style={styles.movementDot} />
                      <Text style={styles.movementText}>{m}</Text>
                    </View>
                  ))}
                </View>

                {/* Details */}
                <View style={styles.detailsGrid}>
                  <View style={styles.detailBox}>
                    <Text style={styles.detailValue}>{selectedWod.scheme}</Text>
                    <Text style={styles.detailLabel}>SCHEME</Text>
                  </View>
                  <View style={styles.detailBox}>
                    <Text style={styles.detailValue}>{selectedWod.estimatedTime || '--'}</Text>
                    <Text style={styles.detailLabel}>EST. TIME</Text>
                  </View>
                  <View style={styles.detailBox}>
                    <Text style={[styles.detailValue, { color: DIFFICULTY_COLORS[selectedWod.difficulty] }]}>
                      {String(selectedWod.difficulty).toUpperCase()}
                    </Text>
                    <Text style={styles.detailLabel}>LEVEL</Text>
                  </View>
                </View>

                {selectedWod.rxWeight !== 'BW' ? (
                  <View style={styles.rxRow}>
                    <Text style={styles.rxLabel}>RX WEIGHT</Text>
                    <Text style={styles.rxValue}>{selectedWod.rxWeight}</Text>
                  </View>
                ) : null}

                {selectedWod.tips ? (
                  <View style={styles.tipsRow}>
                    <Text style={styles.tipsLabel}>TIPS</Text>
                    <Text style={styles.tipsText}>{selectedWod.tips}</Text>
                  </View>
                ) : null}

                {/* Log Result Button */}
                <TouchableOpacity
                  style={styles.logButton}
                  onPress={() => { setLogModal(selectedWod); setLogScore(''); setLogNotes(''); setLogRx(false); }}
                >
                  <Text style={styles.logButtonText}>LOG RESULT</Text>
                </TouchableOpacity>

                {/* History */}
                {wodHistory.length > 0 ? (
                  <View style={styles.historySection}>
                    <Text style={styles.historyTitle}>YOUR HISTORY</Text>
                    {wodHistory.map((h, i) => (
                      <View key={h.id || i} style={styles.historyRow}>
                        <Text style={styles.historyDate}>{h.date}</Text>
                        <Text style={styles.historyScore}>{h.score}</Text>
                        {h.rx ? <Text style={styles.historyRx}>RX</Text> : null}
                        {h.notes ? <Text style={styles.historyNotes}>{h.notes}</Text> : null}
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={{ height: 30 }} />
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Log Score Modal */}
      <Modal visible={!!logModal} animationType="fade" transparent>
        <View style={styles.logOverlay}>
          <View style={styles.logContainer}>
            <Text style={styles.logTitle}>{`LOG: ${logModal?.name || ''}`}</Text>
            <Text style={styles.logSubtitle}>{logModal?.type === 'AMRAP' ? 'Enter rounds + reps' : logModal?.type === 'FOR REPS' ? 'Enter total reps' : 'Enter time (e.g. 8:32)'}</Text>

            <TextInput
              style={styles.logInput}
              placeholder={logModal?.type === 'AMRAP' ? 'e.g. 15+3' : logModal?.type === 'FOR REPS' ? 'e.g. 312' : 'e.g. 8:32'}
              placeholderTextColor="rgba(255,255,255,0.2)"
              value={logScore}
              onChangeText={setLogScore}
              autoFocus
            />

            <TextInput
              style={[styles.logInput, { marginTop: 8 }]}
              placeholder="Notes (optional)"
              placeholderTextColor="rgba(255,255,255,0.2)"
              value={logNotes}
              onChangeText={setLogNotes}
            />

            <TouchableOpacity
              style={[styles.rxToggle, logRx && styles.rxToggleActive]}
              onPress={() => setLogRx(!logRx)}
            >
              <Text style={[styles.rxToggleText, logRx && styles.rxToggleTextActive]}>RX</Text>
            </TouchableOpacity>

            <View style={styles.logButtons}>
              <TouchableOpacity style={styles.logCancel} onPress={() => setLogModal(null)}>
                <Text style={styles.logCancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.logSave, !logScore.trim() && { opacity: 0.4 }]}
                onPress={handleLogResult}
                disabled={!logScore.trim()}
              >
                <Text style={styles.logSaveText}>SAVE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },

  // Header
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  backBtn: { paddingVertical: 4, paddingRight: 12 },
  backBtnText: { color: '#FF4136', fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1.5 },
  headerCount: { color: 'rgba(255,255,255,0.25)', fontSize: 11, fontFamily: 'monospace', marginTop: 2 },

  // Search
  searchContainer: { paddingHorizontal: 14, paddingVertical: 8 },
  searchInput: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16, color: '#fff', fontSize: 14 },

  // Filters
  filterRow: { marginBottom: 8, flexGrow: 0 },
  filterRowContent: { paddingHorizontal: 12, alignItems: 'center' },
  filterChip: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 20, paddingVertical: 7, paddingHorizontal: 14, marginRight: 8, height: 34, justifyContent: 'center', flexShrink: 0 },
  filterChipActive: { backgroundColor: 'rgba(255,65,54,0.15)', borderColor: '#FF4136' },
  filterChipText: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  filterChipTextActive: { color: '#FF4136' },

  // WOD List
  listContent: { paddingHorizontal: 12, paddingBottom: 30 },
  wodCard: { backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#FF4136' },
  wodCardDone: { borderLeftColor: '#01FF70' },
  wodCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  wodCardLeft: { flex: 1 },
  wodCardRight: { flexDirection: 'row', alignItems: 'center' },
  wodName: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  wodType: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '700', letterSpacing: 1, fontFamily: 'monospace', marginTop: 2 },
  wodMovements: { color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 18, marginBottom: 8 },
  wodMeta: { flexDirection: 'row', flexWrap: 'wrap' },
  wodMetaText: { color: 'rgba(255,255,255,0.2)', fontSize: 10, fontFamily: 'monospace', marginRight: 12 },
  equipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  equipChip: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 4, paddingVertical: 2, paddingHorizontal: 6, marginRight: 4, marginBottom: 2 },
  equipChipText: { color: 'rgba(255,255,255,0.25)', fontSize: 8, fontWeight: '700', letterSpacing: 0.5, fontFamily: 'monospace' },
  equipChipGreen: { backgroundColor: 'rgba(1,255,112,0.06)' },
  equipChipTextGreen: { color: 'rgba(1,255,112,0.4)' },
  doneBadge: { backgroundColor: 'rgba(1,255,112,0.12)', borderRadius: 4, paddingVertical: 2, paddingHorizontal: 8, marginRight: 6 },
  doneBadgeText: { color: '#01FF70', fontSize: 9, fontWeight: '800', letterSpacing: 0.5, fontFamily: 'monospace' },
  diffBadge: { borderWidth: 1, borderRadius: 4, paddingVertical: 2, paddingHorizontal: 8 },
  diffText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, fontFamily: 'monospace' },

  // Empty
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: 14 },

  // Detail Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContainer: { backgroundColor: '#0A0A0A', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  modalName: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 1 },
  modalType: { color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '700', letterSpacing: 1, fontFamily: 'monospace', marginTop: 4 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '700' },
  modalDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 12 },

  // Movements
  movementsList: { marginBottom: 16 },
  movementRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  movementDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF4136', marginRight: 12 },
  movementText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // Details Grid
  detailsGrid: { flexDirection: 'row', marginBottom: 16 },
  detailBox: { flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 12, marginRight: 8, alignItems: 'center' },
  detailValue: { color: '#fff', fontSize: 14, fontWeight: '800', fontFamily: 'monospace', textAlign: 'center' },
  detailLabel: { color: 'rgba(255,255,255,0.25)', fontSize: 9, fontWeight: '700', letterSpacing: 1, marginTop: 4 },

  // RX Weight
  rxRow: { backgroundColor: 'rgba(255,65,54,0.06)', borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  rxLabel: { color: '#FF4136', fontSize: 10, fontWeight: '700', letterSpacing: 1, fontFamily: 'monospace' },
  rxValue: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'monospace' },

  // Tips
  tipsRow: { marginBottom: 16 },
  tipsLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '700', letterSpacing: 1, fontFamily: 'monospace', marginBottom: 6 },
  tipsText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 20 },

  // Log Button
  logButton: { backgroundColor: '#FF4136', borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 16 },
  logButtonText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 1.5, fontFamily: 'monospace' },

  // History
  historySection: { marginTop: 8 },
  historyTitle: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, fontFamily: 'monospace', marginBottom: 10 },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  historyDate: { color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: 'monospace', width: 85 },
  historyScore: { color: '#FF4136', fontSize: 15, fontWeight: '800', fontFamily: 'monospace', marginRight: 8 },
  historyRx: { color: '#01FF70', fontSize: 9, fontWeight: '800', fontFamily: 'monospace', backgroundColor: 'rgba(1,255,112,0.1)', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 3, marginRight: 8 },
  historyNotes: { color: 'rgba(255,255,255,0.25)', fontSize: 11, flex: 1 },

  // Log Modal
  logOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 30 },
  logContainer: { backgroundColor: '#161616', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  logTitle: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
  logSubtitle: { color: 'rgba(255,255,255,0.3)', fontSize: 12, marginBottom: 16 },
  logInput: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, color: '#fff', fontSize: 16, fontFamily: 'monospace' },
  rxToggle: { alignSelf: 'flex-start', borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 20, marginTop: 12 },
  rxToggleActive: { borderColor: '#01FF70', backgroundColor: 'rgba(1,255,112,0.1)' },
  rxToggleText: { color: 'rgba(255,255,255,0.3)', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  rxToggleTextActive: { color: '#01FF70' },
  logButtons: { flexDirection: 'row', marginTop: 20 },
  logCancel: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', marginRight: 8 },
  logCancelText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  logSave: { flex: 2, padding: 14, alignItems: 'center', borderRadius: 10, backgroundColor: '#FF4136' },
  logSaveText: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
});
