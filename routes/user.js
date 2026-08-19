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
const { idOrObjectIdFilter } = require("../utils/childCount");
const {
  findAccountByTokenId,
  samajValueKeys,
  usersInManagerCityQuery,
  usersInManagerDistrictQuery,
  usersInManagerRegionQuery,
  usersInManagerStateQuery,
  usersInManagerCountryQuery,
  samajIdsForCity,
  samajIdsForDistrict,
  samajIdsForRegion,
  samajIdsForState,
  samajIdsForCountry,
  getManagerCityId,
  getManagerDistrictId,
  getManagerRegionId,
  getManagerStateId,
  getManagerCountryId,
  regionValueKeys,
  regionIdsForState,
  regionIdsForCountry,
} = require("../utils/managerScope");

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

router.get("/me", async (req, res) => {
  if (!errorCheck(req, res)) {
    const user = await findAccountByTokenId(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const safeUser = user.toObject ? user.toObject() : { ...user };
    delete safeUser.password;
    safeUser.id = user._id || user.id;
    delete safeUser._id;
    res.status(200).json(safeUser);
  }
});

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
      const ownRegion =
        req.query.ownRegion === true ||
        String(req.query.ownRegion).toLowerCase() === "true";
      if (!ownRegion) {
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
      } else {
        const manager = await findAccountByTokenId(id);
        const managerQuery = {
          ...filterSearch,
          ...(await usersInManagerRegionQuery(manager)),
        };
        const MangerUsers = await User.find(managerQuery)
          .sort({ id: -1 })
          .skip(offset)
          .limit(limit)
          .exec();
        const managerTotalItem = await User.countDocuments(managerQuery);
        const totalPages = Math.ceil(managerTotalItem / limit);
        res.status(200).json({
          total: managerTotalItem,
          page,
          totalPages,
          data: MangerUsers,
        });
      }
    } else if (role === "STATE_MANAGER") {
      const ownState =
        req.query.ownState === true ||
        String(req.query.ownState).toLowerCase() === "true";
      if (!ownState) {
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
      } else {
        const manager = await findAccountByTokenId(id);
        const managerQuery = {
          ...filterSearch,
          ...(await usersInManagerStateQuery(manager)),
        };
        const MangerUsers = await User.find(managerQuery)
          .sort({ id: -1 })
          .skip(offset)
          .limit(limit)
          .exec();
        const managerTotalItem = await User.countDocuments(managerQuery);
        const totalPages = Math.ceil(managerTotalItem / limit);
        res.status(200).json({
          total: managerTotalItem,
          page,
          totalPages,
          data: MangerUsers,
        });
      }
    } else if (role === "COUNTRY_MANAGER") {
      const ownCountry =
        req.query.ownCountry === true ||
        String(req.query.ownCountry).toLowerCase() === "true";
      if (!ownCountry) {
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
      } else {
        const manager = await findAccountByTokenId(id);
        const managerQuery = {
          ...filterSearch,
          ...(await usersInManagerCountryQuery(manager)),
        };
        const MangerUsers = await User.find(managerQuery)
          .sort({ id: -1 })
          .skip(offset)
          .limit(limit)
          .exec();
        const managerTotalItem = await User.countDocuments(managerQuery);
        const totalPages = Math.ceil(managerTotalItem / limit);
        res.status(200).json({
          total: managerTotalItem,
          page,
          totalPages,
          data: MangerUsers,
        });
      }
    } else if (role === "SAMAJ_MANAGER") {
      const ownSamaj =
        req.query.ownSamaj === true ||
        String(req.query.ownSamaj).toLowerCase() === "true";
      if (!ownSamaj) {
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
      } else {
        const mangerSamaj = await findAccountByTokenId(id);
        const samajKeys = await samajValueKeys(mangerSamaj?.localSamaj);
        const managerQuery = {
          ...filterSearch,
          localSamaj: { $in: samajKeys },
        };
        const MangerUsers = await User.find(managerQuery)
          .sort({ id: -1 })
          .skip(offset)
          .limit(limit)
          .exec();
        const managerTotalItem = await User.countDocuments(managerQuery);
        const totalPages = Math.ceil(managerTotalItem / limit);
        res.status(200).json({
          total: managerTotalItem,
          page,
          totalPages,
          data: MangerUsers,
        });
      }
    } else if (role === "CITY_MANAGER") {
      const ownCity =
        req.query.ownCity === true ||
        String(req.query.ownCity).toLowerCase() === "true";
      if (!ownCity) {
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
      } else {
        const manager = await findAccountByTokenId(id);
        const managerQuery = {
          ...filterSearch,
          ...(await usersInManagerCityQuery(manager)),
        };
        const MangerUsers = await User.find(managerQuery)
          .sort({ id: -1 })
          .skip(offset)
          .limit(limit)
          .exec();
        const managerTotalItem = await User.countDocuments(managerQuery);
        const totalPages = Math.ceil(managerTotalItem / limit);
        res.status(200).json({
          total: managerTotalItem,
          page,
          totalPages,
          data: MangerUsers,
        });
      }
    } else if (role === "DISTRICT_MANAGER") {
      const ownDistrict =
        req.query.ownDistrict === true ||
        String(req.query.ownDistrict).toLowerCase() === "true";
      if (!ownDistrict) {
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
      } else {
        const manager = await findAccountByTokenId(id);
        const managerQuery = {
          ...filterSearch,
          ...(await usersInManagerDistrictQuery(manager)),
        };
        const MangerUsers = await User.find(managerQuery)
          .sort({ id: -1 })
          .skip(offset)
          .limit(limit)
          .exec();
        const managerTotalItem = await User.countDocuments(managerQuery);
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
    const pendingQuery = {
      allowed: { $eq: false },
      $or: [{ active: true }, { updatedAt: null }],
      ...filterSearch,
    };
    if (role === "ADMIN") {
      const users = await User.find(pendingQuery)
        .sort({ id: -1 })
        .skip(offset)
        .limit(limit)
        .exec();
      const totalItems = await User.countDocuments(pendingQuery);
      const totalPages = Math.ceil(totalItems / limit);
      res
        .status(200)
        .json({ total: totalItems, page, totalPages, data: users });
    } else if (role === "REGION_MANAGER") {
      const manager = await findAccountByTokenId(id);
      const managerPendingQuery = {
        ...pendingQuery,
        ...(await usersInManagerRegionQuery(manager)),
      };
      const MangerUsers = await User.find(managerPendingQuery)
        .sort({ id: -1 })
        .skip(offset)
        .limit(limit)
        .exec();
      const managerTotalItem = await User.countDocuments(managerPendingQuery);
      const totalPages = Math.ceil(managerTotalItem / limit);
      res.status(200).json({
        total: managerTotalItem,
        page,
        totalPages,
        data: MangerUsers,
      });
    } else if (role === "STATE_MANAGER") {
      const manager = await findAccountByTokenId(id);
      const managerPendingQuery = {
        ...pendingQuery,
        ...(await usersInManagerStateQuery(manager)),
      };
      const MangerUsers = await User.find(managerPendingQuery)
        .sort({ id: -1 })
        .skip(offset)
        .limit(limit)
        .exec();
      const managerTotalItem = await User.countDocuments(managerPendingQuery);
      const totalPages = Math.ceil(managerTotalItem / limit);
      res.status(200).json({
        total: managerTotalItem,
        page,
        totalPages,
        data: MangerUsers,
      });
    } else if (role === "COUNTRY_MANAGER") {
      const manager = await findAccountByTokenId(id);
      const managerPendingQuery = {
        ...pendingQuery,
        ...(await usersInManagerCountryQuery(manager)),
      };
      const MangerUsers = await User.find(managerPendingQuery)
        .sort({ id: -1 })
        .skip(offset)
        .limit(limit)
        .exec();
      const managerTotalItem = await User.countDocuments(managerPendingQuery);
      const totalPages = Math.ceil(managerTotalItem / limit);
      res.status(200).json({
        total: managerTotalItem,
        page,
        totalPages,
        data: MangerUsers,
      });
    } else if (role === "SAMAJ_MANAGER") {
      const mangerSamaj = await findAccountByTokenId(id);
      const samajKeys = await samajValueKeys(mangerSamaj?.localSamaj);
      const managerPendingQuery = {
        ...pendingQuery,
        localSamaj: { $in: samajKeys },
      };
      const MangerUsers = await User.find(managerPendingQuery)
        .sort({ id: -1 })
        .skip(offset)
        .limit(limit)
        .exec();
      const managerTotalItem = await User.countDocuments(managerPendingQuery);
      const totalPages = Math.ceil(managerTotalItem / limit);
      res.status(200).json({
        total: managerTotalItem,
        page,
        totalPages,
        data: MangerUsers,
      });
    } else if (role === "CITY_MANAGER") {
      const manager = await findAccountByTokenId(id);
      const managerPendingQuery = {
        ...pendingQuery,
        ...(await usersInManagerCityQuery(manager)),
      };
      const MangerUsers = await User.find(managerPendingQuery)
        .sort({ id: -1 })
        .skip(offset)
        .limit(limit)
        .exec();
      const managerTotalItem = await User.countDocuments(managerPendingQuery);
      const totalPages = Math.ceil(managerTotalItem / limit);
      res.status(200).json({
        total: managerTotalItem,
        page,
        totalPages,
        data: MangerUsers,
      });
    } else if (role === "DISTRICT_MANAGER") {
      const manager = await findAccountByTokenId(id);
      const managerPendingQuery = {
        ...pendingQuery,
        ...(await usersInManagerDistrictQuery(manager)),
      };
      const MangerUsers = await User.find(managerPendingQuery)
        .sort({ id: -1 })
        .skip(offset)
        .limit(limit)
        .exec();
      const managerTotalItem = await User.countDocuments(managerPendingQuery);
      const totalPages = Math.ceil(managerTotalItem / limit);
      res.status(200).json({
        total: managerTotalItem,
        page,
        totalPages,
        data: MangerUsers,
      });
    }
  }
});

