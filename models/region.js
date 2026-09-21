const mongoose = require("mongoose");
const { withMasterName, masterNameFields } = require("../utils/masterName");

const regionSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  name: masterNameFields,
  country_id: {
    type: String,
    required: true,
  },
  state_id: {
    type: String,
    required: true,
  },
  active: Boolean,
  createdAt: Date,
  updatedAt: Date,
  createdBy: String,
  updatedBy: String,
}, {
    toJSON: {
        virtuals: true,
        transform: (doc, ret) => {
            ret.id = ret._id;
            delete ret._id;
            return ret;
        }
    }
});

withMasterName(regionSchema);

const Region = mongoose.model("Region", regionSchema);

module.exports = Region;
