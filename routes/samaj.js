const express = require("express");
const router = express.Router();
const Samaj = require("../models/samaj");
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

// Get all samaj
router.get("/list", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const Samajs = await Samaj.find().skip(offset).limit(limit).exec();
  const totalItems = await Samaj.countDocuments({});
  const totalPages = Math.ceil(totalItems / limit);
  res.status(200).json({ total: totalItems, page, totalPages, data: Samajs });
});
router.get("/get-all-list", async (req, res) => {
  const Samajs = await Samaj.find();
  res.status(200).json(Samajs);
});

// Get samaj by city id
router.get("/list/:id", async (req, res) => {
  const { id } = req.params;
  const SamajData = await Samaj.find({
    city_id: { $eq: id },
  });
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
  if (!errorCheck(req, res)) {
    const data = req.body;
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
  if (!errorCheck(req, res)) {
    const data = req.body;
    await Samaj.deleteMany({ id: { $in: data.samaj } });
    res.status(200).json({ message: "Delete Successfully" });
  }
});

//  Get samaj info by samaj id
router.get("/getInfo/:id", async (req, res) => {
  const { id } = req.params;
  const SamajData = await Samaj.find({
    id: { $eq: id },
  });
  res.status(200).json(SamajData);
});

module.exports = router;
