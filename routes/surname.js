const express = require("express");
const router = express.Router();
const Surname = require("../models/surname");
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

// Get all countries
router.get("/list", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const Surnames = await Surname.find().skip(offset).limit(limit).exec();
  const totalItems = await Surname.countDocuments({});
  const totalPages = Math.ceil(totalItems / limit);
  res.status(200).json({ total: totalItems, page, totalPages, data: Surnames });
});
router.get("/get-all-list", async (req, res) => {
  const Surnames = await Surname.find();
  res.status(200).json(Surnames);
});

// Add new country
router.post("/add", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = req.body;
    const dbSurname = await Surname.create({
      ...data,
      id: crypto.randomUUID().replace(/-/g, ""),
      active: true,
      createdAt: new Date(),
      updatedAt: null,
      createdBy: req.user.id,
      updatedBy: null,
    });
    res.status(200).send(dbSurname);
  }
});

// Delete countries by country ids
router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = req.body;
    await Surname.deleteMany({ id: { $in: data?.surnames } });
    res.status(200).json({ message: "Delete Successfully" });
  }
});

// Get country info by country id
router.get("/getInfo/:id", async (req, res) => {
  const { id } = req.params;
  const Countries = await Surname.find({
    id: { $eq: id },
  });
  res.status(200).json(Countries);
});

module.exports = router;
