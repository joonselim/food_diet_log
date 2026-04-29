import { getDb } from './db.js';

const COL = 'meal_logs';

const DEFAULT_GOALS = { calories: 2000, protein: 150, carbs: 200, fat: 65 };

async function col() {
  const db = await getDb();
  return db.collection(COL);
}

export async function ensureIndexes() {
  const c = await col();
  // Drop legacy single-date unique index if it exists (pre-deviceId schema)
  try { await c.dropIndex('date_1'); } catch { /* not present, ignore */ }
  await c.createIndex({ date: 1, deviceId: 1 }, { unique: true });
}

function emptyLog(date) {
  return { date, meals: { breakfast: [], lunch: [], dinner: [] }, goals: DEFAULT_GOALS };
}

export async function getLog(date, deviceId) {
  const c = await col();
  const doc = await c.findOne({ date, deviceId });
  if (doc) return doc;
  return emptyLog(date);
}

export async function addEntry(date, slot, entry, deviceId) {
  const c = await col();
  // First ensure doc exists with all three slots initialized
  await c.updateOne(
    { date, deviceId },
    { $setOnInsert: { goals: DEFAULT_GOALS, meals: { breakfast: [], lunch: [], dinner: [] } } },
    { upsert: true },
  );
  // Then push the entry (separate op to avoid path conflict with $setOnInsert.meals)
  await c.updateOne({ date, deviceId }, { $push: { [`meals.${slot}`]: entry } });
  return getLog(date, deviceId);
}

export async function removeEntry(date, slot, index, deviceId) {
  // MongoDB has no direct remove-by-index; use a two-step approach
  const log = await getLog(date, deviceId);
  const entries = (log.meals?.[slot] ?? []).filter((_, i) => i !== index);
  const c = await col();
  await c.updateOne(
    { date, deviceId },
    { $set: { [`meals.${slot}`]: entries } },
    { upsert: true },
  );
  return getLog(date, deviceId);
}

export async function updateGoals(date, goals, deviceId) {
  const c = await col();
  await c.updateOne(
    { date, deviceId },
    { $set: { goals }, $setOnInsert: { meals: { breakfast: [], lunch: [], dinner: [] } } },
    { upsert: true },
  );
}
