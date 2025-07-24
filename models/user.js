const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
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
  dob: {
    type: String,
    required: true,
  },
  region: {
    type: String,
    required: true,
  },
  localSamaj: {
    type: String,
    required: true,
  },
  // deviceId: {
  //   type: String,
  //   required: true,
  // },
  active: Boolean,
  allowed: Boolean,
  role: String,
  createdAt: Date,
  updatedAt: Date,
  createdBy: String,
  gender: String,
  updatedBy: String,
  fcmToken: { type: String },
});

const User = mongoose.model("User", userSchema);

module.exports = User;
