const mongoose = require("mongoose");

const familyIdSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    familyId: {
      type: String,
      required: true,
      trim: true,
    },
    active: Boolean,
    createdAt: Date,
    updatedAt: Date,
    createdBy: String,
    updatedBy: String,
  },
  {
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        const uuid = doc._doc?.id;
        ret.id = ret._id;
        delete ret._id;
        if (uuid && String(uuid) !== String(ret.id)) {
          ret.uuid = uuid;
        }
        return ret;
      },
    },
  }
);

familyIdSchema.index({ familyId: 1 }, { unique: true });

const FamilyId = mongoose.model("FamilyId", familyIdSchema);

module.exports = FamilyId;
