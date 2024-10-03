const express = require("express");
const router = express.Router();
const Country = require("../models/country");

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

// Get all countries
router.get("/list", async (req, res) => {
  if (!errorCheck(req, res)) {
    const Countries = await Country.find({ active: { $eq: true } });
    res.json(Countries);
  }
});

// Add new country
router.post("/add", async (req, res) => {
  const data = req.body;
  const dbCountry = await Country.create({
    ...data,
    id: crypto.randomUUID().replace(/-/g, ""),
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
  });
  res.send(dbCountry);
});

// Delete countries by country ids
router.delete("/delete", async (req, res) => {
  const data = req.body;
  const dbCountry = await Country.deleteMany({ id: { $in: data.countries } });
  res.send(dbCountry);
});

// Get country info by country id
router.get("/getInfo/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { id } = req.params;
    const Countries = await Country.find({
      id: { $eq: id },
      active: { $eq: true },
    });
    res.json(Countries);
  }
});

module.exports = router;
