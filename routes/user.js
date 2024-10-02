const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const OtpGenerator = require("otp-generator");
const OTP = require("../models/OTP");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    jwt.verify(authHeader, process.env.JWT_SECRET, (error, res) => {
      if (res) {
        req.user = {
          email: res.email,
          role: res.role,
        };
      } else {
        req.error = {
          message: error.name,
        };
      }
    });
  } else {
    req.error = {
      message: "no-token",
    };
  }
  next();
};

const errorCheck = (req, res) => {
  if (req.hasOwnProperty("error")) {
    const { message } = req.error;
    res.status(401).send({
      message: message === "no-token" ? "unauthenticated" : "token-expired",
    });
    return true;
  } else {
    return false;
  }
};

router.use(verifyToken);
router.get("/list", async (req, res) => {
  if (!errorCheck(req, res)) {
    const users = await User.find({ role: { $ne: "ADMIN" } });
    res.json(users);
  }
});

router.get("/requests", async (req, res) => {
  if (!errorCheck(req, res)) {
    const users = await User.find({
      allowed: false,
      active: true,
      role: { $ne: "ADMIN" },
    });
    res.json(users);
  }
});

router.post("/signUp", async (req, res) => {
  const user = req.body;
  user.password = await bcrypt.hash(user.password, 10);
  const dbUser = await User.create({
    ...user,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
  });
  res.send(dbUser);
});

router.post("/sendOtp", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { email } = req.body;
    const isUserExist = await User.findOne({ email });
    if (isUserExist) {
      let otp = OtpGenerator.generate(6, {
        upperCaseAlphabets: false,
        lowerCaseAlphabets: false,
        specialChars: false,
      });
      const result = await OTP.findOne({ otp: otp });
      while (result) {
        otp = OtpGenerator.generate(6, {
          upperCaseAlphabets: false,
        });
      }
      const otpPayload = { email, otp };
      await OTP.create(otpPayload);
      res.status(200).json({
        message: `otp-sent-successfully`,
        otp,
      });
    } else {
      res.status(404).send({ message: "email-invalid" });
    }
  }
});
router.post("/verifyOtp", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { email, otp } = req.body;
    const isUserExist = await User.findOne({ email });
    if (isUserExist) {
      const isOtpExist = await OTP.findOne({ otp: otp });
      if (isOtpExist) {
        await OTP.findByIdAndDelete(isOtpExist?.id);
        res.status(200).send({ message: "otp-verify-successfully" });
      } else {
        res.status(404).send({ message: "invalid-otp" });
      }
    } else {
      res.status(404).send({ message: "email-invalid" });
    }
  }
});

router.post("/signIn", async (req, res) => {
  const { email, password } = req.body;
  const dbUser = await User.findOne({ email }).lean();
  if (dbUser !== null && dbUser !== undefined) {
    const passwordMatched = await bcrypt.compare(password, dbUser.password);
    if (passwordMatched) {
      if (dbUser?.allowed) {
        const token = jwt.sign(
          { email: dbUser.email, role: dbUser.role },
          process.env.JWT_SECRET,
          {
            expiresIn: "30d",
          }
        );
        delete dbUser.password;
        res.send({ data: dbUser, token });
      } else {
        res.status(403).send({ message: "your-account-is-not-verified" });
      }
    } else {
      res.status(401).send({ message: "password-or-email-incorrect" });
    }
  } else {
    res.status(401).send({ message: "password-or-email-incorrect" });
  }
});

router.patch("/update/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    await User.updateOne(
      { _id: req.body.id },
      { ...req.body, updatedAt: new Date(), updatedBy: req.body.id }
    );
    const users = await User.find({ role: { $ne: "ADMIN" } });
    res.json(users);
  }
});
router.patch("/forgotPassword", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { email, password } = req.body;
    const isUserExits = await User.findOne({ email });
    if (isUserExits) {
      const newPassword = await bcrypt.hash(password, 10);
      await User.updateOne(
        { _id: isUserExits?.id },
        {
          $set: {
            password: newPassword,
            updatedAt: new Date(),
            updatedBy: isUserExits.id,
          },
        }
      );
      res.status(200).send({ message: "password-update-successfully" });
    } else {
      res.status(404).send({ message: "email-invalid" });
    }
  }
});

router.patch("/approveRejectMany", async (req, res) => {
  if (!errorCheck(req, res)) {
    const d = User.find({ _id: { $ne: req.body.ids } });
    await User.updateMany(
      { _id: { $in: req.body.ids } },
      {
        $set: {
          allowed: req.body.action === "accept",
          active: req.body.action === "accept",
          updatedAt: new Date(),
          updatedBy: req.body.id,
        },
      }
    );
    const users = await User.find({
      allowed: false,
      active: true,
      role: { $ne: "ADMIN" },
    });
    res.json(users);
  }
});

module.exports = router;
