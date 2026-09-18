const express = require("express");
const router = express.Router();
const Gotra = require("../models/gotra");
const { idsFilter, idOrObjectIdFilter, sanitizeUpdatePayload } = require("../utils/childCount");
const { rejectLocationMasterWrite } = require("../utils/managerScope");
const { attachLinkedRoute } = require("../utils/linkedRecords");
const { verifyToken, errorCheck, requireAuth } = require("../utils/auth");
const { escapeRegex } = require("../utils/escapeRegex");

router.use(verifyToken());
router.use(requireAuth);
attachLinkedRoute(router, "gotra", errorCheck);

router.get("/list", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const { name } = req.query;
  const Name = name
    ? {
        name: { $regex: new RegExp(escapeRegex(name), "i") },
      }
    : {};
  const records = await Gotra.find({ ...Name })
    .skip(offset)
    .limit(limit)
    .exec();
  const totalItems = await Gotra.countDocuments({ ...Name });
  const totalPages = Math.ceil(totalItems / limit);
  res.status(200).json({ total: totalItems, page, totalPages, data: records });
});

router.get("/get-all-list", async (req, res) => {
  const records = await Gotra.find();
  res.status(200).json(records);
});

router.post("/add", async (req, res) => {
  if (errorCheck(req, res) || rejectLocationMasterWrite(req, res)) {
    return;
  }
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) {
      res.status(400).json({ message: "Gotra name is required." });
      return;
    }
    const existing = await Gotra.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(name)}$`, "i") },
    });
    if (existing) {
      res.status(200).send(existing);
      return;
    }
    const dbGotra = await Gotra.create({
      name,
      id: crypto.randomUUID().replace(/-/g, ""),
      active: true,
      createdAt: new Date(),
      updatedAt: null,
      createdBy: req.user?.id || null,
      updatedBy: null,
    });
    res.status(200).send(dbGotra);
  } catch (error) {
    console.error("gotra-add-failed", error.message);
    res.status(500).json({ message: "Could not add gotra." });
  }
});

router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res) && !rejectLocationMasterWrite(req, res)) {
    const data = req.body;
    await Gotra.deleteMany(idsFilter(data?.gotras));
    res.status(200).json({ message: "Deleted." });
  }
});

router.get("/getInfo/:id", async (req, res) => {
  const { id } = req.params;
  const records = await Gotra.find(idOrObjectIdFilter(id));
  res.status(200).json(records);
});

router.patch("/update/:id", async (req, res) => {
  if (!errorCheck(req, res) && !rejectLocationMasterWrite(req, res)) {
    const { id } = req.params;
    const payload = sanitizeUpdatePayload({ ...req.body });
    await Gotra.updateOne(idOrObjectIdFilter(id), {
      $set: {
        ...payload,
        updatedAt: new Date(),
        updatedBy: req?.user.id,
      },
    });
    res.status(200).json({ message: "Updated." });
  }
});

module.exports = router;
