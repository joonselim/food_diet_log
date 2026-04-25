import { getDb, closeDb } from "../../src/db.js";

async function main() {
  const db = await getDb();
  const col = db.collection("foods");

  console.log("creating text index (name x10, brand x5)...");
  await col.createIndex(
    { name: "text", brand: "text" },
    { weights: { name: 10, brand: 5 }, name: "foods_text", default_language: "english" }
  );

  console.log("creating unique index on (source, source_id)...");
  await col.createIndex(
    { source: 1, source_id: 1 },
    { unique: true, name: "foods_source_id" }
  );

  console.log("creating sparse index on upc...");
  await col.createIndex({ upc: 1 }, { sparse: true, name: "foods_upc" });

  console.log("done.");
  console.log(await col.indexes());
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
