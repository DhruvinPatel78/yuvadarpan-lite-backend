const express = require("express");
const router = express.Router();
const Advertisement = require("../models/advertisement");
const {
  idsFilter,
  idOrObjectIdFilter,
  sanitizeUpdatePayload,
  findByAnyId,
} = require("../utils/childCount");
const { rejectLocationMasterWrite } = require("../utils/managerScope");
const { verifyToken, errorCheck, requireAuth } = require("../utils/auth");
const { escapeRegex } = require("../utils/escapeRegex");
const {
  getAdvertisementEnabled,
  setAdvertisementEnabled,
} = require("../models/appSetting");
const { s3, BUCKET } = require("../utils/s3");

const DISPLAY_PAGES = [
  "login",
  "signup",
  "dashboard",
  "profile",
  "share_profile",
];

const normalizeText = (value) => String(value ?? "").trim();

const normalizeDisplayOn = (value) => {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
    ? value.split(",")
    : [];
  return [
    ...new Set(
      list
        .map((item) => normalizeText(item).toLowerCase())
        .filter((item) => DISPLAY_PAGES.includes(item))
    ),
  ];
};

const normalizeImage = (image) => {
  if (!image || typeof image !== "object") {
    return null;
  }
  const url = normalizeText(image.url);
  if (!url) {
    return null;
  }
  return {
    url,
    name: normalizeText(image.name) || undefined,
    awsId: normalizeText(image.awsId) || undefined,
  };
};

const withSignedImageUrl = (row) => {
  const json = typeof row?.toJSON === "function" ? row.toJSON() : { ...row };
  const awsId = normalizeText(json?.image?.awsId);
  if (!awsId || !json.image) {
    return json;
  }
  try {
    json.image = {
      ...json.image,
      url: s3.getSignedUrl("getObject", {
        Bucket: BUCKET,
        Key: awsId.replace(/^\//, ""),
        Expires: 60 * 60 * 6,
      }),
    };
  } catch (error) {
    console.error("advertisement-sign-url-failed", error.message);
  }
  return json;
};

/** Public: global advertisement display switch. */
router.get("/display-enabled", async (_req, res) => {
  try {
    const enabled = await getAdvertisementEnabled();
    res.status(200).json({ enabled });
  } catch (error) {
    console.error("advertisement-display-enabled-get-failed", error.message);
    res.status(500).json({ message: "Could not load advertisement setting." });
  }
});

/** Public: active ads for a page, ordered by priority (lowest first). */
router.get("/by-page/:page", async (req, res) => {
  try {
    const enabled = await getAdvertisementEnabled();
    if (!enabled) {
      return res.status(200).json({ data: [], enabled: false });
    }
    const page = normalizeText(req.params.page).toLowerCase();
    if (!DISPLAY_PAGES.includes(page)) {
      return res.status(400).json({ message: "Invalid page." });
    }
    const rows = await Advertisement.find({
      active: { $ne: false },
      displayOn: page,
    })
      .sort({ priority: 1, createdAt: 1 })
      .exec();
    res.status(200).json({
      data: rows.map(withSignedImageUrl),
      enabled: true,
    });
  } catch (error) {
    console.error("advertisement-by-page-failed", error.message);
    res.status(500).json({ message: "Could not load advertisements." });
  }
});

router.use(verifyToken());
router.use(requireAuth);

router.patch("/display-enabled", async (req, res) => {
  if (errorCheck(req, res) || rejectLocationMasterWrite(req, res)) {
    return;
  }
  try {
    const enabled = Boolean(req.body?.enabled);
    await setAdvertisementEnabled(enabled, req.user?.id);
    res.status(200).json({ enabled, message: "Advertisement display updated." });
  } catch (error) {
    console.error("advertisement-display-enabled-set-failed", error.message);
    res.status(500).json({ message: "Could not update advertisement setting." });
  }
});

router.get("/list", async (req, res) => {
  if (errorCheck(req, res)) {
    return;
  }
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const search = normalizeText(req.query.name);
    const filter = search
      ? {
          name: {
            $regex: escapeRegex(search),
            $options: "i",
          },
        }
      : {};
    const [rows, totalItems] = await Promise.all([
      Advertisement.find(filter)
        .sort({ priority: 1, createdAt: 1 })
        .skip(offset)
        .limit(limit)
        .exec(),
      Advertisement.countDocuments(filter),
    ]);
    res.status(200).json({
      total: totalItems,
      page,
      totalPages: Math.ceil(totalItems / limit) || 0,
      data: rows,
    });
  } catch (error) {
    console.error("advertisement-list-failed", error.message);
    res.status(500).json({ message: "Could not load advertisements." });
  }
});

router.get("/get-all-list", async (req, res) => {
  if (errorCheck(req, res)) {
    return;
  }
  const rows = await Advertisement.find().sort({ priority: 1, createdAt: 1 });
  res.status(200).json(rows);
});

