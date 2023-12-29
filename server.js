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

let whitelist = ['https://yuvadarpan.netlify.app', 'http://localhost']

let corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  }
}

app.use(cors(corsOptions));

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
