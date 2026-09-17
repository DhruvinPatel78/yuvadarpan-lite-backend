const mongoose = require("mongoose");
const { sendOtpEmail } = require("../utils/accountMail");

const OTPSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
  },
  otp: {
    type: String,
    required: true,
  },
  verified: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 300,
  },
});

async function sendVerificationEmail(email, otp, user) {
  await sendOtpEmail(user || email, otp);
}

const OTP = mongoose.model("OTP", OTPSchema);
OTP.sendVerificationEmail = sendVerificationEmail;

module.exports = OTP;
