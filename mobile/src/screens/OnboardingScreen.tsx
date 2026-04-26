import React, { useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../types';
import { BRIM, F } from '../theme';
import { updateGoals } from '../storage';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Onboarding'> };

function calcGoals(p: { gender: Gender; age: number; height: number; weight: number; goal: Goal }) {
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

type Gender = 'male' | 'female';
type Goal = 'diet' | 'maintain' | 'gain';

const GOALS: { key: Goal; label: string; sub: string }[] = [
  { key: 'diet',     label: 'Lose Weight',   sub: '20% calorie deficit' },
  { key: 'maintain', label: 'Maintain',      sub: 'Stay at current weight' },
  { key: 'gain',     label: 'Build Muscle',  sub: '10% calorie surplus' },
];

// ── WheelPicker ───────────────────────────────────────────────────────────────

const ITEM_H = 44;
const VISIBLE = 3;

const AGE_VALUES    = Array.from({ length: 89  }, (_, i) => i + 12);
const HEIGHT_VALUES = Array.from({ length: 151 }, (_, i) => i + 100);
const WEIGHT_VALUES = Array.from({ length: 156 }, (_, i) => i + 25);

function WheelPicker({ values, selected, onChange }: {
  values: number[];
  selected: number;
  onChange: (v: number) => void;
}) {
  const ref = useRef<ScrollView>(null);
  const idx = Math.max(0, values.indexOf(selected));

  const snap = (y: number) => {
    const i = Math.max(0, Math.min(Math.round(y / ITEM_H), values.length - 1));
    onChange(values[i]);
  };

  return (
    <View style={wp.wrap}>
      <View style={wp.overlay} pointerEvents="none" />
      <ScrollView
        ref={ref}
        contentOffset={{ x: 0, y: idx * ITEM_H }}
        style={wp.scroll}
        contentContainerStyle={wp.content}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={(e) => snap(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => snap(e.nativeEvent.contentOffset.y)}
      >
        {values.map((v) => (
          <View key={v} style={[wp.item, v === selected && wp.itemOn]}>
            <Text style={[wp.text, v === selected && wp.textOn]}>{v}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const wp = StyleSheet.create({
  wrap: { height: ITEM_H * VISIBLE, overflow: 'hidden' },
  overlay: {
    position: 'absolute', left: 0, right: 0,
    top: ITEM_H * 1, height: ITEM_H,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: BRIM.ink,
    zIndex: 10,
  },
  scroll: { height: ITEM_H * VISIBLE },
  content: { paddingVertical: ITEM_H * 1 },
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center', opacity: 0.25 },
  itemOn: { opacity: 1 },
  text: { fontFamily: F.num, fontSize: 18, color: BRIM.mute, letterSpacing: -0.3 },
  textOn: { fontFamily: F.bold, fontSize: 22, color: BRIM.ink, letterSpacing: -0.6 },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function OnboardingScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [gender, setGender] = useState<Gender>('male');
  const [age, setAge] = useState(25);
  const [height, setHeight] = useState(170);
  const [weight, setWeight] = useState(65);
  const [goal, setGoal] = useState<Goal>('maintain');

  const handleStart = async () => {
    const profile = { gender, age, height, weight, goal };
    await AsyncStorage.setItem('user_profile', JSON.stringify(profile));
    const today = new Date();
    const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await updateGoals(d, calcGoals(profile));
    navigation.replace('Home');
  };

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={s.hero}>
          <Image source={require('../../assets/appicon.png')} style={s.appIcon} />
          <Text style={s.title}>Get Started</Text>
        </View>

        {/* Gender */}
        <Text style={s.sectionLabel}>Gender</Text>
        <View style={s.toggleRow}>
          {(['male', 'female'] as Gender[]).map((g) => (
            <Pressable
              key={g}
              style={[s.toggleBtn, gender === g && s.toggleBtnOn]}
              onPress={() => setGender(g)}
            >
              <Text style={[s.toggleText, gender === g && s.toggleTextOn]}>
                {g === 'male' ? 'Male' : 'Female'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Body stats – WheelPicker */}
        <Text style={s.sectionLabel}>Body Info</Text>
        <View style={s.pickersRow}>
          <View style={s.pickerCol}>
            <Text style={s.pickerColLabel}>Age</Text>
            <WheelPicker values={AGE_VALUES} selected={age} onChange={setAge} />
            <Text style={s.pickerColUnit}>yr</Text>
          </View>
          <View style={s.pickerCol}>
            <Text style={s.pickerColLabel}>Height</Text>
            <WheelPicker values={HEIGHT_VALUES} selected={height} onChange={setHeight} />
            <Text style={s.pickerColUnit}>cm</Text>
          </View>
          <View style={s.pickerCol}>
            <Text style={s.pickerColLabel}>Weight</Text>
            <WheelPicker values={WEIGHT_VALUES} selected={weight} onChange={setWeight} />
            <Text style={s.pickerColUnit}>kg</Text>
          </View>
        </View>

        {/* Goal */}
        <Text style={s.sectionLabel}>Goal</Text>
        <View style={s.goalRow}>
          {GOALS.map((g) => (
            <Pressable
              key={g.key}
              style={[s.goalCard, goal === g.key && s.goalCardOn]}
              onPress={() => setGoal(g.key)}
            >
              <Text style={[s.goalLabel, goal === g.key && s.goalLabelOn]}>{g.label}</Text>
              <Text style={s.goalSub}>{g.sub}</Text>
            </Pressable>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={s.startBtn}
          onPress={handleStart}
          activeOpacity={0.8}
        >
          <Text style={s.startText}>Get Started</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRIM.paper },
  scroll: { paddingHorizontal: 24 },

  hero: { alignItems: 'center', paddingTop: 32, paddingBottom: 36, gap: 14 },
  appIcon: { width: 96, height: 96, borderRadius: 22 },
  title: { fontFamily: F.bold, fontSize: 28, color: BRIM.ink, letterSpacing: -0.8 },

  sectionLabel: {
    fontFamily: F.semi, fontSize: 11, color: BRIM.mute,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, marginTop: 24,
  },

  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: BRIM.hair, alignItems: 'center',
    backgroundColor: BRIM.card,
  },
  toggleBtnOn: { backgroundColor: BRIM.ink, borderColor: BRIM.ink },
  toggleText: { fontFamily: F.semi, fontSize: 15, color: BRIM.ink },
  toggleTextOn: { color: BRIM.paper },

  pickersRow: { flexDirection: 'row' },
  pickerCol: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  pickerColLabel: { fontFamily: F.semi, fontSize: 11, color: BRIM.mute, marginBottom: 6, letterSpacing: 0.5 },
  pickerColUnit: { fontFamily: F.med, fontSize: 11, color: BRIM.mute, marginTop: 6 },

  goalRow: { flexDirection: 'row', gap: 8 },
  goalCard: {
    flex: 1, alignItems: 'center',
    backgroundColor: BRIM.card, borderRadius: 14,
    borderWidth: 1, borderColor: BRIM.hair, paddingVertical: 14, paddingHorizontal: 6,
  },
  goalCardOn: { borderColor: BRIM.ink },
  goalLabel: { fontFamily: F.semi, fontSize: 14, color: BRIM.ink, marginBottom: 3, textAlign: 'center' },
  goalLabelOn: { color: BRIM.ink },
  goalSub: { fontFamily: F.med, fontSize: 11, color: BRIM.mute, textAlign: 'center' },

  startBtn: {
    marginTop: 32, paddingVertical: 18, borderRadius: 16,
    backgroundColor: BRIM.ink, alignItems: 'center',
  },
  startText: { fontFamily: F.bold, fontSize: 16, color: BRIM.paper, letterSpacing: -0.3 },
});
