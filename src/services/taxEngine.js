const CESS_RATE = 0.04;

// Both FY supported. Default = FY 2025-26 (Budget 2025 slabs)
const TAX_CONFIG = {
  "2024-25": {
    fy: "2024-25",
    ay: "2025-26",
    old: {
      slabs: [
        { upto: 250000, rate: 0 },
        { upto: 500000, rate: 0.05 },
        { upto: 1000000, rate: 0.2 },
        { upto: Infinity, rate: 0.3 },
      ],
      standard_deduction: 50000,
      rebate_87a: { income_limit: 500000, max_rebate: 12500 },
    },
    new: {
      slabs: [
        { upto: 300000, rate: 0 },
        { upto: 600000, rate: 0.05 },
        { upto: 900000, rate: 0.1 },
        { upto: 1200000, rate: 0.15 },
        { upto: 1500000, rate: 0.2 },
        { upto: Infinity, rate: 0.3 },
      ],
      standard_deduction: 75000,
      rebate_87a: { income_limit: 700000, max_rebate: 25000 },
      surcharge_max_rate: 0.25,
    },
  },
  "2025-26": {
    fy: "2025-26",
    ay: "2026-27",
    old: {
      slabs: [
        { upto: 250000, rate: 0 },
        { upto: 500000, rate: 0.05 },
        { upto: 1000000, rate: 0.2 },
        { upto: Infinity, rate: 0.3 },
      ],
      standard_deduction: 50000,
      rebate_87a: { income_limit: 500000, max_rebate: 12500 },
    },
    new: {
      // Budget 2025 (Union Budget Feb 1, 2025) - effective FY 2025-26
      slabs: [
        { upto: 400000, rate: 0 },
        { upto: 800000, rate: 0.05 },
        { upto: 1200000, rate: 0.1 },
        { upto: 1600000, rate: 0.15 },
        { upto: 2000000, rate: 0.2 },
        { upto: 2400000, rate: 0.25 },
        { upto: Infinity, rate: 0.3 },
      ],
      standard_deduction: 75000,
      // Rebate raised to ₹60,000 — effectively zero tax for income ≤ ₹12L (₹12.75L salaried)
      rebate_87a: { income_limit: 1200000, max_rebate: 60000 },
      surcharge_max_rate: 0.25,
    },
  },
};

const DEFAULT_FY = "2025-26";

const DEDUCTION_LIMITS = {
  sec_80c: 150000,
  sec_80d_self: 25000,
  sec_80d_parents: 25000,
  sec_80d_parents_senior: 50000,
  sec_80ccd_1b: 50000,
  sec_24b_home_loan: 200000,
  sec_80tta: 10000,
  sec_80ttb: 50000,
  sec_80gg: 60000,
  sec_80eea: 150000,
  // 80E (education loan interest) and 80G (donations) have no fixed cap
};

function applySlabs(taxable, slabs) {
  let tax = 0;
  let prev = 0;
  for (const slab of slabs) {
    if (taxable <= prev) break;
    const chunk = Math.min(taxable, slab.upto) - prev;
    tax += chunk * slab.rate;
    prev = slab.upto;
  }
  return tax;
}

function calcSurcharge(tax, taxable, maxRate) {
  let rate = 0;
  if (taxable > 50000000) rate = 0.37;
  else if (taxable > 20000000) rate = 0.25;
  else if (taxable > 10000000) rate = 0.15;
  else if (taxable > 5000000) rate = 0.1;
  if (maxRate != null) rate = Math.min(rate, maxRate);
  return tax * rate;
}

// Section 87A rebate with marginal relief
function applyRebate87A(tax, taxable, rebate_87a) {
  const { income_limit, max_rebate } = rebate_87a;
  if (taxable <= income_limit) {
    return Math.max(0, tax - Math.min(tax, max_rebate));
  }
  // Income above threshold: cap tax at excess over limit (marginal relief)
  const extra = taxable - income_limit;
  return Math.min(tax, extra);
}

const round = (n) => Math.round(n);

function computeHraExemption({ basic, hra, rent_paid, metro }) {
  if (!hra || !rent_paid) return 0;
  const ten_percent_basic = 0.1 * basic;
  const metro_cap = (metro ? 0.5 : 0.4) * basic;
  const excess = Math.max(0, rent_paid - ten_percent_basic);
  return Math.max(0, Math.min(hra, metro_cap, excess));
}

// 80GG rent deduction (for those without HRA component)
function compute80GG({ rent_paid = 0, gross = 0, has_hra = false }) {
  if (has_hra || rent_paid <= 0) return 0;
  const ten_percent_gross = 0.1 * gross;
  const excess_rent = Math.max(0, rent_paid - ten_percent_gross);
  const fixed_cap = DEDUCTION_LIMITS.sec_80gg;
  const twenty_five_percent = 0.25 * gross;
  return Math.min(excess_rent, fixed_cap, twenty_five_percent);
}

function fmt(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }

