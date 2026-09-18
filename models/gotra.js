const mongoose = require("mongoose");

const gotraSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
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
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  },
);

const Gotra = mongoose.model("Gotra", gotraSchema);

module.exports = Gotra;
