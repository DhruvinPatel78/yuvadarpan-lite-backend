const express = require("express");
const router = express.Router();
const State = require("../models/state");
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

// Get all states
router.get("/list", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const States = await State.find().skip(offset).limit(limit).exec();
  const totalItems = await State.countDocuments({});
  const totalPages = Math.ceil(totalItems / limit);
  res.status(200).json({ total: totalItems, page, totalPages, data: States });
});
router.get("/get-all-list", async (req, res) => {
  const States = await State.find();
  res.status(200).json(States);
});

// Get states by country id
router.get("/list/:id", async (req, res) => {
  const { id } = req.params;
  const States = await State.find({
    country_id: { $eq: id },
  });
  res.status(200).json(States);
});

// Add new state
router.post("/add", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = req.body;
    const dbState = await State.create({
      ...data,
      id: crypto.randomUUID().replace(/-/g, ""),
      active: true,
      createdAt: new Date(),
      updatedAt: null,
      createdBy: req.user.id,
      updatedBy: null,
    });
    res.status(200).send(dbState);
  }
});

// Delete states by state ids
router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = req.body;
    await State.deleteMany({ id: { $in: data.states } });
    res.status(200).json({ message: "Delete Successfully" });
  }
});

// Get state info by state id
router.get("/getInfo/:id", async (req, res) => {
  const { id } = req.params;
  const StateData = await State.find({
    id: { $eq: id },
  });
  res.status(200).json(StateData);
});

// Update state by state id
router.patch("/update/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { id } = req.params;
    const payload = { ...req.body };
    await State.updateOne(
        { id: id },
        { ...payload, updatedAt: new Date(), updatedBy: req?.user.id }
    );
    res.status(200).json({ message: "Updated Successfully" });
  }
});

module.exports = router;
