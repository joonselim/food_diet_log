/**
 * Import USDA SR Legacy Foods JSON into MongoDB foods collection.
 * Usage: node scripts/import/sr_legacy.js [path-to-json]
 */

import fs from "node:fs";
import path from "node:path";
import { getDb, closeDb } from "../../src/db.js";

const JSON_PATH =
  process.argv[2] ||
  path.resolve(process.cwd(), "../food_data/FoodData_Central_sr_legacy_food_json_2018-04.json");

const NUTRIENT_IDS = {
  kcal:    1008,
  protein: 1003,
  fat:     1004,
  carbs:   1005,
  fiber:   1079,
  sugar:   2000,
};

function extractNutrients(foodNutrients) {
  const per100 = {};
  for (const fn of foodNutrients) {
    const nid = fn.nutrient?.id;
    const amount = fn.amount ?? fn.median ?? null;
    if (amount === null) continue;
    for (const [key, id] of Object.entries(NUTRIENT_IDS)) {
      if (nid === id && !(key in per100)) {
        per100[key] = Math.round(amount * 100) / 100;
      }
    }
  }
  return per100;
}

function extractServing(foodPortions) {
  if (!foodPortions || foodPortions.length === 0) return null;
  const preferred =
    foodPortions.find(
      (p) => p.measureUnit?.name && !["undetermined", "RACC"].includes(p.measureUnit.name) && p.gramWeight
    ) || foodPortions.find((p) => p.gramWeight);
  if (!preferred) return null;
  const unitName = preferred.measureUnit?.name;
  const isUsable = unitName && !["undetermined", "RACC"].includes(unitName);
  const desc = isUsable
    ? `${preferred.amount ?? 1} ${unitName}`
    : preferred.modifier || "serving";
  return { desc, g: Math.round(preferred.gramWeight * 10) / 10 };
}

async function main() {
  if (!fs.existsSync(JSON_PATH)) {
    console.error("File not found:", JSON_PATH);
    process.exit(1);
  }

  console.log("Reading", JSON_PATH);
  const raw = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  const foods = raw.SRLegacyFoods ?? raw;

  if (!Array.isArray(foods)) {
    console.error("Unexpected JSON structure — expected array at SRLegacyFoods");
    process.exit(1);
  }

  console.log(`Found ${foods.length} SR Legacy foods`);

  const db = await getDb();
  const col = db.collection("foods");

  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  const BATCH = 200;

  for (let i = 0; i < foods.length; i += BATCH) {
    const batch = foods.slice(i, i + BATCH);
    const ops = [];

    for (const food of batch) {
      try {
        const per_100g = extractNutrients(food.foodNutrients ?? []);
        if (!per_100g.kcal && !per_100g.protein) { skipped++; continue; }

        ops.push({
          updateOne: {
            filter: { source: "usda_sr", source_id: String(food.fdcId) },
            update: { $set: {
              source: "usda_sr",
              source_id: String(food.fdcId),
              name: food.description,
              brand: null,
              category: food.foodCategory?.description ?? null,
              upc: null,
              serving: extractServing(food.foodPortions),
              per_100g,
            }},
            upsert: true,
          },
        });
        inserted++;
      } catch (e) {
        console.error("Error on fdcId", food.fdcId, e.message);
        errors++;
      }
    }

    if (ops.length > 0) await col.bulkWrite(ops, { ordered: false });
    process.stdout.write(`\r  ${i + batch.length}/${foods.length}`);
  }

  console.log(`\nDone — inserted/updated: ${inserted}, skipped: ${skipped}, errors: ${errors}`);
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
