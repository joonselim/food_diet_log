// Deletes foods with kcal <= 5 per 100g (water, diet sodas, flavor extracts, etc.)
// These have no practical value in a calorie-tracking app.

import { getDb, closeDb } from "../../src/db.js";

const THRESHOLD = 5;

async function main() {
  const db = await getDb();
  const col = db.collection("foods");

  const total = await col.countDocuments();
  const toDelete = await col.countDocuments({ "per_100g.kcal": { $lte: THRESHOLD } });

  console.log(`전체: ${total.toLocaleString()}건`);
  console.log(`삭제 대상 (kcal ≤ ${THRESHOLD}): ${toDelete.toLocaleString()}건 (${(toDelete/total*100).toFixed(1)}%)`);
  console.log("삭제 중...");

  const result = await col.deleteMany({ "per_100g.kcal": { $lte: THRESHOLD } });

  console.log(`✔ ${result.deletedCount.toLocaleString()}건 삭제 완료`);
  console.log(`남은 문서: ${(total - result.deletedCount).toLocaleString()}건`);

  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
