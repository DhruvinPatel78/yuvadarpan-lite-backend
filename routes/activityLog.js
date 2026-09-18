const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const ActivityLog = require("../models/activityLog");
const { isAdmin } = require("../utils/managerScope");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    req.error = { message: "no-token" };
    return next();
  }
  try {
    const decoded = jwt.verify(
      String(authHeader).replace(/^Bearer\s+/i, "").trim(),
      process.env.JWT_SECRET,
    );
    req.user = {
      email: decoded.email,
      role: decoded.role,
      id: decoded.id,
    };
  } catch (error) {
    req.error = { message: error.name };
  }
  next();
};

const errorCheck = (req, res) => {
  if (req.hasOwnProperty("error")) {
    const { message } = req.error;
    res.status(401).send({
      message:
        message === "no-token"
          ? "Please sign in."
          : "Session expired. Sign in again.",
    });
    return true;
  }
  return false;
};

const rejectNonAdmin = (req, res) => {
  if (!isAdmin(req.user?.role)) {
    res.status(403).json({ message: "You cannot do this." });
    return true;
  }
  return false;
};

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

router.use(verifyToken);

router.get("/list", async (req, res) => {
  if (errorCheck(req, res) || rejectNonAdmin(req, res)) {
    return;
  }
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const { search, action, entityType } = req.query;
  const query = {};
  if (action) query.action = action;
  if (entityType) query.entityType = entityType;
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    query.$or = [
      { summary: rx },
      { actorName: rx },
      { actorId: rx },
      { entityId: rx },
      { entityLabel: rx },
    ];
  }
  const [data, total] = await Promise.all([
    ActivityLog.find(query).sort({ createdAt: -1 }).skip(offset).limit(limit),
    ActivityLog.countDocuments(query),
  ]);
  res.status(200).json({
    total,
    page,
    totalPages: Math.ceil(total / limit) || 0,
    data,
  });
});

router.delete("/clear", async (req, res) => {
  if (errorCheck(req, res) || rejectNonAdmin(req, res)) {
    return;
  }
  const result = await ActivityLog.deleteMany({});
  res.status(200).json({
    message: "Logs cleared.",
    deleted: result.deletedCount || 0,
  });
});

router.get("/:id", async (req, res) => {
  if (errorCheck(req, res) || rejectNonAdmin(req, res)) {
    return;
  }
  const log = await ActivityLog.findById(req.params.id);
  if (!log) {
    return res.status(404).json({ message: "Log not found." });
  }
  res.status(200).json(log);
});

module.exports = router;
