// Restores "NOT A BRANDED ITEM" docs from local Docker to Atlas.
// These are USDA generic/unbranded foods (spaghetti, rice, etc.) — valuable for food diary.

import { MongoClient } from "mongodb";

const LOCAL_URI = "mongodb://localhost:27017";
const ATLAS_URI = process.env.MONGO_URI;
const DB_NAME = process.env.MONGO_DB || "protein_agent";
const BATCH = 500;

function progress(n, total) {
  process.stdout.write(`\r  복원 중: ${n.toLocaleString()} / ${total.toLocaleString()}`);
}

async function main() {
  if (!ATLAS_URI) throw new Error("MONGO_URI not set");

  const localClient = new MongoClient(LOCAL_URI);
  const atlasClient = new MongoClient(ATLAS_URI);

  await localClient.connect();
  await atlasClient.connect();

  const localCol = localClient.db(DB_NAME).collection("foods");
  const atlasCol = atlasClient.db(DB_NAME).collection("foods");

  const total = await localCol.countDocuments({ brand: "NOT A BRANDED ITEM" });
  console.log(`로컬 "NOT A BRANDED ITEM" 문서: ${total.toLocaleString()}건`);

  const cursor = localCol.find(
    { brand: "NOT A BRANDED ITEM" },
    { projection: { _id: 0 } }, // exclude _id so Atlas generates new ones
  );

  let batch = [];
  let done = 0;
  let inserted = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= BATCH) {
      const results = await Promise.allSettled(
        batch.map((d) =>
          atlasCol.updateOne(
            { source: d.source, source_id: d.source_id },
            { $setOnInsert: d },
            { upsert: true },
          )
        )
      );
      for (const r of results) {
        if (r.status === "fulfilled") {
          if (r.value.upsertedCount) inserted++;
          else skipped++;
        }
      }
      done += batch.length;
      batch = [];
      progress(done, total);
    }
  }

  if (batch.length) {
    const results = await Promise.allSettled(
      batch.map((d) =>
        atlasCol.updateOne(
          { source: d.source, source_id: d.source_id },
          { $setOnInsert: d },
          { upsert: true },
        )
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        if (r.value.upsertedCount) inserted++;
        else skipped++;
      }
    }
    done += batch.length;
  }

  console.log(`\n✔ 새로 삽입: ${inserted.toLocaleString()}건 / 이미 있음: ${skipped.toLocaleString()}건`);
  console.log(`  Atlas 총 문서: ${(await atlasCol.countDocuments()).toLocaleString()}건`);

  await localClient.close();
  await atlasClient.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
