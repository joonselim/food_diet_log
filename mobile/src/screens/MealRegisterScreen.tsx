import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { DailyLog, MealEntry, MealSlot, RootStackParamList } from '../types';
import { addEntry, getLog, removeEntry, totals } from '../storage';
import { analyzePhoto, AnalyzedFood } from '../api';
import { BRIM, F, fmt, fmtG } from '../theme';
import { CameraIcon, ImageIcon, SearchIcon, ChevronLeft, CheckIcon } from '../components/Icons';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MealRegister'>;
  route: RouteProp<RootStackParamList, 'MealRegister'>;
};

const SLOT_LABELS: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

export default function MealRegisterScreen({ navigation, route }: Props) {
  const { slot, date } = route.params;
  const insets = useSafeAreaInsets();
  const [log, setLog] = useState<DailyLog | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiResults, setAiResults] = useState<AnalyzedFood[] | null>(null);
  const [addingAi, setAddingAi] = useState(false);

  useFocusEffect(
    useCallback(() => { getLog(date).then(setLog); }, [date]),
  );

  const handleRemove = (index: number) => {
    Alert.alert('Delete', 'Remove this item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const updated = await removeEntry(date, slot, index);
          setLog(updated);
        },
      },
    ]);
  };

  const compressImage = async (uri: string) => {
    const r = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 800 } }],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    return { base64: r.base64!, mimeType: 'image/jpeg' };
  };

  const pickAndAnalyze = async (useCamera: boolean) => {
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Required', 'Camera access is needed.'); return; }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Required', 'Photo library access is needed.'); return; }
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 });

    if (result.canceled || !result.assets[0]?.uri) return;
    setAnalyzing(true);
    const { base64, mimeType } = await compressImage(result.assets[0].uri);
    try {
      const foods = await analyzePhoto(base64, mimeType);
      if (foods.length === 0) {
        Alert.alert('No Results', 'Could not detect food. Try a different photo.');
      } else {
        setAiResults(foods);
      }
    } catch (e: any) {
      Alert.alert('Analysis Failed', e.message ?? 'Server error occurred.');
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
            name: food.name,
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
      Alert.alert('Failed to Add', e.message);
    } finally {
      setAddingAi(false);
    }
  };

  if (!log) {
    return (
      <View style={s.center}>
        <Text style={s.loadingText}>Loading...</Text>
      </View>
    );
  }

  const entries = log.meals[slot];
  const slotTotal = totals(entries);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Custom header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={s.backBtn}>
          <ChevronLeft size={22} color={BRIM.ink} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Log {SLOT_LABELS[slot]}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Totals strip */}
        <View style={s.totalsGrid}>
          {[
            { l: 'KCAL', v: slotTotal.calories, u: '' },
            { l: 'Protein', v: slotTotal.protein, u: 'g' },
            { l: 'Carbs',   v: slotTotal.carbs,   u: 'g' },
            { l: 'Fat',     v: slotTotal.fat,     u: 'g' },
          ].map((m) => (
            <View key={m.l} style={s.totalCell}>
              <Text style={s.totalLabel}>{m.l}</Text>
              <Text style={s.totalValue}>
                {fmt(m.v)}<Text style={s.totalUnit}>{m.u}</Text>
              </Text>
            </View>
          ))}
        </View>

        {/* AI buttons */}
        <View style={s.aiGrid}>
          <TouchableOpacity
            style={[s.aiCard, analyzing && s.aiCardDisabled]}
            onPress={() => pickAndAnalyze(true)}
            disabled={analyzing}
          >
            <CameraIcon size={20} color={BRIM.ink} />
            <View>
              <Text style={s.aiCardTitle}>Take Photo</Text>
              <Text style={s.aiCardSub}>AI auto-detect</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.aiCard, analyzing && s.aiCardDisabled]}
            onPress={() => pickAndAnalyze(false)}
            disabled={analyzing}
          >
            <ImageIcon size={20} color={BRIM.ink} />
            <View>
              <Text style={s.aiCardTitle}>From Album</Text>
              <Text style={s.aiCardSub}>Choose a photo</Text>
            </View>
          </TouchableOpacity>
        </View>

        {analyzing && (
          <View style={s.analyzingRow}>
            <Spinner />
            <Text style={s.analyzingText}>Analyzing food...</Text>
          </View>
        )}

        {/* Entries list */}
        <View style={s.entriesHeader}>
          <Text style={s.entriesLabel}>Logged · {entries.length}</Text>
        </View>

        {entries.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyTitle}>No food added yet</Text>
            <Text style={s.emptySub}>Analyze a photo or search to add food</Text>
          </View>
        ) : (
          <View style={s.entriesList}>
            {entries.map((entry, i) => (
              <EntryCard key={i} entry={entry} onRemove={() => handleRemove(i)} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Sticky footer CTA */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={s.searchBtn}
          onPress={() => navigation.navigate('FoodSearch', { slot, date })}
        >
          <SearchIcon size={16} color={BRIM.paper} />
          <Text style={s.searchBtnText}>Search & Add Food</Text>
        </TouchableOpacity>
      </View>

      <AiResultsModal
        results={aiResults}
        loading={addingAi}
        onConfirm={handleAddAiItems}
        onDismiss={() => setAiResults(null)}
      />
    </View>
  );
}

// ── Entry card ────────────────────────────────────────────────────────────────

function EntryCard({ entry, onRemove }: { entry: MealEntry; onRemove: () => void }) {
  return (
    <View style={s.entryCard}>
      <View style={{ flex: 1 }}>
        <Text style={s.entryName} numberOfLines={2}>{entry.food.name}</Text>
        {entry.food.brand ? <Text style={s.entryBrand}>{entry.food.brand}</Text> : null}
        <View style={s.entryChips}>
          <Chip>{fmt(entry.grams)}g</Chip>
          <Chip strong>{fmt(entry.calories)} kcal</Chip>
          <Chip>P {fmtG(entry.protein)}g</Chip>
        </View>
      </View>
      <TouchableOpacity onPress={onRemove} hitSlop={8} style={s.removeBtn}>
        <Text style={s.removeText}>Remove</Text>
      </TouchableOpacity>
    </View>
  );
}

function Chip({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <View style={[s.chip, strong && s.chipStrong]}>
      <Text style={[s.chipText, strong && s.chipTextStrong]}>{children}</Text>
    </View>
  );
}

function Spinner() {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(rot, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true }),
    ).start();
  }, [rot]);
  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Animated.View style={[s.spinner, { transform: [{ rotate: spin }] }]} />;
}