function generateSavingsTips({ best, old_total, new_total, ded_80c, ded_80ccd1b, deductions }) {
  const tips = [];
  const remaining_80c = Math.max(0, DEDUCTION_LIMITS.sec_80c - ded_80c);
  const remaining_nps = Math.max(0, DEDUCTION_LIMITS.sec_80ccd_1b - ded_80ccd1b);
  const savings = Math.abs(old_total - new_total);

  if (best === "old") {
    if (remaining_80c > 0) {
      tips.push({ title: `Invest ${fmt(remaining_80c)} more under 80C`, detail: `Use ELSS, PPF, or NSC to reduce taxable income by ${fmt(remaining_80c)}.`, color: "green" });
    }
    if (remaining_nps > 0) {
      tips.push({ title: `NPS gives extra ${fmt(remaining_nps)} deduction under 80CCD(1B)`, detail: `NPS Tier-1 up to ${fmt(remaining_nps)} gives deduction OVER your 80C limit.`, color: "blue" });
    }
    if (!deductions.sec_80d_self) {
      tips.push({ title: "Health insurance — save up to ₹25,000 under 80D", detail: "Premium for yourself, spouse, and children. Up to ₹25,000 deductible.", color: "purple" });
    }
    if (!deductions.sec_24b_home_loan) {
      tips.push({ title: "Home loan interest deductible up to ₹2L under 24(b)", detail: "Interest on self-occupied home loan up to ₹2,00,000/year.", color: "amber" });
    }
  } else {
    tips.push({ title: `New regime saves ${fmt(savings)}/year`, detail: `Your tax is ${fmt(savings)} lower in new regime. No need to lock money in tax-saving instruments.`, color: "green" });
    tips.push({ title: "Employer NPS still works in new regime", detail: "Employer NPS contribution under 80CCD(2) is allowed even in new regime — ask HR to restructure.", color: "blue" });
  }

  if (tips.length === 0) {
    tips.push({ title: "All major deductions claimed", detail: "Consider 80E (education loan), 80G (donations), or 80TTA (savings bank interest).", color: "slate" });
  }
  return tips;
}

