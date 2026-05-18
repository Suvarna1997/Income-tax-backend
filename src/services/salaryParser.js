// Salary slip parser — handles multiple PDF text extraction formats:
//   Block  : Labels in one column, values in another column (common in large payroll systems)
//   Lines  : "Basic Salary: 50,000" or "Basic Salary   50,000" on same line
//   Concat : "BasicPay8000Tax800" — label and value merged, no separator
//   Multi  : Multiple pairs per line "Basic Pay  50000  HRA  20000  PF  6000"

const FIELDS = [
  { key: "basic",            aliases: ["basic salary", "basic pay", "basic wages", "basic", "basic component", "base salary", "base pay"] },
  {
    key: "hra",
    aliases: [
      "house rent allowance", "hra", "house rent", "rent allowance",
      "h.r.a", "hra-house rent", "h.r.a.", "housing rent allowance",
    ],
  },
  {
    key: "allowances",
    aliases: [
      "special allowance", "other allowances", "other allowance",
      "conveyance allowance", "conveyance", "transport allowance", "ta",
      "medical allowance", "lta", "leave travel allowance", "leave travel assistance",
      "city compensatory allowance", "cca", "dearness allowance", "da",
      "flexible benefit", "fba", "fuel allowance", "allowances", "allowance",
      "overtime", "overtime pay", "shift allowance", "night allowance",
      "education allowance", "uniform allowance", "telephone allowance",
      "internet allowance", "food allowance", "meal allowance",
      "performance allowance", "additional allowance", "other pay",
    ],
    sum: true,
  },
  {
    key: "bonuses",
    aliases: [
      "bonus", "performance bonus", "annual bonus", "incentive", "variable pay",
      "ex-gratia", "ex gratia", "joining bonus", "retention bonus",
      "annual performance incentive", "performance incentive", "pli",
      "production linked incentive", "special bonus",
    ],
    sum: true,
  },
  {
    key: "pf",
    aliases: [
      "provident fund", "employee pf", "employee provident fund", "epf",
      "pf deduction", "pf", "vpf", "p.f.", "e.p.f", "pf contribution",
      "employee contribution", "pf - employee", "pf(employee)",
    ],
  },
  {
    key: "professional_tax",
    aliases: [
      "professional tax", "p.tax", "p tax", "ptax", "prof. tax",
      "prof tax", "profession tax", "pt", "professional tax deduction",
    ],
  },
  {
    key: "tds",
    aliases: [
      "tds", "income tax deducted", "tax deducted at source", "it deduction",
      "income tax", "it", "tax", "tds deducted", "income tax tds",
    ],
  },
  {
    key: "gross",
    aliases: [
      "gross earnings", "gross salary", "gross pay", "total earnings",
      "total gross", "gross total", "total earning", "gross ctc",
      "total income", "total salary",
    ],
  },
  {
    key: "net",
    aliases: [
      "net salary", "net pay", "take home", "take-home", "net amount",
      "amount payable", "net payable", "net income", "net wages",
    ],
  },
  { key: "ctc", aliases: ["ctc", "cost to company", "annual ctc", "total ctc", "gross ctc"] },
];

const ALIAS_MAP = new Map();
for (const f of FIELDS) {
  for (const a of f.aliases) {
    ALIAS_MAP.set(a.toLowerCase().trim(), { key: f.key, sum: !!f.sum });
  }
}

function matchAlias(label) {
  const l = label.toLowerCase().trim().replace(/\s+/g, " ");
  if (ALIAS_MAP.has(l)) return ALIAS_MAP.get(l);
  // Partial-word match for common variants
  for (const [alias, meta] of ALIAS_MAP) {
    if (l === alias) return meta;
    if (l.startsWith(alias + " ") || alias.startsWith(l + " ")) return meta;
    if (l.includes(alias) && alias.length > 5) return meta;
  }
  return null;
}

function toNumber(s) {
  if (s == null) return null;
  const cleaned = String(s).replace(/,/g, "").replace(/[^\d.\-]/g, "");
  if (!cleaned || cleaned === "." || cleaned === "-") return null;
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
  return t.length > 1 && /[a-zA-Z]/.test(t) && !/\d/.test(t);
}

// A line has mixed text+digits (neither pure text nor pure number)
function isMixedLine(s) {
  const t = s.trim();
  return /[a-zA-Z]/.test(t) && /\d/.test(t);
}

function detectFrequency(text) {
  const t = text.toLowerCase();
  // Annual markers — check first so annual CTCs aren't treated as monthly
  if (/(annual\s*ctc|annual\s*gross|per\s*annum|p\.a\.|yearly|annual\s*salary|annual\s*statement)/i.test(t))
    return "annual";
  // Monthly markers
  if (/(payslip|pay\s*slip|salary\s*slip|salary\s*statement|month\s*of|pay\s*period|for\s*the\s*month|monthly\s*salary|monthly\s*earnings|monthly\s*statement|pay\s*stub|wage\s*slip|paycheck)/i.test(t))
    return "monthly";
  return "unknown";
}

