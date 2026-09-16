const mongoose = require("mongoose");
const mailSender = require("../utils/mailSender");

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

async function sendVerificationEmail(email, otp) {
  await mailSender(
    email,
    "Yuvadarpan verification code",
    `<h1 style="font-weight: bold">Verification code</h1>
            <p>Please use the verification code below to change your password</p>
            <p style="font-weight: bold;font-size: 18px;">${otp}</p>
            <p>If you didn't request this, you can ignore this email</p>
            <span>Thanks,</span>
            <span>The Yuvadarpan team</span>
            `,
  );
}

const OTP = mongoose.model("OTP", OTPSchema);
OTP.sendVerificationEmail = sendVerificationEmail;

module.exports = OTP;
