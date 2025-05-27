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

// Get all Surname
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
  const Surnames = await Surname.find({...Name}).skip(offset).limit(limit).exec();
  const totalItems = await Surname.countDocuments({...Name});
  const totalPages = Math.ceil(totalItems / limit);
  res.status(200).json({ total: totalItems, page, totalPages, data: Surnames });
});
router.get("/get-all-list", async (req, res) => {
  const Surnames = await Surname.find();
  res.status(200).json(Surnames);
});

// Add new Surname
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

// Delete Surname by Surname ids
router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = req.body;
    await Surname.deleteMany({ id: { $in: data?.surnames } });
    res.status(200).json({ message: "Delete Successfully" });
  }
});

// Get Surname info by Surname id
router.get("/getInfo/:id", async (req, res) => {
  const { id } = req.params;
  const Countries = await Surname.find({
    id: { $eq: id },
  });
  res.status(200).json(Countries);
});

// Update Surname by Surname id
router.patch("/update/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { id } = req.params;
    const payload = { ...req.body };
    await Surname.updateOne(
        { id: id },
        { ...payload, updatedAt: new Date(), updatedBy: req?.user.id }
    );
    res.status(200).json({ message: "Updated Successfully" });
  }
});

module.exports = router;
