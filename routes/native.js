const express = require("express");
const router = express.Router();
const Native = require("../models/native");
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

// Get all countries
router.get("/list", async (req, res) => {
  if (!errorCheck(req, res)) {
    const Natives = await Native.find();
    res.json(Natives);
  }
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
    res.send(dbNative);
  }
});

// Delete countries by country ids
router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = req.body;
    const dbNative = await Native.deleteMany({ id: { $in: data.countries } });
    res.send(dbNative);
  }
});

// Get country info by country id
router.get("/getInfo/:id", async (req, res) => {
  const { id } = req.params;
  const Natives = await Native.find({
    id: { $eq: id },
    active: { $eq: true },
  });
  res.json(Natives);
});

router.patch("/update/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    const payload = { ...req.body };
    await Native.updateOne(
      { id: req.body.id },
      { ...payload, updatedAt: new Date(), updatedBy: req.body.id }
    );
    const users = await Native.find();
    res.json(users);
  }
});

module.exports = router;
