const express = require("express");
const { getPfDetails } = require("../services/pfService");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/details", requireAuth, (req, res) => {
  const basic = parseFloat(req.query.basic || "0") || 0;
  const years = parseInt(req.query.years || "3", 10) || 3;
  const data = getPfDetails({ basic, years_of_service: years });
  res.json({ ok: true, ...data });
});

module.exports = router;
