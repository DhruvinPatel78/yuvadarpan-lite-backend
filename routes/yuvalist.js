const express = require("express");
const router = express.Router();
const Yuvalist = require("../models/yuvalist");
const User = require("../models/user");
const { v4: uuidv4 } = require('uuid');
const { idsFilter, idOrObjectIdFilter, sanitizeUpdatePayload, findByAnyId } = require("../utils/childCount");
const { deleteYuvaImages } = require("../utils/s3");
const { getPublicYuvaById, pickYuvaFields, resolveYuvaLabels, MEMBER_YUVA_SELECT, MEMBER_YUVA_KEYS } = require("../utils/yuvaPublic");
const { verifyToken, errorCheck } = require("../utils/auth");
const { escapeRegex } = require("../utils/escapeRegex");
const {
  findAccountByTokenId,
  samajValueKeys,
  isOwnSamajQuery,
  isOwnCityQuery,
  isOwnDistrictQuery,
  isOwnRegionQuery,
  isOwnStateQuery,
  isOwnCountryQuery,
  recordsInManagerCityQuery,
  recordsInManagerDistrictQuery,
  recordsInManagerRegionQuery,
  recordsInManagerStateQuery,
  recordsInManagerCountryQuery,
  isAdmin,
  isLocationMasterReadOnly,
  getYuvaWriteScopeFilter,
  mergeYuvaWriteFilter,
  constrainYuvaLocationForManager,
} = require("../utils/managerScope");
const { attachLinkedRoute } = require("../utils/linkedRecords");
const { recordActivity, recordActivityMany } = require("../utils/activityLog");
const { prepareYuvaRecord, withEnGu, omitGu } = require("../utils/yuvaGu");

const dropStoredGu = async (docs = []) => {
  const ids = docs.map((doc) => doc?._id).filter(Boolean);
  if (!ids.length) {
    return;
  }
  await Yuvalist.collection.updateMany({ _id: { $in: ids } }, { $unset: { gu: "" } });
};

router.use((req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = (body) => sendJson(omitGu(body));
  next();
});

router.get("/public/:id", async (req, res) => {
  try {
    const yuva = await getPublicYuvaById(req.params.id);
    if (!yuva) {
      return res.status(404).json({ message: "Profile not found." });
    }
    res.status(200).json(yuva);
  } catch (e) {
    res.status(500).json({ message: "Could not load data." });
  }
});

router.use(verifyToken());
attachLinkedRoute(router, "yuva", errorCheck);

const toQueryArray = (value) => {
  if (value == null || value === "") {
    return [];
  }
  const list = Array.isArray(value) ? value : [value];
  return list.filter((item) => item !== undefined && item !== null && item !== "");
};

const parseAgeBound = (value) => {
  if (value == null || value === "") {
    return null;
  }
  const age = Number(value);
  if (!Number.isFinite(age) || age < 0 || age > 120) {
    return null;
  }
  return Math.floor(age);
};

const dobRangeForAge = (minAge, maxAge) => {
  let fromAge = minAge;
  let toAge = maxAge;
  if (fromAge != null && toAge != null && fromAge > toAge) {
    const swapped = fromAge;
    fromAge = toAge;
    toAge = swapped;
  }
  const now = new Date();
  const dob = {};
  if (fromAge != null) {
    const latestDob = new Date(now);
    latestDob.setFullYear(latestDob.getFullYear() - fromAge);
    dob.$lte = latestDob;
  }
  if (toAge != null) {
    const earliestDob = new Date(now);
    earliestDob.setFullYear(earliestDob.getFullYear() - (toAge + 1));
    dob.$gt = earliestDob;
  }
  return Object.keys(dob).length ? { dob } : null;
};

const containsClause = (field, value) => {
  if (value == null || String(value).trim() === "") {
    return null;
  }
  return {
    [field]: { $regex: escapeRegex(String(value).trim()), $options: "i" },
  };
};

const bilingualContains = (field, value) => {
  if (value == null || String(value).trim() === "") {
    return null;
  }
  const rx = { $regex: escapeRegex(String(value).trim()), $options: "i" };
  return {
    $or: [
      { [`${field}.en`]: rx },
      { [`${field}.gu`]: rx },
      { [field]: rx },
      { [`${field}En`]: rx },
      { [`${field}Gu`]: rx },
    ],
  };
};

const exactAnyClause = (field, values) => {
  const list = toQueryArray(values);
  if (!list.length) {
    return null;
  }
  return {
    $or: list.flatMap((item) => {
      const rx = {
        $regex: `^${escapeRegex(String(item).trim())}$`,
        $options: "i",
      };
      return [{ [field]: rx }, { [`${field}.en`]: rx }, { [`${field}.gu`]: rx }];
    }),
  };
};

