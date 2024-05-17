const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/user");

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
router.get("/list", async (req, res) => {
  if (!errorCheck(req, res)) {
    const users = await User.find({ role: { $ne: "ADMIN" } });
    res.json(users);
  }
});

router.get("/requests", async (req, res) => {
  if (!errorCheck(req, res)) {
    const users = await User.find({
      allowed: false,
      active: true,
      role: { $ne: "ADMIN" },
    });
    res.json(users);
  }
});

router.post("/signUp", async (req, res) => {
  const user = req.body;
  user.password = await bcrypt.hash(user.password, 10);
  const dbUser = await User.create(user);
  res.send(dbUser);
});

router.post("/signIn", async (req, res) => {
  const { email, password } = req.body;
  const dbUser = await User.findOne({ email }).lean();
  console.log("DBUSER =>", dbUser);
  if (dbUser !== null && dbUser !== undefined) {
    const passwordMatched = await bcrypt.compare(password, dbUser.password);
    if (passwordMatched) {
      if (dbUser?.allowed) {
        const token = jwt.sign(
          { email: dbUser.email, role: dbUser.role },
          process.env.JWT_SECRET,
          {
            expiresIn: "30d",
          }
        );
        delete dbUser.password;
        res.send({ data: dbUser, token });
      } else {
        res.status(403).send({ message: "your-account-is-not-verified." });
      }
    } else {
      res.status(401).send({ message: "password-or-email-incorrect" });
    }
  } else {
    res.status(401).send({ message: "password-or-email-incorrect" });
  }
});

router.patch("/update/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    await User.updateOne({ _id: req.body.id }, { ...req.body });
    const users = await User.find({ role: { $ne: "ADMIN" } });
    res.json(users);
  }
});

router.patch("/approveRejectMany", async (req, res) => {
  if (!errorCheck(req, res)) {
    const d = User.find({ _id: { $ne: req.body.ids } });
    await User.updateMany(
      { _id: { $in: req.body.ids } },
      {
        $set: {
          allowed: req.body.action === "accept",
          active: req.body.action === "accept",
        },
      }
    );
    const users = await User.find({
      allowed: false,
      active: true,
      role: { $ne: "ADMIN" },
    });
    res.json(users);
  }
});

module.exports = router;
