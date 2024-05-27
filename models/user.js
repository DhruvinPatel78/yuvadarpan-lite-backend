const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
  },
  middleName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  mobile: {
    type: String,
    required: true,
  },
  familyId: {
    type: Number,
    required: true,
  },
  dob:{
    type: String,
    required: true,
  },
  active: Boolean,
  allowed: Boolean,
  role: String,
  createdAt:Date,
  updatedAt:Date,
  createdBy:String,
  updatedBy:String,
});

const User = mongoose.model("User", userSchema);

module.exports = User;