const buildYuvaListFilter = (query = {}) => {
  const clauses = [];
  const lastName = toQueryArray(query.lastName);
  const native = toQueryArray(query.native);
  const state = toQueryArray(query.state);
  const region = toQueryArray(query.region);
  const district = toQueryArray(query.district);
  const city = toQueryArray(query.city);
  const samaj = toQueryArray(query.samaj || query.localSamaj);
  if (lastName.length) {
    clauses.push({ lastName: { $in: lastName } });
  }
  if (native.length) {
    clauses.push({ native: { $in: native } });
  }
  if (state.length) {
    clauses.push({ state: { $in: state } });
  }
  if (region.length) {
    clauses.push({ region: { $in: region } });
  }
  if (district.length) {
    clauses.push({ district: { $in: district } });
  }
  if (city.length) {
    clauses.push({ city: { $in: city } });
  }
  if (samaj.length) {
    clauses.push({ localSamaj: { $in: samaj } });
  }
  [
    exactAnyClause("gender", query.gender),
    exactAnyClause("bloodGroup", query.bloodGroup),
    exactAnyClause(
      "martialStatus",
      query.martialStatus || query.maritalStatus
    ),
  ]
    .filter(Boolean)
    .forEach((clause) => clauses.push(clause));
  const education = toQueryArray(query.education);
  if (education.length) {
    clauses.push({
      $or: education.flatMap((item) => {
        const rx = {
          $regex: `^${escapeRegex(String(item).trim())}$`,
          $options: "i",
        };
        return [{ "education.education": rx }, { education: rx }];
      }),
    });
  }
  const ageClause = dobRangeForAge(
    parseAgeBound(query.minAge),
    parseAgeBound(query.maxAge)
  );
  if (ageClause) {
    clauses.push(ageClause);
  }
  [
    containsClause("familyId", query.familyId),
    bilingualContains("firstName", query.firstName),
    bilingualContains("fatherName", query.fatherName),
    bilingualContains("grandFatherName", query.grandFatherName),
    bilingualContains("firm", query.firmName || query.firm),
  ]
    .filter(Boolean)
    .forEach((clause) => clauses.push(clause));
  const phoneMatch = (value) => {
    if (value == null || String(value).trim() === "") {
      return null;
    }
    return {
      $expr: {
        $regexMatch: {
          input: { $toString: { $ifNull: ["$contactInfo.phone", ""] } },
          regex: escapeRegex(String(value).trim()),
          options: "i",
        },
      },
    };
  };
  const phone = query.mobile || query.phone;
  const phoneClause = phoneMatch(phone);
  if (phoneClause) {
    clauses.push(phoneClause);
  }
  const search = String(query.search || query.q || "").trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: "i" };
    const nameOr = [
      { "firstName.en": rx },
      { "firstName.gu": rx },
      { firstName: rx },
      { "fatherName.en": rx },
      { "fatherName.gu": rx },
      { fatherName: rx },
      { "grandFatherName.en": rx },
      { "grandFatherName.gu": rx },
      { grandFatherName: rx },
      { "motherName.en": rx },
      { "motherName.gu": rx },
      { motherName: rx },
      { familyId: rx },
      { "firm.en": rx },
      { "firm.gu": rx },
      { firm: rx },
      { gender: rx },
      { "gender.en": rx },
      { "gender.gu": rx },
      { "martialStatus.en": rx },
      { "martialStatus.gu": rx },
      { "activity.en": rx },
      { "activity.gu": rx },
      { firstNameEn: rx },
      { firstNameGu: rx },
      { fatherNameEn: rx },
      { fatherNameGu: rx },
      { grandFatherNameEn: rx },
      { grandFatherNameGu: rx },
      { motherNameEn: rx },
      { motherNameGu: rx },
      { firmEn: rx },
      { firmGu: rx },
    ];
    const searchPhone = phoneMatch(search);
    if (searchPhone) {
      nameOr.push(searchPhone);
    }
    clauses.push({ $or: nameOr });
  }
  if (!clauses.length) {
    return {};
  }
  if (clauses.length === 1) {
    return clauses[0];
  }
  return { $and: clauses };
};

const mergeFilters = (searchFilter, extraFilter) => {
  const search =
    searchFilter && Object.keys(searchFilter).length ? searchFilter : null;
  const extra =
    extraFilter && Object.keys(extraFilter).length ? extraFilter : null;
  if (!search && !extra) {
    return {};
  }
  if (!search) {
    return extra;
  }
  if (!extra) {
    return search;
  }
  return { $and: [search, extra] };
};

const sendPagedYuvas = async (res, filter, page, limit, limited) => {
  const offset = (page - 1) * limit;
  let query = Yuvalist.find(filter).select("-gu");
  if (limited) {
    query = query.select(MEMBER_YUVA_SELECT);
  }
  const [data, total] = await Promise.all([
    query.skip(offset).limit(limit).exec(),
    Yuvalist.countDocuments(filter),
  ]);
  res.status(200).json({
    total,
    page,
    totalPages: Math.ceil(total / limit) || 0,
    data: data.map(withEnGu),
  });
};

