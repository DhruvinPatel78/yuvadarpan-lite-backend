const express = require("express");
const router = express.Router();
const Samaj = require("../models/samaj");
const City = require("../models/city");
const jwt = require("jsonwebtoken");
const { findChildrenByParent, findByAnyId, idOrObjectIdFilter, idsFilter, sanitizeUpdatePayload } = require("../utils/childCount");
const {
  rejectSamajManagerWrite,
  isCityManager,
  isDistrictManager,
  isRegionManager,
  isStateManager,
  isCountryManager,
  getTokenPayload,
  findAccountByTokenId,
  getManagerCityId,
  getManagerDistrictId,
  getManagerRegionId,
  getManagerStateId,
  getManagerCountryId,
  cityValueKeys,
  districtValueKeys,
  regionValueKeys,
  stateValueKeys,
  countryValueKeys,
  isOwnCityQuery,
  isOwnDistrictQuery,
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

// Get all samaj
router.get("/list", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const {
    country = [],
    state = [],
    region = [],
    district = [],
    city = [],
    name,
  } = req.query;
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
  const District =
    district?.length > 0
      ? {
          district_id: { $in: district },
        }
      : {};
  const CityFilter =
    city?.length > 0
      ? {
          city_id: { $in: city },
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
    ...Region,
    ...District,
    ...CityFilter,
    ...Name,
  };
  const tokenUser = getTokenPayload(req);
  if (isCityManager(tokenUser?.role) && isOwnCityQuery(req.query)) {
    const manager = await findAccountByTokenId(tokenUser?.id);
    const cityKeys = await cityValueKeys(await getManagerCityId(manager));
    filter.city_id = { $in: cityKeys.length ? cityKeys : ["__none__"] };
  }
  if (isDistrictManager(tokenUser?.role) && isOwnDistrictQuery(req.query)) {
    const manager = await findAccountByTokenId(tokenUser?.id);
    const districtKeys = await districtValueKeys(
      await getManagerDistrictId(manager),
    );
    filter.district_id = { $in: districtKeys.length ? districtKeys : ["__none__"] };
  }
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
  const Samajs = await Samaj.find(filter).skip(offset).limit(limit).exec();
  const totalItems = await Samaj.countDocuments(filter);
  const totalPages = Math.ceil(totalItems / limit);
  res.status(200).json({ total: totalItems, page, totalPages, data: Samajs });
});
router.get("/get-all-list", async (req, res) => {
  const { data = [] } = req.query;
  const Data =
    data?.length > 0
      ? {
          region_id: { $in: data },
        }
      : {};
  const Samajs = await Samaj.find(Data);
  res.status(200).json(Samajs);
});

// Get samaj by city id
router.get("/list/:id", async (req, res) => {
  const { id } = req.params;
  const SamajData = await findChildrenByParent(City, Samaj, id, "city_id");
  res.status(200).json(SamajData);
});

// Get samaj by district id
router.get("/listByDistrict/:id", async (req, res) => {
  const { id } = req.params;
  const SamajData = await Samaj.find({
    district_id: { $eq: id },
  });
  res.status(200).json(SamajData);
});

// Get samaj by region id
router.get("/listByRegion/:id", async (req, res) => {
  const { id } = req.params;
  const SamajData = await Samaj.find({
    region_id: { $eq: id },
  });
  res.status(200).json(SamajData);
});

//  Add new samaj
router.post("/add", async (req, res) => {
  if (!errorCheck(req, res) && !rejectSamajManagerWrite(req, res)) {
    const data = req.body;
    if (isCityManager(req.user?.role)) {
      const manager = await findAccountByTokenId(req.user.id);
      const cityId = await getManagerCityId(manager);
      const cityKeys = await cityValueKeys(cityId);
      if (!cityId || (data.city_id && !cityKeys.includes(String(data.city_id)))) {
        return res.status(403).json({ message: "not-allowed" });
      }
      data.city_id = cityId;
    }
    if (isDistrictManager(req.user?.role)) {
      const manager = await findAccountByTokenId(req.user.id);
      const districtId = await getManagerDistrictId(manager);
      const districtKeys = await districtValueKeys(districtId);
      if (
        !districtId ||
        (data.district_id && !districtKeys.includes(String(data.district_id)))
      ) {
        return res.status(403).json({ message: "not-allowed" });
      }
      data.district_id = districtId;
    }
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
    const dbSamaj = await Samaj.create({
      ...data,
      id: crypto.randomUUID().replace(/-/g, ""),
      active: true,
      createdAt: new Date(),
      updatedAt: null,
      createdBy: req.user.id,
      updatedBy: null,
    });
    res.status(200).send(dbSamaj);
  }
});

