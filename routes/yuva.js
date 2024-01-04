const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const Yuva = require("../models/yuva");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parsedJWT = jwt.verify(authHeader, process.env.JWT_SECRET);
    req.user = {
      email: parsedJWT.email,
      role: parsedJWT.role,
    };
  }
  next();
};

router.use(verifyToken);

router.get("/list", async (req, res) => {
  const dbYuva = await Yuva.find();
  res.json(dbYuva);
});

router.post("/:id", async (req, res) => {
  const dbYuva = await Yuva.findById(req.params.id);
  res.send(dbYuva);
});

router.post("/addYuva", async (req, res) => {
  const yuva = req.body;
  const user = req.user;
  if (user.role === "ADMIN") {
    const dbYuva = await Yuva.create(yuva);
    res.send(dbYuva);
  } else {
    res.status(403).send({ message: "Only admin can create yuva" });
  }
});

module.exports = router;