const getYuvaListScopeFilter = async (req) => {
  const { id, role } = req.user;
  if (role === "USER") {
    return { active: true };
  }
  if (role === "ADMIN") {
    return {};
  }
  if (role === "REGION_MANAGER") {
    if (!isOwnRegionQuery(req.query)) {
      return {};
    }
    return recordsInManagerRegionQuery(await findAccountByTokenId(id));
  }
  if (role === "STATE_MANAGER") {
    if (!isOwnStateQuery(req.query)) {
      return {};
    }
    return recordsInManagerStateQuery(await findAccountByTokenId(id));
  }
  if (role === "COUNTRY_MANAGER") {
    if (!isOwnCountryQuery(req.query)) {
      return {};
    }
    return recordsInManagerCountryQuery(await findAccountByTokenId(id));
  }
  if (role === "SAMAJ_MANAGER") {
    if (!isOwnSamajQuery(req.query)) {
      return {};
    }
    const mangerSamaj = await findAccountByTokenId(id);
    const samajKeys = await samajValueKeys(mangerSamaj?.localSamaj);
    return { localSamaj: { $in: samajKeys } };
  }
  if (role === "CITY_MANAGER") {
    if (!isOwnCityQuery(req.query)) {
      return {};
    }
    return recordsInManagerCityQuery(await findAccountByTokenId(id));
  }
  if (role === "DISTRICT_MANAGER") {
    if (!isOwnDistrictQuery(req.query)) {
      return {};
    }
    return recordsInManagerDistrictQuery(await findAccountByTokenId(id));
  }
  return { active: true };
};

router.get("/list", async (req, res) => {
  if (errorCheck(req, res)) {
    return;
  }
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
    const filter = mergeFilters(
      buildYuvaListFilter(req.query),
      await getYuvaListScopeFilter(req)
    );
    await sendPagedYuvas(res, filter, page, limit, String(req.user.role).toUpperCase() === "USER");
  } catch (e) {
    console.error("yuva list failed", e);
    res.status(500).json({ message: "Could not load data." });
  }
});

router.get("/get-all-list", async (req, res) => {
  if (!errorCheck(req, res)) {
    const {id, role} = req.user;
    if(role === "USER") {
      return res.status(403).json({ message: "You cannot do this." });
    }
    else if (role === "ADMIN") {
      const dbYuva = await Yuvalist.find();
      res.status(200).json(dbYuva.map(withEnGu));
    } else if (role === "REGION_MANAGER") {
      const manager = await findAccountByTokenId(id);
      const dbYuva = await Yuvalist.find(await recordsInManagerRegionQuery(manager));
      res.status(200).json(dbYuva.map(withEnGu));
    } else if (role === "STATE_MANAGER") {
      const manager = await findAccountByTokenId(id);
      const dbYuva = await Yuvalist.find(await recordsInManagerStateQuery(manager));
      res.status(200).json(dbYuva.map(withEnGu));
    } else if (role === "COUNTRY_MANAGER") {
      const manager = await findAccountByTokenId(id);
      const dbYuva = await Yuvalist.find(await recordsInManagerCountryQuery(manager));
      res.status(200).json(dbYuva.map(withEnGu));
    } else if (role === "SAMAJ_MANAGER") {
      const mangerSamaj = await User.findById(id);
      if (mangerSamaj?.localSamaj) {
        const dbYuva = await Yuvalist.find({
          localSamaj: { $eq: mangerSamaj?.localSamaj },
        });
        res.status(200).json(dbYuva.map(withEnGu));
      }
    } else if (role === "CITY_MANAGER") {
      const manager = await findAccountByTokenId(id);
      const dbYuva = await Yuvalist.find(await recordsInManagerCityQuery(manager));
      res.status(200).json(dbYuva.map(withEnGu));
    } else if (role === "DISTRICT_MANAGER") {
      const manager = await findAccountByTokenId(id);
      const dbYuva = await Yuvalist.find(await recordsInManagerDistrictQuery(manager));
      res.status(200).json(dbYuva.map(withEnGu));
    }
  }
});

router.get("/list/:id", async (req, res) => {
  if (errorCheck(req, res)) {
    return;
  }
  try {
    const rows = await findByAnyId(Yuvalist, req.params.id);
    const dbYuva = Array.isArray(rows) ? rows[0] : rows;
    if (!dbYuva) {
      return res.status(404).json({ message: "Profile not found." });
    }
    const labels = await resolveYuvaLabels(dbYuva);
    if (String(req.user.role).toUpperCase() === "USER") {
      const picked = pickYuvaFields(withEnGu(dbYuva), MEMBER_YUVA_KEYS);
      picked.labels = labels;
      return res.json(picked);
    }
    const json = withEnGu(dbYuva);
    json.labels = labels;
    res.json(json);
  } catch (e) {
    console.error("yuva get by id failed", e);
    res.status(500).json({ message: "Could not load data." });
  }
});