router.post("/add", async (req, res) => {
  if (errorCheck(req, res) || rejectLocationMasterWrite(req, res)) {
    return;
  }
  try {
    const name = normalizeText(req.body?.name);
    const image = normalizeImage(req.body?.image);
    const websiteLink = normalizeText(req.body?.websiteLink);
    const displayOn = normalizeDisplayOn(req.body?.displayOn);

    if (!name) {
      return res.status(400).json({ message: "Advertisement name is required." });
    }
    if (!image) {
      return res.status(400).json({ message: "Advertisement image is required." });
    }
    if (!displayOn.length) {
      return res.status(400).json({ message: "Select at least one display page." });
    }

    const last = await Advertisement.findOne()
      .sort({ priority: -1 })
      .select("priority")
      .lean();
    const priority =
      Number.isFinite(Number(last?.priority)) ? Number(last.priority) + 1 : 1;

    const row = await Advertisement.create({
      id: crypto.randomUUID().replace(/-/g, ""),
      name,
      image,
      websiteLink,
      displayOn,
      priority,
      active: true,
      createdAt: new Date(),
      updatedAt: null,
      createdBy: req.user?.id || null,
      updatedBy: null,
    });
    res.status(200).json(row);
  } catch (error) {
    console.error("advertisement-add-failed", error.message);
    res.status(500).json({ message: "Could not add advertisement." });
  }
});

router.patch("/reorder", async (req, res) => {
  if (errorCheck(req, res) || rejectLocationMasterWrite(req, res)) {
    return;
  }
  try {
    const orderedIds = Array.isArray(req.body?.orderedIds)
      ? req.body.orderedIds.map(String).filter(Boolean)
      : [];
    if (orderedIds.length) {
      await Promise.all(
        orderedIds.map((id, index) =>
          Advertisement.updateOne(idOrObjectIdFilter(id), {
            $set: {
              priority: index + 1,
              updatedAt: new Date(),
              updatedBy: req.user?.id,
            },
          })
        )
      );
      return res.status(200).json({ message: "Order updated." });
    }

    const id = normalizeText(req.body?.id);
    const direction = normalizeText(req.body?.direction).toLowerCase();
    if (!id || !["up", "down"].includes(direction)) {
      return res
        .status(400)
        .json({ message: "Provide orderedIds or id with direction up/down." });
    }

    const current = await Advertisement.findOne(idOrObjectIdFilter(id));
    if (!current) {
      return res.status(404).json({ message: "Advertisement not found." });
    }

    const neighbor = await Advertisement.findOne(
      direction === "up"
        ? { priority: { $lt: current.priority } }
        : { priority: { $gt: current.priority } }
    )
      .sort(direction === "up" ? { priority: -1 } : { priority: 1 })
      .exec();

    if (!neighbor) {
      return res.status(200).json({ message: "Already at edge." });
    }

    const currentPriority = current.priority;
    current.priority = neighbor.priority;
    neighbor.priority = currentPriority;
    current.updatedAt = new Date();
    neighbor.updatedAt = new Date();
    current.updatedBy = req.user?.id;
    neighbor.updatedBy = req.user?.id;
    await Promise.all([current.save(), neighbor.save()]);
    res.status(200).json({ message: "Order updated." });
  } catch (error) {
    console.error("advertisement-reorder-failed", error.message);
    res.status(500).json({ message: "Could not update order." });
  }
});

router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res) && !rejectLocationMasterWrite(req, res)) {
    const data = req.body;
    await Advertisement.deleteMany(
      idsFilter(data?.advertisementIds || data?.ids || data?.advertisements)
    );
    res.status(200).json({ message: "Delete Successfully" });
  }
});

router.get("/getInfo/:id", async (req, res) => {
  if (errorCheck(req, res)) {
    return;
  }
  const rows = await findByAnyId(Advertisement, req.params.id);
  res.status(200).json(rows);
});

router.patch("/update/:id", async (req, res) => {
  if (errorCheck(req, res) || rejectLocationMasterWrite(req, res)) {
    return;
  }
  try {
    const { id } = req.params;
    const current = await Advertisement.findOne(idOrObjectIdFilter(id));
    if (!current) {
      return res.status(404).json({ message: "Advertisement not found." });
    }
    const payload = sanitizeUpdatePayload({ ...req.body });
    if (payload.name != null) {
      payload.name = normalizeText(payload.name);
      if (!payload.name) {
        return res
          .status(400)
          .json({ message: "Advertisement name is required." });
      }
    }
    if (payload.websiteLink != null) {
      payload.websiteLink = normalizeText(payload.websiteLink);
    }
    if (payload.displayOn != null) {
      payload.displayOn = normalizeDisplayOn(payload.displayOn);
      if (!payload.displayOn.length) {
        return res
          .status(400)
          .json({ message: "Select at least one display page." });
      }
    }
    if (payload.image != null) {
      const image = normalizeImage(payload.image);
      if (!image) {
        return res
          .status(400)
          .json({ message: "Advertisement image is required." });
      }
      payload.image = image;
    }
    await Advertisement.updateOne(idOrObjectIdFilter(id), {
      $set: {
        ...payload,
        updatedAt: new Date(),
        updatedBy: req?.user?.id,
      },
    });
    res.status(200).json({ message: "Update Successfully" });
  } catch (error) {
    console.error("advertisement-update-failed", error.message);
    res.status(500).json({ message: "Could not update advertisement." });
  }
});

module.exports = router;
