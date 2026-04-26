import React, { useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { FoodItem, MealEntry, RootStackParamList } from '../types';
import { searchFoods } from '../api';
import { addEntry } from '../storage';
import { BRIM, F, fmt, fmtG } from '../theme';
import { SearchIcon, ChevronLeft, CloseIcon } from '../components/Icons';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'FoodSearch'>;
  route: RouteProp<RootStackParamList, 'FoodSearch'>;
};

const GRAM_PRESETS = [50, 100, 150, 200, 300];

export default function FoodSearchScreen({ navigation, route }: Props) {
  const { slot, date } = route.params;
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState(100);
  const [adding, setAdding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentQueryRef = useRef('');
  const LIMIT = 20;

  const search = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); setHasMore(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      currentQueryRef.current = q.trim();
      try {
        const res = await searchFoods(q.trim(), LIMIT, 0);
        setResults(res.results);
        setHasMore(res.count === LIMIT);
      } catch {
        setResults([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    }, 400);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await searchFoods(currentQueryRef.current, LIMIT, results.length);
      setResults((prev) => [...prev, ...res.results]);
      setHasMore(res.count === LIMIT);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  };

  const openGramModal = (item: FoodItem) => {
    const defaultG = item.serving?.size ? Math.round(item.serving.size) : 100;
    setGrams(defaultG);
    setSelected(item);
  };

  const confirmAdd = async () => {
    if (!selected || grams <= 0) {
      Alert.alert('Error', 'Please enter a valid amount.');
      return;
    }
    const ratio = grams / 100;
    const entry: MealEntry = {
      food: selected,
      grams,
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
      Alert.alert('Error', 'Failed to save.');
    } finally {
      setAdding(false);
    }
  };

  const previewKcal = selected ? (selected.per_100g.kcal ?? 0) * grams / 100 : 0;
  const previewP = selected ? (selected.per_100g.protein_g ?? 0) * grams / 100 : 0;

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Custom header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={s.backBtn}>
          <ChevronLeft size={22} color={BRIM.ink} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Food Search</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Search input card */}
      <View style={s.searchWrap}>
        <View style={s.searchCard}>
          <SearchIcon size={16} color={BRIM.mute} />
          <TextInput
            style={s.searchInput}
            placeholder="Search food, brand..."
            placeholderTextColor={BRIM.mute}
            value={query}
            onChangeText={search}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setResults([]); }} hitSlop={8}>
              <CloseIcon size={16} color={BRIM.mute} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.listContent}
        renderItem={({ item }) => (
          <FoodRow item={item} onPress={() => openGramModal(item)} />
        )}
        ListEmptyComponent={
          !loading && query.trim() ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyText}>No results found</Text>
            </View>
          ) : !query.trim() ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyText}>Search for food you ate</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          hasMore ? (
            <TouchableOpacity style={s.loadMoreBtn} onPress={loadMore} disabled={loadingMore}>
              <Text style={s.loadMoreText}>{loadingMore ? 'Loading...' : 'Load more'}</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      {/* Gram input modal */}
      <Modal visible={!!selected} animationType="slide" transparent statusBarTranslucent>
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={s.backdrop} onPress={() => setSelected(null)} />
          {selected && (
            <View style={[s.sheet, { paddingBottom: insets.bottom + 28 }]}>
              <View style={s.dragHandle} />

              {/* Food info */}
              <Text style={s.gramFoodName} numberOfLines={2}>{selected.name}</Text>
              {selected.brand ? <Text style={s.gramFoodBrand}>{selected.brand}</Text> : null}

              {/* Per 100g info */}
              <View style={s.per100Card}>
                <Text style={s.per100Label}>per 100g</Text>
                <Text style={s.per100Values}>
                  {fmt(selected.per_100g.kcal ?? 0)} kcal · Protein {fmtG(selected.per_100g.protein_g ?? 0)}g · Carbs {fmtG(selected.per_100g.carbs_g ?? 0)}g · Fat {fmtG(selected.per_100g.fat_g ?? 0)}g
                </Text>
              </View>

              <Text style={s.amountLabel}>Amount</Text>

              {/* Preset chips */}
              <View style={s.presetRow}>
                {GRAM_PRESETS.map((p) => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setGrams(p)}
                    style={[s.presetChip, grams === p && s.presetChipOn]}
                  >
                    <Text style={[s.presetText, grams === p && s.presetTextOn]}>{p}g</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Large gram input */}
              <View style={s.gramInputWrap}>
                <TextInput
                  style={s.gramInput}
                  value={String(grams)}
                  onChangeText={(v) => setGrams(parseInt(v, 10) || 0)}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
                <Text style={s.gramUnit}>g</Text>
              </View>

              {/* Preview */}
              <View style={s.previewRow}>
                <Text style={s.previewText}>Est. </Text>
                <Text style={s.previewVal}>{fmt(previewKcal)} kcal</Text>
                <Text style={s.previewText}> · Protein </Text>
                <Text style={s.previewVal}>{fmtG(previewP)}g</Text>
              </View>

              <View style={s.sheetBtns}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setSelected(null)}>
                  <Text style={s.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.confirmBtn, (!grams || adding) && s.confirmBtnOff]}
                  onPress={confirmAdd}
                  disabled={adding || !grams}
                >
                  <Text style={[s.confirmText, (!grams || adding) && s.confirmTextOff]}>
                    {adding ? 'Saving...' : 'Add'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ── Food row ──────────────────────────────────────────────────────────────────

function FoodRow({ item, onPress }: { item: FoodItem; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.foodRow} onPress={onPress} activeOpacity={0.7}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.foodName} numberOfLines={2}>{item.name}</Text>
        {item.brand ? <Text style={s.foodBrand} numberOfLines={1}>{item.brand}</Text> : null}
      </View>
      <View style={s.foodRight}>
        <View style={s.kcalRow}>
          <Text style={s.foodKcal}>{fmt(item.per_100g.kcal ?? 0)}</Text>
          <Text style={s.kcalUnit}>kcal/100g</Text>
        </View>
        <Text style={s.foodProtein}>P {fmtG(item.per_100g.protein_g ?? 0)}g</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRIM.paper },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, gap: 8,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontFamily: F.bold, fontSize: 22, color: BRIM.ink, letterSpacing: -0.6 },

  searchWrap: { paddingHorizontal: 20, paddingBottom: 16 },
  searchCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, backgroundColor: BRIM.card, borderRadius: 14,
    borderWidth: 1, borderColor: BRIM.hair,
  },
  searchInput: {
    flex: 1, fontFamily: F.med, fontSize: 14, color: BRIM.ink, padding: 0,
  },

  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  emptyWrap: { paddingTop: 40, alignItems: 'center' },
  emptyText: { fontFamily: F.med, fontSize: 13, color: BRIM.mute },
  loadMoreBtn: {
    marginTop: 8, paddingVertical: 14, alignItems: 'center',
    borderRadius: 12, borderWidth: 1, borderColor: BRIM.hair,
  },
  loadMoreText: { fontFamily: F.semi, fontSize: 13, color: BRIM.ink2 },

  foodRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BRIM.hair2,
  },
  foodName: { fontFamily: F.semi, fontSize: 14, color: BRIM.ink, letterSpacing: -0.1 },
  foodBrand: { fontFamily: F.med, fontSize: 11, color: BRIM.mute, marginTop: 1 },
  foodRight: { alignItems: 'flex-end' },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  foodKcal: { fontFamily: F.bold, fontSize: 18, color: BRIM.ink, letterSpacing: -0.5 },
  kcalUnit: { fontFamily: F.med, fontSize: 10, color: BRIM.mute },
  foodProtein: { fontFamily: F.num, fontSize: 10, color: BRIM.mute, marginTop: 1 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,11,14,0.35)' },
  sheet: {
    backgroundColor: BRIM.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 8,
  },
  dragHandle: { width: 36, height: 4, backgroundColor: BRIM.hair, borderRadius: 99, alignSelf: 'center', marginBottom: 16 },

  gramFoodName: { fontFamily: F.bold, fontSize: 18, color: BRIM.ink, letterSpacing: -0.4, marginBottom: 2 },
  gramFoodBrand: { fontFamily: F.med, fontSize: 12, color: BRIM.mute, marginBottom: 12 },

  per100Card: {
    backgroundColor: BRIM.card, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: BRIM.hair, marginBottom: 16,
  },
  per100Label: { fontFamily: F.semi, fontSize: 10, color: BRIM.mute, letterSpacing: 1, textTransform: 'uppercase' },
  per100Values: { fontFamily: F.num, fontSize: 12, color: BRIM.ink, marginTop: 4 },

  amountLabel: { fontFamily: F.semi, fontSize: 11, color: BRIM.mute, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },

  presetRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  presetChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99,
    borderWidth: 1, borderColor: BRIM.hair,
  },
  presetChipOn: { backgroundColor: BRIM.ink, borderColor: BRIM.ink },
  presetText: { fontFamily: F.semi, fontSize: 12, color: BRIM.ink },
  presetTextOn: { color: BRIM.paper },

  gramInputWrap: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4,
    paddingVertical: 20, backgroundColor: BRIM.card, borderRadius: 14,
    borderWidth: 1, borderColor: BRIM.hair, marginBottom: 12,
  },
  gramInput: {
    width: 120, textAlign: 'right',
    fontFamily: F.bold, fontSize: 36, color: BRIM.ink,
    letterSpacing: -1.5, padding: 0,
  },
  gramUnit: { fontFamily: F.med, fontSize: 14, color: BRIM.mute },

  previewRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', paddingVertical: 8 },
  previewText: { fontFamily: F.med, fontSize: 13, color: BRIM.ink2 },
  previewVal: { fontFamily: F.bold, fontSize: 15, color: BRIM.ink },

  sheetBtns: { flexDirection: 'row', gap: 8, marginTop: 16 },
  cancelBtn: {
    flex: 1, padding: 16, borderRadius: 14,
    borderWidth: 1, borderColor: BRIM.hair, alignItems: 'center',
  },
  cancelText: { fontFamily: F.semi, fontSize: 14, color: BRIM.ink },
  confirmBtn: { flex: 2, padding: 16, borderRadius: 14, backgroundColor: BRIM.ink, alignItems: 'center' },
  confirmBtnOff: { backgroundColor: BRIM.hair },
  confirmText: { fontFamily: F.bold, fontSize: 14, color: BRIM.paper },
  confirmTextOff: { color: BRIM.mute },
});
