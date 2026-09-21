const mongoose = require("mongoose");
const { withMasterName, masterNameFields } = require("../utils/masterName");

const surNameSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  name: masterNameFields,
  gotra: {
    type: String,
    required: true,
  },
  mainBranch: {
    type: String,
    default: "",
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

withMasterName(surNameSchema);

const Surname = mongoose.model("Surname", surNameSchema);

module.exports = Surname;
