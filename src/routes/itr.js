const express = require("express");
const { getRules } = require("../services/taxEngine");

const router = express.Router();

router.get("/rules", (req, res) => {
  res.json({ ok: true, rules: getRules() });
});

module.exports = router;