// ─── Strategy 1: Block format ─────────────────────────────────────────────────
// Detects "Earnings...Amount" table header, then:
//   pure-text lines → label block
//   pure-number lines → value block (first N = current month, next N = YTD — skip YTD)
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
    // Also handle "Rs. 50,000" or "INR 50,000" prefix on value
    const m = line.match(/^([A-Za-z][A-Za-z\s\-\.\/()&]*?)(?:\s*[:=\-|]\s*|\s{2,})(?:Rs\.?\s*|INR\s*)?([\d,]+(?:\.\d+)?)\s*$/i);
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

// ─── Strategy 3: Multiple label-value pairs per line ─────────────────────────
// "Basic Pay  50000  HRA  20000  PF  6000"
// Also handles concatenated "BasicPay8000Tax800"
function strategyMultiPair(lines) {
  const result = {};
  const re = /([A-Za-z][A-Za-z\s\-\.\/()&]{1,40}?)\s*(?:[:=]?\s*)(?:Rs\.?\s*|INR\s*)?([\d,]+(?:\.\d+)?)/g;

  for (const raw of lines) {
    const line = raw.trim();
    if (!isMixedLine(line)) continue;
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(line)) !== null) {
      const label = m[1].trim();
      if (label.length < 2) continue;
      const meta = matchAlias(label);
      if (!meta) continue;
      const n = toNumber(m[2]);
      if (n != null && n > 0) {
        result[meta.key] = meta.sum ? (result[meta.key] || 0) + n : result[meta.key] ?? n;
      }
    }
  }
  return result;
}

// ─── Net pay prose extraction ─────────────────────────────────────────────────
function extractNetPay(text) {
  const patterns = [
    /net\s*pay\s*:?\s*(?:Rs\.?\s*|INR\s*)?([\d,]+(?:\.\d+)?)/i,
    /take[\s-]*home\s*:?\s*(?:Rs\.?\s*)?([\d,]+(?:\.\d+)?)/i,
    /net\s*amount\s*payable\s*:?\s*(?:Rs\.?\s*)?([\d,]+(?:\.\d+)?)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) { const n = toNumber(m[1]); if (n && n > 0) return n; }
  }
  return null;
}

// ─── Frequency heuristic when auto-detection fails ───────────────────────────
function guessFrequency(merged) {
  const basic = merged.basic;
  if (!basic) return "unknown";
  // basic < ₹1L → almost certainly monthly; > ₹5L → annual
  if (basic < 100000) return "monthly";
  if (basic > 500000) return "annual";
  return "monthly"; // default: most payslips are monthly
}

// ─── Main entry point ─────────────────────────────────────────────────────────
function parseSalarySlipText(text) {
  if (!text || typeof text !== "string") {
    return {
      extracted: {},
      missing: FIELDS.slice(0, 6).map((f) => f.key),
      raw_text: "",
      frequency: "unknown",
      confidence: "low",
    };
  }

  let frequency = detectFrequency(text);
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);

  // Run all strategies; merge with priority: Block > Lines > Multi
  const blockResult = strategyBlock(text);
  const lineResult = strategyLinePairs(lines);
  const multiResult = strategyMultiPair(lines);

  // Merge: multi first (lowest priority), then lines, then block overrides
  const merged = { ...multiResult };
  for (const [k, v] of Object.entries(lineResult)) {
    if (v > 0) merged[k] = v;
  }
  for (const [k, v] of Object.entries(blockResult)) {
    if (v > 0) merged[k] = v;
  }

  // Net pay fallback
  if (!merged.net) {
    const np = extractNetPay(text);
    if (np) merged.net = np;
  }

  // Guess frequency if still unknown
  if (frequency === "unknown") {
    frequency = guessFrequency(merged);
  }

  const multiplier = frequency === "monthly" ? 12 : 1;
  const annualized = {};
  for (const [k, v] of Object.entries(merged)) {
    annualized[k] = Math.round(v * multiplier);
  }

  const missing = ["basic", "hra", "allowances", "bonuses", "pf", "professional_tax"].filter(
    (k) => annualized[k] == null
  );

  const found = Object.keys(annualized).length;
  const confidence = found >= 4 ? "high" : found >= 2 ? "medium" : "low";

  return {
    extracted: annualized,
    extracted_raw: merged,
    missing,
    frequency,
    multiplier,
    confidence,
    raw_text: text.slice(0, 3000),
  };
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
