const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/user");

router.get("/list", async (req, res) => {
  const users = await User.find();
  res.json(users);
});

router.post("/signUp", async (req, res) => {
  const user = req.body;
  user.password = await bcrypt.hash(user.password, 10);
  const dbUser = await User.create(user);
  res.send(dbUser);
});

router.post("/signIn", async (req, res) => {
  const { email, password } = req.body;
  const dbUser = await User.findOne({ email });
  if (dbUser !== null && dbUser !== undefined) {
    const passwordMatched = await bcrypt.compare(password, dbUser.password);
    if (passwordMatched) {
      if (dbUser?.allowed) {
        const token = jwt.sign(
          { email: dbUser.email, role: dbUser.role },
          process.env.JWT_SECRET,
        );
        res.send({ data: dbUser, token });
      } else {
        res.status(403).send({ message: "Your account is not verified." });
      }
    } else {
      res.status(401).send({ message: "Password or email incorrect" });
    }
  } else {
    res.status(401).send({ message: "Password or email incorrect" });
  }
});

module.exports = router;
