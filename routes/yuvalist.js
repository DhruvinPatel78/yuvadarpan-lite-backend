const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const Yuvalist = require("../models/yuvalist");

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
    const dbYuva = await Yuvalist.find();
    res.json(dbYuva);
  }
});
router.get("/list/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    const dbYuva = await Yuvalist.findById(req.params.id);
    res.json(dbYuva);
  }
});

router.get("/citylist", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = require("../data/pages.json");
    res.json(data.data);
  }
});

router.post("/addYuvaList", async (req, res) => {
  const yuvaList = req.body;
  const user = req.user;
  if (user.role === "ADMIN") {
    const dbYuvaList = await Yuvalist.create(yuvaList);
    res.send(dbYuvaList);
  } else {
    res.status(403).send({ message: "only-admin-can-create-new-yuva" });
  }
});
router.delete("/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    await Yuvalist.findByIdAndDelete(req.params.id);
    const updatedData = await Yuvalist.find();
    res.status(200).json(updatedData);
  }
});
router.patch("/update/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    await Yuvalist.updateOne({ _id: req.body.id }, { ...req.body });
    const users = await Yuvalist.find();
    res.json(users);
  }
});

module.exports = router;
