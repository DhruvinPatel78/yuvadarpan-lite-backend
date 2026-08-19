const express = require("express");
const router = express.Router();
const District = require("../models/district");
const Region = require("../models/region");
const City = require("../models/city");
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
  getManagerRegionId,
  getManagerStateId,
  getManagerCountryId,
  regionValueKeys,
  stateValueKeys,
  countryValueKeys,
  isOwnRegionQuery,
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

//  Get all districts
router.get("/list", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const { country = [], state = [], region = [], name } = req.query;
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
  const Region =
    region?.length > 0
      ? {
          region_id: { $in: region },
        }
      : {};
  const Name = name
    ? {
        name: { $regex: new RegExp(name, "i") },
      }
    : {};
  const filter = {
    ...Country,
    ...Region,
    ...State,
    ...Name,
  };
  const tokenUser = getTokenPayload(req);
  if (isRegionManager(tokenUser?.role) && isOwnRegionQuery(req.query)) {
    const manager = await findAccountByTokenId(tokenUser?.id);
    const regionKeys = await regionValueKeys(await getManagerRegionId(manager));
    filter.region_id = { $in: regionKeys.length ? regionKeys : ["__none__"] };
  }
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
  const Districts = await District.find(filter)
    .skip(offset)
    .limit(limit)
    .exec();
  const data = await attachChildCounts(
    Districts,
    City,
    "district_id",
    "cityCount"
  );
  const totalItems = await District.countDocuments(filter);
  const totalPages = Math.ceil(totalItems / limit);
  res.status(200).json({ total: totalItems, page, totalPages, data });
});
router.get("/get-all-list", async (req, res) => {
  const { data = [] } = req.query;
  const Region =
    data?.length > 0
      ? {
          region_id: { $in: data },
        }
      : {};
  const Districts = await District.find(Region);
  res.status(200).json(Districts);
});

//  Get districts by region id
router.get("/list/:id", async (req, res) => {
  const { id } = req.params;
  const DistrictData = await findChildrenByParent(
    Region,
    District,
    id,
    "region_id"
  );
  const data = await attachChildCounts(
    DistrictData,
    City,
    "district_id",
    "cityCount"
  );
  res.status(200).json(data);
});

//  Get districts by state id
router.get("/listByState/:id", async (req, res) => {
  const { id } = req.params;
  const RegionData = await District.find({
    state_id: { $eq: id },
  });
  res.status(200).json(RegionData);
});

//  Add new district
router.post("/add", async (req, res) => {
  if (errorCheck(req, res) || rejectSamajManagerWrite(req, res)) {
    return;
  }
  if (isCityManager(req.user?.role) || isDistrictManager(req.user?.role)) {
    return res.status(403).json({ message: "not-allowed" });
  }
  const data = req.body;
  if (isRegionManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const regionId = await getManagerRegionId(manager);
    const regionKeys = await regionValueKeys(regionId);
    if (
      !regionId ||
      (data.region_id && !regionKeys.includes(String(data.region_id)))
    ) {
      return res.status(403).json({ message: "not-allowed" });
    }
    data.region_id = regionId;
  }
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
  const dbDistrict = await District.create({
    ...data,
    id: crypto.randomUUID().replace(/-/g, ""),
    active: true,
    createdAt: new Date(),
    updatedAt: null,
    createdBy: req.user.id,
    updatedBy: null,
  });
  res.status(200).json(dbDistrict);
});

//  Delete districts by district ids
router.delete("/delete", async (req, res) => {
  if (errorCheck(req, res) || rejectSamajManagerWrite(req, res)) {
    return;
  }
  if (isCityManager(req.user?.role) || isDistrictManager(req.user?.role)) {
    return res.status(403).json({ message: "not-allowed" });
  }
  const data = req.body;
  const query = idsFilter(data?.districts);
  if (isRegionManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const regionKeys = await regionValueKeys(await getManagerRegionId(manager));
    query.region_id = { $in: regionKeys.length ? regionKeys : ["__none__"] };
  }
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
  await District.deleteMany(query);
  res.status(200).json({ message: "Delete Successfully" });
});

//  Get district info by district id
router.get("/getInfo/:id", async (req, res) => {
  const DistrictData = await findByAnyId(District, req.params.id);
  res.status(200).json(DistrictData);
});

// Update district by district id
router.patch("/update/:id", async (req, res) => {
  if (errorCheck(req, res) || rejectSamajManagerWrite(req, res)) {
    return;
  }
  if (isCityManager(req.user?.role) || isDistrictManager(req.user?.role)) {
    return res.status(403).json({ message: "not-allowed" });
  }
  const { id } = req.params;
  const payload = { ...req.body };
  let filter = idOrObjectIdFilter(id);
  if (isRegionManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const regionKeys = await regionValueKeys(await getManagerRegionId(manager));
    filter = {
      $and: [
        filter,
        { region_id: { $in: regionKeys.length ? regionKeys : ["__none__"] } },
      ],
    };
    const allowed = await District.findOne(filter);
    if (!allowed) {
      return res.status(403).json({ message: "not-allowed" });
    }
    if (payload.region_id && !regionKeys.includes(String(payload.region_id))) {
      return res.status(403).json({ message: "not-allowed" });
    }
  }
  if (isStateManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const stateKeys = await stateValueKeys(await getManagerStateId(manager));
    filter = {
      $and: [
        filter,
        { state_id: { $in: stateKeys.length ? stateKeys : ["__none__"] } },
      ],
    };
    const allowed = await District.findOne(filter);
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
    const allowed = await District.findOne(filter);
    if (!allowed) {
      return res.status(403).json({ message: "not-allowed" });
    }
    if (payload.country_id && !countryKeys.includes(String(payload.country_id))) {
      return res.status(403).json({ message: "not-allowed" });
    }
  }
  await District.updateOne(
    filter,
    { ...sanitizeUpdatePayload(payload), updatedAt: new Date(), updatedBy: req?.user.id }
  );
  res.status(200).json({ message: "Updated Successfully" });
});

module.exports = router;
