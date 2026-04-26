import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../types';
import { BRIM, F } from '../theme';
import { GlassJar } from '../components/GlassJar';
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
  { key: 'diet',     label: '다이어트',    sub: '칼로리 20% 감량' },
  { key: 'maintain', label: '체중 유지',   sub: '현재 체중 유지' },
  { key: 'gain',     label: '근육 증가',   sub: '칼로리 10% 증량' },
];

export default function OnboardingScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [gender, setGender] = useState<Gender>('male');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [goal, setGoal] = useState<Goal>('maintain');

  const canProceed = age.trim() && height.trim() && weight.trim();

  const handleStart = async () => {
    const profile = {
      gender,
      age: parseInt(age, 10),
      height: parseFloat(height),
      weight: parseFloat(weight),
      goal,
    };
    await AsyncStorage.setItem('user_profile', JSON.stringify(profile));
    // Pre-save calculated goals so HomeScreen shows them immediately
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
          <GlassJar width={72} height={88} progress={0.62} liquidColor={BRIM.liquid} showWaves={false} />
          <Text style={s.title}>Brim 시작하기</Text>
          <Text style={s.subtitle}>체형 정보를 입력하면{'\n'}맞춤 영양 목표를 계산해드려요</Text>
        </View>

        {/* Gender */}
        <Text style={s.sectionLabel}>성별</Text>
        <View style={s.toggleRow}>
          {(['male', 'female'] as Gender[]).map((g) => (
            <Pressable
              key={g}
              style={[s.toggleBtn, gender === g && s.toggleBtnOn]}
              onPress={() => setGender(g)}
            >
              <Text style={[s.toggleText, gender === g && s.toggleTextOn]}>
                {g === 'male' ? '남성' : '여성'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Body stats */}
        <Text style={s.sectionLabel}>기본 정보</Text>
        <View style={s.statsGrid}>
          <View style={s.statCard}>
            <Text style={s.statLabel}>나이</Text>
            <View style={s.statInputRow}>
              <TextInput
                style={s.statInput}
                value={age}
                onChangeText={setAge}
                keyboardType="number-pad"
                placeholder="25"
                placeholderTextColor={BRIM.mute}
                maxLength={3}
              />
              <Text style={s.statUnit}>세</Text>
            </View>
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>키</Text>
            <View style={s.statInputRow}>
              <TextInput
                style={s.statInput}
                value={height}
                onChangeText={setHeight}
                keyboardType="decimal-pad"
                placeholder="170"
                placeholderTextColor={BRIM.mute}
                maxLength={5}
              />
              <Text style={s.statUnit}>cm</Text>
            </View>
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>몸무게</Text>
            <View style={s.statInputRow}>
              <TextInput
                style={s.statInput}
                value={weight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
                placeholder="65"
                placeholderTextColor={BRIM.mute}
                maxLength={5}
              />
              <Text style={s.statUnit}>kg</Text>
            </View>
          </View>
        </View>

        {/* Goal */}
        <Text style={s.sectionLabel}>목표</Text>
        <View style={s.goalList}>
          {GOALS.map((g) => (
            <Pressable
              key={g.key}
              style={[s.goalCard, goal === g.key && s.goalCardOn]}
              onPress={() => setGoal(g.key)}
            >
              <View style={[s.goalDot, goal === g.key && s.goalDotOn]} />
              <View style={{ flex: 1 }}>
                <Text style={[s.goalLabel, goal === g.key && s.goalLabelOn]}>{g.label}</Text>
                <Text style={s.goalSub}>{g.sub}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[s.startBtn, !canProceed && s.startBtnOff]}
          onPress={handleStart}
          disabled={!canProceed}
          activeOpacity={0.8}
        >
          <Text style={[s.startText, !canProceed && s.startTextOff]}>시작하기</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRIM.paper },
  scroll: { paddingHorizontal: 24 },

  hero: { alignItems: 'center', paddingTop: 32, paddingBottom: 36, gap: 14 },
  title: { fontFamily: F.bold, fontSize: 28, color: BRIM.ink, letterSpacing: -0.8 },
  subtitle: { fontFamily: F.med, fontSize: 14, color: BRIM.mute, textAlign: 'center', lineHeight: 20 },

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

  statsGrid: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1, backgroundColor: BRIM.card, borderRadius: 14,
    borderWidth: 1, borderColor: BRIM.hair, padding: 14,
  },
  statLabel: { fontFamily: F.semi, fontSize: 11, color: BRIM.mute, marginBottom: 8 },
  statInputRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  statInput: {
    flex: 1, fontFamily: F.bold, fontSize: 22, color: BRIM.ink,
    padding: 0, letterSpacing: -0.5,
  },
  statUnit: { fontFamily: F.med, fontSize: 12, color: BRIM.mute },

  goalList: { gap: 8 },
  goalCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: BRIM.card, borderRadius: 14,
    borderWidth: 1, borderColor: BRIM.hair, padding: 16,
  },
  goalCardOn: { borderColor: BRIM.ink, backgroundColor: BRIM.card },
  goalDot: {
    width: 18, height: 18, borderRadius: 99,
    borderWidth: 2, borderColor: BRIM.hair,
  },
  goalDotOn: { borderColor: BRIM.ink, backgroundColor: BRIM.ink },
  goalLabel: { fontFamily: F.semi, fontSize: 15, color: BRIM.ink, marginBottom: 2 },
  goalLabelOn: { color: BRIM.ink },
  goalSub: { fontFamily: F.med, fontSize: 12, color: BRIM.mute },

  startBtn: {
    marginTop: 32, paddingVertical: 18, borderRadius: 16,
    backgroundColor: BRIM.ink, alignItems: 'center',
  },
  startBtnOff: { backgroundColor: BRIM.hair },
  startText: { fontFamily: F.bold, fontSize: 16, color: BRIM.paper, letterSpacing: -0.3 },
  startTextOff: { color: BRIM.mute },
});
