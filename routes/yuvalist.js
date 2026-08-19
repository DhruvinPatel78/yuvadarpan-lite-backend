const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const Yuvalist = require("../models/yuvalist");
const User = require("../models/user");
const { v4: uuidv4 } = require('uuid');
const { idsFilter, idOrObjectIdFilter, sanitizeUpdatePayload } = require("../utils/childCount");
const { deleteYuvaImages } = require("../utils/s3");
const { getPublicYuvaById } = require("../utils/yuvaPublic");
const {
  findAccountByTokenId,
  samajValueKeys,
  isOwnSamajQuery,
  isOwnCityQuery,
  isOwnDistrictQuery,
  isOwnRegionQuery,
  isOwnStateQuery,
  isOwnCountryQuery,
  usersInManagerCityQuery,
  recordsInManagerCityQuery,
  recordsInManagerDistrictQuery,
  recordsInManagerRegionQuery,
  recordsInManagerStateQuery,
  recordsInManagerCountryQuery,
  getManagerCityId,
  getManagerDistrictId,
  getManagerRegionId,
  getManagerStateId,
  getManagerCountryId,
  samajIdsForCity,
  samajIdsForDistrict,
  samajIdsForRegion,
  samajIdsForState,
  samajIdsForCountry,
  cityIdsForDistrict,
  cityIdsForRegion,
  cityIdsForState,
  cityIdsForCountry,
  districtIdsForRegion,
  districtIdsForState,
  districtIdsForCountry,
  regionIdsForState,
  regionIdsForCountry,
  stateIdsForCountry,
} = require("../utils/managerScope");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    jwt.verify(
      authHeader.replace("Bearer ", ""),
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

router.get("/public/:id", async (req, res) => {
  try {
    const yuva = await getPublicYuvaById(req.params.id);
    if (!yuva) {
      return res.status(404).json({ message: "yuva-not-found" });
    }
    res.status(200).json(yuva);
  } catch (e) {
    res.status(500).json({ message: "failed-to-fetch" });
  }
});

router.use(verifyToken);

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

const toQueryArray = (value) => {
  if (value == null || value === "") {
    return [];
  }
  const list = Array.isArray(value) ? value : [value];
  return list.filter((item) => item !== undefined && item !== null && item !== "");
};

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const containsClause = (field, value) => {
  if (value == null || String(value).trim() === "") {
    return null;
  }
  return {
    [field]: { $regex: escapeRegex(String(value).trim()), $options: "i" },
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
    containsClause("familyId", query.familyId),
    containsClause("firstName", query.firstName),
    containsClause("fatherName", query.fatherName),
    containsClause("grandFatherName", query.grandFatherName),
    containsClause("gender", query.gender),
    containsClause("firm", query.firmName || query.firm),
    containsClause("email", query.email),
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
      { firstName: rx },
      { fatherName: rx },
      { grandFatherName: rx },
      { motherName: rx },
      { familyId: rx },
      { firm: rx },
      { email: rx },
      { gender: rx },
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

const sendPagedYuvas = async (res, filter, page, limit) => {
  const offset = (page - 1) * limit;
  const [data, total] = await Promise.all([
    Yuvalist.find(filter).skip(offset).limit(limit).exec(),
    Yuvalist.countDocuments(filter),
  ]);
  res.status(200).json({
    total,
    page,
    totalPages: Math.ceil(total / limit) || 0,
    data,
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
    await sendPagedYuvas(res, filter, page, limit);
  } catch (e) {
    console.error("yuva list failed", e);
    res.status(500).json({ message: "failed-to-fetch" });
  }
});

router.get("/get-all-list", async (req, res) => {
  if (!errorCheck(req, res)) {
    const {id, role} = req.user;
    if(role === "USER") {
      const dbYuva = await Yuvalist.find({
        active: { $eq: true }
      });
      res.status(200).json(dbYuva);
    }
    else if (role === "ADMIN") {
      const dbYuva = await Yuvalist.find();
      res.status(200).json(dbYuva);
    } else if (role === "REGION_MANAGER") {
      const manager = await findAccountByTokenId(id);
      const dbYuva = await Yuvalist.find(await recordsInManagerRegionQuery(manager));
      res.status(200).json(dbYuva);
    } else if (role === "STATE_MANAGER") {
      const manager = await findAccountByTokenId(id);
      const dbYuva = await Yuvalist.find(await recordsInManagerStateQuery(manager));
      res.status(200).json(dbYuva);
    } else if (role === "COUNTRY_MANAGER") {
      const manager = await findAccountByTokenId(id);
      const dbYuva = await Yuvalist.find(await recordsInManagerCountryQuery(manager));
      res.status(200).json(dbYuva);
    } else if (role === "SAMAJ_MANAGER") {
      const mangerSamaj = await User.findById(id);
      if (mangerSamaj?.localSamaj) {
        const dbYuva = await Yuvalist.find({
          localSamaj: { $eq: mangerSamaj?.localSamaj },
        });
        res.status(200).json(dbYuva);
      }
    } else if (role === "CITY_MANAGER") {
      const manager = await findAccountByTokenId(id);
      const dbYuva = await Yuvalist.find(await recordsInManagerCityQuery(manager));
      res.status(200).json(dbYuva);
    } else if (role === "DISTRICT_MANAGER") {
      const manager = await findAccountByTokenId(id);
      const dbYuva = await Yuvalist.find(await recordsInManagerDistrictQuery(manager));
      res.status(200).json(dbYuva);
    }
  }
});

router.get("/list/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    const dbYuva = await Yuvalist.findById(req.params.id);
    res.json(dbYuva);
  }
});

router.get("/citylist", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = require("../data/pages.json");
    res.json(data.data);
  }
});

