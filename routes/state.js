const express = require("express");
const router = express.Router();
const State = require("../models/state");
const Country = require("../models/country");
const Region = require("../models/region");
const {
  attachChildCounts,
  findChildrenByParent,
  findByAnyId,
  idOrObjectIdFilter,
  idsFilter,
  sanitizeUpdatePayload,
} = require("../utils/childCount");
const {
  rejectSamajManagerWrite,
  isCityManager,
  isDistrictManager,
  isRegionManager,
  isStateManager,
  isCountryManager,
  getTokenPayload,
  findAccountByTokenId,
  getManagerCountryId,
  countryValueKeys,
  isOwnCountryQuery,
} = require("../utils/managerScope");
const { attachLinkedRoute } = require("../utils/linkedRecords");
const { recordActivity, recordActivityMany } = require("../utils/activityLog");
const { verifyToken, errorCheck, requireAuth } = require("../utils/auth");
const { escapeRegex } = require("../utils/escapeRegex");
const { prepareMasterName, nameContains } = require("../utils/masterName");

router.use(verifyToken());
router.use(requireAuth);
attachLinkedRoute(router, "state", errorCheck);

// Get all states
router.get("/list", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const { country = [], name } = req.query;
  const Country =
    country?.length > 0
      ? {
          country_id: { $in: country },
        }
      : {};
  const Name = nameContains(name, escapeRegex);
  const filter = {
    ...Country,
    ...Name,
  };
  const tokenUser = getTokenPayload(req);
  if (isCountryManager(tokenUser?.role) && isOwnCountryQuery(req.query)) {
    const manager = await findAccountByTokenId(tokenUser?.id);
    const countryKeys = await countryValueKeys(
      await getManagerCountryId(manager),
    );
    filter.country_id = { $in: countryKeys.length ? countryKeys : ["__none__"] };
  }
  const States = await State.find(filter).skip(offset).limit(limit).exec();
  const data = await attachChildCounts(
    States,
    Region,
    "state_id",
    "regionCount"
  );
  const totalItems = await State.countDocuments(filter);
  const totalPages = Math.ceil(totalItems / limit);
  res.status(200).json({ total: totalItems, page, totalPages, data });
});
router.get("/get-all-list", async (req, res) => {
  const { data = [] } = req.query;
  const Country =
    data?.length > 0
      ? {
          country_id: { $in: data },
        }
      : {};
  const States = await State.find(Country);
  res.status(200).json(States);
});

// Get states by country id
router.get("/list/:id", async (req, res) => {
  const { id } = req.params;
  const States = await findChildrenByParent(
    Country,
    State,
    id,
    "country_id"
  );
  const data = await attachChildCounts(
    States,
    Region,
    "state_id",
    "regionCount"
  );
  res.status(200).json(data);
});

// Add new state
router.post("/add", async (req, res) => {
  if (errorCheck(req, res) || rejectSamajManagerWrite(req, res)) {
    return;
  }
  if (
    isCityManager(req.user?.role) ||
    isDistrictManager(req.user?.role) ||
    isRegionManager(req.user?.role) ||
    isStateManager(req.user?.role)
  ) {
    return res.status(403).json({ message: "You cannot do this." });
  }
  const data = req.body;
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
  const dbState = await State.create({
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
    entityType: "state",
    entity: dbState,
    next: dbState,
  });
  res.status(200).send(dbState);
});

// Delete states by state ids
router.delete("/delete", async (req, res) => {
  if (errorCheck(req, res) || rejectSamajManagerWrite(req, res)) {
    return;
  }
  if (
    isCityManager(req.user?.role) ||
    isDistrictManager(req.user?.role) ||
    isRegionManager(req.user?.role) ||
    isStateManager(req.user?.role)
  ) {
    return res.status(403).json({ message: "You cannot do this." });
  }
  const data = req.body;
  const query = idsFilter(data.states);
  if (isCountryManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const countryKeys = await countryValueKeys(
      await getManagerCountryId(manager),
    );
    query.country_id = { $in: countryKeys.length ? countryKeys : ["__none__"] };
  }
  const docs = await State.find(query).lean();
  await State.deleteMany(query);
  await recordActivityMany(req, "delete", "state", docs);
  res.status(200).json({ message: "Delete Successfully" });
});

// Get state info by state id
router.get("/getInfo/:id", async (req, res) => {
  const StateData = await findByAnyId(State, req.params.id);
  res.status(200).json(StateData);
});

// Update state by state id
router.patch("/update/:id", async (req, res) => {
  if (errorCheck(req, res) || rejectSamajManagerWrite(req, res)) {
    return;
  }
  if (
    isCityManager(req.user?.role) ||
    isDistrictManager(req.user?.role) ||
    isRegionManager(req.user?.role) ||
    isStateManager(req.user?.role)
  ) {
    return res.status(403).json({ message: "You cannot do this." });
  }
  const { id } = req.params;
  const payload = prepareMasterName({ ...req.body });
  let filter = idOrObjectIdFilter(id);
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
    const allowed = await State.findOne(filter);
    if (!allowed) {
      return res.status(403).json({ message: "You cannot do this." });
    }
    if (payload.country_id && !countryKeys.includes(String(payload.country_id))) {
      return res.status(403).json({ message: "You cannot do this." });
    }
  }
  const previous = await State.findOne(filter).lean();
  await State.updateOne(
    filter,
    { ...sanitizeUpdatePayload(payload), updatedAt: new Date(), updatedBy: req?.user.id }
  );
  if (previous) {
    await recordActivity({
      req,
      action: "update",
      entityType: "state",
      previous,
      next: { ...previous, ...sanitizeUpdatePayload(payload) },
    });
  }
  res.status(200).json({ message: "Updated Successfully" });
});

module.exports = router;
