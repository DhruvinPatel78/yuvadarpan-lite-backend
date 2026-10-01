const express = require("express");
const router = express.Router();
const FamilyId = require("../models/familyId");
const { idsFilter, idOrObjectIdFilter, sanitizeUpdatePayload, findByAnyId } = require("../utils/childCount");
const { rejectLocationMasterWrite, findAccountByTokenId } = require("../utils/managerScope");
const { attachLinkedRoute } = require("../utils/linkedRecords");
const { verifyToken, errorCheck, requireAuth } = require("../utils/auth");
const { escapeRegex } = require("../utils/escapeRegex");

router.use(verifyToken());
router.use(requireAuth);
attachLinkedRoute(router, "familyId", errorCheck);

const normalizeFamilyId = (value) => String(value ?? "").trim();

router.get("/check-user", async (req, res) => {
  if (errorCheck(req, res)) {
    return;
  }
  try {
    const account = await findAccountByTokenId(req.user.id);
    const role = String(account?.role || req.user?.role || "")
      .trim()
      .toUpperCase();
    if (role !== "USER") {
      return res.status(200).json({ exists: true, familyId: "", skipped: true });
    }
    const familyId = normalizeFamilyId(account?.familyId);
    if (!familyId) {
      return res.status(200).json({ exists: false, familyId: "" });
    }
    const numericFamilyId = Number(familyId);
    const found = await FamilyId.findOne({
      $and: [
        {
          $or: [
            { familyId },
            {
              familyId: {
                $regex: new RegExp(`^${escapeRegex(familyId)}$`, "i"),
              },
            },
            ...(Number.isFinite(numericFamilyId)
              ? [{ familyId: String(numericFamilyId) }]
              : []),
          ],
        },
        { active: { $ne: false } },
      ],
    });
    res.status(200).json({
      exists: Boolean(found),
      familyId,
    });
  } catch (error) {
    console.error("familyId-check-user-failed", error.message);
    res.status(500).json({ message: "Could not verify family ID." });
  }
});

const toFamilyIdList = (body = {}) => {
  if (Array.isArray(body.familyIds)) {
    return body.familyIds.map(normalizeFamilyId).filter(Boolean);
  }
  if (Array.isArray(body.familyId)) {
    return body.familyId.map(normalizeFamilyId).filter(Boolean);
  }
  const single = normalizeFamilyId(body.familyId);
  return single ? [single] : [];
};

router.get("/list", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const search = normalizeFamilyId(req.query.familyId || req.query.name);
  const filter = search
    ? {
        familyId: {
          $regex: escapeRegex(search),
          $options: "i",
        },
      }
    : {};
  const [rows, totalItems] = await Promise.all([
    FamilyId.find(filter).skip(offset).limit(limit).exec(),
    FamilyId.countDocuments(filter),
  ]);
  res.status(200).json({
    total: totalItems,
    page,
    totalPages: Math.ceil(totalItems / limit) || 0,
    data: rows,
  });
});

router.get("/get-all-list", async (req, res) => {
  const rows = await FamilyId.find();
  res.status(200).json(rows);
});

router.post("/add", async (req, res) => {
  if (errorCheck(req, res) || rejectLocationMasterWrite(req, res)) {
    return;
  }
  try {
    const values = toFamilyIdList(req.body);
    if (!values.length) {
      return res.status(400).json({ message: "Family ID is required." });
    }

    const created = [];
    const existing = [];
    for (const familyId of values) {
      const found = await FamilyId.findOne({
        familyId: {
          $regex: new RegExp(`^${escapeRegex(familyId)}$`, "i"),
        },
      });
      if (found) {
        existing.push(found);
        continue;
      }
      const row = await FamilyId.create({
        id: crypto.randomUUID().replace(/-/g, ""),
        familyId,
        active: true,
        createdAt: new Date(),
        updatedAt: null,
        createdBy: req.user?.id || null,
        updatedBy: null,
      });
      created.push(row);
    }

    if (values.length === 1) {
      return res.status(200).send(created[0] || existing[0]);
    }

    res.status(200).json({
      message: "Saved.",
      created,
      existing,
      data: [...created, ...existing],
    });
  } catch (error) {
    console.error("familyId-add-failed", error.message);
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Family ID already exists." });
    }
    res.status(500).json({ message: "Could not add family ID." });
  }
});

router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res) && !rejectLocationMasterWrite(req, res)) {
    const data = req.body;
    await FamilyId.deleteMany(
      idsFilter(data?.familyIds || data?.ids || data?.natives)
    );
    res.status(200).json({ message: "Delete Successfully" });
  }
});

router.get("/getInfo/:id", async (req, res) => {
  const rows = await findByAnyId(FamilyId, req.params.id);
  res.status(200).json(rows);
});

router.patch("/update/:id", async (req, res) => {
  if (errorCheck(req, res) || rejectLocationMasterWrite(req, res)) {
    return;
  }
  try {
    const { id } = req.params;
    const current = await FamilyId.findOne(idOrObjectIdFilter(id));
    if (!current) {
      return res.status(404).json({ message: "Family ID not found." });
    }
    const payload = sanitizeUpdatePayload({ ...req.body });
    if (payload.familyId != null) {
      payload.familyId = normalizeFamilyId(payload.familyId);
      if (!payload.familyId) {
        return res.status(400).json({ message: "Family ID is required." });
      }
      const duplicate = await FamilyId.findOne({
        familyId: {
          $regex: new RegExp(`^${escapeRegex(payload.familyId)}$`, "i"),
        },
        id: { $ne: current.id },
      });
      if (duplicate) {
        return res.status(409).json({ message: "Family ID already exists." });
      }
    }
    await FamilyId.updateOne(idOrObjectIdFilter(id), {
      $set: {
        ...payload,
        updatedAt: new Date(),
        updatedBy: req?.user?.id,
      },
    });
    res.status(200).json({ message: "Update Successfully" });
  } catch (error) {
    console.error("familyId-update-failed", error.message);
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Family ID already exists." });
    }
    res.status(500).json({ message: "Could not update family ID." });
  }
});

module.exports = router;
