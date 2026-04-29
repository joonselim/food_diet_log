import express from "express";
import cors from "cors";
import { ObjectId } from "mongodb";
import { getDb, closeDb } from "./db.js";
import { cleanFood, normalizeUpc } from "./clean.js";
import { getLog, addEntry, removeEntry, updateGoals, ensureIndexes } from "./meals.js";
import { analyzeImage } from "./analyze.js";

const PORT = Number(process.env.PORT || 4000);
const app = express();
app.use(cors({ allowedHeaders: ["Content-Type", "x-device-id"] }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// GET /foods/search?q=barilla+spaghetti&limit=20&offset=0
app.get("/foods/search", async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "q is required" });
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const db   = await getDb();
    const col  = db.collection("foods");
    const proj = { name: 1, brand: 1, category: 1, source: 1, source_id: 1, upc: 1, serving: 1, per_100g: 1, popularity: 1 };
    let docs;

    try {
      // ── Step 1: exact matches via find() — guaranteed top results ─────────────
      const qEsc   = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const exactQ = { $regex: `^${qEsc}$`, $options: "i" };
      const pinned = await col.find(
        { $or: [{ name: exactQ }, { aliases: exactQ }] },
        { projection: proj },
      ).limit(10).toArray();
      const pinnedIds = new Set(pinned.map((d) => String(d._id)));

      // ── Step 2: Atlas Search for broader results ──────────────────────────────
      const searched = await col.aggregate([
        {
          $search: {
            index: "foods_search",
            compound: {
              should: [
                { phrase: { query: q, path: "aliases", score: { boost: { value: 40 } } } },
                { text:   { query: q, path: "aliases", score: { boost: { value: 20 } } } },
                { phrase: { query: q, path: "name",    score: { boost: { value: 30 } } } },
                { text:   { query: q, path: "name",    fuzzy: { maxEdits: 1 }, score: { boost: { value: 10 } } } },
                { text:   { query: q, path: "brand",   score: { boost: { value: 5  } } } },
                { exists: { path: "popularity",        score: { boost: { value: 1  } } } },
              ],
            },
          },
        },
        { $limit: limit + 60 },
        { $project: { score: { $meta: "searchScore" }, ...proj } },
      ]).toArray();

      // Re-rank searched results: popularity bonus + length penalty
      const popBonus   = (doc) => (doc.popularity || 0) / 10;
      const lenPenalty = (name) => Math.max(0, name.length - 10) / 15;
      const sourceRank = { foundation: 0, sr_legacy: 0 };
      searched.sort((a, b) => {
        const aAdj = (a.score || 0) + popBonus(a) - lenPenalty(a.name);
        const bAdj = (b.score || 0) + popBonus(b) - lenPenalty(b.name);
        if (Math.abs(aAdj - bAdj) > 0.5) return bAdj - aAdj;
        const aRank = sourceRank[a.source] ?? 1;
        const bRank = sourceRank[b.source] ?? 1;
        if (aRank !== bRank) return aRank - bRank;
        return a.name.length - b.name.length;
      });

      // ── Step 3: merge — pinned items always first, no duplicates ─────────────
      const rest = searched.filter((d) => !pinnedIds.has(String(d._id)));
      docs = [...pinned, ...rest].slice(offset, offset + limit);
    } catch {
      // Fallback: $text index for local dev
      docs = await db.collection("foods")
        .find(
          { $text: { $search: q } },
          { projection: { score: { $meta: "textScore" }, name: 1, brand: 1, category: 1,
                          source: 1, source_id: 1, upc: 1, serving: 1, per_100g: 1 } }
        )
        .sort({ score: { $meta: "textScore" } })
        .skip(offset)
        .limit(limit)
        .toArray();
    }

    res.json({ q, count: docs.length, results: docs.map(cleanFood) });
  } catch (e) { next(e); }
});

