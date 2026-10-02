const mongoose = require("mongoose");

const advertisementSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      url: String,
      name: String,
      awsId: String,
    },
    websiteLink: {
      type: String,
      trim: true,
      default: "",
    },
    displayOn: {
      type: [String],
      default: [],
    },
    priority: {
      type: Number,
      default: 0,
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

advertisementSchema.index({ priority: 1 });
advertisementSchema.index({ displayOn: 1, active: 1, priority: 1 });

const Advertisement = mongoose.model("Advertisement", advertisementSchema);

module.exports = Advertisement;
