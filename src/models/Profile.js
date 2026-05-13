const mongoose = require("mongoose");

const ProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, required: true },
    pan: { type: String, default: "" },
    phone: { type: String, default: "" },
    salary: { type: mongoose.Schema.Types.Mixed, default: {} },
    tax_input: { type: mongoose.Schema.Types.Mixed, default: {} },
    last_result: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Profile", ProfileSchema);
