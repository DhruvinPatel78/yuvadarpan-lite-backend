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
    jwt.verify(
      authHeader.replace("Bearer", ""),
      process.env.JWT_SECRET,
      (error, res) => {
        if (res) {
          req.user = {
            email: res.email,
            role: res.role,
            id: res.id,
          };
        } else {
          req.error = {
            message: error.name,
          };
        }
      }
    );
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
    const { id, role } = req.user;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    if (role === "ADMIN") {
      const users = await User.find({}).skip(offset).limit(limit).exec();
      const totalItems = await User.countDocuments({});
      const totalPages = Math.ceil(totalItems / limit);
      res
        .status(200)
        .json({ total: totalItems, page, totalPages, data: users });
    } else if (role === "REGION_MANAGER") {
      const mangerRegion = await User.findById(id);
      if (mangerRegion?.region) {
        const MangerUsers = await User.find({
          region: { $eq: mangerRegion?.region },
        })
          .skip(offset)
          .limit(limit)
          .exec();
        const managerTotalItem = await User.find({
          region: { $eq: mangerRegion?.region },
        }).countDocuments({});
        const totalPages = Math.ceil(managerTotalItem / limit);
        res.status(200).json({
          total: managerTotalItem,
          page,
          totalPages,
          data: MangerUsers,
        });
      }
    } else if (role === "SAMAJ_MANAGER") {
      const mangerSamaj = await User.findById(id);
      if (mangerSamaj?.localSamaj) {
        const MangerUsers = await User.find({
          localSamaj: { $eq: mangerSamaj?.localSamaj },
        })
          .skip(offset)
          .limit(limit)
          .exec();
        const managerTotalItem = await User.find({
          localSamaj: { $eq: mangerSamaj?.localSamaj },
        }).countDocuments({});
        const totalPages = Math.ceil(managerTotalItem / limit);
        res.status(200).json({
          total: managerTotalItem,
          page,
          totalPages,
          data: MangerUsers,
        });
      }
    }
  }
});

router.get("/requests", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { id, role } = req.user;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    if (role === "ADMIN") {
      const users = await User.find({
        allowed: { $eq: false },
        active: true,
      })
        .skip(offset)
        .limit(limit)
        .exec();
      const totalItems = await User.find({
        allowed: { $eq: false },
        active: true,
      }).countDocuments({});
      const totalPages = Math.ceil(totalItems / limit);
      res
        .status(200)
        .json({ total: totalItems, page, totalPages, data: users });
    } else if (role === "REGION_MANAGER") {
      const mangerRegion = await User.findById(id);
      if (mangerRegion?.region) {
        const MangerUsers = await User.find({
          allowed: { $eq: false },
          active: true,
          region: { $eq: mangerRegion?.region },
        })
          .skip(offset)
          .limit(limit)
          .exec();
        const managerTotalItem = await User.find({
          allowed: { $eq: false },
          active: true,
          region: { $eq: mangerRegion?.region },
        }).countDocuments({});
        const totalPages = Math.ceil(managerTotalItem / limit);
        res.status(200).json({
          total: managerTotalItem,
          page,
          totalPages,
          data: MangerUsers,
        });
      }
    } else if (role === "SAMAJ_MANAGER") {
      const mangerSamaj = await User.findById(id);
      if (mangerSamaj?.localSamaj) {
        const MangerUsers = await User.find({
          allowed: { $eq: false },
          active: true,
          localSamaj: { $eq: mangerSamaj?.localSamaj },
        })
          .skip(offset)
          .limit(limit)
          .exec();
        const managerTotalItem = await User.find({
          allowed: { $eq: false },
          active: true,
          localSamaj: { $eq: mangerSamaj?.localSamaj },
        }).countDocuments({});
        const totalPages = Math.ceil(managerTotalItem / limit);
        res.status(200).json({
          total: managerTotalItem,
          page,
          totalPages,
          data: MangerUsers,
        });
      }
    }
  }
});

router.post("/signUp", async (req, res) => {
  const user = req.body;
  user.password = await bcrypt.hash(user.password, 10);
  const dbUser = await User.create({
    ...user,
    id: crypto.randomUUID().replace(/-/g, ""),
    createdAt: new Date(),
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
    active: true,
    allowed: false,
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
          { email: dbUser.email, role: dbUser.role, id: dbUser.id },
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
    const payload = { ...req.body };
    if (payload?.password) {
      payload.password = await bcrypt.hash(payload.password, 10);
    }
    await User.updateOne(
      { _id: req.body.id },
      { ...payload, updatedAt: new Date(), updatedBy: req.body.id }
    );
    res.status(200).json({ message: "Updated Successfully" });
  }
});

router.patch("/forgotPassword", async (req, res) => {
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
});

router.patch("/approveRejectMany", async (req, res) => {
  if (!errorCheck(req, res)) {
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
    res.status(200).json({ message: "Updated Successfully" });
  }
});

module.exports = router;