router.get("/citylist", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = require("../data/pages.json");
    res.json(data.data);
  }
});

router.post("/addYuvaList", async (req, res) => {
  if (errorCheck(req, res)) {
    return;
  }
  const user = req.user;
  if (!(user && (isAdmin(user.role) || isLocationMasterReadOnly(user.role)))) {
    return res.status(403).json({ message: "Only admin can add this." });
  }
  const isBulk = Array.isArray(req.body?.yuvas);
  const items = isBulk ? req.body.yuvas : [req.body];
  if (!items.length) {
    return res.status(400).json({ message: "Add at least one Yuva." });
  }
  try {
    const docs = [];
    for (const data of items) {
      const constrained = await constrainYuvaLocationForManager(user, data);
      if (!constrained.ok) {
        return res.status(constrained.status).json({ message: constrained.message });
      }
      const { email, ...record } = constrained.data || {};
      const prepared = prepareYuvaRecord(record);
      docs.push({
        ...prepared,
        id: uuidv4().replace(/-/g, ""),
        active: true,
        createdAt: new Date(),
        updatedAt: null,
        createdBy: user.id,
        updatedBy: null,
      });
    }
    if (isBulk) {
      const created = await Yuvalist.insertMany(docs);
      await dropStoredGu(created);
      recordActivityMany(req, "create", "yuva", created).catch(() => {});
      return res.status(200).json({ data: created.map(withEnGu), count: created.length });
    }
    const created = await Yuvalist.create(docs[0]);
    await dropStoredGu([created]);
    recordActivity({
      req,
      action: "create",
      entityType: "yuva",
      entity: created,
      next: created,
    }).catch(() => {});
    const plain =
      typeof created.toObject === "function"
        ? created.toObject({ depopulate: true })
        : created;
    return res.status(200).json(withEnGu(plain));
  } catch (e) {
    console.error("add yuva failed", e);
    return res.status(500).json({
      message: e?.message || String(e),
    });
  }
});

const deleteYuvaRecords = async (filter, req) => {
  const docs = await Yuvalist.find(filter).lean();
  await Yuvalist.deleteMany(filter);
  try {
    await deleteYuvaImages(docs);
  } catch (e) {
    console.error("Failed to delete yuva images from S3", e);
  }
  if (req) {
    await recordActivityMany(req, "delete", "yuva", docs);
  }
};

router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res)) {
    const ids = req.body?.ids || [];
    const scope = await getYuvaWriteScopeFilter(req.user.role, req.user.id);
    const filter = mergeYuvaWriteFilter(idsFilter(ids), scope);
    await deleteYuvaRecords(filter, req);
    res.status(200).json({ message: "Delete Successfully" });
  }
});

router.delete("/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    const scope = await getYuvaWriteScopeFilter(req.user.role, req.user.id);
    const filter = mergeYuvaWriteFilter(idOrObjectIdFilter(req.params.id), scope);
    const allowed = await Yuvalist.findOne(filter);
    if (!allowed) {
      return res.status(403).json({ message: "You cannot do this." });
    }
    await deleteYuvaRecords(filter, req);
    res.status(200).json({ message: "Delete Successfully" });
  }
});

router.patch("/update/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { id } = req.params;
    const scope = await getYuvaWriteScopeFilter(req.user.role, req.user.id);
    const filter = mergeYuvaWriteFilter(idOrObjectIdFilter(id), scope);
    const allowed = await Yuvalist.findOne(filter);
    if (!allowed) {
      return res.status(isAdmin(req.user.role) ? 404 : 403).json({
        message: isAdmin(req.user.role) ? "Profile not found." : "You cannot do this.",
      });
    }
    const constrained = await constrainYuvaLocationForManager(req.user, req.body);
    if (!constrained.ok) {
      return res.status(constrained.status).json({ message: constrained.message });
    }
    const previous = allowed.toObject ? allowed.toObject() : { ...allowed };
    const payload = sanitizeUpdatePayload(prepareYuvaRecord(constrained.data));
    delete payload.email;
    delete previous.email;
    await Yuvalist.updateOne(filter, {
      $set: {
        ...payload,
        updatedAt: new Date(),
        updatedBy: req?.user?.id,
      },
      $unset: { email: "", gu: "" },
    });
    await recordActivity({
      req,
      action: "update",
      entityType: "yuva",
      previous,
      next: { ...previous, ...payload },
    });
    res.status(200).json({ message: "Updated Successfully" });
  }
});

module.exports = router;