// GET /foods/by-upc/:upc — barcode lookup
app.get("/foods/by-upc/:upc", async (req, res, next) => {
  try {
    const upc = normalizeUpc(req.params.upc);
    if (!upc) return res.status(400).json({ error: "invalid upc" });
    const db = await getDb();
    // raw upc has spaces/dashes; find by normalized comparison (exact match on stored variants)
    const doc = await db.collection("foods").findOne({
      $or: [{ upc }, { upc: req.params.upc }]
    });
    if (!doc) return res.status(404).json({ error: "not found" });
    res.json(cleanFood(doc));
  } catch (e) { next(e); }
});

// GET /foods/:id — detail
app.get("/foods/:id", async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "invalid id" });
    const db = await getDb();
    const doc = await db.collection("foods").findOne({ _id: new ObjectId(req.params.id) });
    if (!doc) return res.status(404).json({ error: "not found" });
    res.json(cleanFood(doc));
  } catch (e) { next(e); }
});

// ── Meal log routes ──────────────────────────────────────────────────────────

// Every /meals route requires the x-device-id header. Without it, two users
// sharing the same backend would write to the same daily log document.
function getDeviceId(req, res) {
  const id = req.header("x-device-id");
  if (!id || typeof id !== "string" || id.length < 4 || id.length > 128) {
    res.status(400).json({ error: "x-device-id header required" });
    return null;
  }
  return id;
}

// GET /meals/:date — get daily log (YYYY-MM-DD) for this device
app.get("/meals/:date", async (req, res, next) => {
  try {
    const deviceId = getDeviceId(req, res); if (!deviceId) return;
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "invalid date" });
    const log = await getLog(date, deviceId);
    res.json(log);
  } catch (e) { next(e); }
});

// POST /meals/:date/:slot/entries — add entry to a meal slot
app.post("/meals/:date/:slot/entries", async (req, res, next) => {
  try {
    const deviceId = getDeviceId(req, res); if (!deviceId) return;
    const { date, slot } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "invalid date" });
    if (!["breakfast", "lunch", "dinner"].includes(slot)) return res.status(400).json({ error: "invalid slot" });
    const entry = req.body;
    if (!entry?.food || typeof entry.grams !== "number") return res.status(400).json({ error: "invalid entry" });
    const log = await addEntry(date, slot, entry, deviceId);
    res.json(log);
  } catch (e) { next(e); }
});

// DELETE /meals/:date/:slot/entries/:index — remove entry by index
app.delete("/meals/:date/:slot/entries/:index", async (req, res, next) => {
  try {
    const deviceId = getDeviceId(req, res); if (!deviceId) return;
    const { date, slot } = req.params;
    const index = parseInt(req.params.index, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "invalid date" });
    if (!["breakfast", "lunch", "dinner"].includes(slot)) return res.status(400).json({ error: "invalid slot" });
    if (!Number.isFinite(index) || index < 0) return res.status(400).json({ error: "invalid index" });
    const log = await removeEntry(date, slot, index, deviceId);
    res.json(log);
  } catch (e) { next(e); }
});

// PUT /meals/:date/goals — update daily goals
app.put("/meals/:date/goals", async (req, res, next) => {
  try {
    const deviceId = getDeviceId(req, res); if (!deviceId) return;
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "invalid date" });
    const { calories, protein, carbs, fat } = req.body;
    if ([calories, protein, carbs, fat].some((v) => typeof v !== "number")) {
      return res.status(400).json({ error: "all goal fields must be numbers" });
    }
    await updateGoals(date, { calories, protein, carbs, fat }, deviceId);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Claude Vision analyze ─────────────────────────────────────────────────────

// POST /analyze — { image: base64, mimeType?: string }
app.post("/analyze", async (req, res, next) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
    }
    const { image, mimeType = "image/jpeg" } = req.body;
    if (!image || typeof image !== "string") return res.status(400).json({ error: "image (base64) required" });
    const results = await analyzeImage(image, mimeType);
    res.json({ results });
  } catch (e) { next(e); }
});

// ── Error handler ─────────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "internal error" });
});

const server = app.listen(PORT, async () => {
  await ensureIndexes().catch(console.error);
  console.log(`API listening on http://localhost:${PORT}`);
});

const shutdown = async () => {
  console.log("shutting down...");
  server.close();
  await closeDb();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
