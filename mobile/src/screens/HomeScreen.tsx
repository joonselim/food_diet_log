import React, { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DailyLog, MealSlot, RootStackParamList } from '../types';
import { getLog, totals, updateGoals } from '../storage';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

const today = () => new Date().toISOString().slice(0, 10);

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
};

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(value / (max || 1), 1);
  return (
    <View style={styles.barBg}>
      <View style={[styles.barFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
    </View>
  );
}

export default function HomeScreen({ navigation }: Props) {
  const date = today();
  const [log, setLog] = useState<DailyLog | null>(null);
  const [goalsModal, setGoalsModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getLog(date).then(setLog);
    }, [date]),
  );

  const handleSaveGoals = async (goals: DailyLog['goals']) => {
    await updateGoals(date, goals);
    setLog((prev) => prev ? { ...prev, goals } : prev);
    setGoalsModal(false);
  };

  if (!log) return <View style={styles.center}><Text>불러오는 중...</Text></View>;

  const allEntries = SLOTS.flatMap((s) => log.meals[s]);
  const total = totals(allEntries);
  const { goals } = log;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.dateText}>{date}</Text>

      {/* Daily Summary */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>오늘 섭취량</Text>
          <TouchableOpacity onPress={() => setGoalsModal(true)} style={styles.goalEditBtn}>
            <Text style={styles.goalEditText}>목표 설정</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.macroRow}>
          <MacroBox label="칼로리" value={total.calories} unit="kcal" goal={goals.calories} color="#FF6B35" />
          <MacroBox label="단백질" value={total.protein} unit="g" goal={goals.protein} color="#4ECDC4" />
          <MacroBox label="탄수화물" value={total.carbs} unit="g" goal={goals.carbs} color="#45B7D1" />
          <MacroBox label="지방" value={total.fat} unit="g" goal={goals.fat} color="#96CEB4" />
        </View>
        <ProgressBar value={total.calories} max={goals.calories} color="#FF6B35" />
        <Text style={styles.progressText}>
          {total.calories.toFixed(0)} / {goals.calories} kcal
        </Text>
      </View>

      {/* Meal Slots */}
      {SLOTS.map((slot) => {
        const entries = log.meals[slot];
        const slotTotal = totals(entries);
        return (
          <View key={slot} style={styles.card}>
            <View style={styles.slotHeader}>
              <Text style={styles.cardTitle}>{SLOT_LABELS[slot]}</Text>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => navigation.navigate('MealRegister', { slot, date })}
              >
                <Text style={styles.addBtnText}>+ 추가</Text>
              </TouchableOpacity>
            </View>
            {entries.length === 0 ? (
              <Text style={styles.emptyText}>아직 기록이 없어요</Text>
            ) : (
              <>
                {entries.map((e, i) => (
                  <View key={i} style={styles.entryRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.entryName}>{e.food.name}</Text>
                      {e.food.brand && <Text style={styles.entryBrand}>{e.food.brand}</Text>}
                    </View>
                    <Text style={styles.entryMacro}>{e.grams}g</Text>
                    <Text style={styles.entryKcal}>{e.calories.toFixed(0)} kcal</Text>
                  </View>
                ))}
                <Text style={styles.slotTotal}>
                  합계: {slotTotal.calories.toFixed(0)} kcal · 단백질 {slotTotal.protein.toFixed(1)}g
                </Text>
              </>
            )}
          </View>
        );
      })}

      <GoalsModal
        visible={goalsModal}
        current={goals}
        onSave={handleSaveGoals}
        onDismiss={() => setGoalsModal(false)}
      />
    </ScrollView>
  );
}

// ── Goals Modal ───────────────────────────────────────────────────────────────

type Goals = DailyLog['goals'];

const GOAL_FIELDS: { key: keyof Goals; label: string; unit: string; color: string }[] = [
  { key: 'calories', label: '칼로리', unit: 'kcal', color: '#FF6B35' },
  { key: 'protein',  label: '단백질', unit: 'g',    color: '#4ECDC4' },
  { key: 'carbs',    label: '탄수화물', unit: 'g',  color: '#45B7D1' },
  { key: 'fat',      label: '지방',   unit: 'g',    color: '#96CEB4' },
];

