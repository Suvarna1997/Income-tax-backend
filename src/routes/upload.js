const express = require("express");
const multer = require("multer");
const { parseSalarySlipText, parsePdfBuffer } = require("../services/salaryParser");
const Profile = require("../models/Profile");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post("/", requireAuth, upload.single("file"), async (req, res, next) => {
  try {
    let result = null;
    let source = null;

    if (req.file) {
      const { mimetype, originalname, buffer } = req.file;
      const isPdf = mimetype === "application/pdf" || originalname.toLowerCase().endsWith(".pdf");
      const isText = mimetype.startsWith("text/") || originalname.toLowerCase().endsWith(".txt");
      if (isPdf) {
        result = await parsePdfBuffer(buffer);
        source = "pdf";
      } else if (isText) {
        result = parseSalarySlipText(buffer.toString("utf8"));
        source = "text";
      } else {
        return res.status(415).json({
          ok: false,
          error: "Unsupported file type. Upload a PDF or text salary slip, or paste text manually.",
        });
      }
    } else if (req.body && typeof req.body.text === "string") {
      result = parseSalarySlipText(req.body.text);
      source = "text";
    } else {
      return res.status(400).json({ ok: false, error: "No file or text supplied" });
    }

    if (result?.extracted) {
      await Profile.findOneAndUpdate(
        { user: req.user._id },
        { $set: { salary: result.extracted } },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }

    res.json({ ok: true, source, ...result });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
