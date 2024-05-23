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
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 5, // The document will be automatically deleted after 5 minutes of its creation time
  },
});

// Define a function to send emails
async function sendVerificationEmail(email, otp) {
  // Send the email using our custom mailSender Function
  try {
    await mailSender(
      email,
      "Verification Email",
      `<h1 style="font-weight: bold">Verification code</h1>
            <p>Please use the verification code below to forget password</p>
            <p style="font-weight: bold;font-size: 18px;">${otp}</p>
            <p>If you didn't request this, you can ignore this email</p>
            <span>Thanks,</span>
            <span>The Yuvadarpan team</span>
            `
    );
  } catch (error) {
    throw error;
  }
}

OTPSchema.pre("save", async function (next) {
  // Only send an email when a new document is created
  if (this.isNew) {
    await sendVerificationEmail(this.email, this.otp);
  }
  next();
});

const OTP = mongoose.model("OTP", OTPSchema);

module.exports = OTP;