router.post("/add", async (req, res) => {
  try {
    if (errorCheck(req, res)) {
      return;
    }
    const user = { ...req.body };
    delete user.confirmPassword;
    if (user.role && typeof user.role === "object") {
      user.role = user.role.value || user.role.id || "USER";
    }
    if (!user.password) {
      return res.status(400).json({ message: "password-required" });
    }
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
      return res.status(409).json({ message: errorMessage });
    }
    const actorRole = req.user?.role;
    const isAdmin = String(actorRole || "").toUpperCase() === "ADMIN";
    if (
      actorRole === "SAMAJ_MANAGER" ||
      actorRole === "CITY_MANAGER" ||
      actorRole === "DISTRICT_MANAGER" ||
      actorRole === "REGION_MANAGER" ||
      actorRole === "STATE_MANAGER" ||
      actorRole === "COUNTRY_MANAGER"
    ) {
      user.role = "USER";
    }
    if (actorRole === "CITY_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const samajIds = await samajIdsForCity(await getManagerCityId(manager));
      if (!user.localSamaj || !samajIds.includes(String(user.localSamaj))) {
        return res.status(403).json({ message: "not-allowed" });
      }
    }
    if (actorRole === "DISTRICT_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const samajIds = await samajIdsForDistrict(
        await getManagerDistrictId(manager),
      );
      if (!user.localSamaj || !samajIds.includes(String(user.localSamaj))) {
        return res.status(403).json({ message: "not-allowed" });
      }
    }
    if (actorRole === "REGION_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const regionId = await getManagerRegionId(manager);
      const regionKeys = await regionValueKeys(regionId);
      const samajIds = await samajIdsForRegion(regionId);
      if (!user.localSamaj || !samajIds.includes(String(user.localSamaj))) {
        return res.status(403).json({ message: "not-allowed" });
      }
      if (regionId) {
        user.region = regionKeys[0] || regionId;
      }
    }
    if (actorRole === "STATE_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const stateId = await getManagerStateId(manager);
      const samajIds = await samajIdsForState(stateId);
      const regionIds = await regionIdsForState(stateId);
      if (!user.localSamaj || !samajIds.includes(String(user.localSamaj))) {
        return res.status(403).json({ message: "not-allowed" });
      }
      if (user.region && regionIds.length && !regionIds.includes(String(user.region))) {
        return res.status(403).json({ message: "not-allowed" });
      }
    }
    if (actorRole === "COUNTRY_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const countryId = await getManagerCountryId(manager);
      const samajIds = await samajIdsForCountry(countryId);
      const regionIds = await regionIdsForCountry(countryId);
      if (!user.localSamaj || !samajIds.includes(String(user.localSamaj))) {
        return res.status(403).json({ message: "not-allowed" });
      }
      if (user.region && regionIds.length && !regionIds.includes(String(user.region))) {
        return res.status(403).json({ message: "not-allowed" });
      }
    }
    const dbUser = await User.create({
      ...user,
      id: uuidv4().replace(/-/g, ""),
      createdAt: new Date(),
      updatedAt: null,
      createdBy: req.user?.id || null,
      updatedBy: null,
      active: true,
      allowed: isAdmin,
      fcmToken: user.fcmToken || null,
    });
    res.send(dbUser);
  } catch (e) {
    res.status(400).json({ message: e.message || "failed-to-create-user" });
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
      active: true,
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
    await OTP.deleteMany({ email });
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
      if (diffSeconds > 300) {
        await OTP.findByIdAndDelete(isOtpExist?.id);
        return res.status(410).send({ message: "otp-expired" });
      }
      await OTP.updateOne(
        { _id: isOtpExist._id },
        { $set: { verified: true } },
      );
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

    const isSelf =
      String(req.user.id) === String(id) ||
      String(req.user.id) === String(currentUser._id) ||
      String(req.user.id) === String(currentUser.id);

    if (isSelf) {
      delete payload.role;
      delete payload.allowed;
      delete payload.active;
      delete payload.password;
    }

    if (!isSelf && req.user.role === "SAMAJ_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const samajKeys = await samajValueKeys(manager?.localSamaj);
      if (!samajKeys.includes(String(currentUser.localSamaj))) {
        return res.status(403).json({ message: "not-allowed" });
      }
      delete payload.role;
    }
    if (!isSelf && req.user.role === "CITY_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const inCity = await User.findOne({
        _id: currentUser._id,
        ...(await usersInManagerCityQuery(manager)),
      });
      if (!inCity) {
        return res.status(403).json({ message: "not-allowed" });
      }
      delete payload.role;
      if (payload.localSamaj) {
        const samajIds = await samajIdsForCity(await getManagerCityId(manager));
        if (!samajIds.includes(String(payload.localSamaj))) {
          return res.status(403).json({ message: "not-allowed" });
        }
      }
    }
    if (!isSelf && req.user.role === "DISTRICT_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const inDistrict = await User.findOne({
        _id: currentUser._id,
        ...(await usersInManagerDistrictQuery(manager)),
      });
      if (!inDistrict) {
        return res.status(403).json({ message: "not-allowed" });
      }
      delete payload.role;
      if (payload.localSamaj) {
        const samajIds = await samajIdsForDistrict(
          await getManagerDistrictId(manager),
        );
        if (!samajIds.includes(String(payload.localSamaj))) {
          return res.status(403).json({ message: "not-allowed" });
        }
      }
    }
    if (!isSelf && req.user.role === "REGION_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const inRegion = await User.findOne({
        _id: currentUser._id,
        ...(await usersInManagerRegionQuery(manager)),
      });
      if (!inRegion) {
        return res.status(403).json({ message: "not-allowed" });
      }
      delete payload.role;
      if (payload.localSamaj) {
        const samajIds = await samajIdsForRegion(
          await getManagerRegionId(manager),
        );
        if (!samajIds.includes(String(payload.localSamaj))) {
          return res.status(403).json({ message: "not-allowed" });
        }
      }
    }
    if (!isSelf && req.user.role === "STATE_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const inState = await User.findOne({
        _id: currentUser._id,
        ...(await usersInManagerStateQuery(manager)),
      });
      if (!inState) {
        return res.status(403).json({ message: "not-allowed" });
      }
      delete payload.role;
      if (payload.localSamaj) {
        const samajIds = await samajIdsForState(
          await getManagerStateId(manager),
        );
        if (!samajIds.includes(String(payload.localSamaj))) {
          return res.status(403).json({ message: "not-allowed" });
        }
      }
    }
    if (!isSelf && req.user.role === "COUNTRY_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const inCountry = await User.findOne({
        _id: currentUser._id,
        ...(await usersInManagerCountryQuery(manager)),
      });
      if (!inCountry) {
        return res.status(403).json({ message: "not-allowed" });
      }
      delete payload.role;
      if (payload.localSamaj) {
        const samajIds = await samajIdsForCountry(
          await getManagerCountryId(manager),
        );
        if (!samajIds.includes(String(payload.localSamaj))) {
          return res.status(403).json({ message: "not-allowed" });
        }
      }
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
    const query = { _id: { $in: data.users } };
    if (req.user.role === "SAMAJ_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      query.localSamaj = { $in: await samajValueKeys(manager?.localSamaj) };
    }
    if (req.user.role === "CITY_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      Object.assign(query, await usersInManagerCityQuery(manager));
    }
    if (req.user.role === "DISTRICT_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      Object.assign(query, await usersInManagerDistrictQuery(manager));
    }
    if (req.user.role === "REGION_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      Object.assign(query, await usersInManagerRegionQuery(manager));
    }
    if (req.user.role === "STATE_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      Object.assign(query, await usersInManagerStateQuery(manager));
    }
    if (req.user.role === "COUNTRY_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      Object.assign(query, await usersInManagerCountryQuery(manager));
    }
    await User.deleteMany(query);
    res.status(200).json({ message: "Delete Successfully" });
  }
});

