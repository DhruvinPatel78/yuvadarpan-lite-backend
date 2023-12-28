require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const hotelRouter = require("./routes/hotel");
const userRouter = require("./routes/user");
const app = express();

const PORT = process.env.PORT;

console.log("port =>", PORT)

mongoose.connect(process.env.MONGO_URL).then(() => {
  console.log("Connected to MongoDB");
});

const logger = (req, res, next) => {
  console.log(`${req.method}: Request received on ${req.url}`);
  next();
};

app.use(logger);
app.use(express.json());
app.use("/hotels", hotelRouter);
app.use("/users", userRouter);

app.listen(PORT, () => {
  console.log(`Server is up and running on ${PORT}`);
});

app.get("/", (req, res) => {
  res.send("Hello world!");
});
