const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

UserSchema.method("toPublic", function () {
  return { id: this._id.toString(), name: this.name, email: this.email };
});

module.exports = mongoose.model("User", UserSchema);
