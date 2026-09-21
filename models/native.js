const mongoose = require("mongoose");
const { withMasterName, masterNameFields } = require("../utils/masterName");

const nativeSchema = new mongoose.Schema({
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
}, {
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
        }
    }
});

withMasterName(nativeSchema);

const Native = mongoose.model("Native", nativeSchema);

module.exports = Native;