function calculateTax(input) {
  const {
    basic = 0,
    hra = 0,
    allowances = 0,
    bonuses = 0,
    other_income = 0,
    pf = 0,
    professional_tax = 0,
    rent_paid = 0,
    metro = false,
    is_senior_citizen = false,
    parents_senior_citizen = false,
    deductions = {},
    fy = DEFAULT_FY,
  } = input;

  const config = TAX_CONFIG[fy] || TAX_CONFIG[DEFAULT_FY];
  const gross = basic + hra + allowances + bonuses + other_income;
  const has_hra = hra > 0;

  // --- HRA exemption ---
  const hra_exempt = computeHraExemption({ basic, hra, rent_paid, metro });

  // --- 80C: PF counts toward 80C ---
  const ded_80c = Math.min((deductions.sec_80c || 0) + pf, DEDUCTION_LIMITS.sec_80c);

  // --- 80D: health insurance ---
  const d80d_self_limit = is_senior_citizen ? 50000 : DEDUCTION_LIMITS.sec_80d_self;
  const d80d_parents_limit = parents_senior_citizen
    ? DEDUCTION_LIMITS.sec_80d_parents_senior
    : DEDUCTION_LIMITS.sec_80d_parents;
  const ded_80d = Math.min(deductions.sec_80d_self || 0, d80d_self_limit) +
    Math.min(deductions.sec_80d_parents || 0, d80d_parents_limit);

  // --- 80CCD(1B): NPS over and above 80C ---
  const ded_80ccd1b = Math.min(deductions.sec_80ccd_1b || 0, DEDUCTION_LIMITS.sec_80ccd_1b);

  // --- 24(b): home loan interest ---
  const ded_24b = Math.min(deductions.sec_24b_home_loan || 0, DEDUCTION_LIMITS.sec_24b_home_loan);

  // --- 80E: education loan interest (no upper limit) ---
  const ded_80e = Math.max(0, deductions.sec_80e || 0);

  // --- 80G: donations (user inputs already-calculated eligible amount) ---
  const ded_80g = Math.max(0, deductions.sec_80g || 0);

  // --- 80TTA / 80TTB: savings interest ---
  const tta_limit = is_senior_citizen ? DEDUCTION_LIMITS.sec_80ttb : DEDUCTION_LIMITS.sec_80tta;
  const ded_80tta = Math.min(deductions.sec_80tta || 0, tta_limit);

  // --- 80EEA: additional home loan (affordable housing, no overlap with 24B) ---
  const ded_80eea = Math.min(deductions.sec_80eea || 0, DEDUCTION_LIMITS.sec_80eea);

  // --- 80GG: rent deduction (only if no HRA received) ---
  const ded_80gg = compute80GG({ rent_paid, gross, has_hra });

  // === OLD REGIME ===
  const old_cfg = config.old;
  const old_deductions = {
    standard_deduction: old_cfg.standard_deduction,
    hra_exemption: round(hra_exempt),
    professional_tax: Math.min(professional_tax, 2500),
    sec_80c: ded_80c,
    sec_80d: round(ded_80d),
    sec_80ccd_1b: ded_80ccd1b,
    sec_24b_home_loan: ded_24b,
    sec_80e: round(ded_80e),
    sec_80g: round(ded_80g),
    sec_80tta: round(ded_80tta),
    sec_80eea: round(ded_80eea),
    sec_80gg: round(ded_80gg),
  };
  const old_total_ded = Object.values(old_deductions).reduce((a, b) => a + b, 0);
  const old_taxable = Math.max(0, gross - old_total_ded);
  let old_base = applySlabs(old_taxable, old_cfg.slabs);
  old_base = applyRebate87A(old_base, old_taxable, old_cfg.rebate_87a);
  const old_sur = calcSurcharge(old_base, old_taxable, null);
  const old_cess = (old_base + old_sur) * CESS_RATE;
  const old_total = round(old_base + old_sur + old_cess);

  // === NEW REGIME ===
  const new_cfg = config.new;
  const new_deductions = { standard_deduction: new_cfg.standard_deduction };
  const new_taxable = Math.max(0, gross - new_cfg.standard_deduction);
  let new_base = applySlabs(new_taxable, new_cfg.slabs);
  new_base = applyRebate87A(new_base, new_taxable, new_cfg.rebate_87a);
  const new_sur = calcSurcharge(new_base, new_taxable, new_cfg.surcharge_max_rate);
  const new_cess = (new_base + new_sur) * CESS_RATE;
  const new_total = round(new_base + new_sur + new_cess);

  // Recommend the regime with the lower payable tax.
  const diff = old_total - new_total;
  const best = old_total < new_total ? "old" : "new";
  const savings = Math.abs(diff);

  const tips = generateSavingsTips({ best, old_total, new_total, ded_80c, ded_80ccd1b, deductions });

  return {
    fy: config.fy,
    ay: config.ay,
    summary: {
      gross_income: round(gross),
      taxable_income_old: round(old_taxable),
      taxable_income_new: round(new_taxable),
      total_deductions_old: round(old_total_ded),
    },
    tax_old_regime: {
      total_tax: old_total,
      base_tax: round(old_base),
      surcharge: round(old_sur),
      cess: round(old_cess),
      taxable_income: round(old_taxable),
      deductions: old_deductions,
    },
    tax_new_regime: {
      total_tax: new_total,
      base_tax: round(new_base),
      surcharge: round(new_sur),
      cess: round(new_cess),
      taxable_income: round(new_taxable),
      deductions: new_deductions,
    },
    pf_details: {
      annual_contribution: round(pf),
      balance: round(pf * (input.years_of_service || 3)),
      years_of_service: input.years_of_service || 3,
    },
    savings_tips: tips,
    recommendation: {
      best_option: best,
      savings: round(savings),
      reason: savings === 0
        ? `Both regimes have the same tax payable. New regime selected by default. Old: ${fmt(old_total)} · New: ${fmt(new_total)}.`
        : best === "old"
        ? `Old regime saves ${fmt(savings)} vs new regime. Your deductions (HRA, 80C, etc.) lower taxable income by ${fmt(old_total_ded)}, making old regime better. Old: ${fmt(old_total)} · New: ${fmt(new_total)}.`
        : `New regime saves ${fmt(savings)} vs old regime. Lower slab rates beat your deductions. Old: ${fmt(old_total)} · New: ${fmt(new_total)}.`,
    },
  };
}

function getRules(fy = DEFAULT_FY) {
  const config = TAX_CONFIG[fy] || TAX_CONFIG[DEFAULT_FY];
  return {
    fy: config.fy,
    ay: config.ay,
    budget_update: fy === "2025-26" ? "Union Budget 2025 (Feb 1, 2025)" : "Finance Act 2024",
    old_regime: {
      slabs: config.old.slabs,
      standard_deduction: config.old.standard_deduction,
      rebate_87a: config.old.rebate_87a,
    },
    new_regime: {
      slabs: config.new.slabs,
      standard_deduction: config.new.standard_deduction,
      rebate_87a: config.new.rebate_87a,
      note:
        fy === "2025-26"
          ? "No tax for income up to ₹12L (₹12.75L for salaried after std deduction). 25% surcharge cap."
          : "No tax for income up to ₹7L. 25% surcharge cap.",
    },
    deduction_limits: DEDUCTION_LIMITS,
    cess_rate: CESS_RATE,
    supported_fy: Object.keys(TAX_CONFIG),
    itr_due_date: fy === "2025-26" ? "July 31, 2026 (non-audit)" : "July 31, 2025 (non-audit)",
  };
}

module.exports = { calculateTax, getRules, DEDUCTION_LIMITS, TAX_CONFIG, DEFAULT_FY };
