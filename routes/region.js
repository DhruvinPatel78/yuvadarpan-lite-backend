const express = require("express");
const router = express.Router();
const Region = require("../models/region");
const jwt = require("jsonwebtoken");

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
        name: { $eq: name },
      }
    : {};
  const filter = {
    ...Country,
    ...State,
    ...Name,
  };
  const Regions = await Region.find(filter).skip(offset).limit(limit).exec();
  const totalItems = await Region.countDocuments(filter);
  const totalPages = Math.ceil(totalItems / limit);
  res.status(200).json({ total: totalItems, page, totalPages, data: Regions });
});
router.get("/get-all-list", async (req, res) => {
  const { data = []} = req.query;
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
  const RegionData = await Region.find({
    state_id: { $eq: id },
  });
  res.status(200).json(RegionData);
});

// Add new region
router.post("/add", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = req.body;
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
  }
});

// Delete regions by region ids
router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = req.body;
    await Region.deleteMany({ id: { $in: data.regions } });
    res.status(200).json({ message: "Delete Successfully" });
  }
});

// Get region info by region id
router.get("/getInfo/:id", async (req, res) => {
  const { id } = req.params;
  const RegionData = await Region.find({
    id: { $eq: id },
  });
  res.status(200).json(RegionData);
});

// Update regions by region id
router.patch("/update/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { id } = req.params;
    const payload = { ...req.body };
    await Region.updateOne(
      { id: id },
      { ...payload, updatedAt: new Date(), updatedBy: req?.user.id },
    );
    res.status(200).json({ message: "Updated Successfully" });
  }
});

module.exports = router;