// Delete samaj by samaj ids
router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res) && !rejectSamajManagerWrite(req, res)) {
    const data = req.body;
    const query = idsFilter(data.samaj);
    if (isCityManager(req.user?.role)) {
      const manager = await findAccountByTokenId(req.user.id);
      const cityKeys = await cityValueKeys(await getManagerCityId(manager));
      query.city_id = { $in: cityKeys.length ? cityKeys : ["__none__"] };
    }
    if (isDistrictManager(req.user?.role)) {
      const manager = await findAccountByTokenId(req.user.id);
      const districtKeys = await districtValueKeys(
        await getManagerDistrictId(manager),
      );
      query.district_id = { $in: districtKeys.length ? districtKeys : ["__none__"] };
    }
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
    await Samaj.deleteMany(query);
    res.status(200).json({ message: "Delete Successfully" });
  }
});

//  Get samaj info by samaj id
router.get("/getInfo/:id", async (req, res) => {
  const SamajData = await findByAnyId(Samaj, req.params.id);
  res.status(200).json(SamajData);
});

// Update Samaj by samaj id
router.patch("/update/:id", async (req, res) => {
  if (!errorCheck(req, res) && !rejectSamajManagerWrite(req, res)) {
    const { id } = req.params;
    const payload = { ...req.body };
    let filter = idOrObjectIdFilter(id);
    if (isCityManager(req.user?.role)) {
      const manager = await findAccountByTokenId(req.user.id);
      const cityKeys = await cityValueKeys(await getManagerCityId(manager));
      filter = {
        $and: [filter, { city_id: { $in: cityKeys.length ? cityKeys : ["__none__"] } }],
      };
      const allowed = await Samaj.findOne(filter);
      if (!allowed) {
        return res.status(403).json({ message: "not-allowed" });
      }
      if (payload.city_id && !cityKeys.includes(String(payload.city_id))) {
        return res.status(403).json({ message: "not-allowed" });
      }
    }
    if (isDistrictManager(req.user?.role)) {
      const manager = await findAccountByTokenId(req.user.id);
      const districtKeys = await districtValueKeys(
        await getManagerDistrictId(manager),
      );
      filter = {
        $and: [
          filter,
          { district_id: { $in: districtKeys.length ? districtKeys : ["__none__"] } },
        ],
      };
      const allowed = await Samaj.findOne(filter);
      if (!allowed) {
        return res.status(403).json({ message: "not-allowed" });
      }
      if (
        payload.district_id &&
        !districtKeys.includes(String(payload.district_id))
      ) {
        return res.status(403).json({ message: "not-allowed" });
      }
    }
    if (isRegionManager(req.user?.role)) {
      const manager = await findAccountByTokenId(req.user.id);
      const regionKeys = await regionValueKeys(await getManagerRegionId(manager));
      filter = {
        $and: [
          filter,
          { region_id: { $in: regionKeys.length ? regionKeys : ["__none__"] } },
        ],
      };
      const allowed = await Samaj.findOne(filter);
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
      const allowed = await Samaj.findOne(filter);
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
      const allowed = await Samaj.findOne(filter);
      if (!allowed) {
        return res.status(403).json({ message: "not-allowed" });
      }
      if (payload.country_id && !countryKeys.includes(String(payload.country_id))) {
        return res.status(403).json({ message: "not-allowed" });
      }
    }
    await Samaj.updateOne(
      filter,
      { ...sanitizeUpdatePayload(payload), updatedAt: new Date(), updatedBy: req?.user.id }
    );
    res.status(200).json({ message: "Updated Successfully" });
  }
});

module.exports = router;
