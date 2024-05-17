const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const Yuva = require("../models/yuva");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    jwt.verify(authHeader, process.env.JWT_SECRET, (error, res) => {
      if (res) {
        req.user = {
          email: res.email,
          role: res.role,
        };
      } else {
        req.error = {
          message: error.name,
        };
      }
    });
  } else {
    req.error = {
      message: "no-token",
    };
  }
  next();
};

router.use(verifyToken);

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

router.get("/list", async (req, res) => {
  if (!errorCheck(req, res)) {
    const dbYuva = await Yuva.find();
    res.json(dbYuva);
  }
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
    res.status(403).send({ message: "only-admin-can-create-yuva" });
  }
});

module.exports = router;
