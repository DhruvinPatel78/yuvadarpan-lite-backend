const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  active: Boolean,
  createdAt: Date,
  updatedAt: Date,
  createdBy: String,
  updatedBy: String,
});

const Role = mongoose.model("Role", roleSchema);

module.exports = Role;
