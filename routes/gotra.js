const express = require("express");
const router = express.Router();
const Gotra = require("../models/gotra");
const jwt = require("jsonwebtoken");
const { idsFilter, idOrObjectIdFilter, sanitizeUpdatePayload } = require("../utils/childCount");
const { rejectLocationMasterWrite } = require("../utils/managerScope");
const { attachLinkedRoute } = require("../utils/linkedRecords");

const privateRoutes = ["POST", "DELETE", "PATCH"];

const verifyToken = (req, res, next) => {
  if (privateRoutes.includes(req.method)) {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      try {
        const decoded = jwt.verify(
          authHeader.replace("Bearer ", ""),
          process.env.JWT_SECRET,
        );
        req.user = {
          email: decoded.email,
          role: decoded.role,
          id: decoded.id,
        };
      } catch (error) {
        req.error = {
          message: error.name,
        };
      }
    } else {
      req.error = {
        message: "no-token",
      };
    }
  }
  next();
};

const errorCheck = (req, res) => {
  if (req.hasOwnProperty("error")) {
    const { message } = req.error;
    res.status(401).send({
      message: message === "no-token" ? "Please sign in." : "Session expired. Sign in again.",
    });
    return true;
  }
  return false;
};

router.use(verifyToken);
attachLinkedRoute(router, "gotra", errorCheck);

router.get("/list", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const { name } = req.query;
  const Name = name
    ? {
        name: { $regex: new RegExp(name, "i") },
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
      name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
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
