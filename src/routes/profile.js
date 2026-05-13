const express = require("express");
const Profile = require("../models/Profile");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    let profile = await Profile.findOne({ user: req.user._id });
    if (!profile) profile = await Profile.create({ user: req.user._id });
    res.json({ ok: true, profile: serialize(profile) });
  } catch (e) {
    next(e);
  }
});

router.put("/", requireAuth, async (req, res, next) => {
  try {
    const allowed = ["pan", "phone", "salary", "tax_input", "last_result"];
    const update = {};
    for (const k of allowed) if (k in (req.body || {})) update[k] = req.body[k];

    const profile = await Profile.findOneAndUpdate(
      { user: req.user._id },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ ok: true, profile: serialize(profile) });
  } catch (e) {
    next(e);
  }
});

function serialize(p) {
  if (!p) return {};
  return {
    pan: p.pan || "",
    phone: p.phone || "",
    salary: p.salary || {},
    tax_input: p.tax_input || {},
    last_result: p.last_result || null,
    updated_at: p.updatedAt ? p.updatedAt.toISOString() : null,
  };
}

module.exports = router;
