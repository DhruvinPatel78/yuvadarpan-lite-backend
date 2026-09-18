const express = require("express");
const router = express.Router();
const Yuva = require("../models/yuva");
const { verifyToken, errorCheck } = require("../utils/auth");

router.use(verifyToken());

router.get("/list", async (req, res) => {
  if (!errorCheck(req, res)) {
    const dbYuva = await Yuva.find();
    res.json(dbYuva);
  }
});

router.post("/:id", async (req, res) => {
  if (errorCheck(req, res)) {
    return;
  }
  const dbYuva = await Yuva.findById(req.params.id);
  res.send(dbYuva);
});

router.post("/addYuva", async (req, res) => {
  if (errorCheck(req, res)) {
    return;
  }
  const yuva = req.body;
  const user = req.user;
  if (user.role === "ADMIN") {
    const dbYuva = await Yuva.create(yuva);
    res.send(dbYuva);
  } else {
    res.status(403).send({ message: "Only admin can add this." });
  }
});

module.exports = router;
