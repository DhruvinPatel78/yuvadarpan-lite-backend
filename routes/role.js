const express = require("express");
const router = express.Router();
const Role = require("../models/role");
const { rejectLocationMasterWrite } = require("../utils/managerScope");
const { attachLinkedRoute } = require("../utils/linkedRecords");
const { verifyToken, errorCheck, requireAuth } = require("../utils/auth");
const { escapeRegex } = require("../utils/escapeRegex");

router.use(verifyToken());
router.use(requireAuth);
attachLinkedRoute(router, "role", errorCheck);

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
  const Roles = await Role.find({ ...Name })
    .skip(offset)
    .limit(limit)
    .exec();
  const totalItems = await Role.countDocuments({ ...Name });
  const totalPages = Math.ceil(totalItems / limit);
  res.status(200).json({ total: totalItems, page, totalPages, data: Roles });
});
router.get("/get-all-list", async (req, res) => {
  const Roles = await Role.find();
  res.status(200).json(Roles);
});

// Add new country
router.post("/add", async (req, res) => {
  if (!errorCheck(req, res) && !rejectLocationMasterWrite(req, res)) {
    const data = req.body;
    const dbRole = await Role.create({
      ...data,
      id: crypto.randomUUID().replace(/-/g, ""),
      active: true,
      createdAt: new Date(),
      updatedAt: null,
      createdBy: req.user.id,
      updatedBy: null,
    });
    res.status(200).send(dbRole);
  }
});

// Delete countries by country ids
router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res) && !rejectLocationMasterWrite(req, res)) {
    const data = req.body;
    await Role.deleteMany({ id: { $in: data?.Roles } });
    res.status(200).json({ message: "Delete Successfully" });
  }
});

// Get country info by country id
router.get("/getInfo/:id", async (req, res) => {
  const { id } = req.params;
  const Roles = await Role.find({
    id: { $eq: id },
    active: { $eq: true },
  });
  res.status(200).json(Roles);
});

router.patch("/update/:id", async (req, res) => {
  if (!errorCheck(req, res) && !rejectLocationMasterWrite(req, res)) {
    const { id } = req.params;
    const payload = { ...req.body };
    await Role.updateOne(
      { id: id },
      { ...payload, updatedAt: new Date(), updatedBy: req?.user.id }
    );
    res.status(200).json({ message: "Update Successfully" });
  }
});

module.exports = router;
