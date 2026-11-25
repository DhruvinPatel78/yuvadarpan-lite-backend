const mongoose = require("mongoose");

const slugHistorySchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    entityType: {
      type: String,
      required: true,
      enum: ["YuvaList"],
      default: "YuvaList",
    },
    entityId: {
      type: String,
      required: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false },
);

module.exports = mongoose.model("SlugHistory", slugHistorySchema);