function GoalsModal({
  visible,
  current,
  onSave,
  onDismiss,
}: {
  visible: boolean;
  current: Goals;
  onSave: (g: Goals) => Promise<void>;
  onDismiss: () => void;
}) {
  const [draft, setDraft] = useState<Record<keyof Goals, string>>({
    calories: String(current.calories),
    protein: String(current.protein),
    carbs: String(current.carbs),
    fat: String(current.fat),
  });
  const [saving, setSaving] = useState(false);

  // Sync draft when modal opens
  React.useEffect(() => {
    if (visible) {
      setDraft({
        calories: String(current.calories),
        protein: String(current.protein),
        carbs: String(current.carbs),
        fat: String(current.fat),
      });
    }
  }, [visible, current]);

  const handleSave = async () => {
    const parsed = {
      calories: parseFloat(draft.calories),
      protein: parseFloat(draft.protein),
      carbs: parseFloat(draft.carbs),
      fat: parseFloat(draft.fat),
    };
    if (Object.values(parsed).some((v) => !Number.isFinite(v) || v <= 0)) {
      Alert.alert('오류', '모든 목표값을 올바르게 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>목표 설정</Text>
          <Text style={styles.modalSub}>오늘 하루 목표 영양소를 입력하세요</Text>

          {GOAL_FIELDS.map(({ key, label, unit, color }) => (
            <View key={key} style={styles.goalRow}>
              <View style={[styles.goalDot, { backgroundColor: color }]} />
              <Text style={styles.goalLabel}>{label}</Text>
              <TextInput
                style={styles.goalInput}
                value={draft[key]}
                onChangeText={(v) => setDraft((d) => ({ ...d, [key]: v }))}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
              <Text style={styles.goalUnit}>{unit}</Text>
            </View>
          ))}

          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onDismiss}>
              <Text style={styles.cancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleSave} disabled={saving}>
              <Text style={styles.confirmText}>{saving ? '저장 중...' : '저장'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MacroBox({ label, value, unit, goal, color }: {
  label: string; value: number; unit: string; goal: number; color: string;
}) {
  const pct = Math.min(Math.round((value / (goal || 1)) * 100), 999);
  return (
    <View style={styles.macroBox}>
      <Text style={[styles.macroValue, { color }]}>{value.toFixed(0)}</Text>
      <Text style={styles.macroUnit}>{unit}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroGoal}>목표 {goal} · {pct}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dateText: { fontSize: 14, color: '#888', marginBottom: 12, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  goalEditBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  goalEditText: { fontSize: 12, color: '#888' },
  macroRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  macroBox: { alignItems: 'center', flex: 1 },
  macroValue: { fontSize: 20, fontWeight: '700' },
  macroUnit: { fontSize: 11, color: '#888' },
  macroLabel: { fontSize: 12, color: '#555', marginTop: 2 },
  macroGoal: { fontSize: 10, color: '#bbb', marginTop: 1 },
  barBg: { height: 8, backgroundColor: '#eee', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  progressText: { fontSize: 12, color: '#888', textAlign: 'right', marginTop: 4 },
  slotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  addBtn: { backgroundColor: '#4ECDC4', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  emptyText: { color: '#bbb', fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  entryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  entryName: { fontSize: 13, fontWeight: '600' },
  entryBrand: { fontSize: 11, color: '#999' },
  entryMacro: { fontSize: 12, color: '#888', marginRight: 8 },
  entryKcal: { fontSize: 13, fontWeight: '600', color: '#FF6B35', minWidth: 60, textAlign: 'right' },
  slotTotal: { fontSize: 12, color: '#888', marginTop: 8, textAlign: 'right' },
  // Goals Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  modalSub: { fontSize: 13, color: '#888', marginBottom: 20 },
  goalRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  goalDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  goalLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#333' },
  goalInput: { width: 90, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, textAlign: 'right', marginRight: 6 },
  goalUnit: { width: 32, fontSize: 13, color: '#888' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelText: { fontSize: 15, color: '#666' },
  confirmBtn: { flex: 2, padding: 14, borderRadius: 12, backgroundColor: '#4ECDC4', alignItems: 'center' },
  confirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
