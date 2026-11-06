const express = require("express");
const router = express.Router();
const District = require("../models/district");
const Vibhag = require("../models/vibhag");
const Region = require("../models/region");
const State = require("../models/state");
const Country = require("../models/country");
const City = require("../models/city");
const {
  attachChildCounts,
  findChildrenByParent,
  findByAnyId,
  idOrObjectIdFilter,
  idsFilter,
  parentIdFilter,
  sanitizeUpdatePayload,
} = require("../utils/childCount");
const {
  rejectSamajManagerWrite,
  isCityManager,
  isDistrictManager,
  isVibhagManager,
  isRegionManager,
  isStateManager,
  isCountryManager,
  getTokenPayload,
  findAccountByTokenId,
  getManagerVibhagId,
  getManagerRegionId,
  getManagerStateId,
  getManagerCountryId,
  vibhagValueKeys,
  regionValueKeys,
  stateValueKeys,
  countryValueKeys,
  isOwnVibhagQuery,
  isOwnRegionQuery,
  isOwnStateQuery,
  isOwnCountryQuery,
} = require("../utils/managerScope");
const { attachLinkedRoute } = require("../utils/linkedRecords");
const { recordActivity, recordActivityMany } = require("../utils/activityLog");
const { verifyToken, errorCheck, requireAuth } = require("../utils/auth");
const { escapeRegex } = require("../utils/escapeRegex");
const { prepareMasterName, nameContains } = require("../utils/masterName");
const { mergeAnd } = require("../utils/caseInsensitiveSearch");

router.use(verifyToken());
router.use(requireAuth);
attachLinkedRoute(router, "district", errorCheck);

//  Get all districts
router.get("/list", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const { country, state, region, vibhag, name } = req.query;
  const filter = mergeAnd(
    await parentIdFilter("country_id", country, Country),
    await parentIdFilter("state_id", state, State),
    await parentIdFilter("region_id", region, Region),
    await parentIdFilter("vibhag_id", vibhag, Vibhag),
    nameContains(name)
  );
  const tokenUser = getTokenPayload(req);
  if (isVibhagManager(tokenUser?.role) && isOwnVibhagQuery(req.query)) {
    const manager = await findAccountByTokenId(tokenUser?.id);
    const vibhagKeys = await vibhagValueKeys(await getManagerVibhagId(manager));
    filter.vibhag_id = { $in: vibhagKeys.length ? vibhagKeys : ["__none__"] };
  }
  if (isRegionManager(tokenUser?.role) && isOwnRegionQuery(req.query)) {
    const manager = await findAccountByTokenId(tokenUser?.id);
    const regionKeys = await regionValueKeys(await getManagerRegionId(manager));
    filter.region_id = { $in: regionKeys.length ? regionKeys : ["__none__"] };
  }
  if (isStateManager(tokenUser?.role) && isOwnStateQuery(req.query)) {
    const manager = await findAccountByTokenId(tokenUser?.id);
    const stateKeys = await stateValueKeys(await getManagerStateId(manager));
    filter.state_id = { $in: stateKeys.length ? stateKeys : ["__none__"] };
  }
  if (isCountryManager(tokenUser?.role) && isOwnCountryQuery(req.query)) {
    const manager = await findAccountByTokenId(tokenUser?.id);
    const countryKeys = await countryValueKeys(
      await getManagerCountryId(manager),
    );
    filter.country_id = { $in: countryKeys.length ? countryKeys : ["__none__"] };
  }
  const Districts = await District.find(filter)
    .skip(offset)
    .limit(limit)
    .exec();
  const data = await attachChildCounts(
    Districts,
    City,
    "district_id",
    "cityCount"
  );
  const totalItems = await District.countDocuments(filter);
  const totalPages = Math.ceil(totalItems / limit);
  res.status(200).json({ total: totalItems, page, totalPages, data });
});
router.get("/get-all-list", async (req, res) => {
  const Districts = await District.find(
    await parentIdFilter("vibhag_id", req.query.data, Vibhag)
  );
  res.status(200).json(Districts);
});

//  Get districts by vibhag id
router.get("/list/:id", async (req, res) => {
  const { id } = req.params;
  const DistrictData = await findChildrenByParent(
    Vibhag,
    District,
    id,
    "vibhag_id"
  );
  const data = await attachChildCounts(
    DistrictData,
    City,
    "district_id",
    "cityCount"
  );
  res.status(200).json(data);
});

//  Get districts by state id
router.get("/listByState/:id", async (req, res) => {
  const { id } = req.params;
  const RegionData = await District.find({
    state_id: { $eq: id },
  });
  res.status(200).json(RegionData);
});

//  Add new district
router.post("/add", async (req, res) => {
  if (errorCheck(req, res) || rejectSamajManagerWrite(req, res)) {
    return;
  }
  if (isCityManager(req.user?.role) || isDistrictManager(req.user?.role)) {
    return res.status(403).json({ message: "You cannot do this." });
  }
  const data = req.body;
  if (isVibhagManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const vibhagId = await getManagerVibhagId(manager);
    const vibhagKeys = await vibhagValueKeys(vibhagId);
    if (
      !vibhagId ||
      (data.vibhag_id && !vibhagKeys.includes(String(data.vibhag_id)))
    ) {
      return res.status(403).json({ message: "You cannot do this." });
    }
    data.vibhag_id = vibhagId;
  }
  if (isRegionManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const regionId = await getManagerRegionId(manager);
    const regionKeys = await regionValueKeys(regionId);
    if (
      !regionId ||
      (data.region_id && !regionKeys.includes(String(data.region_id)))
    ) {
      return res.status(403).json({ message: "You cannot do this." });
    }
    data.region_id = regionId;
  }
  if (isStateManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const stateId = await getManagerStateId(manager);
    const stateKeys = await stateValueKeys(stateId);
    if (
      !stateId ||
      (data.state_id && !stateKeys.includes(String(data.state_id)))
    ) {
      return res.status(403).json({ message: "You cannot do this." });
    }
    data.state_id = stateId;
  }
  if (isCountryManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const countryId = await getManagerCountryId(manager);
    const countryKeys = await countryValueKeys(countryId);
    if (
      !countryId ||
      (data.country_id && !countryKeys.includes(String(data.country_id)))
    ) {
      return res.status(403).json({ message: "You cannot do this." });
    }
    data.country_id = countryId;
  }
  const dbDistrict = await District.create({
    ...prepareMasterName(data),
    id: crypto.randomUUID().replace(/-/g, ""),
    active: true,
    createdAt: new Date(),
    updatedAt: null,
    createdBy: req.user.id,
    updatedBy: null,
  });
  await recordActivity({
    req,
    action: "create",
    entityType: "district",
    entity: dbDistrict,
    next: dbDistrict,
  });
  res.status(200).json(dbDistrict);
});

