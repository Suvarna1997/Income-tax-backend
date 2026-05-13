// Salary slip parser — handles three PDF extraction formats:
//   Block  : Labels in a pure-text block, values in the pure-number block below (Amdocs/ADP)
//   Lines  : "Label: 12,345" or "Label   12,345" on the same line
//   Concat : "BasicPay8000Tax800" — label and value merged with no separator

const FIELDS = [
  { key: "basic",            aliases: ["basic salary", "basic pay", "basic wages", "basic"] },
  { key: "hra",              aliases: ["house rent allowance", "hra", "house rent", "rent allowance", "h.r.a", "hra-house rent"] },
  {
    key: "allowances",
    aliases: [
      "special allowance", "other allowances", "other allowance",
      "conveyance allowance", "conveyance", "transport allowance", "ta",
      "medical allowance", "lta", "leave travel allowance", "leave travel assistance",
      "city compensatory allowance", "cca", "dearness allowance", "da",
      "flexible benefit", "fba", "fuel allowance", "allowances", "allowance",
      "overtime", "overtime pay",
    ],
    sum: true,
  },
  {
    key: "bonuses",
    aliases: [
      "bonus", "performance bonus", "annual bonus", "incentive", "variable pay",
      "ex-gratia", "ex gratia", "joining bonus", "retention bonus",
      "annual performance incentive", "performance incentive",
    ],
    sum: true,
  },
  { key: "pf",               aliases: ["provident fund", "employee pf", "employee provident fund", "epf", "pf deduction", "pf", "vpf", "p.f.", "e.p.f"] },
  { key: "professional_tax", aliases: ["professional tax", "p.tax", "p tax", "ptax", "prof. tax", "prof tax", "profession tax", "pt"] },
  { key: "tds",              aliases: ["tds", "income tax deducted", "tax deducted at source", "it deduction", "income tax", "it", "tax"] },
  { key: "gross",            aliases: ["gross earnings", "gross salary", "gross pay", "total earnings", "total gross", "gross total", "total earning"] },
  { key: "net",              aliases: ["net salary", "net pay", "take home", "take-home", "net amount", "amount payable", "net payable"] },
  { key: "ctc",              aliases: ["ctc", "cost to company", "annual ctc", "total ctc"] },
];

const ALIAS_MAP = new Map();
for (const f of FIELDS) {
  for (const a of f.aliases) {
    ALIAS_MAP.set(a.toLowerCase().trim(), { key: f.key, sum: !!f.sum });
  }
}

function matchAlias(label) {
  const l = label.toLowerCase().trim();
  if (ALIAS_MAP.has(l)) return ALIAS_MAP.get(l);
  for (const [alias, meta] of ALIAS_MAP) {
    if (l === alias || l.startsWith(alias + " ") || alias.startsWith(l + " ")) return meta;
  }
  return null;
}

function toNumber(s) {
  if (!s) return null;
  const cleaned = String(s).replace(/,/g, "").replace(/[^\d.\-]/g, "");
  if (!cleaned || cleaned === ".") return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// A line is a pure number if it contains ONLY digits, commas, decimal point (and optional leading dot)
function isNumberLine(s) {
  const t = s.trim();
  return /^-?[\d,]+(\.\d+)?$/.test(t) || /^\.\d+$/.test(t);
}

// A line is purely textual (no digit characters at all)
function isPureTextLine(s) {
  const t = s.trim();
  return t.length > 0 && /[a-zA-Z]/.test(t) && !/\d/.test(t);
}

// A line has mixed text+digits (neither pure text nor pure number)
function isMixedLine(s) {
  const t = s.trim();
  return /[a-zA-Z]/.test(t) && /\d/.test(t);
}

function detectFrequency(text) {
  if (/(payslip|pay\s*slip|month\s*of|pay\s*period|for\s*the\s*month|monthly\s*salary|monthly\s*earnings)/i.test(text))
    return "monthly";
  if (/(annual\s*ctc|annual\s*gross|per\s*annum|p\.a\.|yearly|annual\s*salary)/i.test(text))
    return "annual";
  return "unknown";
}

// ─── Strategy 1: Block format (Amdocs/ADP) ──────────────────────────────────
// Detects "Earnings...Amount" table header, then:
//   - pure-text lines   → label block
//   - pure-number lines → value block (first N = current month, next N = YTD)
// Processes earnings section then deductions section separately.
function strategyBlock(text) {
  const result = {};
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (!/earnings.*amount/i.test(lines[i])) continue;

    let j = i + 1;

    // Process earnings label block + value block
    j = extractLabelValueBlock(lines, j, result);
    // Process deductions label block + value block (immediately after earnings values)
    extractLabelValueBlock(lines, j, result);

    break; // One table per document
  }

  return result;
}

