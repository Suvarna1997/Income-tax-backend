const { DEDUCTION_LIMITS } = require("./taxEngine");

function getInvestmentSuggestions({ pf = 0, deductions = {} } = {}) {
  const used_80c = Math.min((deductions.sec_80c || 0) + pf, DEDUCTION_LIMITS.sec_80c);
  const remaining_80c = Math.max(0, DEDUCTION_LIMITS.sec_80c - used_80c);

  const used_80d = Math.min(
    (deductions.sec_80d_self || 0) + (deductions.sec_80d_parents || 0),
    DEDUCTION_LIMITS.sec_80d_self + DEDUCTION_LIMITS.sec_80d_parents
  );
  const remaining_80d = Math.max(0, DEDUCTION_LIMITS.sec_80d_self - Math.min(deductions.sec_80d_self || 0, DEDUCTION_LIMITS.sec_80d_self));

  const used_80ccd1b = Math.min(deductions.sec_80ccd_1b || 0, DEDUCTION_LIMITS.sec_80ccd_1b);
  const remaining_80ccd1b = Math.max(0, DEDUCTION_LIMITS.sec_80ccd_1b - used_80ccd1b);

  const suggestions = [];

  if (remaining_80c > 0) {
    suggestions.push({
      section: "80C",
      remaining_limit: remaining_80c,
      options: [
        { name: "PPF (Public Provident Fund)", risk: "Low", lock_in: "15 years", returns: "~7.1%", description: "Government-backed savings. Interest is tax-free." },
        { name: "ELSS (Equity-Linked Saving Scheme)", risk: "Medium-High", lock_in: "3 years", returns: "~12-15%", description: "Mutual fund that invests in stocks. Shortest lock-in among 80C options." },
        { name: "LIC / Life Insurance Premium", risk: "Low", lock_in: "Policy term", returns: "~5-6%", description: "Also provides life cover. Premium paid qualifies for 80C." },
        { name: "5-Year Tax Saver FD", risk: "Low", lock_in: "5 years", returns: "~6.5-7%", description: "Fixed deposit with guaranteed returns and 80C benefit." },
        { name: "NSC (National Savings Certificate)", risk: "Low", lock_in: "5 years", returns: "~7.7%", description: "Post-office savings scheme. Interest earned is reinvested and also qualifies for 80C." },
        { name: "Sukanya Samriddhi Yojana", risk: "Low", lock_in: "Till girl turns 21", returns: "~8.2%", description: "Only for girl child (below 10 years). High interest, fully tax-exempt." },
      ],
      note: `You can still invest up to ₹${remaining_80c.toLocaleString("en-IN")} under Section 80C this FY to reduce taxable income.`,
    });
  }

  if (remaining_80d > 0) {
    suggestions.push({
      section: "80D",
      remaining_limit: remaining_80d,
      options: [
        {
          name: "Self + Family Health Insurance",
          risk: "N/A",
          lock_in: "Annual renewal",
          returns: "Health cover",
          description: "Premiums for health insurance covering you, spouse, and children qualify. Up to ₹25,000 for self, ₹50,000 if you are a senior citizen.",
        },
        {
          name: "Parents' Health Insurance",
          risk: "N/A",
          lock_in: "Annual renewal",
          returns: "Health cover",
          description: "Additional ₹25,000 (or ₹50,000 if parents are senior citizens) for parents' health insurance.",
        },
      ],
      note: `Health insurance premiums up to ₹${remaining_80d.toLocaleString("en-IN")} more can be claimed under 80D.`,
    });
  }

  if (remaining_80ccd1b > 0) {
    suggestions.push({
      section: "80CCD(1B)",
      remaining_limit: remaining_80ccd1b,
      options: [
        {
          name: "NPS (National Pension System) Tier-1",
          risk: "Medium",
          lock_in: "Till age 60",
          returns: "~9-11%",
          description: "Extra ₹50,000 deduction OVER AND ABOVE the ₹1.5L 80C limit. Long-term retirement fund managed by pension fund managers.",
        },
      ],
      note: `NPS investment of ₹${remaining_80ccd1b.toLocaleString("en-IN")} more gives additional tax deduction beyond your 80C limit.`,
    });
  }

  if (!deductions.sec_24b_home_loan) {
    suggestions.push({
      section: "24(b)",
      remaining_limit: DEDUCTION_LIMITS.sec_24b_home_loan,
      options: [
        {
          name: "Home Loan Interest",
          risk: "N/A",
          lock_in: "Loan tenure",
          returns: "Tax + Asset",
          description: "Interest paid on home loan (self-occupied property) up to ₹2,00,000 per year is deductible under old regime.",
        },
      ],
      note: "If you have a home loan, interest paid (up to ₹2L/year) can be claimed under Section 24(b) in old regime.",
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      section: "ALL",
      remaining_limit: 0,
      options: [],
      note: "You've maxed out common deduction sections. Consider: home loan interest (24B), donations to eligible NGOs (80G), education loan interest (80E), or savings account interest (80TTA).",
    });
  }

  return suggestions;
}

module.exports = { getInvestmentSuggestions };
