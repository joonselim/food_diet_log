// Output-side cleaners. Raw USDA strings are noisy; we present friendlier values
// without mutating the database (raw values stay queryable).

const SMALL_WORDS = new Set(["a","an","and","as","at","but","by","for","in","of","on","or","the","to","with"]);

export function titleCase(s) {
  if (!s || typeof s !== "string") return s;
  const lowered = s.toLowerCase();
  return lowered.split(/(\s+|,)/).map((tok, i) => {
    if (!/\S/.test(tok) || tok === ",") return tok;
    if (i > 0 && SMALL_WORDS.has(tok)) return tok;
    return tok.charAt(0).toUpperCase() + tok.slice(1);
  }).join("");
}

export function normalizeUpc(upc) {
  if (!upc || typeof upc !== "string") return null;
  const digits = upc.replace(/\D/g, "");
  return digits || null;
}

// Strips legal entity suffixes from brand names.
// "Barilla G & R F.lli S.p.a." → "Barilla"
// "General Mills, Inc." → "General Mills"
// "Kraft Heinz Foods Company" → "Kraft Heinz Foods"
// Corporate / legal entity suffixes — strip when they appear at the end
const LEGAL_SUFFIX_RE = new RegExp(
  "[,\\s]+" +
  "(?:" +
    [
      "Incorporated", "Inc",
      "Limited Liability Company", "L\\.L\\.C", "LLC",
      "Corporation", "Corp",
      "Limited", "Ltd",
      "Company", "Co",
      "S\\.p\\.A", "S\\.p\\.a",   // Italy
      "S\\.r\\.l", "Srl",
      "GmbH", "G\\.m\\.b\\.H",   // Germany
      "AG",
      "S\\.A", "SA",
      "N\\.V", "NV",
      "B\\.V", "BV",
      "P\\.L\\.C", "PLC",
      "Pty",
    ].join("|") +
  ")" +
  // optionally allow a second corporate suffix (e.g. "Foods, Inc.")
  "\\.?(?:[,\\s]+(?:Inc|LLC|Corp|Ltd|Co)\\.?)?$",
  "i",
);

// Descriptor-only words — strip only when trailing with no content following
const DESCRIPTOR_SUFFIX_RE =
  /[,\s]+(?:Holdings?|Enterprises?|International|Intl|Group|Global|Industries|USA|U\.S\.A|US|United States?|America[n]?|Canada)\.?$/i;

// Also strip Italian-style family markers mid-string that expose the real brand as first token
// e.g. "Barilla G & R F.lli S.p.a." → strip everything from the first " [A-Z] & " pattern
const FAMILY_MARKER_RE = /\s+[A-Z]\s*&\s*.+$/;

export function cleanBrand(brand) {
  if (!brand || typeof brand !== "string") return brand;
  let b = brand.trim();

  // 1. Remove trailing ", The" (e.g. "Dannon Company, Inc., The")
  b = b.replace(/[,\s]+[Tt]he\.?$/, "").trim();

  // 2. Remove legal entity suffix (Inc, LLC, GmbH, S.p.a. etc.)
  b = b.replace(LEGAL_SUFFIX_RE, "").trim().replace(/[,\s.]+$/, "").trim();

  // 3. Remove trailing descriptor words (International, Group, USA, etc.)
  b = b.replace(DESCRIPTOR_SUFFIX_RE, "").trim().replace(/[,\s.]+$/, "").trim();

  // 4. Strip Italian-style family markers: "Barilla G & R F.lli" → "Barilla"
  b = b.replace(FAMILY_MARKER_RE, "").trim();

  // Fallback: if we wiped everything, use the original
  return titleCase(b || brand);
}

export function cleanFood(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    source: doc.source,
    source_id: doc.source_id,
    name: titleCase(doc.name),
    brand: doc.brand ? cleanBrand(doc.brand) : null,
    category: doc.category || null,
    upc: normalizeUpc(doc.upc) || doc.normalized_upc || null,
    serving: doc.serving || null,
    per_100g: doc.per_100g,
  };
}
