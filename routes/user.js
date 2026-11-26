const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const ExcelJS = require("exceljs");
const { verifyToken } = require("../utils/auth");
const User = require("../models/user");
const OtpGenerator = require("otp-generator");
const OTP = require("../models/OTP");
const Country = require("../models/country");
const State = require("../models/state");
const Region = require("../models/region");
const Vibhag = require("../models/vibhag");
const District = require("../models/district");
const City = require("../models/city");
const Samaj = require("../models/samaj");
const { v4: uuidv4 } = require("uuid");
const { sendNotification } = require("../utils/fcm");
const { notifyAccountEvent, notifyStatusChange } = require("../utils/accountMail");
const { notifyStaffEvent } = require("../utils/notifyStaff");
const appMessages = require("../utils/appMessages");
const notification = require("../data/locale/notifications.json");
const { escapeRegex } = require("../utils/escapeRegex");
const { containsAny, mergeAnd } = require("../utils/caseInsensitiveSearch");
const {
  idOrObjectIdFilter,
  idsFilter,
  parentIdFilter,
} = require("../utils/childCount");
const {
  findAccountByTokenId,
  countryValueKeys,
  stateValueKeys,
  regionValueKeys,
  vibhagValueKeys,
  districtValueKeys,
  cityValueKeys,
  samajValueKeys,
  samajIdsForCity,
  samajIdsForDistrict,
  samajIdsForVibhag,
  samajIdsForRegion,
  samajIdsForState,
  samajIdsForCountry,
  getManagerCityId,
  getManagerDistrictId,
  getManagerVibhagId,
  getManagerRegionId,
  getManagerStateId,
  getManagerCountryId,
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
const {
  enrichUserLocation,
  ensureUsersLocationAndRankBackfilled,
} = require("../utils/userLocation");
const {
  buildUserVisibilityFilter,
  USER_LEVEL_FIELD_BY_ROLE,
  getRoleRank,
  normalizeRole,
} = require("../utils/userVisibility");
const {
  asPermissionObject,
  getPermissionByUserId,
  setPermissionForUser,
  clearPermissionForUser,
} = require("../models/permission");

/** Keep Permission docs only for manager roles. */
const normalizePermissionForRole = (role, permission) => {
  if (!isLocationMasterReadOnly(role)) {
    return {};
  }
  return asPermissionObject(permission);
};

const savePermissionForUser = async (userId, role, permission) => {
  const flags = normalizePermissionForRole(role, permission);
  if (!isLocationMasterReadOnly(role)) {
    await clearPermissionForUser(userId);
    return {};
  }
  return setPermissionForUser(userId, flags);
};

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

const asQueryList = (value) => {
  if (value == null || value === "") {
    return [];
  }
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((item) => String(item ?? "").trim())
    .filter((item) => item && item !== "all");
};

const textContains = (value, fields = []) => containsAny(value, fields);

const idContains = (field, value) => containsAny(value, [field]);

const genderFilter = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return {};
  }
  const lower = raw.toLowerCase();
  const aliases =
    lower === "male" || lower === "પુરુષ"
      ? ["male", "Male", "પુરુષ"]
      : lower === "female" || lower === "સ્ત્રી"
        ? ["female", "Female", "સ્ત્રી"]
        : [raw];
  return {
    $or: [...new Set(aliases)].map((item) => ({
      gender: new RegExp(`^${escapeRegex(item)}$`, "i"),
    })),
  };
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

const LEVEL_KEY_RESOLVER = {
  country: countryValueKeys,
  state: stateValueKeys,
  region: regionValueKeys,
  vibhag: vibhagValueKeys,
  district: districtValueKeys,
  city: cityValueKeys,
  localSamaj: samajValueKeys,
};

const USER_SORT_FIELDS = new Set([
  "id",
  "familyId",
  "firstName",
  "lastName",
  "role",
  "roleRank",
  "email",
  "allowed",
  "active",
  "createdAt",
  "updatedAt",
]);

const buildUserSort = (query = {}) => {
  const sortBy = String(query.sortBy || "").trim();
  if (!USER_SORT_FIELDS.has(sortBy)) {
    return { id: -1 };
  }
  const sortOrder =
    String(query.sortOrder || "").trim().toLowerCase() === "asc" ? 1 : -1;
  return { [sortBy]: sortOrder };
};

