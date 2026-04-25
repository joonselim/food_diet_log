import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";
import { getDb, closeDb } from "../../src/db.js";

const DATA_DIR = process.env.USDA_DATA_DIR
  || path.resolve(process.cwd(), "../food_data");
const BATCH = 2000;

// nutrient_id chains: pick first present in order
const NUTRIENT_CHAINS = {
  kcal:      ["1008", "2047", "2048"],   // Energy / Atwater General / Atwater Specific
  protein_g: ["1003"],
  fat_g:     ["1004"],
  carbs_g:   ["1005", "1050"],            // by difference / by summation
  fiber_g:   ["1079"],
  sugar_g:   ["1063", "2000"],
};
const TARGET_NUTRIENT_IDS = new Set(
  Object.values(NUTRIENT_CHAINS).flat()
);

function streamCsv(file) {
  return fs.createReadStream(path.join(DATA_DIR, file))
    .pipe(parse({ columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true }));
}

function progress(label, n) {
  if (n % 500_000 === 0) console.log(`  ${label}: ${n.toLocaleString()}`);
}

// Load measure_unit lookup (small)
async function loadMeasureUnits() {
  const map = new Map();
  for await (const r of streamCsv("measure_unit.csv")) {
    map.set(r.id, r.name);
  }
  return map;
}

// Pass 1: nutrients per fdc_id, only target nutrient IDs.
// Use a fixed-shape entry so V8 shares one hidden class for all entries (big memory win).
// Number keys (fdc_id) instead of strings — also cheaper.
function makeEntry() {
  return { n1003: null, n1004: null, n1005: null, n1008: null, n1050: null,
           n1063: null, n1079: null, n2000: null, n2047: null, n2048: null };
}

async function loadNutrients() {
  console.log("[1/4] Streaming food_nutrient.csv (~27M rows, slowest pass)...");
  const map = new Map(); // Number(fdc_id) -> fixed-shape entry
  let n = 0;
  for await (const r of streamCsv("food_nutrient.csv")) {
    n++;
    progress("food_nutrient", n);
    const nid = r.nutrient_id;
    if (!TARGET_NUTRIENT_IDS.has(nid)) continue;
    const amt = parseFloat(r.amount);
    if (!Number.isFinite(amt)) continue;
    const fdc = Number(r.fdc_id);
    let entry = map.get(fdc);
    if (!entry) { entry = makeEntry(); map.set(fdc, entry); }
    entry["n" + nid] = amt;
  }
  console.log(`  ✔ nutrients indexed for ${map.size.toLocaleString()} foods`);
  return map;
}

function pickNutrients(entry) {
  const out = {};
  for (const [field, chain] of Object.entries(NUTRIENT_CHAINS)) {
    let v = null;
    for (const nid of chain) {
      const slot = entry["n" + nid];
      if (slot != null) { v = slot; break; }
    }
    out[field] = v;
  }
  return out;
}

// Pass 2: branded metadata per fdc_id
async function loadBranded() {
  console.log("[2/4] Streaming branded_food.csv (~2M rows)...");
  const map = new Map();
  let n = 0;
  for await (const r of streamCsv("branded_food.csv")) {
    n++;
    progress("branded_food", n);
    const size = parseFloat(r.serving_size);
    map.set(Number(r.fdc_id), {
      brand: r.brand_owner || r.brand_name || null,
      upc: r.gtin_upc || null,
      branded_category: r.branded_food_category || null,
      serving: Number.isFinite(size) ? {
        size,
        unit: r.serving_size_unit || null,
        text: r.household_serving_fulltext || null,
      } : null,
    });
  }
  console.log(`  ✔ branded metadata for ${map.size.toLocaleString()} foods`);
  return map;
}

// Pass 3: portions for non-branded foods (gives us a default serving)
async function loadPortions(unitMap) {
  console.log("[3/4] Streaming food_portion.csv...");
  const map = new Map(); // fdc_id -> first portion
  for await (const r of streamCsv("food_portion.csv")) {
    const fdc = Number(r.fdc_id);
    if (map.has(fdc)) continue;
    const grams = parseFloat(r.gram_weight);
    const amount = parseFloat(r.amount);
    if (!Number.isFinite(grams)) continue;
    const unit = unitMap.get(r.measure_unit_id) || r.modifier || null;
    const text = [Number.isFinite(amount) ? amount : null, unit, r.portion_description]
      .filter(Boolean).join(" ").trim() || null;
    map.set(fdc, {
      size: grams,
      unit: "g",
      text,
    });
  }
  console.log(`  ✔ portions for ${map.size.toLocaleString()} foods`);
  return map;
}

// Pass 4: stream food.csv and emit final docs
async function importFoods({ nutrients, branded, portions }) {
  console.log("[4/4] Streaming food.csv and inserting docs...");
  const db = await getDb();
  const col = db.collection("foods");

  console.log("  dropping existing usda docs...");
  await col.deleteMany({ source: "usda" });

  let batch = [];
  let inserted = 0;
  let skipped = 0;

  const flush = async () => {
    if (!batch.length) return;
    await col.insertMany(batch, { ordered: false });
    inserted += batch.length;
    batch = [];
    if (inserted % 50_000 === 0) console.log(`  inserted: ${inserted.toLocaleString()}`);
  };

  for await (const r of streamCsv("food.csv")) {
    const fdc = Number(r.fdc_id);
    const nut = nutrients.get(fdc);
    if (!nut) { skipped++; continue; }
    const per100 = pickNutrients(nut);
    if (per100.kcal == null) { skipped++; continue; } // no energy → useless

    const b = branded.get(fdc);
    const doc = {
      source: "usda",
      source_id: r.fdc_id,
      name: r.description,
      brand: b?.brand || null,
      category: b?.branded_category || r.food_category_id || null,
      data_type: r.data_type || null,
      upc: b?.upc || null,
      serving: b?.serving || portions.get(fdc) || null,
      per_100g: per100,
    };
    batch.push(doc);
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  console.log(`✔ inserted ${inserted.toLocaleString()} foods, skipped ${skipped.toLocaleString()} (no kcal)`);
}

async function main() {
  const t0 = Date.now();
  const unitMap = await loadMeasureUnits();
  const nutrients = await loadNutrients();
  const branded = await loadBranded();
  const portions = await loadPortions(unitMap);
  await importFoods({ nutrients, branded, portions });
  console.log(`done in ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min`);
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
