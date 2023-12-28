require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const yuvaRouter = require("./routes/yuva");
const userRouter = require("./routes/user");
const app = express();

const PORT = process.env.PORT;

console.log("port =>", PORT)

// mongoose.connect(process.env.MONGO_URL).then(() => {
//   console.log("Connected to MongoDB");
// });


const logger = (req, res, next) => {
  console.log(`${req.method}: Request received on ${req.url}`);
  next();
};

app.use(cors({
  origin: '*'
}));

app.use(logger);
app.use(express.json());
app.use("/yuva/", yuvaRouter);
app.use("/user/", userRouter);

app.listen(PORT, () => {
  console.log(`Server is up and running on ${PORT}`);
});

app.get("/", (req, res) => {
  res.send("Hello world!");
});
