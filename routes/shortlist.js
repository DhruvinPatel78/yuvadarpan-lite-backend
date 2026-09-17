const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const Shortlist = require("../models/shortlist");
const Yuvalist = require("../models/yuvalist");
const { idOrObjectIdFilter } = require("../utils/childCount");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    req.error = { message: "no-token" };
    return next();
  }
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
    req.error = { message: error.name };
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

const isRegularUser = (role) => String(role || "").toUpperCase() === "USER";

const requireRegularUser = (req, res) => {
  if (errorCheck(req, res)) {
    return true;
  }
  if (!isRegularUser(req.user?.role)) {
    res.status(403).json({ message: "You cannot do this." });
    return true;
  }
  return false;
};

const yuvaKeys = (yuva) =>
  [...new Set([yuva?.id, yuva?._id && String(yuva._id)].filter(Boolean).map(String))];

router.use(verifyToken);

router.get("/ids", async (req, res) => {
  if (requireRegularUser(req, res)) {
    return;
  }
  const rows = await Shortlist.find({ userId: String(req.user.id) })
    .select("yuvaId")
    .lean();
  res.status(200).json({
    data: [...new Set(rows.map((row) => String(row.yuvaId)))],
  });
});

router.get("/", async (req, res) => {
  if (requireRegularUser(req, res)) {
    return;
  }
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 12, 100);
  const offset = (page - 1) * limit;
  const userId = String(req.user.id);
  const total = await Shortlist.countDocuments({ userId });
  const rows = await Shortlist.find({ userId })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .lean();
  const yuvaIds = rows.map((row) => String(row.yuvaId));
  const yuvas = yuvaIds.length
    ? await Yuvalist.find({
        $or: yuvaIds.flatMap((id) => {
          const parts = [{ id: { $eq: id } }];
          if (/^[0-9a-fA-F]{24}$/.test(id)) {
            parts.push({ _id: id });
          }
          return parts;
        }),
      }).exec()
    : [];
  const yuvaMap = new Map();
  yuvas.forEach((yuva) => {
    yuvaKeys(yuva).forEach((key) => yuvaMap.set(key, yuva));
  });
  const data = rows
    .map((row) => yuvaMap.get(String(row.yuvaId)))
    .filter(Boolean);
  res.status(200).json({
    total,
    page,
    totalPages: Math.ceil(total / limit) || 0,
    data,
  });
});

router.post("/", async (req, res) => {
  if (requireRegularUser(req, res)) {
    return;
  }
  const yuvaId = String(req.body?.yuvaId || "").trim();
  if (!yuvaId) {
    return res.status(400).json({ message: "Select a profile first." });
  }
  const yuva = await Yuvalist.findOne(idOrObjectIdFilter(yuvaId));
  if (!yuva) {
    return res.status(404).json({ message: "Profile not found." });
  }
  const storedId = String(yuva._id);
  try {
    await Shortlist.updateOne(
      { userId: String(req.user.id), yuvaId: storedId },
      {
        $setOnInsert: {
          userId: String(req.user.id),
          yuvaId: storedId,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
  } catch (e) {
    if (e.code !== 11000) {
      return res.status(500).json({ message: "Could not shortlist." });
    }
  }
  res.status(200).json({ message: "shortlisted", yuvaId: storedId });
});

router.delete("/:yuvaId", async (req, res) => {
  if (requireRegularUser(req, res)) {
    return;
  }
  const yuvaId = String(req.params.yuvaId || "").trim();
  if (!yuvaId) {
    return res.status(400).json({ message: "Select a profile first." });
  }
  const yuva = await Yuvalist.findOne(idOrObjectIdFilter(yuvaId));
  const ids = [...new Set([yuvaId, ...(yuva ? yuvaKeys(yuva) : [])])];
  await Shortlist.deleteMany({
    userId: String(req.user.id),
    yuvaId: { $in: ids },
  });
  res.status(200).json({ message: "removed", yuvaId });
});

module.exports = router;
