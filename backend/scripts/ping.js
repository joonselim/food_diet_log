// Quick connectivity + capacity check against whatever MONGO_URI points at.
import { MongoClient } from "mongodb";

const uri = process.env.MONGO_URI;
if (!uri) { console.error("MONGO_URI missing"); process.exit(1); }

// Mask password in logged URI
const masked = uri.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
console.log("connecting:", masked);

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  const admin = client.db().admin();
  const ping = await admin.ping();
  console.log("ping:", ping);

  const dbList = await admin.listDatabases();
  console.log("databases:");
  for (const db of dbList.databases) {
    console.log(`  ${db.name}: ${(db.sizeOnDisk / 1024 / 1024).toFixed(1)} MB`);
  }

  // Detect target db from URI path
  const dbNameMatch = uri.match(/\/([^/?]+)\?|\/([^/?]+)$/);
  const targetDb = dbNameMatch ? (dbNameMatch[1] || dbNameMatch[2]) : "(none)";
  console.log("target db (from URI path):", targetDb);

  if (targetDb && targetDb !== "(none)") {
    const db = client.db(targetDb);
    const collections = await db.listCollections().toArray();
    console.log(`${targetDb} collections:`, collections.map(c => c.name));
    if (collections.find(c => c.name === "foods")) {
      const n = await db.collection("foods").estimatedDocumentCount();
      console.log("foods count:", n.toLocaleString());
    }
  }
} catch (e) {
  console.error("ERROR:", e.message);
  process.exit(2);
} finally {
  await client.close();
}
