/**
 * Import USDA Foundation Foods JSON into MongoDB foods collection.
 * Usage: node scripts/import/foundation.js [path-to-json]
 * Default path: ../food_data/FoodData_Central_foundation_food_json_*.json
 */

import fs from "node:fs";
import path from "node:path";
import { getDb, closeDb } from "../../src/db.js";

const JSON_PATH =
  process.argv[2] ||
  path.resolve(process.cwd(), "../food_data/FoodData_Central_foundation_food_json_2025-12-18 2.json");

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
  // Prefer named portions over RACC
  const preferred = foodPortions.find(
    (p) => p.measureUnit?.name && p.measureUnit.name !== "RACC" && p.gramWeight
  ) || foodPortions.find((p) => p.gramWeight);
  if (!preferred) return null;
  const desc = preferred.measureUnit?.name
    ? `${preferred.amount ?? 1} ${preferred.measureUnit.name}`
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
  const foods = raw.FoundationFoods ?? raw;

  if (!Array.isArray(foods)) {
    console.error("Unexpected JSON structure — expected array at FoundationFoods");
    process.exit(1);
  }

  console.log(`Found ${foods.length} foundation foods`);

  const db = await getDb();
  const col = db.collection("foods");

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const food of foods) {
    try {
      const per_100g = extractNutrients(food.foodNutrients ?? []);
      if (!per_100g.kcal && !per_100g.protein) {
        skipped++;
        continue;
      }

      const doc = {
        source: "usda_foundation",
        source_id: String(food.fdcId),
        name: food.description,
        brand: null,
        category: food.foodCategory?.description ?? null,
        upc: null,
        serving: extractServing(food.foodPortions),
        per_100g,
      };

      await col.updateOne(
        { source: "usda_foundation", source_id: doc.source_id },
        { $set: doc },
        { upsert: true }
      );
      inserted++;
    } catch (e) {
      console.error("Error on fdcId", food.fdcId, e.message);
      errors++;
    }
  }

  console.log(`Done — inserted/updated: ${inserted}, skipped (no nutrients): ${skipped}, errors: ${errors}`);
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