//  Delete districts by district ids
router.delete("/delete", async (req, res) => {
  if (errorCheck(req, res) || rejectSamajManagerWrite(req, res)) {
    return;
  }
  if (isCityManager(req.user?.role) || isDistrictManager(req.user?.role)) {
    return res.status(403).json({ message: "You cannot do this." });
  }
  const data = req.body;
  const query = idsFilter(data?.districts);
  if (isVibhagManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const vibhagKeys = await vibhagValueKeys(await getManagerVibhagId(manager));
    query.vibhag_id = { $in: vibhagKeys.length ? vibhagKeys : ["__none__"] };
  }
  if (isRegionManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const regionKeys = await regionValueKeys(await getManagerRegionId(manager));
    query.region_id = { $in: regionKeys.length ? regionKeys : ["__none__"] };
  }
  if (isStateManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const stateKeys = await stateValueKeys(await getManagerStateId(manager));
    query.state_id = { $in: stateKeys.length ? stateKeys : ["__none__"] };
  }
  if (isCountryManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const countryKeys = await countryValueKeys(
      await getManagerCountryId(manager),
    );
    query.country_id = { $in: countryKeys.length ? countryKeys : ["__none__"] };
  }
  const docs = await District.find(query).lean();
  await District.deleteMany(query);
  await recordActivityMany(req, "delete", "district", docs);
  res.status(200).json({ message: "Delete Successfully" });
});

//  Get district info by district id
router.get("/getInfo/:id", async (req, res) => {
  const DistrictData = await findByAnyId(District, req.params.id);
  res.status(200).json(DistrictData);
});

// Update district by district id
router.patch("/update/:id", async (req, res) => {
  if (errorCheck(req, res) || rejectSamajManagerWrite(req, res)) {
    return;
  }
  if (isCityManager(req.user?.role) || isDistrictManager(req.user?.role)) {
    return res.status(403).json({ message: "You cannot do this." });
  }
  const { id } = req.params;
  const payload = prepareMasterName({ ...req.body });
  let filter = idOrObjectIdFilter(id);
  if (isVibhagManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const vibhagKeys = await vibhagValueKeys(await getManagerVibhagId(manager));
    filter = {
      $and: [
        filter,
        { vibhag_id: { $in: vibhagKeys.length ? vibhagKeys : ["__none__"] } },
      ],
    };
    const allowed = await District.findOne(filter);
    if (!allowed) {
      return res.status(403).json({ message: "You cannot do this." });
    }
    if (payload.vibhag_id && !vibhagKeys.includes(String(payload.vibhag_id))) {
      return res.status(403).json({ message: "You cannot do this." });
    }
  }
  if (isRegionManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const regionKeys = await regionValueKeys(await getManagerRegionId(manager));
    filter = {
      $and: [
        filter,
        { region_id: { $in: regionKeys.length ? regionKeys : ["__none__"] } },
      ],
    };
    const allowed = await District.findOne(filter);
    if (!allowed) {
      return res.status(403).json({ message: "You cannot do this." });
    }
    if (payload.region_id && !regionKeys.includes(String(payload.region_id))) {
      return res.status(403).json({ message: "You cannot do this." });
    }
  }
  if (isStateManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const stateKeys = await stateValueKeys(await getManagerStateId(manager));
    filter = {
      $and: [
        filter,
        { state_id: { $in: stateKeys.length ? stateKeys : ["__none__"] } },
      ],
    };
    const allowed = await District.findOne(filter);
    if (!allowed) {
      return res.status(403).json({ message: "You cannot do this." });
    }
    if (payload.state_id && !stateKeys.includes(String(payload.state_id))) {
      return res.status(403).json({ message: "You cannot do this." });
    }
  }
  if (isCountryManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const countryKeys = await countryValueKeys(
      await getManagerCountryId(manager),
    );
    filter = {
      $and: [
        filter,
        { country_id: { $in: countryKeys.length ? countryKeys : ["__none__"] } },
      ],
    };
    const allowed = await District.findOne(filter);
    if (!allowed) {
      return res.status(403).json({ message: "You cannot do this." });
    }
    if (payload.country_id && !countryKeys.includes(String(payload.country_id))) {
      return res.status(403).json({ message: "You cannot do this." });
    }
  }
  const previous = await District.findOne(filter).lean();
  await District.updateOne(
    filter,
    { ...sanitizeUpdatePayload(payload), updatedAt: new Date(), updatedBy: req?.user.id }
  );
  if (previous) {
    await recordActivity({
      req,
      action: "update",
      entityType: "district",
      previous,
      next: { ...previous, ...sanitizeUpdatePayload(payload) },
    });
  }
  res.status(200).json({ message: "Updated Successfully" });
});

module.exports = router;
