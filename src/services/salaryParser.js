// Salary slip parser — handles multiple PDF text extraction formats:
//   Block  : Labels in one column, values in another column (common in large payroll systems)
//   Lines  : "Basic Salary: 50,000" or "Basic Salary   50,000" on same line
//   Concat : "BasicPay8000Tax800" — label and value merged, no separator
//   Multi  : Multiple pairs per line "Basic Pay  50000  HRA  20000  PF  6000"

const FIELDS = [
  {
    key: "basic",
    aliases: [
      "basic salary", "basic pay", "basic wages", "basic", "basic component",
      "base salary", "base pay", "basic earning", "basic earnings",
      "basic da", "basic and da",
    ],
  },
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
      "transportation allowance",
      "medical allowance", "lta", "leave travel allowance", "leave travel assistance",
      "city compensatory allowance", "cca", "dearness allowance", "da",
      "flexible benefit", "fba", "fuel allowance", "allowances", "allowance",
      "overtime", "overtime pay", "shift allowance", "night allowance",
      "education allowance", "uniform allowance", "telephone allowance",
      "internet allowance", "food allowance", "meal allowance",
      "performance allowance", "additional allowance", "other pay",
      "washing allowance", "mobile allowance", "books allowance",
      "statutory bonus", "arrears", "salary arrears", "earnings adjustment",
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
      "employee epf", "epf employee", "provident fund employee",
      "employee provident fund contribution", "employee pf contribution",
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
      "income tax deduction",
    ],
  },
  {
    key: "gross",
    aliases: [
      "gross earnings", "gross salary", "gross pay", "total earnings",
      "total gross", "gross total", "total earning", "gross ctc",
      "total income", "total salary", "salary total",
    ],
  },
  {
    key: "net",
    aliases: [
      "net salary", "net pay", "take home", "take-home", "net amount",
      "amount payable", "net payable", "net income", "net wages",
      "net salary received", "salary received",
    ],
  },
  { key: "ctc", aliases: ["ctc", "cost to company", "annual ctc", "total ctc", "gross ctc"] },
];

const ALIAS_MAP = new Map();
const ALIAS_COMPACT_MAP = new Map();
for (const f of FIELDS) {
  for (const a of f.aliases) {
    const meta = { key: f.key, sum: !!f.sum };
    ALIAS_MAP.set(a.toLowerCase().trim(), meta);
    ALIAS_COMPACT_MAP.set(compactLabel(a), meta);
  }
}

