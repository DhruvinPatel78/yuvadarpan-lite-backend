const express = require("express");
const router = express.Router();
const Region = require("../models/region");
const State = require("../models/state");
const District = require("../models/district");
const jwt = require("jsonwebtoken");
const {
  attachChildCounts,
  findChildrenByParent,
  findByAnyId,
  idOrObjectIdFilter,
  idsFilter,
  sanitizeUpdatePayload,
} = require("../utils/childCount");
const {
  rejectSamajManagerWrite,
  isCityManager,
  isDistrictManager,
  isRegionManager,
  isStateManager,
  isCountryManager,
  getTokenPayload,
  findAccountByTokenId,
  getManagerStateId,
  getManagerCountryId,
  stateValueKeys,
  countryValueKeys,
  isOwnStateQuery,
  isOwnCountryQuery,
} = require("../utils/managerScope");

const privateRoutes = ["POST", "DELETE", "PATCH"];

const verifyToken = (req, res, next) => {
  if (privateRoutes.includes(req.method)) {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      jwt.verify(
        authHeader.replace("Bearer ", ""),
        process.env.JWT_SECRET,
        (error, res) => {
          if (res) {
            req.user = {
              email: res.email,
              role: res.role,
              id: res.id,
            };
          } else {
            req.error = {
              message: error.name,
            };
          }
        }
      );
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
      message: message === "no-token" ? "unauthenticated" : "token-expired",
    });
    return true;
  } else {
    return false;
  }
};

router.use(verifyToken);

// Get all region
router.get("/list", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const { country = [], state = [], name } = req.query;
  const Country =
    country?.length > 0
      ? {
          country_id: { $in: country },
        }
      : {};
  const State =
    state?.length > 0
      ? {
          state_id: { $in: state },
        }
      : {};
  const Name = name
    ? {
        name: { $regex: new RegExp(name, "i") },
      }
    : {};
  const filter = {
    ...Country,
    ...State,
    ...Name,
  };
  const tokenUser = getTokenPayload(req);
  if (isStateManager(tokenUser?.role) && isOwnStateQuery(req.query)) {
    const manager = await findAccountByTokenId(tokenUser?.id);
    const stateKeys = await stateValueKeys(await getManagerStateId(manager));
    filter.state_id = { $in: stateKeys.length ? stateKeys : ["__none__"] };
  }
  if (isCountryManager(tokenUser?.role) && isOwnCountryQuery(req.query)) {
    const manager = await findAccountByTokenId(tokenUser?.id);
    const countryKeys = await countryValueKeys(
      await getManagerCountryId(manager),
    );
    filter.country_id = { $in: countryKeys.length ? countryKeys : ["__none__"] };
  }
  const Regions = await Region.find(filter).skip(offset).limit(limit).exec();
  const data = await attachChildCounts(
    Regions,
    District,
    "region_id",
    "districtCount"
  );
  const totalItems = await Region.countDocuments(filter);
  const totalPages = Math.ceil(totalItems / limit);
  res.status(200).json({ total: totalItems, page, totalPages, data });
});
router.get("/get-all-list", async (req, res) => {
  const { data = [] } = req.query;
  const State =
    data?.length > 0
      ? {
          state_id: { $in: data },
        }
      : {};
  const Regions = await Region.find(State);
  res.status(200).json(Regions);
});

// Get all regions by country id
router.get("/listByCountry/:id", async (req, res) => {
  const { id } = req.params;
  const RegionData = await Region.find({
    country_id: { $eq: id },
  });
  res.status(200).json(RegionData);
});

// Get all regions by state id
router.get("/list/:id", async (req, res) => {
  const { id } = req.params;
  const RegionData = await findChildrenByParent(
    State,
    Region,
    id,
    "state_id"
  );
  const data = await attachChildCounts(
    RegionData,
    District,
    "region_id",
    "districtCount"
  );
  res.status(200).json(data);
});

