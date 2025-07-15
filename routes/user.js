const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const OtpGenerator = require("otp-generator");
const OTP = require("../models/OTP");
const Region = require("../models/region");

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
      },
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
    const {
      lastName = [],
      state = [],
      region = [],
      samaj = [],
      familyId,
      firstName,
      mobile,
      email,
      gender,
      roles = [],
    } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const Roles =
      roles?.length > 0
        ? {
            role: { $in: roles },
          }
        : {};
    const LastName =
      lastName?.length > 0
        ? {
            lastName: { $in: lastName },
          }
        : {};
    const FamilyId = familyId
      ? {
          familyId: { $eq: familyId },
        }
      : {};
    const FirstName = firstName
      ? {
          firstName: { $eq: firstName },
        }
      : {};
    const Mobile = mobile
      ? {
          mobile: { $eq: mobile },
        }
      : {};
    const Email = email
      ? {
          email: { $eq: email },
        }
      : {};
    const Gender = gender
      ? {
          gender: { $eq: gender },
        }
      : {};

    const RegionData = await Region.findOne({
      state_id: { $in: state },
    });
    const State = RegionData
      ? {
          region: { $eq: RegionData?.id },
        }
      : {};
    const CurrentRegion =
      region?.length > 0
        ? {
            region: { $in: region },
          }
        : {};
    const CurrentSamaj =
      samaj?.length > 0
        ? {
            localSamaj: { $in: samaj },
          }
        : {};
    const filterSearch = {
      ...LastName,
      ...State,
      ...CurrentRegion,
      ...CurrentSamaj,
      ...FamilyId,
      ...FirstName,
      ...Mobile,
      ...Gender,
      ...Email,
      ...Roles,
    };
    if (role === "ADMIN") {
      const users = await User.find({ ...filterSearch })
        .skip(offset)
        .limit(limit)
        .exec();
      const totalItems = await User.countDocuments({ ...filterSearch });
      const totalPages = Math.ceil(totalItems / limit);
      res
        .status(200)
        .json({ total: totalItems, page, totalPages, data: users });
    } else if (role === "REGION_MANAGER") {
      const mangerRegion = await User.findById(id);
      if (mangerRegion?.region) {
        const MangerUsers = await User.find({
          region: { $eq: mangerRegion?.region },
          ...filterSearch,
        })
          .skip(offset)
          .limit(limit)
          .exec();
        const managerTotalItem = await User.find({
          region: { $eq: mangerRegion?.region },
          ...filterSearch,
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
          ...filterSearch,
        })
          .skip(offset)
          .limit(limit)
          .exec();
        const managerTotalItem = await User.find({
          localSamaj: { $eq: mangerSamaj?.localSamaj },
          ...filterSearch,
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
    const {
      lastName = [],
      state = [],
      region = [],
      samaj = [],
      familyId,
      firstName,
      mobile,
      email,
      gender,
      roles = [],
    } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const Roles =
      roles?.length > 0
        ? {
            role: { $in: roles },
          }
        : {};
    const LastName =
      lastName?.length > 0
        ? {
            lastName: { $in: lastName },
          }
        : {};
    const FamilyId = familyId
      ? {
          familyId: { $eq: familyId },
        }
      : {};
    const FirstName = firstName
      ? {
          firstName: { $eq: firstName },
        }
      : {};
    const Mobile = mobile
      ? {
          mobile: { $eq: mobile },
        }
      : {};
    const Email = email
      ? {
          email: { $eq: email },
        }
      : {};
    const Gender = gender
      ? {
          gender: { $eq: gender },
        }
      : {};

    const RegionData = await Region.findOne({
      state_id: { $in: state },
    });
    const State = RegionData
      ? {
          region: { $eq: RegionData?.id },
        }
      : {};
    const CurrentRegion =
      region?.length > 0
        ? {
            region: { $in: region },
          }
        : {};
    const CurrentSamaj =
      samaj?.length > 0
        ? {
            localSamaj: { $in: samaj },
          }
        : {};
    const filterSearch = {
      ...LastName,
      ...State,
      ...CurrentRegion,
      ...CurrentSamaj,
      ...FamilyId,
      ...FirstName,
      ...Mobile,
      ...Gender,
      ...Email,
      ...Roles,
    };
    if (role === "ADMIN") {
      const users = await User.find({
        allowed: { $eq: false },
        active: true,
        ...filterSearch,
      })
        .skip(offset)
        .limit(limit)
        .exec();
      const totalItems = await User.find({
        allowed: { $eq: false },
        active: true,
        ...filterSearch,
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
          ...filterSearch,
        })
          .skip(offset)
          .limit(limit)
          .exec();
        const managerTotalItem = await User.find({
          allowed: { $eq: false },
          active: true,
          region: { $eq: mangerRegion?.region },
          ...filterSearch,
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
          ...filterSearch,
        })
          .skip(offset)
          .limit(limit)
          .exec();
        const managerTotalItem = await User.find({
          allowed: { $eq: false },
          active: true,
          localSamaj: { $eq: mangerSamaj?.localSamaj },
          ...filterSearch,
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
  const emailRegex = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/;
  const Email = email
      ? emailRegex.test(email) ? {
        email: { $eq: email },
      } : {
        mobile: { $eq: email },
      }
      : {};
  const dbUser = await User.findOne(Email).lean();

  if (dbUser !== null && dbUser !== undefined) {
    const passwordMatched = await bcrypt.compare(password, dbUser.password);
    if (passwordMatched) {
      if (dbUser?.allowed) {
        const token = jwt.sign(
          { email: dbUser.email, role: dbUser.role, id: dbUser.id },
          process.env.JWT_SECRET,
          {
            expiresIn: "30d",
          },
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

router.post("/add", async (req, res) => {
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

router.patch("/update/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { id } = req.params;
    const payload = { ...req.body };
    if (payload?.password) {
      payload.password = await bcrypt.hash(payload.password, 10);
    }
    await User.updateOne(
      { _id: id },
      { ...payload, updatedAt: new Date(), updatedBy: req?.user.id },
    );
    res.status(200).json({ message: "Updated Successfully" });
  }
});

router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = req.body;
    await User.deleteMany({ id: { $in: data.users } });
    res.status(200).json({ message: "Delete Successfully" });
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
      },
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
      },
    );
    res.status(200).json({ message: "Updated Successfully" });
  }
});

module.exports = router;
