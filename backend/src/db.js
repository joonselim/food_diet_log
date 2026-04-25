import { MongoClient } from "mongodb";

const uri = process.env.MONGO_URI || "mongodb://localhost:27017";
const dbName = process.env.MONGO_DB || "protein_agent";

let client;

export async function getClient() {
  if (!client) {
    client = new MongoClient(uri, { maxPoolSize: 10 });
    await client.connect();
  }
  return client;
}

export async function getDb() {
  return (await getClient()).db(dbName);
}

export async function closeDb() {
  if (client) {
    await client.close();
    client = null;
  }
}
