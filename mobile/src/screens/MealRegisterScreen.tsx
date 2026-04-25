import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { DailyLog, MealEntry, MealSlot, RootStackParamList } from '../types';
import { addEntry, getLog, removeEntry, totals } from '../storage';
import { analyzePhoto, AnalyzedFood } from '../api';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MealRegister'>;
  route: RouteProp<RootStackParamList, 'MealRegister'>;
};

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
};

export default function MealRegisterScreen({ navigation, route }: Props) {
  const { slot, date } = route.params;
  const [log, setLog] = useState<DailyLog | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiResults, setAiResults] = useState<AnalyzedFood[] | null>(null);
  const [addingAi, setAddingAi] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getLog(date).then(setLog);
    }, [date]),
  );

  const handleRemove = (index: number) => {
    Alert.alert('삭제', '이 항목을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          const updated = await removeEntry(date, slot, index);
          setLog(updated);
        },
      },
    ]);
  };

  const handleAnalyzePhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '사진 라이브러리 접근 권한이 필요합니다.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
    });

    if (result.canceled || !result.assets[0]?.base64) return;

    const { base64, mimeType = 'image/jpeg' } = result.assets[0];
    setAnalyzing(true);
    try {
      const foods = await analyzePhoto(base64, mimeType);
      if (foods.length === 0) {
        Alert.alert('분석 결과 없음', '음식을 인식하지 못했어요. 다른 사진을 시도해보세요.');
      } else {
        setAiResults(foods);
      }
    } catch (e: any) {
      Alert.alert('분석 실패', e.message ?? '서버 오류가 발생했어요.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCameraCapture = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '카메라 접근 권한이 필요합니다.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    const { base64, mimeType = 'image/jpeg' } = result.assets[0];
    setAnalyzing(true);
    try {
      const foods = await analyzePhoto(base64, mimeType);
      if (foods.length === 0) {
        Alert.alert('분석 결과 없음', '음식을 인식하지 못했어요.');
      } else {
        setAiResults(foods);
      }
    } catch (e: any) {
      Alert.alert('분석 실패', e.message ?? '서버 오류가 발생했어요.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAddAiItems = async (selected: AnalyzedFood[]) => {
    setAddingAi(true);
    try {
      let updated = log!;
      for (const food of selected) {
        const entry: MealEntry = {
          food: {
            id: `ai_${Date.now()}_${Math.random()}`,
            name: food.name_ko || food.name,
            brand: null,
            category: null,
            upc: null,
            serving: { size: food.estimated_grams, unit: 'g', text: null },
            per_100g: food.per_100g,
          },
          grams: food.estimated_grams,
          calories: (food.per_100g.kcal ?? 0) * food.estimated_grams / 100,
          protein: (food.per_100g.protein_g ?? 0) * food.estimated_grams / 100,
          carbs: (food.per_100g.carbs_g ?? 0) * food.estimated_grams / 100,
          fat: (food.per_100g.fat_g ?? 0) * food.estimated_grams / 100,
        };
        updated = await addEntry(date, slot, entry);
      }
      setLog(updated);
      setAiResults(null);
    } catch (e: any) {
      Alert.alert('추가 실패', e.message);
    } finally {
      setAddingAi(false);
    }
  };

  if (!log) return <View style={styles.center}><Text>불러오는 중...</Text></View>;

  const entries = log.meals[slot];
  const slotTotal = totals(entries);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Slot total summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{SLOT_LABELS[slot]} 합계</Text>
          <View style={styles.macroRow}>
            <MacroChip label="칼로리" value={slotTotal.calories.toFixed(0)} unit="kcal" />
            <MacroChip label="단백질" value={slotTotal.protein.toFixed(1)} unit="g" />
            <MacroChip label="탄수" value={slotTotal.carbs.toFixed(1)} unit="g" />
            <MacroChip label="지방" value={slotTotal.fat.toFixed(1)} unit="g" />
          </View>
        </View>

        {/* AI Analyze buttons */}
        <View style={styles.aiRow}>
          <TouchableOpacity style={styles.aiBtn} onPress={handleCameraCapture} disabled={analyzing}>
            <Text style={styles.aiBtnText}>📷 사진 찍기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.aiBtn} onPress={handleAnalyzePhoto} disabled={analyzing}>
            <Text style={styles.aiBtnText}>🖼 앨범에서 선택</Text>
          </TouchableOpacity>
        </View>
        {analyzing && (
          <View style={styles.analyzingRow}>
            <ActivityIndicator color="#FF6B35" />
            <Text style={styles.analyzingText}>AI가 음식을 분석하는 중...</Text>
          </View>
        )}

        {/* Entry list */}
        {entries.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>아직 추가된 음식이 없어요.</Text>
            <Text style={styles.emptyHint}>사진을 찍거나 아래에서 검색해보세요!</Text>
          </View>
        ) : (
          entries.map((entry: MealEntry, i: number) => (
            <EntryCard key={i} entry={entry} onRemove={() => handleRemove(i)} />
          ))
        )}
      </ScrollView>

      {/* Add food button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={() => navigation.navigate('FoodSearch', { slot, date })}
        >
          <Text style={styles.searchBtnText}>음식 검색하여 추가</Text>
        </TouchableOpacity>
      </View>

      {/* AI Results Modal */}
      <AiResultsModal
        results={aiResults}
        loading={addingAi}
        onConfirm={handleAddAiItems}
        onDismiss={() => setAiResults(null)}
      />
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AiResultsModal({
  results,
  loading,
  onConfirm,
  onDismiss,
}: {
  results: AnalyzedFood[] | null;
  loading: boolean;
  onConfirm: (selected: AnalyzedFood[]) => void;
  onDismiss: () => void;
}) {
  const [checked, setChecked] = useState<boolean[]>([]);

  React.useEffect(() => {
    if (results) setChecked(results.map(() => true));
  }, [results]);

  if (!results) return null;

  const toggle = (i: number) => setChecked((c) => c.map((v, j) => (j === i ? !v : v)));
  const selected = results.filter((_, i) => checked[i]);

  return (
    <Modal visible animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>AI 분석 결과</Text>
          <Text style={styles.modalSub}>추가할 항목을 선택하세요</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {results.map((food, i) => (
              <TouchableOpacity key={i} style={styles.aiItem} onPress={() => toggle(i)}>
                <View style={[styles.checkbox, checked[i] && styles.checkboxOn]}>
                  {checked[i] && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.aiItemName}>{food.name_ko || food.name}</Text>
                  <Text style={styles.aiItemSub}>
                    {food.estimated_grams}g · {food.per_100g.kcal?.toFixed(0)}kcal/100g ·{' '}
                    단백질 {food.per_100g.protein_g?.toFixed(1)}g{' '}
                    <Text style={{ color: CONF_COLOR[food.confidence], fontSize: 11 }}>
                      {food.confidence === 'high' ? '확실' : food.confidence === 'medium' ? '보통' : '불확실'}
                    </Text>
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onDismiss}>
              <Text style={styles.cancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, selected.length === 0 && styles.confirmBtnDisabled]}
              onPress={() => onConfirm(selected)}
              disabled={loading || selected.length === 0}
            >
              <Text style={styles.confirmText}>
                {loading ? '추가 중...' : `${selected.length}개 추가`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function EntryCard({ entry, onRemove }: { entry: MealEntry; onRemove: () => void }) {
  return (
    <View style={styles.entryCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.entryName} numberOfLines={2}>{entry.food.name}</Text>
        {entry.food.brand && <Text style={styles.entryBrand}>{entry.food.brand}</Text>}
        <View style={styles.entryMacros}>
          <Text style={styles.macroText}>{entry.grams}g</Text>
          <Text style={styles.macroText}>{entry.calories.toFixed(0)} kcal</Text>
          <Text style={styles.macroText}>단백질 {entry.protein.toFixed(1)}g</Text>
        </View>
      </View>
      <TouchableOpacity onPress={onRemove} style={styles.removeBtn}>
        <Text style={styles.removeText}>삭제</Text>
      </TouchableOpacity>
    </View>
  );
}

function MacroChip({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.macroChip}>
      <Text style={styles.macroValue}>{value}</Text>
      <Text style={styles.macroUnit}>{unit}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

const CONF_COLOR: Record<AnalyzedFood['confidence'], string> = {
  high: '#4ECDC4',
  medium: '#F7B731',
  low: '#FF6B6B',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  summaryCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  summaryTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  macroRow: { flexDirection: 'row', justifyContent: 'space-around' },
  macroChip: { alignItems: 'center' },
  macroValue: { fontSize: 18, fontWeight: '700', color: '#333' },
  macroUnit: { fontSize: 11, color: '#888' },
  macroLabel: { fontSize: 11, color: '#555' },
  aiRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  aiBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#FF6B35', elevation: 1 },
  aiBtnText: { fontSize: 13, fontWeight: '600', color: '#FF6B35' },
  analyzingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, paddingHorizontal: 4 },
  analyzingText: { fontSize: 13, color: '#FF6B35' },
  emptyBox: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 15, color: '#999', marginBottom: 6 },
  emptyHint: { fontSize: 13, color: '#bbb' },
  entryCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  entryName: { fontSize: 14, fontWeight: '600', color: '#222' },
  entryBrand: { fontSize: 12, color: '#999', marginTop: 2 },
  entryMacros: { flexDirection: 'row', gap: 10, marginTop: 6 },
  macroText: { fontSize: 12, color: '#666' },
  removeBtn: { justifyContent: 'center', paddingLeft: 12 },
  removeText: { color: '#FF3B30', fontSize: 13, fontWeight: '600' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' },
  searchBtn: { backgroundColor: '#4ECDC4', borderRadius: 12, padding: 16, alignItems: 'center' },
  searchBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  modalSub: { fontSize: 13, color: '#888', marginBottom: 16 },
  aiItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: '#4ECDC4', borderColor: '#4ECDC4' },
  checkmark: { color: '#fff', fontWeight: '700', fontSize: 13 },
  aiItemName: { fontSize: 15, fontWeight: '600', color: '#222', marginBottom: 2 },
  aiItemSub: { fontSize: 12, color: '#888' },

  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelText: { fontSize: 15, color: '#666' },
  confirmBtn: { flex: 2, padding: 14, borderRadius: 12, backgroundColor: '#4ECDC4', alignItems: 'center' },
  confirmBtnDisabled: { backgroundColor: '#ccc' },
  confirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
