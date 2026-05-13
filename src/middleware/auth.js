const jwt = require("jsonwebtoken");
const User = require("../models/User");

const SECRET = process.env.AUTH_SECRET || "dev-insecure-secret-change-me";
const COOKIE_NAME = process.env.COOKIE_NAME || "taxwise_token";
const EXPIRES_IN = "7d";

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), email: user.email, name: user.name }, SECRET, {
    expiresIn: EXPIRES_IN,
  });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res) {
  res.cookie(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

async function requireAuth(req, res, next) {
  const token =
    req.cookies?.[COOKIE_NAME] ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null);
  if (!token) return res.status(401).json({ ok: false, error: "Unauthorized" });
  const claims = verifyToken(token);
  if (!claims) return res.status(401).json({ ok: false, error: "Invalid token" });
  const user = await User.findById(claims.sub);
  if (!user) return res.status(401).json({ ok: false, error: "User not found" });
  req.user = user;
  next();
}

module.exports = { signToken, verifyToken, setAuthCookie, clearAuthCookie, requireAuth, COOKIE_NAME };
