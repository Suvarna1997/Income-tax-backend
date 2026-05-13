const express = require("express");
const { getInvestmentSuggestions } = require("../services/investmentService");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, (req, res) => {
  res.json({ ok: true, suggestions: getInvestmentSuggestions({}) });
});

router.post("/", requireAuth, (req, res) => {
  const body = req.body || {};
  const suggestions = getInvestmentSuggestions({
    pf: body.pf || 0,
    deductions: body.deductions || {},
  });
  res.json({ ok: true, suggestions });
});

module.exports = router;
