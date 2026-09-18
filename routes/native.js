const express = require("express");
const router = express.Router();
const Native = require("../models/native");
const { rejectLocationMasterWrite } = require("../utils/managerScope");
const { attachLinkedRoute } = require("../utils/linkedRecords");
const { verifyToken, errorCheck, requireAuth } = require("../utils/auth");
const { escapeRegex } = require("../utils/escapeRegex");
const { findByAnyId } = require("../utils/childCount");

router.use(verifyToken());
router.use(requireAuth);
attachLinkedRoute(router, "native", errorCheck);

// Get all countries
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
  const Natives = await Native.find({ ...Name })
    .skip(offset)
    .limit(limit)
    .exec();
  const totalItems = await Native.countDocuments({ ...Name });
  const totalPages = Math.ceil(totalItems / limit);
  res.status(200).json({ total: totalItems, page, totalPages, data: Natives });
});
router.get("/get-all-list", async (req, res) => {
  const Natives = await Native.find();
  res.status(200).json(Natives);
});

// Add new country
router.post("/add", async (req, res) => {
  if (!errorCheck(req, res) && !rejectLocationMasterWrite(req, res)) {
    const data = req.body;
    const dbNative = await Native.create({
      ...data,
      id: crypto.randomUUID().replace(/-/g, ""),
      active: true,
      createdAt: new Date(),
      updatedAt: null,
      createdBy: req.user.id,
      updatedBy: null,
    });
    res.status(200).send(dbNative);
  }
});

// Delete countries by country ids
router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res) && !rejectLocationMasterWrite(req, res)) {
    const data = req.body;
    await Native.deleteMany({ id: { $in: data?.natives } });
    res.status(200).json({ message: "Delete Successfully" });
  }
});

// Get country info by country id
router.get("/getInfo/:id", async (req, res) => {
  const Natives = await findByAnyId(Native, req.params.id);
  res.status(200).json(Natives);
});

router.patch("/update/:id", async (req, res) => {
  if (!errorCheck(req, res) && !rejectLocationMasterWrite(req, res)) {
    const { id } = req.params;
    const payload = { ...req.body };
    await Native.updateOne(
      { id: id },
      { ...payload, updatedAt: new Date(), updatedBy: req?.user.id },
    );
    res.status(200).json({ message: "Update Successfully" });
  }
});

module.exports = router;
