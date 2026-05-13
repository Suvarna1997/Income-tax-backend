require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const connectDB = require("./src/config/db");

const authRoutes = require("./src/routes/auth");
const profileRoutes = require("./src/routes/profile");
const taxRoutes = require("./src/routes/tax");
const pfRoutes = require("./src/routes/pf");
const investmentRoutes = require("./src/routes/investments");
const uploadRoutes = require("./src/routes/upload");
const itrRoutes = require("./src/routes/itr");

const app = express();
const PORT = process.env.PORT || 5000;

const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";
app.use(
  cors({
    origin: corsOrigin.split(",").map((s) => s.trim()),
    credentials: true,
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());
app.use(morgan("dev"));

app.get("/health", (req, res) => res.json({ ok: true, service: "incometax-backend" }));

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/tax", taxRoutes);
app.use("/api/pf", pfRoutes);
app.use("/api/investments", investmentRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/itr", itrRoutes);

app.use((req, res) => res.status(404).json({ ok: false, error: "Not found" }));

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ ok: false, error: err.message || "Server error" });
});

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Backend listening on :${PORT}`));
});
