const express = require("express");
const router = express.Router();
const Native = require("../models/native");
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

// Get all countries
router.get("/list", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const { name } = req.query;
  const Name = name
    ? {
        name: { $eq: name },
      }
    : {};
  const Natives = await Native.find({ ...Name })
    .skip(offset)
    .limit(limit)
    .exec();
  const totalItems = await Native.countDocuments({ ...Name });
  const totalPages = Math.ceil(totalItems / limit);
  res.status(200).json({ total: totalItems, page, totalPages, data: Natives });
});
router.get("/get-all-list", async (req, res) => {
  const Natives = await Native.find();
  res.status(200).json(Natives);
});

// Add new country
router.post("/add", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = req.body;
    const dbNative = await Native.create({
      ...data,
      id: crypto.randomUUID().replace(/-/g, ""),
      active: true,
      createdAt: new Date(),
      updatedAt: null,
      createdBy: req.user.id,
      updatedBy: null,
    });
    res.status(200).send(dbNative);
  }
});

// Delete countries by country ids
router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = req.body;
    await Native.deleteMany({ id: { $in: data?.natives } });
    res.status(200).json({ message: "Delete Successfully" });
  }
});

// Get country info by country id
router.get("/getInfo/:id", async (req, res) => {
  const { id } = req.params;
  const Natives = await Native.find({
    id: { $eq: id },
    active: { $eq: true },
  });
  res.status(200).json(Natives);
});

router.patch("/update/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { id } = req.params;
    const payload = { ...req.body };
    await Native.updateOne(
      { id: id },
      { ...payload, updatedAt: new Date(), updatedBy: req?.user.id },
    );
    res.status(200).json({ message: "Update Successfully" });
  }
});

module.exports = router;
