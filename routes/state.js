const express = require("express");
const router = express.Router();
const State = require("../models/state");
const Country = require("../models/country");
const Region = require("../models/region");
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
  getManagerCountryId,
  countryValueKeys,
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

// Get all states
router.get("/list", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const { country = [], name } = req.query;
  const Country =
    country?.length > 0
      ? {
          country_id: { $in: country },
        }
      : {};
  const Name = name
    ? {
        name: { $regex: new RegExp(name, "i") },
      }
    : {};
  const filter = {
    ...Country,
    ...Name,
  };
  const tokenUser = getTokenPayload(req);
  if (isCountryManager(tokenUser?.role) && isOwnCountryQuery(req.query)) {
    const manager = await findAccountByTokenId(tokenUser?.id);
    const countryKeys = await countryValueKeys(
      await getManagerCountryId(manager),
    );
    filter.country_id = { $in: countryKeys.length ? countryKeys : ["__none__"] };
  }
  const States = await State.find(filter).skip(offset).limit(limit).exec();
  const data = await attachChildCounts(
    States,
    Region,
    "state_id",
    "regionCount"
  );
  const totalItems = await State.countDocuments(filter);
  const totalPages = Math.ceil(totalItems / limit);
  res.status(200).json({ total: totalItems, page, totalPages, data });
});
router.get("/get-all-list", async (req, res) => {
  const { data = [] } = req.query;
  const Country =
    data?.length > 0
      ? {
          country_id: { $in: data },
        }
      : {};
  const States = await State.find(Country);
  res.status(200).json(States);
});

// Get states by country id
router.get("/list/:id", async (req, res) => {
  const { id } = req.params;
  const States = await findChildrenByParent(
    Country,
    State,
    id,
    "country_id"
  );
  const data = await attachChildCounts(
    States,
    Region,
    "state_id",
    "regionCount"
  );
  res.status(200).json(data);
});

// Add new state
router.post("/add", async (req, res) => {
  if (errorCheck(req, res) || rejectSamajManagerWrite(req, res)) {
    return;
  }
  if (
    isCityManager(req.user?.role) ||
    isDistrictManager(req.user?.role) ||
    isRegionManager(req.user?.role) ||
    isStateManager(req.user?.role)
  ) {
    return res.status(403).json({ message: "not-allowed" });
  }
  const data = req.body;
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
  const dbState = await State.create({
    ...data,
    id: crypto.randomUUID().replace(/-/g, ""),
    active: true,
    createdAt: new Date(),
    updatedAt: null,
    createdBy: req.user.id,
    updatedBy: null,
  });
  res.status(200).send(dbState);
});

// Delete states by state ids
router.delete("/delete", async (req, res) => {
  if (errorCheck(req, res) || rejectSamajManagerWrite(req, res)) {
    return;
  }
  if (
    isCityManager(req.user?.role) ||
    isDistrictManager(req.user?.role) ||
    isRegionManager(req.user?.role) ||
    isStateManager(req.user?.role)
  ) {
    return res.status(403).json({ message: "not-allowed" });
  }
  const data = req.body;
  const query = idsFilter(data.states);
  if (isCountryManager(req.user?.role)) {
    const manager = await findAccountByTokenId(req.user.id);
    const countryKeys = await countryValueKeys(
      await getManagerCountryId(manager),
    );
    query.country_id = { $in: countryKeys.length ? countryKeys : ["__none__"] };
  }
  await State.deleteMany(query);
  res.status(200).json({ message: "Delete Successfully" });
});

// Get state info by state id
router.get("/getInfo/:id", async (req, res) => {
  const StateData = await findByAnyId(State, req.params.id);
  res.status(200).json(StateData);
});

// Update state by state id
router.patch("/update/:id", async (req, res) => {
  if (errorCheck(req, res) || rejectSamajManagerWrite(req, res)) {
    return;
  }
  if (
    isCityManager(req.user?.role) ||
    isDistrictManager(req.user?.role) ||
    isRegionManager(req.user?.role) ||
    isStateManager(req.user?.role)
  ) {
    return res.status(403).json({ message: "not-allowed" });
  }
  const { id } = req.params;
  const payload = { ...req.body };
  let filter = idOrObjectIdFilter(id);
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
    const allowed = await State.findOne(filter);
    if (!allowed) {
      return res.status(403).json({ message: "not-allowed" });
    }
    if (payload.country_id && !countryKeys.includes(String(payload.country_id))) {
      return res.status(403).json({ message: "not-allowed" });
    }
  }
  await State.updateOne(
    filter,
    { ...sanitizeUpdatePayload(payload), updatedAt: new Date(), updatedBy: req?.user.id }
  );
  res.status(200).json({ message: "Updated Successfully" });
});

module.exports = router;
