const mongoose = require("mongoose");

const samajSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  label: {
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
  city_id: {
    type: String,
    required: true,
  },
  zipcode: {
    type: Number,
    required: true,
  },
  active: Boolean,
  createdAt: Date,
  updatedAt: Date,
  createdBy: String,
  updatedBy: String,
});

const Samaj = mongoose.model("Samaj", samajSchema);

module.exports = Samaj;
