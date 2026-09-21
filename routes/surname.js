const express = require("express");
const router = express.Router();
const Surname = require("../models/surname");
const { idsFilter, idOrObjectIdFilter, sanitizeUpdatePayload } = require("../utils/childCount");
const { rejectLocationMasterWrite } = require("../utils/managerScope");
const { attachLinkedRoute } = require("../utils/linkedRecords");
const { verifyToken, errorCheck, WRITE_METHODS } = require("../utils/auth");
const { escapeRegex } = require("../utils/escapeRegex");
const { prepareMasterName, nameContains } = require("../utils/masterName");

router.use(verifyToken({ methods: WRITE_METHODS }));
attachLinkedRoute(router, "surname", errorCheck);

// Get all Surname
router.get("/list", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const { name, gotra } = req.query;
  const Name = {
    ...nameContains(name, escapeRegex),
    ...(gotra
      ? {
          gotra: { $regex: new RegExp(escapeRegex(gotra), "i") },
        }
      : {}),
  };
  const Surnames = await Surname.find({ ...Name })
    .skip(offset)
    .limit(limit)
    .exec();
  const totalItems = await Surname.countDocuments({ ...Name });
  const totalPages = Math.ceil(totalItems / limit);
  res.status(200).json({ total: totalItems, page, totalPages, data: Surnames });
});
router.get("/get-all-list", async (req, res) => {
  const Surnames = await Surname.find();
  res.status(200).json(Surnames);
});

// Add new Surname
router.post("/add", async (req, res) => {
  if (!errorCheck(req, res) && !rejectLocationMasterWrite(req, res)) {
    const data = req.body;
    const dbSurname = await Surname.create({
      ...prepareMasterName(data),
      id: crypto.randomUUID().replace(/-/g, ""),
      active: true,
      createdAt: new Date(),
      updatedAt: null,
      createdBy: req.user.id,
      updatedBy: null,
    });
    res.status(200).send(dbSurname);
  }
});

// Delete Surname by Surname ids
router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res) && !rejectLocationMasterWrite(req, res)) {
    const data = req.body;
    await Surname.deleteMany(idsFilter(data?.surnames));
    res.status(200).json({ message: "Delete Successfully" });
  }
});

// Get Surname info by Surname id
router.get("/getInfo/:id", async (req, res) => {
  const { id } = req.params;
  const records = await Surname.find(idOrObjectIdFilter(id));
  res.status(200).json(records);
});

router.patch("/update/:id", async (req, res) => {
  if (errorCheck(req, res) || rejectLocationMasterWrite(req, res)) {
    return;
  }
  try {
    const { id } = req.params;
    const payload = sanitizeUpdatePayload(prepareMasterName({ ...req.body }));
    const result = await Surname.updateOne(idOrObjectIdFilter(id), {
      $set: {
        ...payload,
        updatedAt: new Date(),
        updatedBy: req?.user?.id || null,
      },
    });
    if (!result.matchedCount) {
      res.status(404).json({ message: "Surname not found." });
      return;
    }
    res.status(200).json({ message: "Updated Successfully" });
  } catch (error) {
    console.error("surname-update-failed", error.message);
    res.status(500).json({ message: "Could not update surname." });
  }
});

module.exports = router;
