// Removes foods from:
// 1. B2B/wholesale companies — never appear on consumer products
// 2. Defunct grocery chains — no longer operate retail stores

import { getDb, closeDb } from "../../src/db.js";

const B2B_BRANDS = [
  "Topco Associates, Inc.",           // B2B private-label consortium
  "Associated Wholesale Grocers, Inc.", // wholesale co-op
  "Glencourt Inc.",                   // private-label distributor
  "Kingston Marketing Co",            // private-label marketer
  "The Moran Group Incorporated",     // food broker/distributor
  "Ross Acquisition Inc.",            // acquisition company
  "Finlay Extracts & Ingredients USA, Inc.", // B2B ingredient supplier
  "United Natural Foods, Inc.",       // wholesale distributor
  "NOT A BRANDED ITEM",              // junk data
];

const DEFUNCT_CHAINS = [
  "Nash Finch Company",              // acquired 2013, brand gone
  "Supervalu, Inc.",                 // Chapter 11 2018, stores sold
  "Dean Foods Company",              // Chapter 11 2019, liquidated
];

async function main() {
  const db = await getDb();
  const col = db.collection("foods");

  const allBrands = [...B2B_BRANDS, ...DEFUNCT_CHAINS];
  const before = await col.countDocuments();

  // Preview
  console.log("=== 삭제 대상 ===");
  let totalTarget = 0;
  for (const brand of allBrands) {
    const n = await col.countDocuments({ brand });
    if (n > 0) {
      console.log(`  ${n.toString().padStart(6)}건  ${brand}`);
      totalTarget += n;
    }
  }
  console.log(`\n  합계: ${totalTarget.toLocaleString()}건 (전체 ${before.toLocaleString()}건의 ${(totalTarget/before*100).toFixed(1)}%)`);

  console.log("\n삭제 중...");
  const result = await col.deleteMany({ brand: { $in: allBrands } });
  console.log(`✔ ${result.deletedCount.toLocaleString()}건 삭제 완료`);
  console.log(`  남은 문서: ${(before - result.deletedCount).toLocaleString()}건`);

  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