const getViewerVisibilityFilter = async (reqUser) => {
  await ensureUsersLocationAndRankBackfilled();
  const viewerDoc = await findAccountByTokenId(reqUser?.id);
  if (!viewerDoc) {
    return {
      viewer: null,
      visibilityFilter: buildUserVisibilityFilter(null),
      locationKeys: [],
      levelField: null,
    };
  }
  const plainViewer = viewerDoc.toObject
    ? viewerDoc.toObject()
    : { ...viewerDoc };
  const { user: enrichedViewer, patch } = await enrichUserLocation(plainViewer);
  if (Object.keys(patch).length && viewerDoc._id) {
    await User.updateOne({ _id: viewerDoc._id }, { $set: patch });
  }
  const normalizedRole = normalizeRole(enrichedViewer.role);
  const levelField = USER_LEVEL_FIELD_BY_ROLE[normalizedRole] || null;
  const keyResolver = levelField ? LEVEL_KEY_RESOLVER[levelField] : null;
  const locationKeys =
    keyResolver && enrichedViewer[levelField]
      ? await keyResolver(enrichedViewer[levelField])
      : undefined;
  const visibilityFilter = buildUserVisibilityFilter(enrichedViewer, {
    locationKeys,
  });
  return {
    viewer: enrichedViewer,
    visibilityFilter,
    locationKeys: locationKeys || [],
    levelField,
  };
};

const buildUserQueryFilter = async (reqQuery = {}) => {
  const lastName = asQueryList(reqQuery.lastName);
  const country = asQueryList(reqQuery.country);
  const state = asQueryList(reqQuery.state);
  const region = asQueryList(reqQuery.region);
  const vibhag = asQueryList(reqQuery.vibhag);
  const district = asQueryList(reqQuery.district);
  const city = asQueryList(reqQuery.city);
  const samaj = asQueryList(reqQuery.samaj || reqQuery.localSamaj);
  const roles = asQueryList(reqQuery.roles).map(normalizeRole).filter(Boolean);
  const { familyId, firstName, mobile, email, gender } = reqQuery;

  const [
    CountryFilter,
    StateFilter,
    RegionFilter,
    VibhagFilter,
    DistrictFilter,
    CityFilter,
    SamajFilter,
  ] = await Promise.all([
    parentIdFilter("country", country, Country),
    parentIdFilter("state", state, State),
    parentIdFilter("region", region, Region),
    parentIdFilter("vibhag", vibhag, Vibhag),
    parentIdFilter("district", district, District),
    parentIdFilter("city", city, City),
    parentIdFilter("localSamaj", samaj, Samaj),
  ]);

  const Roles = roles.length > 0 ? { role: { $in: roles } } : {};
  const LastName = lastName.length > 0 ? { lastName: { $in: lastName } } : {};
  const FamilyId = idContains("familyId", familyId);
  const FirstName = textContains(firstName, ["firstName", "middleName"]);
  const Mobile = textContains(mobile, ["mobile"]);
  const Email = textContains(email, ["email"]);
  const Gender = genderFilter(gender);

  return mergeAnd(
    LastName,
    CountryFilter,
    StateFilter,
    RegionFilter,
    VibhagFilter,
    DistrictFilter,
    CityFilter,
    SamajFilter,
    FamilyId,
    FirstName,
    Mobile,
    Gender,
    Email,
    Roles,
  );
};

router.use(verifyToken());
attachLinkedRoute(router, "user", errorCheck);

router.get("/getInfo/:id", async (req, res) => {
  if (errorCheck(req, res)) {
    return;
  }
  if (!canManageUsers(req.user?.role)) {
    return res.status(403).json({ message: appMessages.notAllowed });
  }
  const { visibilityFilter } = await getViewerVisibilityFilter(req.user);
  const user = await User.findOne(
    mergeAnd(idOrObjectIdFilter(String(req.params.id)), visibilityFilter),
  ).lean();
  if (!user) {
    return res.status(404).json({ message: appMessages.userNotFound });
  }
  delete user.password;
  delete user.fcmToken;
  const mongoId = user._id;
  user.id = mongoId;
  delete user._id;
  const { user: withLocation, patch } = await enrichUserLocation(user);
  if (Object.keys(patch).length && mongoId) {
    await User.updateOne({ _id: mongoId }, { $set: patch });
  }
  withLocation.Permission = await getPermissionByUserId(mongoId);
  res.status(200).json(withLocation);
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
    const { user: withLocation, patch } = await enrichUserLocation(safeUser);
    if (Object.keys(patch).length && user._id) {
      await User.updateOne({ _id: user._id }, { $set: patch });
    }
    res.status(200).json(withLocation);
  }
});

