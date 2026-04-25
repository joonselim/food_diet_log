// Removes duplicate foods that share the same normalized_upc.
// Keeps the doc with the most complete per_100g nutrient data.
// Run normalize-upc.js first.

import { getDb, closeDb } from "../../src/db.js";

function nutrientScore(doc) {
  // Count non-null values in per_100g
  if (!doc.per_100g) return 0;
  return Object.values(doc.per_100g).filter((v) => v != null).length;
}

async function main() {
  const db = await getDb();
  const col = db.collection("foods");

  console.log("finding duplicate UPCs...");
  const dupeGroups = await col.aggregate([
    { $match: { normalized_upc: { $exists: true } } },
    { $group: { _id: "$normalized_upc", count: { $sum: 1 }, ids: { $push: "$_id" } } },
    { $match: { count: { $gt: 1 } } },
  ], { allowDiskUse: true }).toArray();

  console.log(`found ${dupeGroups.length.toLocaleString()} UPCs with duplicates`);
  if (dupeGroups.length === 0) { console.log("nothing to do."); await closeDb(); return; }

  let totalDeleted = 0;

  for (let i = 0; i < dupeGroups.length; i++) {
    const group = dupeGroups[i];
    const docs = await col.find({ _id: { $in: group.ids } }, { projection: { per_100g: 1, source_id: 1 } }).toArray();

    // Sort by nutrient completeness desc, then by source_id asc (lower = older = more vetted)
    docs.sort((a, b) => {
      const scoreDiff = nutrientScore(b) - nutrientScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return Number(a.source_id) - Number(b.source_id);
    });

    // Keep the first, delete the rest
    const toDelete = docs.slice(1).map((d) => d._id);
    await col.deleteMany({ _id: { $in: toDelete } });
    totalDeleted += toDelete.length;

    if ((i + 1) % 500 === 0) {
      process.stdout.write(`\r  processed ${(i + 1).toLocaleString()} / ${dupeGroups.length.toLocaleString()} groups`);
    }
  }

  console.log(`\n✔ deleted ${totalDeleted.toLocaleString()} duplicate docs`);
  console.log(`  remaining: ${(await col.countDocuments()).toLocaleString()}`);

  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
