import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { FoodItem, MealEntry, RootStackParamList } from '../types';
import { searchFoods } from '../api';
import { addEntry } from '../storage';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'FoodSearch'>;
  route: RouteProp<RootStackParamList, 'FoodSearch'>;
};

export default function FoodSearchScreen({ navigation, route }: Props) {
  const { slot, date } = route.params;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState('');
  const [adding, setAdding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await searchFoods(q.trim());
        setResults(res.results);
      } catch (e: any) {
        setError('검색에 실패했어요. 서버가 실행 중인지 확인해주세요.');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  };

  const openAddModal = (item: FoodItem) => {
    const defaultGrams = item.serving?.size ? String(Math.round(item.serving.size)) : '100';
    setSelected(item);
    setGrams(defaultGrams);
  };

  const confirmAdd = async () => {
    if (!selected) return;
    const g = parseFloat(grams);
    if (!g || g <= 0) {
      Alert.alert('오류', '올바른 그램 수를 입력해주세요.');
      return;
    }
    const ratio = g / 100;
    const entry: MealEntry = {
      food: selected,
      grams: g,
      calories: (selected.per_100g.kcal ?? 0) * ratio,
      protein: (selected.per_100g.protein_g ?? 0) * ratio,
      carbs: (selected.per_100g.carbs_g ?? 0) * ratio,
      fat: (selected.per_100g.fat_g ?? 0) * ratio,
    };
    setAdding(true);
    try {
      await addEntry(date, slot, entry);
      setSelected(null);
      navigation.goBack();
    } catch {
      Alert.alert('오류', '저장에 실패했어요.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          placeholder="음식 이름을 검색하세요..."
          value={query}
          onChangeText={search}
          autoFocus
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 20 }} />}
      {error && <Text style={styles.errorText}>{error}</Text>}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <FoodRow item={item} onPress={() => openAddModal(item)} />}
        ListEmptyComponent={
          !loading && query.trim() ? (
            <Text style={styles.emptyText}>검색 결과가 없어요.</Text>
          ) : null
        }
      />

      {/* Amount input modal */}
      <Modal visible={!!selected} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {selected && (
              <>
                <Text style={styles.modalTitle} numberOfLines={2}>{selected.name}</Text>
                {selected.brand && <Text style={styles.modalBrand}>{selected.brand}</Text>}
                <Text style={styles.modalPer100}>
                  100g당: {selected.per_100g.kcal?.toFixed(0) ?? '-'} kcal ·
                  단백질 {selected.per_100g.protein_g?.toFixed(1) ?? '-'}g ·
                  탄수 {selected.per_100g.carbs_g?.toFixed(1) ?? '-'}g ·
                  지방 {selected.per_100g.fat_g?.toFixed(1) ?? '-'}g
                </Text>
                <Text style={styles.gramsLabel}>섭취량 (g)</Text>
                <TextInput
                  style={styles.gramsInput}
                  value={grams}
                  onChangeText={setGrams}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
                {grams && parseFloat(grams) > 0 && (
                  <Text style={styles.preview}>
                    예상: {((selected.per_100g.kcal ?? 0) * parseFloat(grams) / 100).toFixed(0)} kcal ·
                    단백질 {((selected.per_100g.protein_g ?? 0) * parseFloat(grams) / 100).toFixed(1)}g
                  </Text>
                )}
                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelected(null)}>
                    <Text style={styles.cancelText}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={confirmAdd} disabled={adding}>
                    <Text style={styles.confirmText}>{adding ? '저장 중...' : '추가'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function FoodRow({ item, onPress }: { item: FoodItem; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={2}>{item.name}</Text>
        {item.brand && <Text style={styles.rowBrand}>{item.brand}</Text>}
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowKcal}>{item.per_100g.kcal?.toFixed(0) ?? '-'}</Text>
        <Text style={styles.rowKcalUnit}>kcal/100g</Text>
        <Text style={styles.rowProtein}>단백질 {item.per_100g.protein_g?.toFixed(1) ?? '-'}g</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  searchBar: { backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  input: { backgroundColor: '#F0F0F0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  errorText: { color: '#FF3B30', textAlign: 'center', margin: 16 },
  emptyText: { textAlign: 'center', color: '#bbb', marginTop: 40, fontSize: 14 },
  row: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  rowName: { fontSize: 14, fontWeight: '600', color: '#222' },
  rowBrand: { fontSize: 12, color: '#999', marginTop: 2 },
  rowRight: { alignItems: 'flex-end', justifyContent: 'center', marginLeft: 12 },
  rowKcal: { fontSize: 18, fontWeight: '700', color: '#FF6B35' },
  rowKcalUnit: { fontSize: 10, color: '#aaa' },
  rowProtein: { fontSize: 11, color: '#4ECDC4', marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#222', marginBottom: 4 },
  modalBrand: { fontSize: 13, color: '#999', marginBottom: 10 },
  modalPer100: { fontSize: 12, color: '#666', backgroundColor: '#F5F5F5', padding: 10, borderRadius: 8, marginBottom: 16 },
  gramsLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  gramsInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 20, textAlign: 'center', marginBottom: 8 },
  preview: { fontSize: 13, color: '#FF6B35', textAlign: 'center', marginBottom: 16 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelText: { fontSize: 15, color: '#666' },
  confirmBtn: { flex: 2, padding: 14, borderRadius: 12, backgroundColor: '#4ECDC4', alignItems: 'center' },
  confirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
