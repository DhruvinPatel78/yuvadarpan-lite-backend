const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const OtpGenerator = require("otp-generator");
const OTP = require("../models/OTP");
const Region = require("../models/region");
const { v4: uuidv4 } = require("uuid");
const { sendNotification } = require("../utils/fcm");
const notification = require("../data/locale/notifications.json");

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
        .sort({ id: -1 })
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
          .sort({ id: -1 })
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
          .sort({ id: -1 })
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
        .sort({ id: -1 })
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
          .sort({ id: -1 })
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
          .sort({ id: -1 })
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

router.post("/add", async (req, res) => {
  if (!errorCheck(req, res)) {
    const user = req.body;
    user.password = await bcrypt.hash(user.password, 10);
    const Email = user.email
      ? {
          email: { $eq: user.email },
        }
      : {};
    const emailExist = await User.findOne(Email).lean();
    const Mobile = user.mobile
      ? {
          mobile: { $eq: user.mobile },
        }
      : {};
    const mobileExist = await User.findOne(Mobile).lean();

    if (emailExist || mobileExist) {
      const errorMessage =
        emailExist && mobileExist
          ? "Email-and-Mobile-is-already-exist"
          : emailExist
            ? "Email-is-already-exist"
            : "Mobile-is-already-exist";
      res.status(401).json({ message: errorMessage });
    } else {
      const dbUser = await User.create({
        ...user,
        id: uuidv4().replace(/-/g, ""),
        createdAt: new Date(),
        updatedAt: null,
        createdBy: null,
        updatedBy: null,
        active: true,
        allowed: false,
        fcmToken: user.fcmToken || null,
      });
      // if (dbUser.fcmToken) {
      //   try {
      //     await sendNotification(
      //       dbUser.fcmToken,
      //       "Registration Successful",
      //       "Welcome to Yuvadarpan! Your registration was successful.",
      //     );
      //   } catch (err) {
      //     console.error("FCM notification error:", err);
      //   }
      // }
      res.send(dbUser);
    }
  }
});

router.post("/signup", async (req, res) => {
  const user = req.body;
  user.password = await bcrypt.hash(user.password, 10);
  const Email = user.email
    ? {
        email: { $eq: user.email },
      }
    : {};
  const emailExist = await User.findOne(Email).lean();
  const Mobile = user.mobile
    ? {
        mobile: { $eq: user.mobile },
      }
    : {};
  const mobileExist = await User.findOne(Mobile).lean();

  if (emailExist || mobileExist) {
    const errorMessage =
      emailExist && mobileExist
        ? "Email-and-Mobile-is-already-exist"
        : emailExist
          ? "Email-is-already-exist"
          : "Mobile-is-already-exist";

      user?.fcmToken && await sendNotification(
      user?.fcmToken,
      notification.RegistrationFail.title.en,
      errorMessage,
    );

    res.status(401).json({ message: errorMessage });
  } else {
    const dbUser = await User.create({
      ...user,
      id: uuidv4().replace(/-/g, ""),
      createdAt: new Date(),
      updatedAt: null,
      createdBy: null,
      updatedBy: null,
      active: false,
      allowed: false,
      fcmToken: user.fcmToken || null,
      language: user.language || "en",
    });
    // if (dbUser.fcmToken) {
    //   try {
    //     await sendNotification(
    //       dbUser.fcmToken,
    //       "Registration Successful",
    //       "Welcome to Yuvadarpan! Your registration was successful.",
    //     );
    //   } catch (err) {
    //     console.error("FCM notification error:", err);
    //   }
    // }
    res.send(dbUser);
  }
});

