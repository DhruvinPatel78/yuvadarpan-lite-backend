const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const YuvaList = require("../models/yuvaList");

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
      message: message === "no-token" ? "Unauthenticated" : "Token Expired",
    });
    return true;
  } else {
    return false;
  }
};

router.get("/list", async (req, res) => {
  if (!errorCheck(req, res)) {
    const dbYuva = await YuvaList.find();
    res.json(dbYuva);
  }
});
router.get("/list/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    const dbYuva = await YuvaList.findById(req.params.id);
    res.json(dbYuva);
  }
});

router.post("/addYuvaList", async (req, res) => {
  const yuvaList = req.body;
  const user = req.user;
  if (user.role === "ADMIN") {
    const dbYuvaList = await YuvaList.create(yuvaList);
    res.send(dbYuvaList);
  } else {
    res.status(403).send({ message: "Only admin can create New yuva" });
  }
});
router.delete("/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    await YuvaList.findByIdAndDelete(req.params.id);
    const updatedData = await YuvaList.find();
    res.status(200).json(updatedData);
  }
});
router.patch("/update/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    await YuvaList.updateOne({ _id: req.body.id }, { ...req.body });
    const users = await YuvaList.find();
    res.json(users);
  }
});

module.exports = router;
