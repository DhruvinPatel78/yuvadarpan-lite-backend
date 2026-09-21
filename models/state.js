const mongoose = require("mongoose");
const { withMasterName, masterNameFields } = require("../utils/masterName");

const stateSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  name: masterNameFields,
  country_id: {
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

withMasterName(stateSchema);

const State = mongoose.model("State", stateSchema);

module.exports = State;
