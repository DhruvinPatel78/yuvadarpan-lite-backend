const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { verifyToken } = require("../utils/auth");
const User = require("../models/user");
const OtpGenerator = require("otp-generator");
const OTP = require("../models/OTP");
const Region = require("../models/region");
const { v4: uuidv4 } = require("uuid");
const { sendNotification } = require("../utils/fcm");
const { notifyAccountEvent, notifyStatusChange } = require("../utils/accountMail");
const appMessages = require("../utils/appMessages");
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
  isAdmin: isAdminRole,
  isLocationMasterReadOnly,
} = require("../utils/managerScope");
const { attachLinkedRoute } = require("../utils/linkedRecords");
const {
  recordActivity,
  recordActivityMany,
  inferUserAction,
} = require("../utils/activityLog");

const createUniqueOtp = async () => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const otp = OtpGenerator.generate(6, {
      upperCaseAlphabets: false,
      lowerCaseAlphabets: false,
      specialChars: false,
    });
    const exists = await OTP.findOne({ otp }).lean();
    if (!exists) {
      return otp;
    }
  }
  throw new Error("otp-generate-failed");
};

const errorCheck = (req, res) => {
  if (req.hasOwnProperty("error")) {
    const { message } = req.error;
    res.status(401).send({
      message: message === "no-token" ? appMessages.unauthenticated : appMessages.tokenExpired,
    });
    return true;
  } else {
    return false;
  }
};

const resetAttempts = new Map();