function normalizeLabel(label) {
  return String(label || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_|]/g, " ")
    .replace(/\b(?:rs|inr|amount|amt|current|month|monthly|ytd|year\s*to\s*date|arrear|actual|earnings?|deductions?|payments?|salary|wages|description|particulars?)\b/gi, " ")
    .replace(/[^\w\s.&()/+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactLabel(label) {
  return String(label || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchAlias(label) {
  const l = normalizeLabel(label).toLowerCase().trim().replace(/\s+/g, " ");
  if (ALIAS_MAP.has(l)) return ALIAS_MAP.get(l);
  const compact = compactLabel(l);
  if (ALIAS_COMPACT_MAP.has(compact)) return ALIAS_COMPACT_MAP.get(compact);
  // Partial-word match for common variants
  for (const [alias, meta] of ALIAS_MAP) {
    if (l === alias) return meta;
    if (l.startsWith(alias + " ") || alias.startsWith(l + " ")) return meta;
    if (l.includes(alias) && alias.length > 5) return meta;
  }
  for (const [alias, meta] of ALIAS_COMPACT_MAP) {
    if (compact.includes(alias) && alias.length > 4) return meta;
    if (alias.includes(compact) && compact.length > 4) return meta;
  }
  return null;
}

function toNumber(s) {
  if (s == null) return null;
  let cleaned = String(s).replace(/(?:rs|inr|rp)\.?\s*|₹/gi, "").replace(/[^\d.,\-]/g, "");
  if (!cleaned || cleaned === "." || cleaned === "-") return null;

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  const dotCount = (cleaned.match(/\./g) || []).length;
  const commaCount = (cleaned.match(/,/g) || []).length;

  if (dotCount && commaCount) {
    // The last separator is normally the decimal separator; the other is thousands.
    if (lastDot > lastComma) cleaned = cleaned.replace(/,/g, "");
    else cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (dotCount > 1) {
    const lastGroup = cleaned.slice(lastDot + 1);
    if (/^0+$/.test(lastGroup)) {
      cleaned = cleaned.slice(0, lastDot).replace(/\./g, "") + "." + lastGroup;
    } else {
      cleaned = cleaned.replace(/\./g, "");
    }
  } else if (commaCount > 1) {
    const lastGroup = cleaned.slice(lastComma + 1);
    if (/^0+$/.test(lastGroup)) {
      cleaned = cleaned.slice(0, lastComma).replace(/,/g, "") + "." + lastGroup;
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (dotCount === 1) {
    const decimals = cleaned.length - lastDot - 1;
    const wholeDigits = cleaned.slice(0, lastDot).replace(/[^\d]/g, "").length;
    const decimalPart = cleaned.slice(lastDot + 1);
    if (decimals === 3 && wholeDigits <= 3 && !/^0+$/.test(decimalPart)) cleaned = cleaned.replace(".", "");
  } else if (commaCount === 1) {
    const decimals = cleaned.length - lastComma - 1;
    const wholeDigits = cleaned.slice(0, lastComma).replace(/[^\d]/g, "").length;
    const decimalPart = cleaned.slice(lastComma + 1);
    cleaned = decimals === 3 && wholeDigits <= 3 && !/^0+$/.test(decimalPart) ? cleaned.replace(",", "") : cleaned.replace(",", ".");
  }

  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// A line is a pure number if it contains ONLY digits, commas, decimal point (and optional leading dot)
function isNumberLine(s) {
  const t = s.trim();
  return /^(?:₹\s*)?(?:(?:Rs|INR|Rp)\.?\s*)?-?[\d.,]+$/i.test(t) || /^\.\d+$/.test(t);
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

function isValueOnlyLine(s) {
  return isNumberLine(s);
}

function moneyTokens(line) {
  const tokens = [];
  const re = /(?:(?:rs|inr|rp)\.?\s*|₹\s*)?-?[\d.,]+/gi;
  let m;
  while ((m = re.exec(line)) !== null) {
    const n = toNumber(m[0]);
    if (n != null) tokens.push({ value: n, index: m.index, raw: m[0] });
  }
  return tokens;
}

function firstMeaningfulAmount(tokens) {
  const t = tokens.find((x) => x.value > 0);
  return t ? t.value : null;
}

function addValue(result, meta, value) {
  if (!meta || value == null || value <= 0) return;
  result[meta.key] = meta.sum ? (result[meta.key] || 0) + value : result[meta.key] ?? value;
}

function setValue(result, meta, value) {
  if (!meta || value == null || value <= 0) return;
  result[meta.key] = meta.sum ? (result[meta.key] || 0) + value : value;
}

function cleanRowLabel(label) {
  return normalizeLabel(label)
    .replace(/\b(?:no|sr|sl|code|component|pay\s*head|head|rate|unit|days?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findAliasInLine(line) {
  const normalized = normalizeLabel(line);
  return matchAlias(normalized);
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
    addValue(result, meta, toNumber(m[2]));
  }
  return result;
}

// ─── Strategy 2a: Adjacent label/value lines ─────────────────────────────────
// Handles PDF text where table cells become separate lines:
//   Basic
//   ₹56,000.00
// Also handles summary cards where the amount appears before the label:
//   ₹1,07,000.00
//   Total Net Pay
function strategyAdjacentPairs(lines) {
  const result = {};

  for (let i = 0; i < lines.length - 1; i++) {
    const current = lines[i].trim();
    const next = lines[i + 1].trim();

    if (isPureTextLine(current) && isValueOnlyLine(next)) {
      const meta = matchAlias(current);
      addValue(result, meta, toNumber(next));
      continue;
    }

    if (isValueOnlyLine(current) && isPureTextLine(next)) {
      const meta = matchAlias(next);
      if (meta && !["net", "gross", "ctc"].includes(meta.key)) continue;
      addValue(result, meta, toNumber(current));
    }
  }

  return result;
}

// ─── Strategy 2b: Sequential label block followed by value block ─────────────
// Some design-template payslips extract as:
//   Basic Salary
//   Transportation Allowance
//   Rp.8000.000
//   Rp. 500.000
function strategySequentialBlocks(lines) {
  const result = {};

  for (let i = 0; i < lines.length; i++) {
    const labels = [];
    let j = i;

    while (j < lines.length && isPureTextLine(lines[j])) {
      const meta = matchAlias(lines[j]);
      if (!meta) break;
      labels.push(meta);
      j++;
    }

    if (!labels.length) continue;

    const values = [];
    let k = j;
    while (k < lines.length && isValueOnlyLine(lines[k])) {
      const n = toNumber(lines[k]);
      if (n != null) values.push(n);
      k++;
    }

    if (!values.length) continue;
    const count = Math.min(labels.length, values.length);
    for (let x = 0; x < count; x++) {
      setValue(result, labels[x], values[x]);
    }
    i = k - 1;
  }

  return result;
}

// ─── Strategy 2c: Table/row formats ──────────────────────────────────────────
// Handles rows such as:
//   "Basic Pay        50,000      6,00,000"
//   "PF - Employee | 1,800 | 21,600"
// The first amount is treated as the current payslip amount; later amounts are
// usually YTD/annual columns.
function strategyTableRows(lines) {
  const result = {};

  for (const raw of lines) {
    const line = raw.replace(/\t/g, " ").trim();
    if (!isMixedLine(line)) continue;
    if (/\b(total|grand total|sub total)\b/i.test(line) && !matchAlias(line)) continue;

    const tokens = moneyTokens(line);
    if (!tokens.length) continue;

    const labelBeforeFirstAmount = cleanRowLabel(line.slice(0, tokens[0].index));
    const labelWithoutAmounts = cleanRowLabel(line.replace(/(?:(?:rs|inr|rp)\.?\s*|₹\s*)?-?[\d.,]+/gi, " "));
    const meta = matchAlias(labelBeforeFirstAmount) || findAliasInLine(labelWithoutAmounts);
    if (!meta) continue;

    addValue(result, meta, firstMeaningfulAmount(tokens));
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
      addValue(result, meta, toNumber(m[2]));
    }
  }
  return result;
}

// ─── Net pay prose extraction ─────────────────────────────────────────────────
function extractNetPay(text) {
  const patterns = [
    /net\s*pay\s*:?\s*(?:(?:Rs|INR|Rp)\.?\s*)?([\d.,]+)/i,
    /take[\s-]*home\s*:?\s*(?:(?:Rs|INR|Rp)\.?\s*)?([\d.,]+)/i,
    /net\s*amount\s*payable\s*:?\s*(?:(?:Rs|INR|Rp)\.?\s*)?([\d.,]+)/i,
    /net\s*salary\s*received\s*:?\s*(?:(?:Rs|INR|Rp)\.?\s*)?([\d.,]+)/i,
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
  const adjacentResult = strategyAdjacentPairs(lines);
  const sequentialResult = strategySequentialBlocks(lines);
  const tableResult = strategyTableRows(lines);
  const multiResult = strategyMultiPair(lines);

  // Merge: multi first (lowest priority), then adjacent/table rows, sequential, lines, then block overrides
  const merged = { ...multiResult };
  for (const [k, v] of Object.entries(adjacentResult)) {
    if (v > 0) merged[k] = v;
  }
  for (const [k, v] of Object.entries(tableResult)) {
    if (v > 0) merged[k] = v;
  }
  for (const [k, v] of Object.entries(sequentialResult)) {
    if (v > 0) merged[k] = v;
  }
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

  if (!merged.gross) {
    const computedGross = (merged.basic || 0) + (merged.hra || 0) + (merged.allowances || 0) + (merged.bonuses || 0);
    if (computedGross > 0) merged.gross = computedGross;
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
  if (!text.trim()) {
    return {
      extracted: {}, extracted_raw: {},
      missing: ["basic", "hra", "allowances", "bonuses", "pf", "professional_tax"],
      frequency: "unknown", multiplier: 1, confidence: "low", raw_text: "",
      parse_error: "This PDF does not contain selectable text. It looks like an image/scanned payslip, so OCR is required. Try uploading a text-based PDF or paste the payslip text.",
    };
  }
  return parseSalarySlipText(text);
}

module.exports = { parseSalarySlipText, parsePdfBuffer };
