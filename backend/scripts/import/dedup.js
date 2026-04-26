// dedup.js — Remove duplicate food entries, keep the one with median calories.
// Uses JS-side grouping to avoid M0 $group memory limit.
// Run: node --env-file=.env scripts/import/dedup.js

import { getDb, closeDb } from "../../src/db.js";

const db  = await getDb();
const col = db.collection("foods");

// Stream all docs (only _id, name, calories) to avoid memory issues
const cursor = col.find({}, { projection: { _id: 1, name: 1, "per_100g.calories": 1 } });

const byName = new Map(); // lowercase name → [{id, cal}]
let total = 0;
for await (const doc of cursor) {
  const key = (doc.name || "").toLowerCase().trim();
  if (!key) continue;
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push({ id: doc._id, cal: doc.per_100g?.calories ?? 0 });
  total++;
}
console.log(`Scanned ${total} documents, ${byName.size} unique names`);

let totalDeleted = 0;
for (const [name, docs] of byName) {
  if (docs.length <= 1) continue;

  docs.sort((a, b) => a.cal - b.cal);
  const medianIdx = Math.floor((docs.length - 1) / 2);
  const toDelete  = docs.filter((_, i) => i !== medianIdx).map((d) => d.id);

  await col.deleteMany({ _id: { $in: toDelete } });
  totalDeleted += toDelete.length;
  console.log(`  "${name.slice(0, 60)}" — kept 1 of ${docs.length} (cal: ${docs[medianIdx].cal})`);
}

console.log(`\nDone. Deleted ${totalDeleted} duplicates.`);
await closeDb();
