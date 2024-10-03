const mongoose = require("mongoose");

const regionSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
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
});

const Region = mongoose.model("Region", regionSchema);

module.exports = Region;