// Add new region
router.post("/add", async (req, res) => {
  if (errorCheck(req, res) || rejectSamajManagerWrite(req, res)) {
    return;
  }
  if (
    isCityManager(req.user?.role) ||
    isDistrictManager(req.user?.role) ||
    isRegionManager(req.user?.role)
  ) {
    return res.status(403).json({ message: "not-allowed" });
  }
  const data = req.body;
  if (isStateManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const stateId = await getManagerStateId(manager);
    const stateKeys = await stateValueKeys(stateId);
    if (
      !stateId ||
      (data.state_id && !stateKeys.includes(String(data.state_id)))
    ) {
      return res.status(403).json({ message: "not-allowed" });
    }
    data.state_id = stateId;
  }
  if (isCountryManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const countryId = await getManagerCountryId(manager);
    const countryKeys = await countryValueKeys(countryId);
    if (
      !countryId ||
      (data.country_id && !countryKeys.includes(String(data.country_id)))
    ) {
      return res.status(403).json({ message: "not-allowed" });
    }
    data.country_id = countryId;
  }
  const dbRegion = await Region.create({
    ...data,
    id: crypto.randomUUID().replace(/-/g, ""),
    active: true,
    createdAt: new Date(),
    updatedAt: null,
    createdBy: req.user.id,
    updatedBy: null,
  });
  res.status(200).json(dbRegion);
});

// Delete regions by region ids
router.delete("/delete", async (req, res) => {
  if (errorCheck(req, res) || rejectSamajManagerWrite(req, res)) {
    return;
  }
  if (
    isCityManager(req.user?.role) ||
    isDistrictManager(req.user?.role) ||
    isRegionManager(req.user?.role)
  ) {
    return res.status(403).json({ message: "not-allowed" });
  }
  const data = req.body;
  const query = idsFilter(data.regions);
  if (isStateManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const stateKeys = await stateValueKeys(await getManagerStateId(manager));
    query.state_id = { $in: stateKeys.length ? stateKeys : ["__none__"] };
  }
  if (isCountryManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const countryKeys = await countryValueKeys(
      await getManagerCountryId(manager),
    );
    query.country_id = { $in: countryKeys.length ? countryKeys : ["__none__"] };
  }
  await Region.deleteMany(query);
  res.status(200).json({ message: "Delete Successfully" });
});

// Get region info by region id
router.get("/getInfo/:id", async (req, res) => {
  const RegionData = await findByAnyId(Region, req.params.id);
  res.status(200).json(RegionData);
});

// Update regions by region id
router.patch("/update/:id", async (req, res) => {
  if (errorCheck(req, res) || rejectSamajManagerWrite(req, res)) {
    return;
  }
  if (
    isCityManager(req.user?.role) ||
    isDistrictManager(req.user?.role) ||
    isRegionManager(req.user?.role)
  ) {
    return res.status(403).json({ message: "not-allowed" });
  }
  const { id } = req.params;
  const payload = { ...req.body };
  let filter = idOrObjectIdFilter(id);
  if (isStateManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const stateKeys = await stateValueKeys(await getManagerStateId(manager));
    filter = {
      $and: [
        filter,
        { state_id: { $in: stateKeys.length ? stateKeys : ["__none__"] } },
      ],
    };
    const allowed = await Region.findOne(filter);
    if (!allowed) {
      return res.status(403).json({ message: "not-allowed" });
    }
    if (payload.state_id && !stateKeys.includes(String(payload.state_id))) {
      return res.status(403).json({ message: "not-allowed" });
    }
  }
  if (isCountryManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const countryKeys = await countryValueKeys(
      await getManagerCountryId(manager),
    );
    filter = {
      $and: [
        filter,
        { country_id: { $in: countryKeys.length ? countryKeys : ["__none__"] } },
      ],
    };
    const allowed = await Region.findOne(filter);
    if (!allowed) {
      return res.status(403).json({ message: "not-allowed" });
    }
    if (payload.country_id && !countryKeys.includes(String(payload.country_id))) {
      return res.status(403).json({ message: "not-allowed" });
    }
  }
  await Region.updateOne(
    filter,
    { ...sanitizeUpdatePayload(payload), updatedAt: new Date(), updatedBy: req?.user.id }
  );
  res.status(200).json({ message: "Updated Successfully" });
});

module.exports = router;
