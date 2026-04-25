import { getDb } from './db.js';

const COL = 'meal_logs';

const DEFAULT_GOALS = { calories: 2000, protein: 150, carbs: 200, fat: 65 };

async function col() {
  const db = await getDb();
  return db.collection(COL);
}

export async function ensureIndexes() {
  const c = await col();
  await c.createIndex({ date: 1 }, { unique: true });
}

export async function getLog(date) {
  const c = await col();
  const doc = await c.findOne({ date });
  if (doc) return doc;
  return { date, meals: { breakfast: [], lunch: [], dinner: [] }, goals: DEFAULT_GOALS };
}

export async function addEntry(date, slot, entry) {
  const c = await col();
  // First ensure doc exists with all three slots initialized
  await c.updateOne(
    { date },
    { $setOnInsert: { goals: DEFAULT_GOALS, meals: { breakfast: [], lunch: [], dinner: [] } } },
    { upsert: true },
  );
  // Then push the entry (separate op to avoid path conflict with $setOnInsert.meals)
  await c.updateOne({ date }, { $push: { [`meals.${slot}`]: entry } });
  return getLog(date);
}

export async function removeEntry(date, slot, index) {
  // MongoDB has no direct remove-by-index; use a two-step approach
  const log = await getLog(date);
  const entries = (log.meals?.[slot] ?? []).filter((_, i) => i !== index);
  const c = await col();
  await c.updateOne(
    { date },
    { $set: { [`meals.${slot}`]: entries } },
    { upsert: true },
  );
  return getLog(date);
}

export async function updateGoals(date, goals) {
  const c = await col();
  await c.updateOne(
    { date },
    { $set: { goals }, $setOnInsert: { meals: { breakfast: [], lunch: [], dinner: [] } } },
    { upsert: true },
  );
}