router.post("/sendOtp", async (req, res) => {
  const { email } = req.body;
  const emailRegex = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/;
  const Email = email
    ? emailRegex.test(email)
      ? {
          email: { $eq: email },
        }
      : {
          mobile: { $eq: email },
        }
    : {};
  const dbUser = await User.findOne(Email).lean();

  if (dbUser) {
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
});

router.post("/verifyOtp", async (req, res) => {
  const { email, otp } = req.body;

  const emailRegex = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/;
  const Email = email
    ? emailRegex.test(email)
      ? {
          email: { $eq: email },
        }
      : {
          mobile: { $eq: email },
        }
    : {};
  const isUserExit = await User.findOne(Email).lean();
  if (isUserExit) {
    const isOtpExist = await OTP.findOne({ otp: otp, email: email });
    if (isOtpExist) {
      const now = new Date();
      const createdAt = new Date(isOtpExist.createdAt);
      const diffSeconds = (now - createdAt) / 1000;
      if (diffSeconds > 60) {
        await OTP.findByIdAndDelete(isOtpExist?.id);
        return res.status(410).send({ message: "otp-expired" });
      }
      await OTP.findByIdAndDelete(isOtpExist?.id);
      res.status(200).send({ message: "otp-verify-successfully" });
    } else {
      return res.status(404).send({ message: "invalid-otp" });
    }
  } else {
    res.status(404).send({ message: "email-invalid" });
  }
});

router.post("/signIn", async (req, res) => {
  const { email, password } = req.body;
  const emailRegex = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/;
  const Email = email
    ? emailRegex.test(email)
      ? {
          email: { $eq: email },
        }
      : {
          mobile: { $eq: email },
        }
    : {};
  const dbUser = await User.findOne(Email).lean();

  if (dbUser !== null && dbUser !== undefined) {
    const passwordMatched = await bcrypt.compare(password, dbUser.password);
    if (passwordMatched) {
      if (dbUser?.allowed) {
        const token = jwt.sign(
          { email: dbUser.email, role: dbUser.role, id: dbUser._id },
          process.env.JWT_SECRET,
          {
            expiresIn: "30d",
          },
        );
        const { password, ...rest } = dbUser;
        const safeUser = { ...rest, id: dbUser._id };
        delete safeUser._id;
        res.send({ data: safeUser, token });
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
    const { id } = req.params;
    const payload = { ...req.body };

    // Get current user data before update
    const currentUser = await User.findById(id).lean();

    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (payload?.password) {
      payload.password = await bcrypt.hash(payload.password, 10);
    }

    const isAcceptStatusChanged =
      payload.hasOwnProperty("allowed") &&
      currentUser.allowed !== payload.allowed;

    await User.updateOne(
      { _id: id },
      { ...payload, updatedAt: new Date(), updatedBy: req?.user.id },
    );

    if (isAcceptStatusChanged && currentUser?.fcmToken) {
      let lang = currentUser?.language;
      await sendNotification(
        currentUser?.fcmToken,
        payload?.allowed ? notification.AccountVerifySuccess.title[lang] : notification.AccountVerifyFail.title[lang],
        payload?.allowed ? notification.AccountVerifySuccess.body[lang] : notification.AccountVerifyFail.body[lang],
      );
    }

    res.status(200).json({ message: "Updated Successfully" });
  }
});

router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = req.body;
    await User.deleteMany({ _id: { $in: data.users } });
    res.status(200).json({ message: "Delete Successfully" });
  }
});

router.patch("/forgotPassword", async (req, res) => {
  const { email, password } = req.body;

  const emailRegex = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/;
  const Email = email
    ? emailRegex.test(email)
      ? {
          email: { $eq: email },
        }
      : {
          mobile: { $eq: email },
        }
    : {};
  const isUserExits = await User.findOne(Email).lean();

  if (isUserExits) {
    const newPassword = await bcrypt.hash(password, 10);
    await User.updateOne(
      { id: isUserExits?.id },
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
    const { ids, action } = req.body;
    const isAccepting = action === "accept";

    const usersToUpdate = await User.find({ _id: { $in: ids } }).lean();

    await User.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          allowed: isAccepting,
          active: isAccepting,
          updatedAt: new Date(),
          updatedBy: req.body.id,
        },
      },
    );

    const notificationPromises = usersToUpdate.map(async (user) => {
      const lang = user?.language;
      await sendNotification(
        user?.fcmToken,
        isAccepting ? notification.AccountVerifySuccess.title[lang] : notification.AccountVerifyFail.title[lang],
        isAccepting ? notification.AccountVerifySuccess.body[lang] : notification.AccountVerifyFail.body[lang],
      );
    });

    await Promise.all(notificationPromises);

    res.status(200).json({ message: "Updated Successfully" });
  }
});

router.patch("/fcmTokenUpdate/:id", async (req, res) => {
  const { id } = req.params;
  const payload = { ...req.body };

  const currentUser = await User.findById(id).lean();

  if (!currentUser) {
    return res.status(404).json({ message: "User not found" });
  }

  if (payload?.password) {
    payload.password = await bcrypt.hash(payload.password, 10);
  }

  await User.updateOne(
    { _id: id },
    { ...payload, updatedAt: new Date(), updatedBy: id },
  );
  res.status(200).json({ message: "fcmToken Updated Successfully" });
});

router.post("/test", async (req, res) => {
  const user = req.body;
  console.log("user", user);
  if (user.fcmToken) {
    try {
      await sendNotification(
        user.fcmToken,
        "Test Notification",
        "Test Notification send and receive successfully.",
      );
    } catch (err) {
      console.log("FCM notification error:", err);
    }
  } else {
    console.log("FCM token is required");
  }
});

module.exports = router;
