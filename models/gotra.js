const mongoose = require("mongoose");
const { withMasterName, masterNameFields } = require("../utils/masterName");

const gotraSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    name: masterNameFields,
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
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  },
);

withMasterName(gotraSchema);

const Gotra = mongoose.model("Gotra", gotraSchema);

module.exports = Gotra;
