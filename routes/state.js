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
  const States = await State.find({ active: { $eq: true } });
  res.json(States);
});

// Get states by country id
router.get("/list/:id", async (req, res) => {
  const { id } = req.params;
  const States = await State.find({
    country_id: { $eq: id },
    active: { $eq: true },
  });
  res.json(States);
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
    res.send(dbState);
  }
});

// Delete states by state ids
router.delete("/delete", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = req.body;
    await State.deleteMany({ id: { $in: data.states } });
    const dbState = await State.find();
    res.send(dbState);
  }
});

// Get state info by state id
router.get("/getInfo/:id", async (req, res) => {
  const { id } = req.params;
  const StateData = await State.find({
    id: { $eq: id },
    active: { $eq: true },
  });
  res.json(StateData);
});

module.exports = router;
