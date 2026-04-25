import Constants from 'expo-constants';
import { DailyLog, FoodItem, MealEntry, MealSlot } from './types';

// Configured in app.json extra.apiBase
// iOS Simulator: localhost, Android Emulator: 10.0.2.2, Real device: Mac LAN IP
const BASE: string = Constants.expoConfig?.extra?.apiBase ?? 'http://localhost:4000';

// ── Food search ───────────────────────────────────────────────────────────────

export interface SearchResponse {
  q: string;
  count: number;
  results: FoodItem[];
}

export async function searchFoods(q: string, limit = 20, offset = 0): Promise<SearchResponse> {
  const url = `${BASE}/foods/search?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

// ── Meal log ──────────────────────────────────────────────────────────────────

export async function fetchLog(date: string): Promise<DailyLog> {
  const res = await fetch(`${BASE}/meals/${date}`);
  if (!res.ok) throw new Error(`fetchLog failed: ${res.status}`);
  return res.json();
}

export async function postEntry(date: string, slot: MealSlot, entry: MealEntry): Promise<DailyLog> {
  const res = await fetch(`${BASE}/meals/${date}/${slot}/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(`postEntry failed: ${res.status}`);
  return res.json();
}

export async function deleteEntry(date: string, slot: MealSlot, index: number): Promise<DailyLog> {
  const res = await fetch(`${BASE}/meals/${date}/${slot}/entries/${index}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteEntry failed: ${res.status}`);
  return res.json();
}

export async function putGoals(date: string, goals: DailyLog['goals']): Promise<void> {
  const res = await fetch(`${BASE}/meals/${date}/goals`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(goals),
  });
  if (!res.ok) throw new Error(`putGoals failed: ${res.status}`);
}

// ── Claude Vision ─────────────────────────────────────────────────────────────

export interface AnalyzedFood {
  name: string;
  name_ko: string;
  estimated_grams: number;
  per_100g: {
    kcal: number;
    protein_g: number;
    fat_g: number;
    carbs_g: number;
  };
  confidence: 'high' | 'medium' | 'low';
}

export async function analyzePhoto(base64: string, mimeType = 'image/jpeg'): Promise<AnalyzedFood[]> {
  const res = await fetch(`${BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64, mimeType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || `analyze failed: ${res.status}`);
  }
  const data = await res.json();
  return data.results;
}
