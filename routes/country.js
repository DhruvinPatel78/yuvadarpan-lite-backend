const express = require("express");
const router = express.Router();
const Country = require("../models/country");
const State = require("../models/state");
const { attachChildCounts, findByAnyId, idOrObjectIdFilter, idsFilter, sanitizeUpdatePayload } = require("../utils/childCount");
const { rejectLocationMasterWrite } = require("../utils/managerScope");
const { attachLinkedRoute } = require("../utils/linkedRecords");
const { recordActivity, recordActivityMany } = require("../utils/activityLog");
const { verifyToken, errorCheck, requireAuth } = require("../utils/auth");
const { escapeRegex } = require("../utils/escapeRegex");
const { prepareMasterName, nameContains } = require("../utils/masterName");

router.use(verifyToken());
router.use(requireAuth);
attachLinkedRoute(router, "country", errorCheck);

// Get all countries
router.get("/list", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const { name } = req.query;
  const Name = nameContains(name, escapeRegex);
  const offset = (page - 1) * limit;
  const Countries = await Country.find({ ...Name })
    .skip(offset)
    .limit(limit)
    .exec();
  const data = await attachChildCounts(
    Countries,
    State,
    "country_id",
    "stateCount"
  );
  const totalItems = await Country.countDocuments({ ...Name });
  const totalPages = Math.ceil(totalItems / limit);
  res.status(200).json({ total: totalItems, page, totalPages, data });
});
router.get("/get-all-list", async (req, res) => {
  const Countries = await Country.find();
  res.status(200).json(Countries);
});

// Add new country
router.post("/add", async (req, res) => {
  if (!errorCheck(req, res) && !rejectLocationMasterWrite(req, res)) {
    const data = req.body;
    const dbCountry = await Country.create({
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
      entityType: "country",
      entity: dbCountry,
      next: dbCountry,
    });
    res.status(200).json(dbCountry);
  }
});

// Delete countries by country ids
router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res) && !rejectLocationMasterWrite(req, res)) {
    const data = req.body;
    const filter = idsFilter(data?.countries);
    const docs = await Country.find(filter).lean();
    await Country.deleteMany(filter);
    await recordActivityMany(req, "delete", "country", docs);
    res.status(200).json({ message: "Delete Successfully" });
  }
});

// Get country info by country id
router.get("/getInfo/:id", async (req, res) => {
  const Countries = await findByAnyId(Country, req.params.id);
  res.status(200).json(Countries);
});

router.patch("/update/:id", async (req, res) => {
  if (!errorCheck(req, res) && !rejectLocationMasterWrite(req, res)) {
    const { id } = req.params;
    const payload = prepareMasterName({ ...req.body });
    const filter = idOrObjectIdFilter(id);
    const previous = await Country.findOne(filter).lean();
    await Country.updateOne(
      filter,
      { ...sanitizeUpdatePayload(payload), updatedAt: new Date(), updatedBy: req?.user.id },
    );
    if (previous) {
      await recordActivity({
        req,
        action: "update",
        entityType: "country",
        previous,
        next: { ...previous, ...sanitizeUpdatePayload(payload) },
      });
    }
    res.status(200).json({ message: "Updated Successfully" });
  }
});

module.exports = router;
