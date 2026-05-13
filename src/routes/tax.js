const express = require("express");
const { calculateTax, getRules } = require("../services/taxEngine");
const { getPfDetails } = require("../services/pfService");
const { getInvestmentSuggestions } = require("../services/investmentService");
const Profile = require("../models/Profile");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/calculate", requireAuth, async (req, res, next) => {
  try {
    const input = req.body || {};
    const tax = calculateTax(input);
    const pf_details = getPfDetails({
      basic: input.basic || 0,
      years_of_service: input.years_of_service || 3,
    });
    const investment_suggestions = getInvestmentSuggestions({
      pf: input.pf || 0,
      deductions: input.deductions || {},
    });

    const result = { ...tax, pf_details, investment_suggestions };

    await Profile.findOneAndUpdate(
      { user: req.user._id },
      { $set: { tax_input: input, last_result: result } },
      { upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
});

// Returns current tax regime rules — useful for displaying slabs to users
router.get("/rules", requireAuth, (req, res) => {
  const fy = req.query.fy;
  res.json({ ok: true, rules: getRules(fy) });
});

module.exports = router;
