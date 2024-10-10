const mongoose = require("mongoose");
const mamaInfoSchema = new mongoose.Schema({
  name: String,
  city: String,
  native: String,
});
const contactInfoSchema = new mongoose.Schema({
  name: String,
  phone: Number,
  relation: String,
});
const profileSchema = new mongoose.Schema({
  url: String,
  name: String,
  awsId: String,
});
const yuvaListSchema = new mongoose.Schema({
  familyId: {
    type: String,
    required: true,
  },
  native: {
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
  dob: {
    type: Date,
    default: Date.now,
    required: true,
  },
  motherName: {
    type: String,
    required: true,
  },
  firm: {
    type: String,
    required: true,
  },
  firmAddress: {
    type: String,
    required: true,
  },
  country: {
    type: String,
    required: true,
  },
  state: {
    type: String,
    required: true,
  },
  city: {
    type: String,
    required: true,
  },
  mamaInfo: mamaInfoSchema,
  contactInfo: contactInfoSchema,
  education: {
    type: String,
    // required: true,
  },
  bloodGroup: {
    type: String,
    // required: true,
  },
  height: {
    type: String,
    required: true,
  },
  weight: {
    type: String,
    required: true,
  },
  profile: profileSchema,
  active: Boolean,
  createdAt: Date,
  updatedAt: Date,
  createdBy: String,
  updatedBy: String,
});

const Yuvalist = mongoose.model("YuvaList", yuvaListSchema);

module.exports = Yuvalist;
