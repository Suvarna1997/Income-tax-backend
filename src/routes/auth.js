const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Profile = require("../models/Profile");
const { signToken, setAuthCookie, clearAuthCookie, requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, error: "Name, email and password required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ ok: false, error: "Password must be at least 6 characters" });
    }
    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) return res.status(409).json({ ok: false, error: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash });
    await Profile.create({ user: user._id });

    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({ ok: true, user: user.toPublic(), token });
  } catch (e) {
    next(e);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const user = await User.findOne({ email: String(email || "").toLowerCase() });
    if (!user) return res.status(401).json({ ok: false, error: "Invalid email or password" });
    const ok = await bcrypt.compare(password || "", user.passwordHash);
    if (!ok) return res.status(401).json({ ok: false, error: "Invalid email or password" });
    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({ ok: true, user: user.toPublic(), token });
  } catch (e) {
    next(e);
  }
});

router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user.toPublic() });
});

module.exports = router;