router.post("/sendChangePasswordOtp", async (req, res) => {
  if (!errorCheck(req, res)) {
    const manager = await findAccountByTokenId(req.user.id);
    if (!manager?.email) {
      return res.status(404).send({ message: "email-invalid" });
    }
    const email = manager.email;
    let otp = OtpGenerator.generate(6, {
      upperCaseAlphabets: false,
      lowerCaseAlphabets: false,
      specialChars: false,
    });
    let result = await OTP.findOne({ otp });
    while (result) {
      otp = OtpGenerator.generate(6, {
        upperCaseAlphabets: false,
        lowerCaseAlphabets: false,
        specialChars: false,
      });
      result = await OTP.findOne({ otp });
    }
    await OTP.deleteMany({ email });
    await OTP.create({ email, otp });
    res.status(200).json({ message: "otp-sent-successfully" });
  }
});

router.patch("/changePassword", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ message: "password-required" });
    }
    const manager = await findAccountByTokenId(req.user.id);
    if (!manager?.email) {
      return res.status(404).send({ message: "email-invalid" });
    }
    const verifiedOtp = await OTP.findOne({
      email: manager.email,
      verified: true,
    });
    if (!verifiedOtp) {
      return res.status(403).json({ message: "otp-not-verified" });
    }
    const now = new Date();
    const createdAt = new Date(verifiedOtp.createdAt);
    if ((now - createdAt) / 1000 > 300) {
      await OTP.findByIdAndDelete(verifiedOtp._id);
      return res.status(410).send({ message: "otp-expired" });
    }
    const newPassword = await bcrypt.hash(password, 10);
    await User.updateOne(
      { _id: manager._id },
      {
        $set: {
          password: newPassword,
          updatedAt: new Date(),
          updatedBy: req.user.id,
        },
      },
    );
    await OTP.deleteMany({ email: manager.email });
    res.status(200).send({ message: "password-update-successfully" });
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

    const query = { _id: { $in: ids } };
    if (req.user.role === "SAMAJ_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      query.localSamaj = { $in: await samajValueKeys(manager?.localSamaj) };
    }
    if (req.user.role === "CITY_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      Object.assign(query, await usersInManagerCityQuery(manager));
    }
    if (req.user.role === "DISTRICT_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      Object.assign(query, await usersInManagerDistrictQuery(manager));
    }
    if (req.user.role === "REGION_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      Object.assign(query, await usersInManagerRegionQuery(manager));
    }
    if (req.user.role === "STATE_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      Object.assign(query, await usersInManagerStateQuery(manager));
    }
    if (req.user.role === "COUNTRY_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      Object.assign(query, await usersInManagerCountryQuery(manager));
    }

    const usersToUpdate = await User.find(query).lean();

    await User.updateMany(query, {
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