// ── AI results modal ──────────────────────────────────────────────────────────

function AiResultsModal({
  results, loading, onConfirm, onDismiss,
}: {
  results: AnalyzedFood[] | null;
  loading: boolean;
  onConfirm: (sel: AnalyzedFood[]) => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [checked, setChecked] = useState<boolean[]>([]);

  React.useEffect(() => {
    if (results) setChecked(results.map((r) => r.confidence !== 'low'));
  }, [results]);

  if (!results) return null;

  const toggle = (i: number) => setChecked((c) => c.map((v, j) => (j === i ? !v : v)));
  const selected = results.filter((_, i) => checked[i]);

  return (
    <Modal visible animationType="slide" transparent statusBarTranslucent>
      <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={s.backdrop} onPress={onDismiss} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 28 }]}>
          <View style={s.dragHandle} />
          <Text style={s.sheetTitle}>AI Analysis</Text>
          <Text style={s.sheetSub}>Select items to add</Text>

          <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
            {results.map((food, i) => (
              <TouchableOpacity key={i} onPress={() => toggle(i)} style={s.aiItem}>
                <View style={[s.checkbox, checked[i] && s.checkboxOn]}>
                  {checked[i] && <CheckIcon size={12} color={BRIM.paper} />}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.aiItemName} numberOfLines={1}>{food.name}</Text>
                    <ConfidenceBadge level={food.confidence} />
                  </View>
                  <Text style={s.aiItemSub}>
                    {food.estimated_grams}g · {(food.per_100g.kcal ?? 0).toFixed(0)} kcal · P {(food.per_100g.protein_g ?? 0).toFixed(1)}g
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={s.sheetBtns}>
            <TouchableOpacity style={s.cancelBtn} onPress={onDismiss}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.confirmBtn, selected.length === 0 && s.confirmBtnOff]}
              onPress={() => onConfirm(selected)}
              disabled={loading || selected.length === 0}
            >
              <Text style={[s.confirmText, selected.length === 0 && s.confirmTextOff]}>
                {loading ? 'Adding...' : `Add ${selected.length}`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ConfidenceBadge({ level }: { level: AnalyzedFood['confidence'] }) {
  const dots = level === 'high' ? 3 : level === 'medium' ? 2 : 1;
  const label = level === 'high' ? 'High' : level === 'medium' ? 'Medium' : 'Low';
  const isLow = level === 'low';
  return (
    <View style={[s.badge, isLow && s.badgeLow]}>
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[
            s.badgeDot,
            { backgroundColor: i < dots ? (isLow ? BRIM.danger : BRIM.ink) : BRIM.hair },
          ]} />
        ))}
      </View>
      <Text style={[s.badgeText, isLow && s.badgeTextLow]}>{label}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRIM.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BRIM.paper },
  loadingText: { fontFamily: F.med, fontSize: 14, color: BRIM.mute },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, gap: 8,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontFamily: F.bold, fontSize: 22, color: BRIM.ink, letterSpacing: -0.6 },

  scroll: { paddingHorizontal: 20, paddingBottom: 120 },

  totalsGrid: { flexDirection: 'row', gap: 6, paddingTop: 8, paddingBottom: 16 },
  totalCell: {
    flex: 1, padding: 10, backgroundColor: BRIM.card, borderRadius: 12,
    borderWidth: 1, borderColor: BRIM.hair, gap: 2,
  },
  totalLabel: { fontFamily: F.semi, fontSize: 9, color: BRIM.mute, letterSpacing: 1, textTransform: 'uppercase' },
  totalValue: { fontFamily: F.bold, fontSize: 17, color: BRIM.ink, letterSpacing: -0.5 },
  totalUnit: { fontSize: 9, color: BRIM.mute, fontFamily: F.med },

  aiGrid: { flexDirection: 'row', gap: 8, paddingBottom: 16 },
  aiCard: {
    flex: 1, flexDirection: 'column', alignItems: 'flex-start', gap: 8,
    padding: 16, backgroundColor: BRIM.card, borderRadius: 16,
    borderWidth: 1, borderColor: BRIM.hair,
  },
  aiCardDisabled: { opacity: 0.5 },
  aiCardTitle: { fontFamily: F.bold, fontSize: 13, color: BRIM.ink },
  aiCardSub: { fontFamily: F.med, fontSize: 11, color: BRIM.mute, marginTop: 2 },

  analyzingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, backgroundColor: BRIM.card, borderRadius: 14,
    borderWidth: 1, borderColor: BRIM.hair, marginBottom: 16,
  },
  analyzingText: { fontFamily: F.med, fontSize: 13, color: BRIM.ink },
  spinner: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 2, borderColor: BRIM.hair, borderTopColor: BRIM.ink,
  },

  entriesHeader: { marginBottom: 8 },
  entriesLabel: { fontFamily: F.semi, fontSize: 11, color: BRIM.mute, letterSpacing: 1, textTransform: 'uppercase' },
  entriesList: { gap: 8 },
  emptyBox: {
    padding: 36, alignItems: 'center',
    backgroundColor: BRIM.card, borderRadius: 16,
    borderWidth: 1, borderColor: BRIM.hair, borderStyle: 'dashed',
  },
  emptyTitle: { fontFamily: F.semi, fontSize: 14, color: BRIM.ink, marginBottom: 4 },
  emptySub: { fontFamily: F.med, fontSize: 12, color: BRIM.mute, textAlign: 'center' },

  entryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, backgroundColor: BRIM.card, borderRadius: 14,
    borderWidth: 1, borderColor: BRIM.hair,
  },
  entryName: { fontFamily: F.semi, fontSize: 13, color: BRIM.ink, letterSpacing: -0.1 },
  entryBrand: { fontFamily: F.med, fontSize: 11, color: BRIM.mute, marginTop: 1 },
  entryChips: { flexDirection: 'row', gap: 4, marginTop: 6 },
  chip: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  chipStrong: { backgroundColor: 'rgba(11,11,14,0.06)' },
  chipText: { fontFamily: F.num, fontSize: 10, color: BRIM.mute },
  chipTextStrong: { fontFamily: F.numSemi, fontSize: 10, color: BRIM.ink },
  removeBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  removeText: { fontFamily: F.semi, fontSize: 12, color: BRIM.mute },

  footer: {
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: BRIM.hair2,
    backgroundColor: BRIM.paper,
  },
  searchBtn: {
    backgroundColor: BRIM.ink, borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  searchBtnText: { fontFamily: F.bold, fontSize: 15, color: BRIM.paper, letterSpacing: -0.1 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,11,14,0.35)' },
  sheet: {
    backgroundColor: BRIM.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 8,
  },
  dragHandle: { width: 36, height: 4, backgroundColor: BRIM.hair, borderRadius: 99, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontFamily: F.bold, fontSize: 18, color: BRIM.ink, letterSpacing: -0.4 },
  sheetSub: { fontFamily: F.med, fontSize: 12, color: BRIM.mute, marginTop: 2, marginBottom: 16 },
  sheetBtns: { flexDirection: 'row', gap: 8, marginTop: 20 },
  cancelBtn: {
    flex: 1, padding: 16, borderRadius: 14,
    borderWidth: 1, borderColor: BRIM.hair, alignItems: 'center',
  },
  cancelText: { fontFamily: F.semi, fontSize: 14, color: BRIM.ink },
  confirmBtn: { flex: 2, padding: 16, borderRadius: 14, backgroundColor: BRIM.ink, alignItems: 'center' },
  confirmBtnOff: { backgroundColor: BRIM.hair },
  confirmText: { fontFamily: F.bold, fontSize: 14, color: BRIM.paper },
  confirmTextOff: { color: BRIM.mute },

  aiItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BRIM.hair2,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 7,
    borderWidth: 1.5, borderColor: BRIM.hair,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: BRIM.ink, borderColor: BRIM.ink },
  aiItemName: { fontFamily: F.semi, fontSize: 14, color: BRIM.ink, flex: 1 },
  aiItemSub: { fontFamily: F.num, fontSize: 11, color: BRIM.mute, marginTop: 2 },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99,
    backgroundColor: BRIM.hair2,
  },
  badgeLow: { backgroundColor: 'rgba(180,58,46,0.08)' },
  badgeDot: { width: 3, height: 3, borderRadius: 99 },
  badgeText: { fontFamily: F.semi, fontSize: 9, color: BRIM.mute, letterSpacing: 0.4, textTransform: 'uppercase' },
  badgeTextLow: { color: BRIM.danger },
});
