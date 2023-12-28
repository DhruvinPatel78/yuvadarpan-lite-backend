const mongoose = require("mongoose");

const yuvaSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  }
});

const Yuva = mongoose.model("Yuva", yuvaSchema);

module.exports = Yuva;
