// Adds normalized_upc (digits only) to all docs that have a upc field.
// Safe to re-run (skips docs that already have normalized_upc).

import { getDb, closeDb } from "../../src/db.js";
import { normalizeUpc } from "../../src/clean.js";

const BATCH = 2000;

function progress(label, n, total) {
  process.stdout.write(`\r  ${label}: ${n.toLocaleString()} / ${total.toLocaleString()}`);
}

async function main() {
  const db = await getDb();
  const col = db.collection("foods");

  const total = await col.countDocuments({ upc: { $exists: true, $ne: null }, normalized_upc: { $exists: false } });
  console.log(`docs needing normalization: ${total.toLocaleString()}`);
  if (total === 0) { console.log("nothing to do."); await closeDb(); return; }

  const cursor = col.find(
    { upc: { $exists: true, $ne: null }, normalized_upc: { $exists: false } },
    { projection: { _id: 1, upc: 1 } },
  );

  let ops = [];
  let done = 0;

  for await (const doc of cursor) {
    const normalized = normalizeUpc(doc.upc);
    if (!normalized) continue;
    ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { normalized_upc: normalized } } } });
    if (ops.length >= BATCH) {
      await col.bulkWrite(ops, { ordered: false });
      done += ops.length;
      ops = [];
      progress("normalized", done, total);
    }
  }
  if (ops.length) {
    await col.bulkWrite(ops, { ordered: false });
    done += ops.length;
  }
  console.log(`\n✔ normalized ${done.toLocaleString()} UPCs`);

  // Add sparse index on normalized_upc
  console.log("creating sparse index on normalized_upc...");
  await col.createIndex({ normalized_upc: 1 }, { sparse: true, name: "foods_normalized_upc" });
  console.log("✔ index created");

  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
