const mongoose = require("mongoose");

const changeSchema = new mongoose.Schema(
  {
    field: String,
    label: String,
    from: mongoose.Schema.Types.Mixed,
    to: mongoose.Schema.Types.Mixed,
  },
  { _id: false },
);

const activityLogSchema = new mongoose.Schema({
  actorId: { type: String, required: true, index: true },
  actorName: { type: String, default: "" },
  actorRole: { type: String, default: "" },
  action: {
    type: String,
    required: true,
    enum: ["create", "update", "delete", "approve", "reject"],
    index: true,
  },
  entityType: {
    type: String,
    required: true,
    enum: ["user", "yuva", "samaj", "city", "district", "region", "state", "country"],
    index: true,
  },
  entityId: { type: String, default: "", index: true },
  entityLabel: { type: String, default: "" },
  summary: { type: String, default: "" },
  changes: { type: [changeSchema], default: [] },
  snapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true },
});

activityLogSchema.index({ createdAt: -1 });

activityLogSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("ActivityLog", activityLogSchema);
