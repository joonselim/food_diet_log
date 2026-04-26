// add-popularity.js — Add `popularity` score (0–100) to documents with known brands.
// Documents without a matching brand get popularity: 0 (default, not stored).
// Run: node --env-file=.env scripts/import/add-popularity.js

import { getDb, closeDb } from "../../src/db.js";

// Brand name (lowercase) → popularity score 0–100
const BRAND_SCORES = {
  // Fast food — global
  "mcdonald's": 100, "mcdonalds": 100,
  "burger king": 96,
  "kfc": 94,
  "wendy's": 92, "wendys": 92,
  "subway": 91,
  "taco bell": 89,
  "pizza hut": 87,
  "domino's": 87, "dominos": 87,
  "starbucks": 86,
  "chick-fil-a": 85, "chick fil a": 85,
  "popeyes": 82,
  "sonic": 80,
  "dairy queen": 79,
  "jack in the box": 78,
  "carl's jr": 77, "carls jr": 77,
  "hardee's": 76,
  "five guys": 80,
  "shake shack": 78,
  "in-n-out": 82, "in n out": 82,
  "chipotle": 83,
  "panda express": 78,
  "panera": 77, "panera bread": 77,
  "dunkin": 79, "dunkin donuts": 79, "dunkin'": 79,
  "tim hortons": 75,
  // Grocery / CPG brands
  "kraft": 70,
  "heinz": 70,
  "campbell's": 68, "campbells": 68,
  "general mills": 67,
  "kellogg's": 67, "kelloggs": 67,
  "nestle": 66, "nestlé": 66,
  "quaker": 72,
  "nabisco": 65,
  "frito-lay": 68, "frito lay": 68,
  "lay's": 67, "lays": 67,
  "doritos": 66,
  "pepsi": 69,
  "coca-cola": 70, "coca cola": 70,
  "tyson": 68,
  "oscar mayer": 65,
  "jimmy dean": 63,
  "hormel": 62,
  "dole": 64,
  "del monte": 60,
  "birds eye": 60,
  "annie's": 58, "annies": 58,
  "amy's": 58, "amys": 58,
};

const db = await getDb();
const col = db.collection("foods");

// Reset all popularity fields first
await col.updateMany({ popularity: { $exists: true } }, { $unset: { popularity: "" } });

let updated = 0;
for (const [brand, score] of Object.entries(BRAND_SCORES)) {
  // Case-insensitive regex match on the brand field
  const result = await col.updateMany(
    { brand: { $regex: brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
    { $set: { popularity: score } },
  );
  if (result.modifiedCount > 0) {
    console.log(`  "${brand}" → score ${score} (${result.modifiedCount} docs)`);
    updated += result.modifiedCount;
  }
}

console.log(`\nDone. Updated ${updated} documents with popularity scores.`);
await closeDb();
