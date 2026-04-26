import React, { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DailyLog, MealEntry, MealSlot, RootStackParamList } from '../types';
import { getLog, totals, updateGoals } from '../storage';
import { BRIM, F, fmt, fmtG } from '../theme';
import { GlassJar } from '../components/GlassJar';
import { Bear } from '../components/Bear';
import { SlotGlyph, PlusIcon } from '../components/Icons';
import Svg, { Path, Rect } from 'react-native-svg';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

// ── User profile ──────────────────────────────────────────────────────────────

interface UserProfile {
  height: number;
  weight: number;
  gender: 'male' | 'female';
  age: number;
  goal: 'diet' | 'maintain' | 'gain';
}

const PROFILE_KEY = 'user_profile';

async function loadProfile(): Promise<UserProfile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function saveProfile(p: UserProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}

function calcGoals(p: UserProfile): DailyLog['goals'] {
  const bmr = p.gender === 'male'
    ? 10 * p.weight + 6.25 * p.height - 5 * p.age + 5
    : 10 * p.weight + 6.25 * p.height - 5 * p.age - 161;
  const tdee = Math.round(bmr * 1.375);
  const kcal = p.goal === 'diet' ? Math.round(tdee * 0.8)
    : p.goal === 'gain' ? Math.round(tdee * 1.1)
    : tdee;
  const proteinG = p.goal === 'diet' ? Math.round(p.weight * 2.2)
    : p.goal === 'gain' ? Math.round(p.weight * 2.0)
    : Math.round(p.weight * 1.6);
  const fatG = Math.round(kcal * 0.25 / 9);
  const carbG = Math.round((kcal - proteinG * 4 - fatG * 9) / 4);
  return { calories: kcal, protein: proteinG, carbs: Math.max(carbG, 0), fat: fatG };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SLOT_LABELS: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateLabel(d: Date) {
  const isToday = dateStr(d) === dateStr(new Date());
  const label = `${MONTHS[d.getMonth()]} ${d.getDate()} · ${DAYS[d.getDay()]}`;
  return isToday ? `Today · ${label}` : label;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [log, setLog] = useState<DailyLog | null>(null);
  const [goalsModal, setGoalsModal] = useState(false);
  const [animateKey, setAnimateKey] = useState(0);

  const date = dateStr(selectedDate);

  useFocusEffect(
    useCallback(() => {
      Promise.all([getLog(date), loadProfile()]).then(async ([l, profile]) => {
        if (profile && l.goals.calories <= 2000) {
          const calculated = calcGoals(profile);
          l = { ...l, goals: calculated };
          updateGoals(date, calculated).catch(() => {});
        }
        setLog(l);
        setAnimateKey((k) => k + 1);
      });
    }, [date]),
  );

  const handleSaveGoals = async (goals: DailyLog['goals']) => {
    await updateGoals(date, goals);
    setLog((prev) => (prev ? { ...prev, goals } : prev));
    setGoalsModal(false);
    setAnimateKey((k) => k + 1);
  };

  if (!log) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={BRIM.ink} />
      </View>
    );
  }

  const allEntries = SLOTS.flatMap((sl) => log.meals[sl] ?? []);
  const total = totals(allEntries);
  const { goals } = log;
  const calProgress = goals.calories > 0 ? total.calories / goals.calories : 0;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Date + calendar + goals button */}
        <View style={s.topRow}>
          <TouchableOpacity onPress={() => setShowCalendar(true)} style={s.dateBtn} hitSlop={8}>
            <CalendarIcon size={14} color={BRIM.mute} />
            <Text style={s.dateLbl}>{dateLabel(selectedDate)}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setGoalsModal(true)} hitSlop={8}>
            <Text style={s.goalsBtn}>Edit Goals →</Text>
          </TouchableOpacity>
        </View>

        <View style={s.titleRow}>
          <Text style={s.title}>Today's Calories</Text>
        </View>

        {/* Hero bear */}
        <View style={s.heroWrap}>
          <Bear calories={total.calories} goal={goals.calories} size={160} />
          <View style={s.heroKcal} pointerEvents="none">
            <View style={s.heroKcalRow}>
              <Text style={[s.heroNum, { color: BRIM.ink }]}>{fmt(total.calories)}</Text>
              <Text style={s.heroSub}>/ {fmt(goals.calories)} kcal</Text>
            </View>
          </View>

        </View>

        {/* Macro text row */}
        <View style={s.macroRow}>
          {([
            { label: 'Protein', value: total.protein, target: goals.protein },
            { label: 'Carbs',   value: total.carbs,   target: goals.carbs },
            { label: 'Fat',     value: total.fat,     target: goals.fat },
          ] as const).map((m) => (
            <View key={m.label} style={s.macroCell}>
              <Text style={s.macroLabel}>{m.label}</Text>
              <View style={s.macroNumRow}>
                <Text style={s.macroNum}>{fmt(m.value)}</Text>
                <Text style={s.macroTarget}>/{fmt(m.target)}g</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Slot cards */}
        <View style={s.slotsWrap}>
          {SLOTS.map((slot) => (
            <SlotCard
              key={slot} slot={slot}
              entries={log.meals[slot]}
              onAdd={() => navigation.navigate('MealRegister', { slot, date })}
            />
          ))}
        </View>
      </ScrollView>

      {/* Calendar picker */}
      {showCalendar && (
        <Modal transparent animationType="fade" statusBarTranslucent>
          <Pressable style={s.calOverlay} onPress={() => setShowCalendar(false)}>
            <Pressable style={s.calSheet} onPress={() => {}}>
              <View style={s.dragHandle} />
              <Text style={s.calTitle}>Select Date</Text>
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="inline"
                maximumDate={new Date()}
                onChange={(_, d) => { if (d) { setSelectedDate(d); setShowCalendar(false); } }}
                accentColor={BRIM.ink}
                themeVariant="light"
                style={{ alignSelf: 'center' }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}

      <GoalsModal
        visible={goalsModal}
        current={goals}
        onSave={handleSaveGoals}
        onDismiss={() => setGoalsModal(false)}
      />
    </View>
  );
}

// ── Slot card ─────────────────────────────────────────────────────────────────

function SlotCard({ slot, entries, onAdd }: {
  slot: MealSlot; entries: MealEntry[]; onAdd: () => void;
}) {
  const slotTotal = totals(entries);
  return (
    <View style={s.slotCard}>
      <View style={s.slotHeaderRow}>
        <View style={s.slotLeft}>
          <SlotGlyph slot={slot} size={14} color={BRIM.mute} />
          <Text style={s.slotName}>{SLOT_LABELS[slot]}</Text>
          {entries.length > 0 && (
            <Text style={s.slotSummary} numberOfLines={1}>
              {fmt(slotTotal.calories)} kcal · Protein {fmtG(slotTotal.protein)}g
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={onAdd} hitSlop={8} style={s.addBtn}>
          <PlusIcon size={14} color={BRIM.ink} />
          <Text style={s.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
      {entries.length === 0 ? (
        <Text style={s.emptySlot}>Nothing logged yet.</Text>
      ) : (
        <View style={s.entryList}>
          {entries.map((e, i) => (
            <View key={i} style={s.entryRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.entryName} numberOfLines={1}>{e.food.name}</Text>
                {e.food.brand ? <Text style={s.entryBrand} numberOfLines={1}>{e.food.brand}</Text> : null}
              </View>
              <View style={s.entryRight}>
                <Text style={s.entryGrams}>{fmt(e.grams)}g</Text>
                <Text style={s.entryKcal}>{fmt(e.calories)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Goals modal ───────────────────────────────────────────────────────────────

type Goals = DailyLog['goals'];
type GoalMode = 'manual' | 'body';

const GOAL_LABELS = ['Lose Weight', 'Maintain', 'Build Muscle'] as const;
const GOAL_VALUES: UserProfile['goal'][] = ['diet', 'maintain', 'gain'];

function GoalsModal({ visible, current, onSave, onDismiss }: {
  visible: boolean; current: Goals;
  onSave: (g: Goals) => Promise<void>; onDismiss: () => void;
}) {
  const [mode, setMode] = useState<GoalMode>('body');
  const [draft, setDraft] = useState({ ...current });
  const [profile, setProfile] = useState<UserProfile>({
    height: 175, weight: 70, gender: 'male', age: 30, goal: 'maintain',
  });
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (!visible) return;
    setDraft({ ...current });
    loadProfile().then((p) => { if (p) setProfile(p); });
  }, [visible]);

  const computed = calcGoals(profile);

  const handleSave = async () => {
    const goals = mode === 'body' ? computed : draft;
    if (Object.values(goals).some((v) => !Number.isFinite(v) || v <= 0)) {
      Alert.alert('Error', 'Please enter valid values.');
      return;
    }
    setSaving(true);
    try {
      if (mode === 'body') await saveProfile(profile);
      await onSave(goals);
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={s.backdrop} onPress={onDismiss} />
        <ScrollView style={s.sheet} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={s.dragHandle} />
          <Text style={s.sheetTitle}>Goals</Text>

          {/* Mode toggle */}
          <View style={s.modeToggle}>
            {(['body', 'manual'] as GoalMode[]).map((m) => (
              <TouchableOpacity key={m} style={[s.modeBtn, mode === m && s.modeBtnOn]} onPress={() => setMode(m)}>
                <Text style={[s.modeBtnText, mode === m && s.modeBtnTextOn]}>
                  {m === 'body' ? 'Calculate from body' : 'Enter manually'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === 'body' ? (
            <View style={s.bodyForm}>
              {/* Gender */}
              <View style={s.bodyRow}>
                <Text style={s.bodyLabel}>Gender</Text>
                <View style={s.genderRow}>
                  {(['male', 'female'] as const).map((g) => (
                    <TouchableOpacity
                      key={g}
                      style={[s.genderBtn, profile.gender === g && s.genderBtnOn]}
                      onPress={() => setProfile((p) => ({ ...p, gender: g }))}
                    >
                      <Text style={[s.genderText, profile.gender === g && s.genderTextOn]}>
                        {g === 'male' ? 'Male' : 'Female'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Age / Height / Weight */}
              {([
                { key: 'age',    label: 'Age',    unit: 'yr' },
                { key: 'height', label: 'Height', unit: 'cm' },
                { key: 'weight', label: 'Weight', unit: 'kg' },
              ] as { key: keyof UserProfile; label: string; unit: string }[]).map(({ key, label, unit }) => (
                <View key={key} style={s.bodyRow}>
                  <Text style={s.bodyLabel}>{label}</Text>
                  <View style={s.numInputRow}>
                    <TextInput
                      style={s.numInput}
                      value={String(profile[key])}
                      onChangeText={(v) => setProfile((p) => ({ ...p, [key]: parseFloat(v) || 0 }))}
                      keyboardType="decimal-pad"
                      selectTextOnFocus
                    />
                    <Text style={s.numUnit}>{unit}</Text>
                  </View>
                </View>
              ))}

              {/* Goal */}
              <View style={s.bodyRow}>
                <Text style={s.bodyLabel}>Goal</Text>
                <View style={s.goalBtnRow}>
                  {GOAL_VALUES.map((g, i) => (
                    <TouchableOpacity
                      key={g}
                      style={[s.goalChip, profile.goal === g && s.goalChipOn]}
                      onPress={() => setProfile((p) => ({ ...p, goal: g }))}
                    >
                      <Text style={[s.goalChipText, profile.goal === g && s.goalChipTextOn]}>
                        {GOAL_LABELS[i]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Calculated preview */}
              <View style={s.calcPreview}>
                <Text style={s.calcTitle}>Calculated Goals</Text>
                <View style={s.calcRow}>
                  {[
                    { l: 'Calories', v: computed.calories, u: 'kcal' },
                    { l: 'Protein',  v: computed.protein,  u: 'g' },
                    { l: 'Carbs',    v: computed.carbs,    u: 'g' },
                    { l: 'Fat',      v: computed.fat,      u: 'g' },
                  ].map((m) => (
                    <View key={m.l} style={s.calcCell}>
                      <Text style={s.calcNum}>{m.v}</Text>
                      <Text style={s.calcUnit}>{m.u}</Text>
                      <Text style={s.calcLabel}>{m.l}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ) : (
            <View style={s.goalFields}>
              {([
                { key: 'calories', label: 'Calories', unit: 'kcal' },
                { key: 'protein',  label: 'Protein',  unit: 'g' },
                { key: 'carbs',    label: 'Carbs',    unit: 'g' },
                { key: 'fat',      label: 'Fat',      unit: 'g' },
              ] as { key: keyof Goals; label: string; unit: string }[]).map(({ key, label, unit }) => (
                <View key={key} style={s.goalRow}>
                  <Text style={s.goalLabel}>{label}</Text>
                  <TextInput
                    style={s.goalInput}
                    value={String(draft[key])}
                    onChangeText={(v) => setDraft((d) => ({ ...d, [key]: parseFloat(v) || 0 }))}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                  />
                  <Text style={s.goalUnit}>{unit}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={s.sheetBtns}>
            <TouchableOpacity style={s.cancelBtn} onPress={onDismiss}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.confirmBtn} onPress={handleSave} disabled={saving}>
              <Text style={s.confirmText}>{saving ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Calendar icon ─────────────────────────────────────────────────────────────

function CalendarIcon({ size = 14, color = BRIM.mute }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={4} width={18} height={18} rx={3} stroke={color} strokeWidth={1.6} />
      <Path d="M16 2v4M8 2v4M3 10h18" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRIM.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BRIM.paper },
  scroll: { paddingBottom: 40 },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateLbl: { fontFamily: F.semi, fontSize: 11, color: BRIM.mute, letterSpacing: 1.3, textTransform: 'uppercase' },
  goalsBtn: { fontFamily: F.semi, fontSize: 12, color: BRIM.mute },

  titleRow: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 },
  title: { fontFamily: F.bold, fontSize: 22, color: BRIM.ink, letterSpacing: -0.6 },

  heroWrap: { alignItems: 'center', paddingBottom: 8 },
  heroKcal: { alignItems: 'center', paddingBottom: 8 },
  heroKcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  heroUnit: { fontFamily: F.num, fontSize: 11, color: BRIM.mute, letterSpacing: 2, textTransform: 'uppercase', marginBottom: -4 },
  heroNum: { fontFamily: F.bold, fontSize: 44, letterSpacing: -1.8 },
  heroSub: { fontFamily: F.num, fontSize: 13, color: BRIM.mute, letterSpacing: -0.1 },

  macroRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 20, paddingBottom: 20 },
  macroCell: { alignItems: 'center' },
  macroLabel: { fontFamily: F.semi, fontSize: 10, color: BRIM.mute, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  macroNumRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  macroNum: { fontFamily: F.bold, fontSize: 20, color: BRIM.ink, letterSpacing: -0.5 },
  macroTarget: { fontFamily: F.med, fontSize: 10, color: BRIM.mute },

  slotsWrap: { paddingHorizontal: 16, gap: 10 },
  slotCard: { backgroundColor: BRIM.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: BRIM.hair },
  slotHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  slotLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  slotName: { fontFamily: F.bold, fontSize: 13, color: BRIM.ink, letterSpacing: -0.1 },
  slotSummary: { fontFamily: F.num, fontSize: 11, color: BRIM.mute, flex: 1 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { fontFamily: F.semi, fontSize: 12, color: BRIM.ink },
  emptySlot: { fontFamily: F.med, fontSize: 12, color: BRIM.mute, paddingTop: 6, paddingBottom: 2 },
  entryList: { gap: 6, marginTop: 10 },
  entryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  entryName: { fontFamily: F.semi, fontSize: 13, color: BRIM.ink },
  entryBrand: { fontFamily: F.med, fontSize: 11, color: BRIM.mute, marginTop: 1 },
  entryRight: { flexDirection: 'row', alignItems: 'baseline', gap: 4, flexShrink: 0 },
  entryGrams: { fontFamily: F.num, fontSize: 11, color: BRIM.mute, width: 48, textAlign: 'right' },
  entryKcal: { fontFamily: F.numSemi, fontSize: 12, color: BRIM.ink, width: 38, textAlign: 'right' },

  // Calendar
  calOverlay: { flex: 1, backgroundColor: 'rgba(11,11,14,0.35)', justifyContent: 'flex-end' },
  calSheet: { backgroundColor: BRIM.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 },
  calTitle: { fontFamily: F.bold, fontSize: 18, color: BRIM.ink, paddingHorizontal: 24, marginBottom: 8 },

  // Goals modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,11,14,0.35)' },
  sheet: { backgroundColor: BRIM.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 8, maxHeight: '90%' },
  dragHandle: { width: 36, height: 4, backgroundColor: BRIM.hair, borderRadius: 99, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontFamily: F.bold, fontSize: 18, color: BRIM.ink, letterSpacing: -0.4, marginBottom: 16 },

  // Mode toggle
  modeToggle: { flexDirection: 'row', backgroundColor: BRIM.hair, borderRadius: 12, padding: 3, marginBottom: 20 },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  modeBtnOn: { backgroundColor: BRIM.card },
  modeBtnText: { fontFamily: F.semi, fontSize: 13, color: BRIM.mute },
  modeBtnTextOn: { color: BRIM.ink },

  // Body form
  bodyForm: { gap: 12 },
  bodyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BRIM.hair2 },
  bodyLabel: { fontFamily: F.med, fontSize: 14, color: BRIM.ink },
  genderRow: { flexDirection: 'row', gap: 8 },
  genderBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: BRIM.hair },
  genderBtnOn: { backgroundColor: BRIM.ink, borderColor: BRIM.ink },
  genderText: { fontFamily: F.semi, fontSize: 13, color: BRIM.ink },
  genderTextOn: { color: BRIM.paper },
  numInputRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  numInput: { fontFamily: F.numSemi, fontSize: 18, color: BRIM.ink, textAlign: 'right', minWidth: 60 },
  numUnit: { fontFamily: F.med, fontSize: 13, color: BRIM.mute },
  goalBtnRow: { flexDirection: 'row', gap: 6 },
  goalChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: BRIM.hair },
  goalChipOn: { backgroundColor: BRIM.ink, borderColor: BRIM.ink },
  goalChipText: { fontFamily: F.semi, fontSize: 12, color: BRIM.ink },
  goalChipTextOn: { color: BRIM.paper },

  // Calculated preview
  calcPreview: { backgroundColor: BRIM.card, borderRadius: 14, padding: 16, marginTop: 8, borderWidth: 1, borderColor: BRIM.hair },
  calcTitle: { fontFamily: F.semi, fontSize: 11, color: BRIM.mute, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-around' },
  calcCell: { alignItems: 'center', gap: 2 },
  calcNum: { fontFamily: F.bold, fontSize: 20, color: BRIM.ink, letterSpacing: -0.5 },
  calcUnit: { fontFamily: F.med, fontSize: 10, color: BRIM.mute },
  calcLabel: { fontFamily: F.semi, fontSize: 10, color: BRIM.mute, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Manual entry
  goalFields: { gap: 12 },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: BRIM.card, borderRadius: 14, borderWidth: 1, borderColor: BRIM.hair },
  goalLabel: { flex: 1, fontFamily: F.med, fontSize: 14, color: BRIM.ink },
  goalInput: { width: 80, textAlign: 'right', fontFamily: F.numSemi, fontSize: 17, color: BRIM.ink },
  goalUnit: { fontFamily: F.med, fontSize: 11, color: BRIM.mute, minWidth: 28 },

  sheetBtns: { flexDirection: 'row', gap: 8, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: BRIM.hair, alignItems: 'center' },
  cancelText: { fontFamily: F.semi, fontSize: 14, color: BRIM.ink },
  confirmBtn: { flex: 2, padding: 16, borderRadius: 14, backgroundColor: BRIM.ink, alignItems: 'center' },
  confirmText: { fontFamily: F.bold, fontSize: 14, color: BRIM.paper },
});