router.post("/addYuvaList", async (req, res) => {
  const data = req.body;
  const user = req.user;
  if (user.role === "ADMIN" || user.role === "SAMAJ_MANAGER" || user.role === "CITY_MANAGER" || user.role === "DISTRICT_MANAGER" || user.role === "REGION_MANAGER" || user.role === "STATE_MANAGER" || user.role === "COUNTRY_MANAGER") {
    if (user.role === "SAMAJ_MANAGER") {
      const manager = await findAccountByTokenId(user.id);
      if (!manager?.localSamaj) {
        return res.status(403).send({ message: "samaj-not-assigned" });
      }
      data.localSamaj = manager.localSamaj;
    }
    if (user.role === "CITY_MANAGER") {
      const manager = await findAccountByTokenId(user.id);
      const cityId = await getManagerCityId(manager);
      if (!cityId) {
        return res.status(403).send({ message: "city-not-assigned" });
      }
      data.city = cityId;
      const samajIds = await samajIdsForCity(cityId);
      if (data.localSamaj && !samajIds.includes(String(data.localSamaj))) {
        return res.status(403).json({ message: "not-allowed" });
      }
    }
    if (user.role === "DISTRICT_MANAGER") {
      const manager = await findAccountByTokenId(user.id);
      const districtId = await getManagerDistrictId(manager);
      if (!districtId) {
        return res.status(403).send({ message: "district-not-assigned" });
      }
      data.district = districtId;
      const cityIds = await cityIdsForDistrict(districtId);
      if (data.city && !cityIds.includes(String(data.city))) {
        return res.status(403).json({ message: "not-allowed" });
      }
      const samajIds = await samajIdsForDistrict(districtId);
      if (data.localSamaj && !samajIds.includes(String(data.localSamaj))) {
        return res.status(403).json({ message: "not-allowed" });
      }
    }
    if (user.role === "REGION_MANAGER") {
      const manager = await findAccountByTokenId(user.id);
      const regionId = await getManagerRegionId(manager);
      if (!regionId) {
        return res.status(403).send({ message: "region-not-assigned" });
      }
      data.region = regionId;
      const districtIds = await districtIdsForRegion(regionId);
      if (data.district && !districtIds.includes(String(data.district))) {
        return res.status(403).json({ message: "not-allowed" });
      }
      const cityIds = await cityIdsForRegion(regionId);
      if (data.city && !cityIds.includes(String(data.city))) {
        return res.status(403).json({ message: "not-allowed" });
      }
      const samajIds = await samajIdsForRegion(regionId);
      if (data.localSamaj && !samajIds.includes(String(data.localSamaj))) {
        return res.status(403).json({ message: "not-allowed" });
      }
    }
    if (user.role === "STATE_MANAGER") {
      const manager = await findAccountByTokenId(user.id);
      const stateId = await getManagerStateId(manager);
      if (!stateId) {
        return res.status(403).send({ message: "state-not-assigned" });
      }
      data.state = stateId;
      const regionIds = await regionIdsForState(stateId);
      if (data.region && !regionIds.includes(String(data.region))) {
        return res.status(403).json({ message: "not-allowed" });
      }
      const districtIds = await districtIdsForState(stateId);
      if (data.district && !districtIds.includes(String(data.district))) {
        return res.status(403).json({ message: "not-allowed" });
      }
      const cityIds = await cityIdsForState(stateId);
      if (data.city && !cityIds.includes(String(data.city))) {
        return res.status(403).json({ message: "not-allowed" });
      }
      const samajIds = await samajIdsForState(stateId);
      if (data.localSamaj && !samajIds.includes(String(data.localSamaj))) {
        return res.status(403).json({ message: "not-allowed" });
      }
    }
    if (user.role === "COUNTRY_MANAGER") {
      const manager = await findAccountByTokenId(user.id);
      const countryId = await getManagerCountryId(manager);
      if (!countryId) {
        return res.status(403).send({ message: "country-not-assigned" });
      }
      data.country = countryId;
      const stateIds = await stateIdsForCountry(countryId);
      if (data.state && !stateIds.includes(String(data.state))) {
        return res.status(403).json({ message: "not-allowed" });
      }
      const regionIds = await regionIdsForCountry(countryId);
      if (data.region && !regionIds.includes(String(data.region))) {
        return res.status(403).json({ message: "not-allowed" });
      }
      const districtIds = await districtIdsForCountry(countryId);
      if (data.district && !districtIds.includes(String(data.district))) {
        return res.status(403).json({ message: "not-allowed" });
      }
      const cityIds = await cityIdsForCountry(countryId);
      if (data.city && !cityIds.includes(String(data.city))) {
        return res.status(403).json({ message: "not-allowed" });
      }
      const samajIds = await samajIdsForCountry(countryId);
      if (data.localSamaj && !samajIds.includes(String(data.localSamaj))) {
        return res.status(403).json({ message: "not-allowed" });
      }
    }
    const dbYuvaList = await Yuvalist.create({
      ...data,
      // id: crypto.randomUUID().replace(/-/g, ""),
      id: uuidv4().replace(/-/g, ""),
      active: true,
      createdAt: new Date(),
      updatedAt: null,
      createdBy: req.user.id,
      updatedBy: null,
    });
    res.send(dbYuvaList);
  } else {
    res.status(403).send({ message: "only-admin-can-create-yuva" });
  }
});

