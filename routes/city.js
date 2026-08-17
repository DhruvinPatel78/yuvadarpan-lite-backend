const express = require("express");
const router = express.Router();
const City = require("../models/city");
const District = require("../models/district");
const Samaj = require("../models/samaj");
const jwt = require("jsonwebtoken");
const {
  attachChildCounts,
  findChildrenByParent,
  findByAnyId,
  idOrObjectIdFilter,
  idsFilter,
  sanitizeUpdatePayload,
} = require("../utils/childCount");
const { rejectSamajManagerWrite } = require("../utils/managerScope");

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
        },
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

// Get all cities
router.get("/list", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const {
    country = [],
    state = [],
    region = [],
    district = [],
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
    ...District,
  };
  const Cities = await City.find(filter).skip(offset).limit(limit).exec();
  const data = await attachChildCounts(Cities, Samaj, "city_id", "samajCount");
  const totalItems = await City.countDocuments(filter);
  const totalPages = Math.ceil(totalItems / limit);
  res.status(200).json({ total: totalItems, page, totalPages, data });
});
router.get("/get-all-list", async (req, res) => {
  const { data = [] } = req.query;
  const District =
    data?.length > 0
      ? {
          district_id: { $in: data },
        }
      : {};
  const Cities = await City.find(District);
  res.status(200).json(Cities);
});

// Get cities by district id
router.get("/list/:id", async (req, res) => {
  const { id } = req.params;
  const CityData = await findChildrenByParent(
    District,
    City,
    id,
    "district_id"
  );
  const data = await attachChildCounts(CityData, Samaj, "city_id", "samajCount");
  res.status(200).json(data);
});

// Get cities by region id
router.get("/listByRegion/:id", async (req, res) => {
  const { id } = req.params;
  const CityData = await City.find({
    region_id: { $eq: id },
  });
  res.status(200).json(CityData);
});

// Add new city
router.post("/add", async (req, res) => {
  if (!errorCheck(req, res) && !rejectSamajManagerWrite(req, res)) {
    const data = req.body;
    const dbCity = await City.create({
      ...data,
      id: crypto.randomUUID().replace(/-/g, ""),
      active: true,
      createdAt: new Date(),
      updatedAt: null,
      createdBy: req.user.id,
      updatedBy: null,
    });
    res.status(200).send(dbCity);
  }
});

//  Delete cities by city ids
router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res) && !rejectSamajManagerWrite(req, res)) {
    const data = req.body;
    await City.deleteMany(idsFilter(data.cities));
    res.status(200).json({ message: "Delete Successfully" });
  }
});

router.get("/getInfo/:id", async (req, res) => {
  const CityData = await findByAnyId(City, req.params.id);
  res.status(200).json(CityData);
});

// Update City by city id
router.patch("/update/:id", async (req, res) => {
  if (!errorCheck(req, res) && !rejectSamajManagerWrite(req, res)) {
    const { id } = req.params;
    const payload = { ...req.body };
    await City.updateOne(
      idOrObjectIdFilter(id),
      { ...sanitizeUpdatePayload(payload), updatedAt: new Date(), updatedBy: req?.user.id }
    );
    res.status(200).json({ message: "Updated Successfully" });
  }
});

module.exports = router;