function extractLabelValueBlock(lines, startJ, result) {
  let j = startJ;

  // Collect pure-text label lines
  const labelBlock = [];
  while (j < lines.length && isPureTextLine(lines[j])) {
    labelBlock.push({ meta: matchAlias(lines[j]), index: labelBlock.length });
    j++;
  }

  if (labelBlock.length === 0) return j;

  // Collect pure-number value lines
  const values = [];
  while (j < lines.length && isNumberLine(lines[j])) {
    values.push(toNumber(lines[j]) ?? 0);
    j++;
  }

  // First N values = current month (N = label count), rest = YTD → skip
  const N = labelBlock.length;
  for (const { meta, index } of labelBlock) {
    if (!meta || index >= Math.min(N, values.length)) continue;
    const v = values[index];
    if (v > 0) {
      result[meta.key] = meta.sum ? (result[meta.key] || 0) + v : result[meta.key] ?? v;
    }
  }

  return j;
}

// ─── Strategy 2: Same-line pairs with separator ──────────────────────────────
// "Basic Salary: 46,840" or "Basic Salary   46,840"
function strategyLinePairs(lines) {
  const result = {};
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(/^([A-Za-z][A-Za-z\s\-\.\/()]*?)(?:\s*[:=\-|]\s*|\s{2,})([\d,]+(?:\.\d+)?)\s*$/);
    if (!m) continue;
    const meta = matchAlias(m[1]);
    if (!meta) continue;
    const n = toNumber(m[2]);
    if (n != null && n > 0) {
      result[meta.key] = meta.sum ? (result[meta.key] || 0) + n : result[meta.key] ?? n;
    }
  }
  return result;
}

// ─── Strategy 3: Concatenated label+value ────────────────────────────────────
// "Basic Pay8000Tax800" → [("Basic Pay", 8000), ("Tax", 800)]
// Only applied to lines that have BOTH letters and digits (mixed lines).
function strategyConcatenated(lines) {
  const result = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!isMixedLine(line)) continue;

    // Split at each text→digit and digit→text boundary
    const re = /([A-Za-z][A-Za-z\s\-\.\/()]*?)\s*([\d,]+(?:\.\d+)?)/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      const meta = matchAlias(m[1].trim());
      if (!meta) continue;
      const n = toNumber(m[2]);
      if (n != null && n > 0) {
        result[meta.key] = meta.sum ? (result[meta.key] || 0) + n : result[meta.key] ?? n;
      }
    }
  }
  return result;
}

// ─── Net pay prose extraction ────────────────────────────────────────────────
function extractNetPay(text) {
  const m = text.match(/net\s*pay\s*:?\s*(?:Rs\.?\s*)?([\d,]+(?:\.\d+)?)/i);
  if (m) { const n = toNumber(m[1]); return n && n > 0 ? n : null; }
  return null;
}

// ─── Main entry point ─────────────────────────────────────────────────────────
function parseSalarySlipText(text) {
  if (!text || typeof text !== "string") {
    return { extracted: {}, missing: FIELDS.slice(0, 6).map((f) => f.key), raw_text: "", frequency: "unknown", confidence: "low" };
  }

  const frequency = detectFrequency(text);
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);

  // Run all three strategies; merge with priority: Block > Lines > Concat
  const blockResult  = strategyBlock(text);
  const lineResult   = strategyLinePairs(lines);
  const concatResult = strategyConcatenated(lines);

  const merged = { ...concatResult };
  // Lines strategy overrides concat
  for (const [k, v] of Object.entries(lineResult)) {
    if (v > 0) merged[k] = Math.round(v);
  }
  // Block strategy overrides everything
  for (const [k, v] of Object.entries(blockResult)) {
    if (v > 0) merged[k] = Math.round(v);
  }

  // For sum fields (allowances, bonuses) — block strategy already sums within its context,
  // but if lines/concat found extras not in block, add them
  for (const field of FIELDS.filter((f) => f.sum)) {
    if (blockResult[field.key] && concatResult[field.key] && concatResult[field.key] !== blockResult[field.key]) {
      // Don't add — trust block strategy when available
    }
  }

  // Net pay fallback
  if (!merged.net) {
    const np = extractNetPay(text);
    if (np) merged.net = Math.round(np);
  }

  const missing = ["basic", "hra", "allowances", "bonuses", "pf", "professional_tax"].filter(
    (k) => merged[k] == null
  );

  const multiplier = frequency === "monthly" ? 12 : 1;
  const annualized = {};
  for (const [k, v] of Object.entries(merged)) {
    annualized[k] = Math.round(v * multiplier);
  }

  const found = Object.keys(annualized).length;
  const confidence = found >= 4 ? "high" : found >= 2 ? "medium" : "low";

  return { extracted: annualized, extracted_raw: merged, missing, frequency, multiplier, confidence, raw_text: text.slice(0, 3000) };
}

async function parsePdfBuffer(buffer) {
  let text = "";
  try {
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer);
    text = data.text || "";
  } catch (e) {
    return {
      extracted: {}, extracted_raw: {},
      missing: ["basic", "hra", "allowances", "bonuses", "pf", "professional_tax"],
      frequency: "unknown", multiplier: 1, confidence: "low", raw_text: "",
      parse_error: "Could not read PDF. Try pasting the text from the PDF instead.",
    };
  }
  return parseSalarySlipText(text);
}

module.exports = { parseSalarySlipText, parsePdfBuffer };