router.get("/list", async (req, res) => {
  if (!errorCheck(req, res)) {
    if (!canManageUsers(req.user?.role)) {
      return res.status(403).json({ message: appMessages.notAllowed });
    }
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const [{ visibilityFilter }, filterSearch] = await Promise.all([
      getViewerVisibilityFilter(req.user),
      buildUserQueryFilter(req.query),
    ]);
    const query = mergeAnd(visibilityFilter, filterSearch);
    const sort = buildUserSort(req.query);
    const [users, totalItems] = await Promise.all([
      User.find(query)
        .select("-password -fcmToken")
        .sort(sort)
        .skip(offset)
        .limit(limit)
        .exec(),
      User.countDocuments(query),
    ]);
    const totalPages = Math.ceil(totalItems / limit);
    res.status(200).json({ total: totalItems, page, totalPages, data: users });
  }
});

router.get("/export", async (req, res) => {
  if (errorCheck(req, res)) {
    return;
  }
  if (!canManageUsers(req.user?.role)) {
    return res.status(403).json({ message: appMessages.notAllowed });
  }
  const format = String(req.query.format || "csv").trim().toLowerCase();
  if (format !== "csv" && format !== "xlsx") {
    return res.status(400).json({ message: "Choose CSV or XLSX." });
  }
  const [{ visibilityFilter }, filterSearch] = await Promise.all([
    getViewerVisibilityFilter(req.user),
    buildUserQueryFilter(req.query),
  ]);
  const query = mergeAnd(visibilityFilter, filterSearch);
  const sort = buildUserSort(req.query);
  const users = await User.find(query)
    .select("-password -fcmToken")
    .sort(sort)
    .lean();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Users");
  sheet.columns = [
    { header: "Family ID", key: "familyId", width: 14 },
    { header: "First Name", key: "firstName", width: 18 },
    { header: "Middle Name", key: "middleName", width: 18 },
    { header: "Last Name", key: "lastName", width: 18 },
    { header: "Role", key: "role", width: 18 },
    { header: "Email", key: "email", width: 28 },
    { header: "Mobile", key: "mobile", width: 16 },
    { header: "Gender", key: "gender", width: 12 },
    { header: "Allowed", key: "allowed", width: 10 },
    { header: "Active", key: "active", width: 10 },
  ];
  users.forEach((row) => {
    sheet.addRow({
      familyId: row.familyId ?? "",
      firstName: row.firstName || "",
      middleName: row.middleName || "",
      lastName: row.lastName || "",
      role: row.role || "",
      email: row.email || "",
      mobile: row.mobile || "",
      gender: row.gender || "",
      allowed: row.allowed ? "Yes" : "No",
      active: row.active ? "Yes" : "No",
    });
  });

  if (format === "xlsx") {
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", 'attachment; filename="users.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
    return;
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="users.csv"');
  await workbook.csv.write(res);
  res.end();
});

router.get("/requests", async (req, res) => {
  if (!errorCheck(req, res)) {
    if (!canManageUsers(req.user?.role)) {
      return res.status(403).json({ message: appMessages.notAllowed });
    }
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const [{ visibilityFilter }, filterSearch] = await Promise.all([
      getViewerVisibilityFilter(req.user),
      buildUserQueryFilter(req.query),
    ]);
    const query = mergeAnd(
      visibilityFilter,
      { allowed: { $eq: false } },
      { $or: [{ active: true }, { updatedAt: null }] },
      filterSearch,
    );
    const sort = buildUserSort(req.query);
    const [users, totalItems] = await Promise.all([
      User.find(query)
        .select("-password -fcmToken")
        .sort(sort)
        .skip(offset)
        .limit(limit)
        .exec(),
      User.countDocuments(query),
    ]);
    const totalPages = Math.ceil(totalItems / limit);
    res.status(200).json({ total: totalItems, page, totalPages, data: users });
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
    if (user.familyId != null && user.familyId !== "") {
      user.familyId = Number(user.familyId);
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
      actorRole === "VIBHAG_MANAGER" ||
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
    if (actorRole === "VIBHAG_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const samajIds = await samajIdsForVibhag(
        await getManagerVibhagId(manager),
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
    user.role = normalizeRole(user.role || "USER") || "USER";
    const { user: withLocation } = await enrichUserLocation(user);
    delete withLocation.Permission;
    const dbUser = await User.create({
      ...withLocation,
      role: user.role,
      roleRank: getRoleRank(user.role),
      id: uuidv4().replace(/-/g, ""),
      createdAt: new Date(),
      updatedAt: null,
      createdBy: req.user?.id || null,
      updatedBy: null,
      active: true,
      allowed: isAdmin,
      fcmToken: user.fcmToken || null,
      language: user.language === "en" ? "en" : "gu",
    });
    await savePermissionForUser(
      dbUser._id,
      dbUser.role || withLocation.role || user.role,
      user.Permission,
    );
    await notifyAccountEvent(
      dbUser,
      isAdmin ? "AccountVerifySuccess" : "RegistrationSuccess",
    );
    notifyStaffEvent({
      kind: isAdmin || dbUser.allowed ? "NewUserAdded" : "NewSignupRequest",
      subject: dbUser,
      subjectKind: "user",
      excludeIds: [req.user?.id, req.user?._id],
      data: { path: dbUser.allowed ? "/userlist" : "/request" },
    });
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
  try {
    const user = { ...req.body };
    delete user.confirmPassword;
    if (!user.password) {
      return res.status(400).json({ message: appMessages.passwordRequired });
    }
    if (user.familyId != null && user.familyId !== "") {
      user.familyId = Number(user.familyId);
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

      user?.fcmToken &&
        (await sendNotification(
          user?.fcmToken,
          notification.RegistrationFail.title.en,
          errorMessage,
        ));

      return res.status(401).json({ message: errorMessage });
    }

    const { user: withLocation } = await enrichUserLocation(user);
    delete withLocation.Permission;
    const dbUser = await User.create({
      ...withLocation,
      id: uuidv4().replace(/-/g, ""),
      createdAt: new Date(),
      updatedAt: null,
      createdBy: null,
      updatedBy: null,
      active: true,
      role: "USER",
      roleRank: getRoleRank("USER"),
      allowed: false,
      fcmToken: user.fcmToken || null,
      language: user.language === "en" ? "en" : "gu",
    });
    await notifyAccountEvent(dbUser, "RegistrationSuccess");
    notifyStaffEvent({
      kind: "NewSignupRequest",
      subject: dbUser,
      subjectKind: "user",
      data: { path: "/request" },
    });
    res.send(dbUser);
  } catch (e) {
    res.status(400).json({ message: e.message || appMessages.createFailed });
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
    if (payload.language) {
      payload.language = payload.language === "en" ? "en" : "gu";
    }

    const actorIsAdmin = isAdminRole(req.user?.role);
    const actorCanManage = canManageUsers(req.user?.role);

    let currentUser = null;
    let visibilityMeta = null;

    if (actorCanManage) {
      visibilityMeta = await getViewerVisibilityFilter(req.user);
      currentUser = await User.findOne(
        mergeAnd(idOrObjectIdFilter(String(id)), visibilityMeta.visibilityFilter),
      ).lean();
      if (!currentUser) {
        return res.status(404).json({ message: appMessages.userNotFound });
      }
    } else {
      await ensureUsersLocationAndRankBackfilled();
      currentUser = await User.findOne(idOrObjectIdFilter(String(id))).lean();
      if (!currentUser) {
        return res.status(404).json({ message: appMessages.userNotFound });
      }
    }

    const isSelf =
      String(req.user.id) === String(id) ||
      String(req.user.id) === String(currentUser._id) ||
      String(req.user.id) === String(currentUser.id);

    if (!isSelf && !actorCanManage) {
      return res.status(403).json({ message: appMessages.notAllowed });
    }
    if (isAdminRole(currentUser.role) && !actorIsAdmin) {
      return res.status(404).json({ message: appMessages.userNotFound });
    }

    if (isSelf) {
      delete payload.role;
      delete payload.roleRank;
      delete payload.password;
      delete payload.Permission;
      if (!actorIsAdmin) {
        delete payload.allowed;
        delete payload.active;
      }
    }

    let nextPermission = null;
    const permissionTouched =
      Object.prototype.hasOwnProperty.call(payload, "Permission") ||
      Boolean(payload.role);
    // Only admins assign roles and manager Permission flags.
    if (!actorIsAdmin) {
      delete payload.role;
      delete payload.roleRank;
      delete payload.Permission;
    } else {
      if (payload.role) {
        if (typeof payload.role === "object") {
          payload.role = payload.role.value || payload.role.id || currentUser.role;
        }
        payload.role = normalizeRole(payload.role);
        payload.roleRank = getRoleRank(payload.role);
      }
      if (permissionTouched) {
        const nextRole = payload.role || currentUser.role;
        const existing = await getPermissionByUserId(currentUser._id);
        nextPermission = normalizePermissionForRole(
          nextRole,
          Object.prototype.hasOwnProperty.call(payload, "Permission")
            ? payload.Permission
            : existing,
        );
      }
    }
    delete payload.Permission;

    const locationFields = [
      "country",
      "state",
      "region",
      "vibhag",
      "district",
      "city",
      "localSamaj",
    ];
    const locationTouched = locationFields.some((field) =>
      Object.prototype.hasOwnProperty.call(payload, field),
    );
    if (locationTouched) {
      const mergedLocationInput = {
        ...currentUser,
        ...payload,
      };
      if (
        Object.prototype.hasOwnProperty.call(payload, "localSamaj") &&
        String(payload.localSamaj || "") !== String(currentUser.localSamaj || "")
      ) {
        ["country", "state", "region", "vibhag", "district", "city"].forEach(
          (ancestorField) => {
            if (!Object.prototype.hasOwnProperty.call(payload, ancestorField)) {
              mergedLocationInput[ancestorField] = "";
            }
          },
        );
      }
      const { user: enrichedTarget } = await enrichUserLocation(
        mergedLocationInput,
      );
      locationFields.forEach((field) => {
        if (enrichedTarget[field] !== undefined) {
          payload[field] = enrichedTarget[field];
        }
      });
    }

    if (!isSelf && !actorIsAdmin && visibilityMeta?.levelField) {
      const targetLevelValue = String(
        payload[visibilityMeta.levelField] ??
          currentUser[visibilityMeta.levelField] ??
          "",
      ).trim();
      if (
        !visibilityMeta.locationKeys.length ||
        !visibilityMeta.locationKeys.includes(targetLevelValue)
      ) {
        return res.status(403).json({ message: appMessages.notAllowed });
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

    if (nextPermission !== null) {
      await savePermissionForUser(
        currentUser._id,
        payload.role || currentUser.role,
        nextPermission,
      );
    }

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
    const userIds = [
      ...new Set(
        (Array.isArray(data?.users) ? data.users : [])
          .map((item) => String(item || "").trim())
          .filter(Boolean),
      ),
    ];
    if (!userIds.length) {
      return res.status(404).json({ message: appMessages.userNotFound });
    }
    const { visibilityFilter } = await getViewerVisibilityFilter(req.user);
    const query = mergeAnd(idsFilter(userIds), visibilityFilter);
    const usersToDelete = await User.find(query).lean();
    if (usersToDelete.length !== userIds.length) {
      return res.status(404).json({ message: appMessages.userNotFound });
    }
    await User.deleteMany({ _id: { $in: usersToDelete.map((doc) => doc._id) } });
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
    const userIds = [
      ...new Set(
        (Array.isArray(ids) ? ids : [])
          .map((item) => String(item || "").trim())
          .filter(Boolean),
      ),
    ];
    if (!userIds.length) {
      return res.status(404).json({ message: appMessages.userNotFound });
    }
    const { visibilityFilter } = await getViewerVisibilityFilter(req.user);
    const query = mergeAnd(idsFilter(userIds), visibilityFilter);
    const usersToUpdate = await User.find(query).lean();
    if (usersToUpdate.length !== userIds.length) {
      return res.status(404).json({ message: appMessages.userNotFound });
    }

    await User.updateMany(
      { _id: { $in: usersToUpdate.map((doc) => doc._id) } },
      {
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
  if (errorCheck(req, res)) {
    return;
  }
  const { id } = req.params;
  const fcmToken = req.body?.fcmToken;

  const currentUser =
    (await User.findById(id).lean()) ||
    (await User.findOne(idOrObjectIdFilter(String(id))).lean());

  if (!currentUser) {
    return res.status(404).json({ message: appMessages.userNotFound });
  }

  const isSelf =
    String(req.user?.id) === String(id) ||
    String(req.user?.id) === String(currentUser._id) ||
    String(req.user?.id) === String(currentUser.id);
  const actorIsAdmin = isAdminRole(req.user?.role);

  if (!isSelf && !actorIsAdmin) {
    return res.status(403).json({ message: appMessages.notAllowed });
  }
  if (isAdminRole(currentUser.role) && !actorIsAdmin) {
    return res.status(403).json({ message: appMessages.notAllowed });
  }

  await User.updateOne(
    { _id: currentUser._id },
    { $set: { fcmToken, updatedAt: new Date(), updatedBy: req.user.id } },
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
