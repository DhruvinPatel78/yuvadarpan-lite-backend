const express = require("express");
const router = express.Router();
const Vibhag = require("../models/vibhag");
const Region = require("../models/region");
const State = require("../models/state");
const Country = require("../models/country");
const District = require("../models/district");
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
  getManagerRegionId,
  getManagerStateId,
  getManagerCountryId,
  regionValueKeys,
  stateValueKeys,
  countryValueKeys,
  isOwnRegionQuery,
  isOwnStateQuery,
  isOwnCountryQuery,
} = require("../utils/managerScope");
const { attachLinkedRoute } = require("../utils/linkedRecords");
const { recordActivity, recordActivityMany } = require("../utils/activityLog");
const { verifyToken, errorCheck, requireAuth } = require("../utils/auth");
const { prepareMasterName, nameContains } = require("../utils/masterName");
const { mergeAnd } = require("../utils/caseInsensitiveSearch");

router.use(verifyToken());
router.use(requireAuth);
attachLinkedRoute(router, "vibhag", errorCheck);

router.get("/list", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const { country, state, region, name } = req.query;
  const filter = mergeAnd(
    await parentIdFilter("country_id", country, Country),
    await parentIdFilter("state_id", state, State),
    await parentIdFilter("region_id", region, Region),
    nameContains(name)
  );
  const tokenUser = getTokenPayload(req);
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
      await getManagerCountryId(manager)
    );
    filter.country_id = { $in: countryKeys.length ? countryKeys : ["__none__"] };
  }
  const rows = await Vibhag.find(filter).skip(offset).limit(limit).exec();
  const data = await attachChildCounts(
    rows,
    District,
    "vibhag_id",
    "districtCount"
  );
  const totalItems = await Vibhag.countDocuments(filter);
  const totalPages = Math.ceil(totalItems / limit);
  res.status(200).json({ total: totalItems, page, totalPages, data });
});

router.get("/get-all-list", async (req, res) => {
  const rows = await Vibhag.find(
    await parentIdFilter("region_id", req.query.data, Region)
  );
  res.status(200).json(rows);
});

router.get("/list/:id", async (req, res) => {
  const { id } = req.params;
  const rows = await findChildrenByParent(Region, Vibhag, id, "region_id");
  const data = await attachChildCounts(
    rows,
    District,
    "vibhag_id",
    "districtCount"
  );
  res.status(200).json(data);
});

router.post("/add", async (req, res) => {
  if (errorCheck(req, res) || rejectSamajManagerWrite(req, res)) {
    return;
  }
  if (
    isCityManager(req.user?.role) ||
    isDistrictManager(req.user?.role) ||
    isVibhagManager(req.user?.role)
  ) {
    return res.status(403).json({ message: "You cannot do this." });
  }
  const data = req.body;
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
  const dbVibhag = await Vibhag.create({
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
    entityType: "vibhag",
    entity: dbVibhag,
    next: dbVibhag,
  });
  res.status(200).json(dbVibhag);
});

router.delete("/delete", async (req, res) => {
  if (errorCheck(req, res) || rejectSamajManagerWrite(req, res)) {
    return;
  }
  if (
    isCityManager(req.user?.role) ||
    isDistrictManager(req.user?.role) ||
    isVibhagManager(req.user?.role)
  ) {
    return res.status(403).json({ message: "You cannot do this." });
  }
  const data = req.body;
  const query = idsFilter(data?.vibhags);
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
      await getManagerCountryId(manager)
    );
    query.country_id = { $in: countryKeys.length ? countryKeys : ["__none__"] };
  }
  const docs = await Vibhag.find(query).lean();
  await Vibhag.deleteMany(query);
  await recordActivityMany(req, "delete", "vibhag", docs);
  res.status(200).json({ message: "Delete Successfully" });
});

router.get("/getInfo/:id", async (req, res) => {
  const VibhagData = await findByAnyId(Vibhag, req.params.id);
  res.status(200).json(VibhagData);
});

router.patch("/update/:id", async (req, res) => {
  if (errorCheck(req, res) || rejectSamajManagerWrite(req, res)) {
    return;
  }
  if (
    isCityManager(req.user?.role) ||
    isDistrictManager(req.user?.role) ||
    isVibhagManager(req.user?.role)
  ) {
    return res.status(403).json({ message: "You cannot do this." });
  }
  const { id } = req.params;
  const payload = prepareMasterName({ ...req.body });
  let filter = idOrObjectIdFilter(id);
  if (isRegionManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const regionKeys = await regionValueKeys(await getManagerRegionId(manager));
    filter = {
      $and: [
        filter,
        { region_id: { $in: regionKeys.length ? regionKeys : ["__none__"] } },
      ],
    };
    const allowed = await Vibhag.findOne(filter);
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
    const allowed = await Vibhag.findOne(filter);
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
      await getManagerCountryId(manager)
    );
    filter = {
      $and: [
        filter,
        { country_id: { $in: countryKeys.length ? countryKeys : ["__none__"] } },
      ],
    };
    const allowed = await Vibhag.findOne(filter);
    if (!allowed) {
      return res.status(403).json({ message: "You cannot do this." });
    }
    if (
      payload.country_id &&
      !countryKeys.includes(String(payload.country_id))
    ) {
      return res.status(403).json({ message: "You cannot do this." });
    }
  }
  const previous = await Vibhag.findOne(filter).lean();
  await Vibhag.updateOne(filter, {
    ...sanitizeUpdatePayload(payload),
    updatedAt: new Date(),
    updatedBy: req?.user.id,
  });
  if (previous) {
    await recordActivity({
      req,
      action: "update",
      entityType: "vibhag",
      previous,
      next: { ...previous, ...sanitizeUpdatePayload(payload) },
    });
  }
  res.status(200).json({ message: "Updated Successfully" });
});

module.exports = router;