const deleteYuvaRecords = async (filter) => {
  const docs = await Yuvalist.find(filter).lean();
  await Yuvalist.deleteMany(filter);
  try {
    await deleteYuvaImages(docs);
  } catch (e) {
    console.error("Failed to delete yuva images from S3", e);
  }
};

router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res)) {
    const ids = req.body?.ids || [];
    let filter = idsFilter(ids);
    if (req.user.role === "SAMAJ_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const samajKeys = await samajValueKeys(manager?.localSamaj);
      filter = { $and: [filter, { localSamaj: { $in: samajKeys } }] };
    }
    if (req.user.role === "CITY_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      filter = { $and: [filter, await recordsInManagerCityQuery(manager)] };
    }
    if (req.user.role === "DISTRICT_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      filter = { $and: [filter, await recordsInManagerDistrictQuery(manager)] };
    }
    if (req.user.role === "REGION_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      filter = { $and: [filter, await recordsInManagerRegionQuery(manager)] };
    }
    if (req.user.role === "STATE_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      filter = { $and: [filter, await recordsInManagerStateQuery(manager)] };
    }
    if (req.user.role === "COUNTRY_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      filter = { $and: [filter, await recordsInManagerCountryQuery(manager)] };
    }
    await deleteYuvaRecords(filter);
    res.status(200).json({ message: "Delete Successfully" });
  }
});