const limitResetAttempts = (req, res, next) => {
  const ip =
    String(req.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim() ||
    req.ip ||
    "unknown";
  const email = String(req.body?.email || "").trim().toLowerCase();
  const key = `${ip}:${email}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  if (resetAttempts.size > 2000) {
    for (const [storedKey, entry] of resetAttempts) {
      if (now - entry.start > windowMs) {
        resetAttempts.delete(storedKey);
      }
    }
  }
  const entry = resetAttempts.get(key);
  if (!entry || now - entry.start > windowMs) {
    resetAttempts.set(key, { start: now, count: 1 });
    return next();
  }
  entry.count += 1;
  if (entry.count > 8) {
    return res.status(429).json({ message: appMessages.tooManyAttempts });
  }
  next();
};

const canManageUsers = (role) =>
  isAdminRole(role) || isLocationMasterReadOnly(role);

router.use(verifyToken());
attachLinkedRoute(router, "user", errorCheck);

router.get("/getInfo/:id", async (req, res) => {
  if (errorCheck(req, res)) {
    return;
  }
  if (String(req.user?.role || "").toUpperCase() === "USER") {
    return res.status(403).json({ message: appMessages.notAllowed });
  }
  const user =
    (await User.findById(req.params.id).lean()) ||
    (await User.findOne(idOrObjectIdFilter(String(req.params.id))).lean());
  if (!user) {
    return res.status(404).json({ message: appMessages.userNotFound });
  }
  delete user.password;
  delete user.fcmToken;
  user.id = user._id;
  delete user._id;
  res.status(200).json(user);
});

router.get("/me", async (req, res) => {
  if (!errorCheck(req, res)) {
    const user = await findAccountByTokenId(req.user.id);
    if (!user || user.allowed === false || user.active === false) {
      return res.status(401).json({ message: appMessages.tokenExpired });
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
    if (!canManageUsers(req.user?.role)) {
      return res.status(403).json({ message: appMessages.notAllowed });
    }
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
    const query = { ...filterSearch };
    if (role !== "ADMIN") {
      const manager = await findAccountByTokenId(id);
      if (role === "SAMAJ_MANAGER") {
        query.localSamaj = { $in: await samajValueKeys(manager?.localSamaj) };
      } else if (role === "CITY_MANAGER") {
        Object.assign(query, await usersInManagerCityQuery(manager));
      } else if (role === "DISTRICT_MANAGER") {
        Object.assign(query, await usersInManagerDistrictQuery(manager));
      } else if (role === "REGION_MANAGER") {
        Object.assign(query, await usersInManagerRegionQuery(manager));
      } else if (role === "STATE_MANAGER") {
        Object.assign(query, await usersInManagerStateQuery(manager));
      } else if (role === "COUNTRY_MANAGER") {
        Object.assign(query, await usersInManagerCountryQuery(manager));
      }
    }
    const users = await User.find(query)
      .select("-password")
      .sort({ id: -1 })
      .skip(offset)
      .limit(limit)
      .exec();
    const totalItems = await User.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);
    res.status(200).json({ total: totalItems, page, totalPages, data: users });
  }
});

router.get("/requests", async (req, res) => {
  if (!errorCheck(req, res)) {
    if (!canManageUsers(req.user?.role)) {
      return res.status(403).json({ message: appMessages.notAllowed });
    }
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
    if (!canManageUsers(req.user?.role)) {
      return res.status(403).json({ message: appMessages.notAllowed });
    }
    const user = { ...req.body };
    delete user.confirmPassword;
    if (user.role && typeof user.role === "object") {
      user.role = user.role.value || user.role.id || "USER";
    }
    if (!user.password) {
      return res.status(400).json({ message: appMessages.passwordRequired });
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
          ? appMessages.emailAndMobileExist
          : emailExist
            ? appMessages.emailExists
            : appMessages.mobileExists;
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
    if (actorRole === "SAMAJ_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const samajKeys = await samajValueKeys(manager?.localSamaj);
      if (!user.localSamaj || !samajKeys.includes(String(user.localSamaj))) {
        return res.status(403).json({ message: appMessages.notAllowed });
      }
    }
    if (actorRole === "CITY_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const samajIds = await samajIdsForCity(await getManagerCityId(manager));
      if (!user.localSamaj || !samajIds.includes(String(user.localSamaj))) {
        return res.status(403).json({ message: appMessages.notAllowed });
      }
    }
    if (actorRole === "DISTRICT_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const samajIds = await samajIdsForDistrict(
        await getManagerDistrictId(manager),
      );
      if (!user.localSamaj || !samajIds.includes(String(user.localSamaj))) {
        return res.status(403).json({ message: appMessages.notAllowed });
      }
    }
    if (actorRole === "REGION_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const regionId = await getManagerRegionId(manager);
      const regionKeys = await regionValueKeys(regionId);
      const samajIds = await samajIdsForRegion(regionId);
      if (!user.localSamaj || !samajIds.includes(String(user.localSamaj))) {
        return res.status(403).json({ message: appMessages.notAllowed });
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
        return res.status(403).json({ message: appMessages.notAllowed });
      }
      if (user.region && regionIds.length && !regionIds.includes(String(user.region))) {
        return res.status(403).json({ message: appMessages.notAllowed });
      }
    }
    if (actorRole === "COUNTRY_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const countryId = await getManagerCountryId(manager);
      const samajIds = await samajIdsForCountry(countryId);
      const regionIds = await regionIdsForCountry(countryId);
      if (!user.localSamaj || !samajIds.includes(String(user.localSamaj))) {
        return res.status(403).json({ message: appMessages.notAllowed });
      }
      if (user.region && regionIds.length && !regionIds.includes(String(user.region))) {
        return res.status(403).json({ message: appMessages.notAllowed });
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
    await notifyAccountEvent(
      dbUser,
      isAdmin ? "AccountVerifySuccess" : "RegistrationSuccess",
    );
    await recordActivity({
      req,
      action: "create",
      entityType: "user",
      entity: dbUser,
      next: dbUser,
    });
    res.send(dbUser);
  } catch (e) {
    res.status(400).json({ message: e.message || appMessages.createFailed });
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
        ? appMessages.emailAndMobileExist
        : emailExist
          ? appMessages.emailExists
          : appMessages.mobileExists;

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
      role: "USER",
      allowed: false,
      fcmToken: user.fcmToken || null,
      language: user.language || "en",
    });
    await notifyAccountEvent(dbUser, "RegistrationSuccess");
    res.send(dbUser);
  }
});

router.post("/sendOtp", limitResetAttempts, async (req, res) => {
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
  const dbUser = email ? await User.findOne(Email).lean() : null;

  if (!dbUser?.email) {
    return res.status(200).json({ message: appMessages.otpSent });
  }
  try {
    const otp = await createUniqueOtp();
    await OTP.deleteMany({ email: dbUser.email });
    await OTP.create({ email: dbUser.email, otp });
    await OTP.sendVerificationEmail(String(dbUser.email).trim(), otp, dbUser);
    return res.status(200).json({
      message: appMessages.otpSent,
    });
  } catch (error) {
    console.error("sendOtp", error.message);
    await OTP.deleteMany({ email: dbUser.email });
    return res.status(502).json({ message: appMessages.otpEmailFailed });
  }
});

router.post("/verifyOtp", limitResetAttempts, async (req, res) => {
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
  const isUserExit = email ? await User.findOne(Email).lean() : null;
  if (isUserExit) {
    const isOtpExist = await OTP.findOne({ otp: otp, email: isUserExit.email });
    if (isOtpExist) {
      const now = new Date();
      const createdAt = new Date(isOtpExist.createdAt);
      const diffSeconds = (now - createdAt) / 1000;
      if (diffSeconds > 300) {
        await OTP.findByIdAndDelete(isOtpExist?.id);
        return res.status(410).send({ message: appMessages.otpExpired });
      }
      await OTP.updateOne(
        { _id: isOtpExist._id },
        { $set: { verified: true } },
      );
      res.status(200).send({ message: appMessages.otpVerified });
    } else {
      return res.status(404).send({ message: appMessages.otpInvalid });
    }
  } else {
    res.status(404).send({ message: appMessages.otpInvalid });
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
      if (dbUser?.allowed && dbUser.active !== false) {
        const token = jwt.sign(
          { email: dbUser.email, role: dbUser.role, id: dbUser._id },
          process.env.JWT_SECRET,
          {
            expiresIn: "10d",
          },
        );
        const { password, ...rest } = dbUser;
        const safeUser = { ...rest, id: dbUser._id };
        delete safeUser._id;
        res.send({ data: safeUser, token });
      } else {
        res.status(403).send({ message: appMessages.accountNotApproved });
      }
    } else {
      res.status(401).send({ message: appMessages.loginFailed });
    }
  } else {
    res.status(401).send({ message: appMessages.loginFailed });
  }
});

router.patch("/update/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { id } = req.params;
    const payload = { ...req.body };

    // Get current user data before update
    const currentUser =
      (await User.findById(id).lean()) ||
      (await User.findOne(idOrObjectIdFilter(String(id))).lean());

    if (!currentUser) {
      return res.status(404).json({ message: appMessages.userNotFound });
    }

    const isSelf =
      String(req.user.id) === String(id) ||
      String(req.user.id) === String(currentUser._id) ||
      String(req.user.id) === String(currentUser.id);
    const actorIsAdmin = String(req.user.role || "").toUpperCase() === "ADMIN";

    if (!isSelf && !canManageUsers(req.user.role)) {
      return res.status(403).json({ message: appMessages.notAllowed });
    }

    if (isSelf) {
      delete payload.role;
      delete payload.password;
      if (!actorIsAdmin) {
        delete payload.allowed;
        delete payload.active;
      }
    }

    if (!isSelf && req.user.role === "SAMAJ_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const samajKeys = await samajValueKeys(manager?.localSamaj);
      if (!samajKeys.includes(String(currentUser.localSamaj))) {
        return res.status(403).json({ message: appMessages.notAllowed });
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
        return res.status(403).json({ message: appMessages.notAllowed });
      }
      delete payload.role;
      if (payload.localSamaj) {
        const samajIds = await samajIdsForCity(await getManagerCityId(manager));
        if (!samajIds.includes(String(payload.localSamaj))) {
          return res.status(403).json({ message: appMessages.notAllowed });
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
        return res.status(403).json({ message: appMessages.notAllowed });
      }
      delete payload.role;
      if (payload.localSamaj) {
        const samajIds = await samajIdsForDistrict(
          await getManagerDistrictId(manager),
        );
        if (!samajIds.includes(String(payload.localSamaj))) {
          return res.status(403).json({ message: appMessages.notAllowed });
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
        return res.status(403).json({ message: appMessages.notAllowed });
      }
      delete payload.role;
      if (payload.localSamaj) {
        const samajIds = await samajIdsForRegion(
          await getManagerRegionId(manager),
        );
        if (!samajIds.includes(String(payload.localSamaj))) {
          return res.status(403).json({ message: appMessages.notAllowed });
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
        return res.status(403).json({ message: appMessages.notAllowed });
      }
      delete payload.role;
      if (payload.localSamaj) {
        const samajIds = await samajIdsForState(
          await getManagerStateId(manager),
        );
        if (!samajIds.includes(String(payload.localSamaj))) {
          return res.status(403).json({ message: appMessages.notAllowed });
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
        return res.status(403).json({ message: appMessages.notAllowed });
      }
      delete payload.role;
      if (payload.localSamaj) {
        const samajIds = await samajIdsForCountry(
          await getManagerCountryId(manager),
        );
        if (!samajIds.includes(String(payload.localSamaj))) {
          return res.status(403).json({ message: appMessages.notAllowed });
        }
      }
    }

    if (payload?.password) {
      payload.password = await bcrypt.hash(payload.password, 10);
    }

    const statusPayload = {};
    if (
      Object.prototype.hasOwnProperty.call(payload, "allowed") &&
      Boolean(currentUser.allowed) !== Boolean(payload.allowed)
    ) {
      statusPayload.allowed = payload.allowed;
    }
    if (
      Object.prototype.hasOwnProperty.call(payload, "active") &&
      Boolean(currentUser.active) !== Boolean(payload.active)
    ) {
      statusPayload.active = payload.active;
    }

    await User.updateOne(
      { _id: currentUser._id },
      {
        $set: {
          ...payload,
          updatedAt: new Date(),
          updatedBy: req?.user.id,
        },
      },
    );

    if (Object.keys(statusPayload).length) {
      await notifyStatusChange(
        { ...currentUser, ...statusPayload },
        statusPayload,
      );
    }

    const nextUser = { ...currentUser, ...payload };
    await recordActivity({
      req,
      action: inferUserAction(currentUser, payload),
      entityType: "user",
      previous: currentUser,
      next: nextUser,
      entity: nextUser,
      extraChanges: [
        ...("allowed" in statusPayload
          ? [
              {
                field: "allowed",
                label: "Allowed",
                from: currentUser.allowed ? "Yes" : "No",
                to: statusPayload.allowed ? "Yes" : "No",
              },
            ]
          : []),
        ...("active" in statusPayload
          ? [
              {
                field: "active",
                label: "Active",
                from: currentUser.active ? "Yes" : "No",
                to: statusPayload.active ? "Yes" : "No",
              },
            ]
          : []),
      ],
    });

    res.status(200).json({ message: appMessages.updated });
  }
});

router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res)) {
    if (!canManageUsers(req.user?.role)) {
      return res.status(403).json({ message: appMessages.notAllowed });
    }
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
    const usersToDelete = await User.find(query).lean();
    await User.deleteMany(query);
    await recordActivityMany(req, "delete", "user", usersToDelete);
    res.status(200).json({ message: appMessages.deleted });
  }
});

router.post("/sendChangePasswordOtp", async (req, res) => {
  if (errorCheck(req, res)) {
    return;
  }
  try {
    const manager = await findAccountByTokenId(req.user.id);
    if (!manager?.email) {
      return res.status(404).send({ message: appMessages.emailInvalid });
    }
    const email = String(manager.email || "").trim();
    const otp = await createUniqueOtp();
    await OTP.deleteMany({ email });
    await OTP.create({ email, otp });
    await OTP.sendVerificationEmail(email, otp, manager);
    return res.status(200).json({ message: appMessages.otpSent });
  } catch (error) {
    console.error("sendChangePasswordOtp", error.message);
    if (req.user?.id) {
      const manager = await findAccountByTokenId(req.user.id);
      if (manager?.email) {
        await OTP.deleteMany({ email: manager.email });
      }
    }
    return res.status(502).json({ message: appMessages.otpEmailFailed });
  }
});

router.patch("/changePassword", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ message: appMessages.passwordRequired });
    }
    const manager = await findAccountByTokenId(req.user.id);
    if (!manager?.email) {
      return res.status(404).send({ message: appMessages.emailInvalid });
    }
    const verifiedOtp = await OTP.findOneAndUpdate(
      { email: manager.email, verified: true, consumed: { $ne: true } },
      { $set: { consumed: true } },
    );
    if (!verifiedOtp) {
      return res.status(403).json({ message: appMessages.otpNotVerified });
    }
    const now = new Date();
    const createdAt = new Date(verifiedOtp.createdAt);
    if ((now - createdAt) / 1000 > 300) {
      await OTP.deleteMany({ email: manager.email });
      return res.status(410).send({ message: appMessages.otpExpired });
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
    await notifyAccountEvent(manager, "PasswordChanged");
    res.status(200).send({ message: appMessages.passwordUpdated });
  }
});

router.patch("/forgotPassword", limitResetAttempts, async (req, res) => {
  const { email, password } = req.body;
  if (!password) {
    return res.status(400).json({ message: appMessages.passwordRequired });
  }

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
  const account = email ? await User.findOne(Email).lean() : null;
  const fail = () =>
    res.status(403).json({ message: appMessages.otpNotVerified });

  if (!account?.email) {
    return fail();
  }

  const verifiedOtp = await OTP.findOneAndUpdate(
    { email: account.email, verified: true, consumed: { $ne: true } },
    { $set: { consumed: true } },
  );
  if (!verifiedOtp) {
    return fail();
  }

  const now = new Date();
  const createdAt = new Date(verifiedOtp.createdAt);
  if ((now - createdAt) / 1000 > 300) {
    await OTP.deleteMany({ email: account.email });
    return res.status(410).send({ message: appMessages.otpExpired });
  }

  const newPassword = await bcrypt.hash(password, 10);
  await User.updateOne(
    { _id: account._id },
    {
      $set: {
        password: newPassword,
        updatedAt: new Date(),
        updatedBy: account.id,
      },
    },
  );
  await OTP.deleteMany({ email: account.email });
  await notifyAccountEvent(account, "PasswordChanged");
  res.status(200).send({ message: appMessages.passwordUpdated });
});

router.patch("/approveRejectMany", async (req, res) => {
  if (!errorCheck(req, res)) {
    if (!canManageUsers(req.user?.role)) {
      return res.status(403).json({ message: appMessages.notAllowed });
    }
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
          updatedBy: req.user.id,
        },
      },
    );

    await Promise.all(
      usersToUpdate.map((user) =>
        notifyAccountEvent(
          user,
          isAccepting ? "AccountVerifySuccess" : "AccountVerifyFail",
        ),
      ),
    );

    await Promise.all(
      usersToUpdate.map((user) =>
        recordActivity({
          req,
          action: isAccepting ? "approve" : "reject",
          entityType: "user",
          previous: user,
          next: { ...user, allowed: isAccepting, active: isAccepting },
          entity: { ...user, allowed: isAccepting, active: isAccepting },
        }),
      ),
    );

    res.status(200).json({ message: appMessages.updated });
  }
});

router.patch("/fcmTokenUpdate/:id", async (req, res) => {
  const { id } = req.params;
  const payload = { ...req.body };

  const currentUser = await User.findById(id).lean();

  if (!currentUser) {
    return res.status(404).json({ message: appMessages.userNotFound });
  }

  if (payload?.password) {
    payload.password = await bcrypt.hash(payload.password, 10);
  }

  await User.updateOne(
    { _id: id },
    { ...payload, updatedAt: new Date(), updatedBy: id },
  );
  res.status(200).json({ message: appMessages.updated });
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
