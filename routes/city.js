const express = require("express");
const router = express.Router();
const City = require("../models/city");
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

// Get all cities
router.get("/list", async (req, res) => {
  const Cities = await City.find({ active: { $eq: true } });
  res.json(Cities);
});

// Get cities by district id
router.get("/list/:id", async (req, res) => {
  const { id } = req.params;
  const CityData = await City.find({
    district_id: { $eq: id },
    active: { $eq: true },
  });
  res.json(CityData);
});

// Get cities by region id
router.get("/listByRegion/:id", async (req, res) => {
  const { id } = req.params;
  const CityData = await City.find({
    region_id: { $eq: id },
    active: { $eq: true },
  });
  res.json(CityData);
});

// Add new city
router.post("/add", async (req, res) => {
  if (!errorCheck(req, res)) {
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
    res.send(dbCity);
  }
});

//  Delete cities by city ids
router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = req.body;
    await City.deleteMany({ id: { $in: data.cities } });
    const dbCity = await City.find();
    res.send(dbCity);
  }
});

router.get("/getInfo/:id", async (req, res) => {
  const { id } = req.params;
  const CityData = await City.find({
    id: { $eq: id },
    active: { $eq: true },
  });
  res.json(CityData);
});

module.exports = router;