router.delete("/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    let filter = idOrObjectIdFilter(req.params.id);
    if (req.user.role === "SAMAJ_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const samajKeys = await samajValueKeys(manager?.localSamaj);
      filter = { $and: [filter, { localSamaj: { $in: samajKeys } }] };
    }
    if (req.user.role === "CITY_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      filter = { $and: [filter, await recordsInManagerCityQuery(manager)] };
    }
    if (req.user.role === "DISTRICT_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      filter = { $and: [filter, await recordsInManagerDistrictQuery(manager)] };
    }
    if (req.user.role === "REGION_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      filter = { $and: [filter, await recordsInManagerRegionQuery(manager)] };
    }
    if (req.user.role === "STATE_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      filter = { $and: [filter, await recordsInManagerStateQuery(manager)] };
    }
    if (req.user.role === "COUNTRY_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      filter = { $and: [filter, await recordsInManagerCountryQuery(manager)] };
    }
    await deleteYuvaRecords(filter);
    res.status(200).json({ message: "Delete Successfully" });
  }
});

router.patch("/update/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { id } = req.params;
    let filter = idOrObjectIdFilter(id);
    if (req.user.role === "SAMAJ_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      const samajKeys = await samajValueKeys(manager?.localSamaj);
      filter = { $and: [filter, { localSamaj: { $in: samajKeys } }] };
      const allowed = await Yuvalist.findOne(filter);
      if (!allowed) {
        return res.status(403).json({ message: "not-allowed" });
      }
    }
    if (req.user.role === "CITY_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      filter = { $and: [filter, await recordsInManagerCityQuery(manager)] };
      const allowed = await Yuvalist.findOne(filter);
      if (!allowed) {
        return res.status(403).json({ message: "not-allowed" });
      }
    }
    if (req.user.role === "DISTRICT_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      filter = { $and: [filter, await recordsInManagerDistrictQuery(manager)] };
      const allowed = await Yuvalist.findOne(filter);
      if (!allowed) {
        return res.status(403).json({ message: "not-allowed" });
      }
    }
    if (req.user.role === "REGION_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      filter = { $and: [filter, await recordsInManagerRegionQuery(manager)] };
      const allowed = await Yuvalist.findOne(filter);
      if (!allowed) {
        return res.status(403).json({ message: "not-allowed" });
      }
    }
    if (req.user.role === "STATE_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      filter = { $and: [filter, await recordsInManagerStateQuery(manager)] };
      const allowed = await Yuvalist.findOne(filter);
      if (!allowed) {
        return res.status(403).json({ message: "not-allowed" });
      }
    }
    if (req.user.role === "COUNTRY_MANAGER") {
      const manager = await findAccountByTokenId(req.user.id);
      filter = { $and: [filter, await recordsInManagerCountryQuery(manager)] };
      const allowed = await Yuvalist.findOne(filter);
      if (!allowed) {
        return res.status(403).json({ message: "not-allowed" });
      }
    }
    await Yuvalist.updateOne(
      filter,
      {
        ...sanitizeUpdatePayload(req.body),
        updatedAt: new Date(),
        updatedBy: req?.user?.id,
      },
    );
    res.status(200).json({ message: "Updated Successfully" });
  }
});

module.exports = router;
