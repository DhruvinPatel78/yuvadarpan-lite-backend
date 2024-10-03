const express = require("express");
const router = express.Router();
const State = require("../models/state");

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

// Get all states
router.get("/list", async (req, res) => {
  if (!errorCheck(req, res)) {
    const States = await State.find({ active: { $eq: true } });
    res.json(States);
  }
});

// Get states by country id
router.get("/list/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { id } = req.params;
    const States = await State.find({
      country_id: { $eq: id },
      active: { $eq: true },
    });
    res.json(States);
  }
});

// Add new state
router.post("/add", async (req, res) => {
  const data = req.body;
  const dbState = await State.create({
    ...data,
    id: crypto.randomUUID().replace(/-/g, ""),
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
  });
  res.send(dbState);
});

// Delete states by state ids
router.delete("/delete", async (req, res) => {
  const data = req.body;
  const dbState = await State.deleteMany({ id: { $in: data.states } });
  res.send(dbState);
});

// Get state info by state id
router.get("/getInfo/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { id } = req.params;
    const StateData = await State.find({
      id: { $eq: id },
      active: { $eq: true },
    });
    res.json(StateData);
  }
});

module.exports = router;
