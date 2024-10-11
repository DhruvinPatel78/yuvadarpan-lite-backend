const express = require("express");
const router = express.Router();
const District = require("../models/district");
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

//  Get all districts
router.get("/list", async (req, res) => {
  const Districts = await District.find({ active: { $eq: true } });
  res.json(Districts);
});

//  Get districts by region id
router.get("/list/:id", async (req, res) => {
  const { id } = req.params;
  const DistrictData = await District.find({
    region_id: { $eq: id },
    active: { $eq: true },
  });
  res.json(DistrictData);
});

//  Get districts by state id
router.get("/listByState/:id", async (req, res) => {
  const { id } = req.params;
  const RegionData = await District.find({
    state_id: { $eq: id },
    active: { $eq: true },
  });
  res.json(RegionData);
});

//  Add new district
router.post("/add", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = req.body;
    const dbDistrict = await District.create({
      ...data,
      id: crypto.randomUUID().replace(/-/g, ""),
      active: true,
      createdAt: new Date(),
      updatedAt: null,
      createdBy: req.user.id,
      updatedBy: null,
    });
    res.send(dbDistrict);
  }
});

//  Delete districts by district ids
router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = req.body;
    await District.deleteMany({ id: { $in: data?.districts  } });
    const dbState = await District.find();
    res.send(dbState);
  }
});

//  Get district info by district id
router.get("/getInfo/:id", async (req, res) => {
  const { id } = req.params;
  const DistrictData = await District.find({
    id: { $eq: id },
    active: { $eq: true },
  });
  res.json(DistrictData);
});

module.exports = router;
