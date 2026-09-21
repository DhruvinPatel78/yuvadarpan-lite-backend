const mongoose = require("mongoose");
const { withMasterName, masterNameFields } = require("../utils/masterName");

const countrySchema = new mongoose.Schema({
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
            ret.id = ret._id;
            delete ret._id;
            return ret;
        }
    }
});

withMasterName(countrySchema);

const Country = mongoose.model("Country", countrySchema);

module.exports = Country;
