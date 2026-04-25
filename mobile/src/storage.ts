import AsyncStorage from '@react-native-async-storage/async-storage';
import { DailyLog, MealEntry, MealSlot } from './types';
import * as api from './api';

const DEFAULT_GOALS = { calories: 2000, protein: 150, carbs: 200, fat: 65 };
const cacheKey = (date: string) => `daily_log:${date}`;

function emptyLog(date: string): DailyLog {
  return { date, meals: { breakfast: [], lunch: [], dinner: [] }, goals: DEFAULT_GOALS };
}

async function readCache(date: string): Promise<DailyLog | null> {
  const raw = await AsyncStorage.getItem(cacheKey(date));
  return raw ? JSON.parse(raw) : null;
}

async function writeCache(log: DailyLog): Promise<void> {
  await AsyncStorage.setItem(cacheKey(log.date), JSON.stringify(log));
}

function normalize(log: DailyLog): DailyLog {
  return {
    ...log,
    meals: {
      breakfast: log.meals?.breakfast ?? [],
      lunch: log.meals?.lunch ?? [],
      dinner: log.meals?.dinner ?? [],
    },
  };
}

export async function getLog(date: string): Promise<DailyLog> {
  try {
    const log = normalize(await api.fetchLog(date));
    await writeCache(log);
    return log;
  } catch {
    // Fallback to local cache when backend is unreachable
    const cached = await readCache(date);
    return cached ? normalize(cached) : emptyLog(date);
  }
}

export async function addEntry(date: string, slot: MealSlot, entry: MealEntry): Promise<DailyLog> {
  try {
    const log = await api.postEntry(date, slot, entry);
    await writeCache(log);
    return log;
  } catch {
    // Offline fallback
    const log = (await readCache(date)) ?? emptyLog(date);
    log.meals[slot] = [...log.meals[slot], entry];
    await writeCache(log);
    return log;
  }
}

export async function removeEntry(date: string, slot: MealSlot, index: number): Promise<DailyLog> {
  try {
    const log = await api.deleteEntry(date, slot, index);
    await writeCache(log);
    return log;
  } catch {
    const log = (await readCache(date)) ?? emptyLog(date);
    log.meals[slot] = log.meals[slot].filter((_, i) => i !== index);
    await writeCache(log);
    return log;
  }
}

export async function updateGoals(date: string, goals: DailyLog['goals']): Promise<void> {
  const log = (await readCache(date)) ?? emptyLog(date);
  log.goals = goals;
  await writeCache(log);
  await api.putGoals(date, goals).catch(() => null);
}

export function totals(entries: MealEntry[]) {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}
