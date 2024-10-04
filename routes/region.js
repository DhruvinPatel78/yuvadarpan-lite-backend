const express = require("express");
const router = express.Router();
const Region = require("../models/region");
const jwt = require("jsonwebtoken");

const privateRoutes = ["/add", "/delete"];

const verifyToken = (req, res, next) => {
  if (privateRoutes.includes(req.url)) {
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
  if (!errorCheck(req, res)) {
    const Regions = await Region.find({ active: { $eq: true } });
    res.json(Regions);
  }
});

// Get all regions by country id
router.get("/listByCountry/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { id } = req.params;
    const RegionData = await Region.find({
      country_id: { $eq: id },
      active: { $eq: true },
    });
    res.json(RegionData);
  }
});

// Get all regions by state id
router.get("/list/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { id } = req.params;
    const RegionData = await Region.find({
      state_id: { $eq: id },
      active: { $eq: true },
    });
    res.json(RegionData);
  }
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
      updatedAt: new Date(),
      createdBy: null,
      updatedBy: null,
    });
    res.send(dbRegion);
  }
});

// Delete regions by region ids
router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = req.body;
    const dbState = await Region.deleteMany({ id: { $in: data.regions } });
    res.send(dbState);
  }
});

// Get region info by region id
router.get("/getInfo/:id", async (req, res) => {
  const { id } = req.params;
  const RegionData = await Region.find({
    id: { $eq: id },
    active: { $eq: true },
  });
  res.json(RegionData);
});

module.exports = router;
