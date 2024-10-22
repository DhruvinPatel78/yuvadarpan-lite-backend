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
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const Districts = await District.find().skip(offset).limit(limit).exec();
  const totalItems = await District.countDocuments({});
  const totalPages = Math.ceil(totalItems / limit);
  res
    .status(200)
    .json({ total: totalItems, page, totalPages, data: Districts });
});
router.get("/get-all-list", async (req, res) => {
  const Districts = await District.find();
  res.status(200).json(Districts);
});

//  Get districts by region id
router.get("/list/:id", async (req, res) => {
  const { id } = req.params;
  const DistrictData = await District.find({
    region_id: { $eq: id },
  });
  res.status(200).json(DistrictData);
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
    res.status(200).json(dbDistrict);
  }
});

//  Delete districts by district ids
router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = req.body;
    await District.deleteMany({ id: { $in: data?.districts } });
    res.status(200).json({ message: "Delete Successfully" });
  }
});

//  Get district info by district id
router.get("/getInfo/:id", async (req, res) => {
  const { id } = req.params;
  const DistrictData = await District.find({
    id: { $eq: id },
  });
  res.status(200).json(DistrictData);
});

module.exports = router;
