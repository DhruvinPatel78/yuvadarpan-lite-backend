const mongoose = require("mongoose");

const citySchema = new mongoose.Schema({
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
  region_id: {
    type: String,
    required: true,
  },
  district_id: {
    type: String,
    required: true,
  },
  active: Boolean,
  createdAt: Date,
  updatedAt: Date,
  createdBy: String,
  updatedBy: String,
});

const City = mongoose.model("City", citySchema);

module.exports = City;
