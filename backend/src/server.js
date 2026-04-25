import express from "express";
import cors from "cors";
import { ObjectId } from "mongodb";
import { getDb, closeDb } from "./db.js";
import { cleanFood, normalizeUpc } from "./clean.js";
import { getLog, addEntry, removeEntry, updateGoals, ensureIndexes } from "./meals.js";
import { analyzeImage } from "./analyze.js";

const PORT = Number(process.env.PORT || 4000);
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// GET /foods/search?q=barilla+spaghetti&limit=20&offset=0
app.get("/foods/search", async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "q is required" });
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const db = await getDb();
    let docs;

    try {
      // Atlas Search — index doesn't count toward M0 storage quota
      docs = await db.collection("foods").aggregate([
        {
          $search: {
            index: "foods_search",
            compound: {
              should: [
                // exact alias match — top priority (e.g. "oatmeal" alias on plain oats)
                { phrase: { query: q, path: "aliases", score: { boost: { value: 40 } } } },
                { text:   { query: q, path: "aliases", score: { boost: { value: 20 } } } },
                // exact phrase match in name
                { phrase: { query: q, path: "name",    score: { boost: { value: 30 } } } },
                // fuzzy word match for typos
                { text:   { query: q, path: "name",    fuzzy: { maxEdits: 1 }, score: { boost: { value: 10 } } } },
                { text:   { query: q, path: "brand",   score: { boost: { value: 5  } } } },
              ],
            },
          },
        },
        { $skip: offset },
        { $limit: limit },
        { $project: { score: { $meta: "searchScore" }, name: 1, brand: 1, category: 1,
                      source: 1, source_id: 1, upc: 1, serving: 1, per_100g: 1 } },
      ]).toArray();
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

// GET /meals/:date — get daily log (YYYY-MM-DD)
app.get("/meals/:date", async (req, res, next) => {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "invalid date" });
    const log = await getLog(date);
    res.json(log);
  } catch (e) { next(e); }
});

// POST /meals/:date/:slot/entries — add entry to a meal slot
app.post("/meals/:date/:slot/entries", async (req, res, next) => {
  try {
    const { date, slot } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "invalid date" });
    if (!["breakfast", "lunch", "dinner"].includes(slot)) return res.status(400).json({ error: "invalid slot" });
    const entry = req.body;
    if (!entry?.food || typeof entry.grams !== "number") return res.status(400).json({ error: "invalid entry" });
    const log = await addEntry(date, slot, entry);
    res.json(log);
  } catch (e) { next(e); }
});

// DELETE /meals/:date/:slot/entries/:index — remove entry by index
app.delete("/meals/:date/:slot/entries/:index", async (req, res, next) => {
  try {
    const { date, slot } = req.params;
    const index = parseInt(req.params.index, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "invalid date" });
    if (!["breakfast", "lunch", "dinner"].includes(slot)) return res.status(400).json({ error: "invalid slot" });
    if (!Number.isFinite(index) || index < 0) return res.status(400).json({ error: "invalid index" });
    const log = await removeEntry(date, slot, index);
    res.json(log);
  } catch (e) { next(e); }
});

// PUT /meals/:date/goals — update daily goals
app.put("/meals/:date/goals", async (req, res, next) => {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "invalid date" });
    const { calories, protein, carbs, fat } = req.body;
    if ([calories, protein, carbs, fat].some((v) => typeof v !== "number")) {
      return res.status(400).json({ error: "all goal fields must be numbers" });
    }
    await updateGoals(date, { calories, protein, carbs, fat });
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
