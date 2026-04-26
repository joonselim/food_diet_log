// popular-brands.js — Fetch popular brand foods from Open Food Facts API
// Fetches ~200 items per brand (2 pages × 100). Total ~3,000 docs — well within M0.
// Run: node --env-file=.env scripts/import/popular-brands.js

import { getDb, closeDb } from "../../src/db.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// OFF brands_tags slugs + display name + popularity score
const BRANDS = [
  { tag: "mcdonalds",    display: "McDonald's",   popularity: 100 },
  { tag: "burger-king",  display: "Burger King",  popularity: 96  },
  { tag: "kfc",          display: "KFC",          popularity: 94  },
  { tag: "wendys",       display: "Wendy's",      popularity: 92  },
  { tag: "subway",       display: "Subway",       popularity: 91  },
  { tag: "taco-bell",    display: "Taco Bell",    popularity: 89  },
  { tag: "pizza-hut",    display: "Pizza Hut",    popularity: 87  },
  { tag: "dominos",      display: "Domino's",     popularity: 87  },
  { tag: "starbucks",    display: "Starbucks",    popularity: 86  },
  { tag: "chick-fil-a",  display: "Chick-fil-A",  popularity: 85  },
  { tag: "chipotle",     display: "Chipotle",     popularity: 83  },
  { tag: "five-guys",    display: "Five Guys",    popularity: 80  },
  { tag: "shake-shack",  display: "Shake Shack",  popularity: 78  },
  { tag: "panera-bread", display: "Panera Bread", popularity: 77  },
  { tag: "quaker",       display: "Quaker",       popularity: 72  },
  { tag: "kelloggs",     display: "Kellogg's",    popularity: 67  },
  { tag: "kraft",        display: "Kraft",        popularity: 70  },
  { tag: "nestle",       display: "Nestlé",       popularity: 66  },
];

// OFF v1 brand endpoint is more stable than v2 search
async function fetchPage(tag, page) {
  const url = `https://world.openfoodfacts.org/brand/${encodeURIComponent(tag)}/${page}.json`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "BrimDietApp/1.0 (diet tracking)" },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

function toDoc(product, display, popularity) {
  const name = (product.product_name || "").trim();
  if (!name) return null;

  const n = product.nutriments || {};
  // OFF stores kcal as energy-kcal_100g; fallback: kJ → kcal
  const kcal =
    n["energy-kcal_100g"] ??
    (n["energy_100g"] ? Math.round(n["energy_100g"] / 4.184) : null);
  if (!kcal || kcal <= 0) return null;

  return {
    name,
    brand: (product.brands || display).split(",")[0].trim(),
    category: (product.categories_tags ?? [])[0]?.replace(/^[a-z]{2}:/, "") ?? null,
    source: "openfoodfacts",
    source_id: product.code || null,
    upc: product.code || null,
    per_100g: {
      calories: Math.round(kcal),
      protein:  Math.round((n.proteins_100g       ?? 0) * 10) / 10,
      carbs:    Math.round((n.carbohydrates_100g   ?? 0) * 10) / 10,
      fat:      Math.round((n.fat_100g             ?? 0) * 10) / 10,
      fiber:    Math.round((n["fiber_100g"]        ?? 0) * 10) / 10,
      sodium:   Math.round((n.sodium_100g          ?? 0) * 1000) / 1000,
    },
    popularity,
  };
}

const db  = await getDb();
const col = db.collection("foods");

let totalUpserted = 0;
let totalSkipped  = 0;

for (const brand of BRANDS) {
  console.log(`\n▶ ${brand.display}`);
  let brandCount = 0;

  for (const page of [1, 2]) {
    try {
      const data     = await fetchPage(brand.tag, page);
      const products = data.products ?? [];
      if (products.length === 0) break;

      for (const product of products) {
        const doc = toDoc(product, brand.display, brand.popularity);
        if (!doc) { totalSkipped++; continue; }

        // Upsert: match by UPC if present, otherwise by name + brand
        const filter = doc.upc
          ? { upc: doc.upc }
          : { name: doc.name, brand: doc.brand };

        await col.updateOne(filter, { $set: doc }, { upsert: true });
        brandCount++;
      }

      console.log(`  page ${page}: +${products.length} fetched`);
      await sleep(400); // polite delay between requests
    } catch (e) {
      console.error(`  page ${page} error: ${e.message}`);
      break;
    }
  }

  console.log(`  → ${brandCount} inserted/updated`);
  totalUpserted += brandCount;
}

console.log(`\n✓ Done. Total upserted: ${totalUpserted}, skipped (no nutrition): ${totalSkipped}`);
await closeDb();
