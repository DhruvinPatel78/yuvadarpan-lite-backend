require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const yuvaRouter = require("./routes/yuva");
const userRouter = require("./routes/user");
const yuvaListRoutes = require("./routes/yuvalist");
const imageRouter = require("./routes/image");
const countryRouter = require("./routes/country");
const stateRouter = require("./routes/state");
const regionRouter = require("./routes/region");
const districtRouter = require("./routes/district");
const cityRouter = require("./routes/city");
const samajRouter = require("./routes/samaj");
const surnameRouter = require("./routes/surname");
const { specs, swaggerUi } = require("./swagger");

const app = express();

const PORT = process.env.PORT;

console.log("port =>", PORT);

mongoose.connect(process.env.MONGO_URL).then(() => {
  console.log("Connected to MongoDB");
});

const logger = (req, res, next) => {
  console.log(`${req.method}: Request received on ${req.url}`);
  next();
};

let whitelist = ["https://yuvadarpan.netlify.app", "http://localhost:3000"];

let corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
};

// app.use(cors(corsOptions));
app.use(cors());

app.use(logger);
app.use(express.json());

app.use("/swagger", swaggerUi.serve, swaggerUi.setup(specs));

app.use("/yuva", yuvaRouter);
app.use("/user", userRouter);
app.use("/yuvalist", yuvaListRoutes);
app.use("/image", imageRouter);
app.use("/country", countryRouter);
app.use("/state", stateRouter);
app.use("/region", regionRouter);
app.use("/district", districtRouter);
app.use("/city", cityRouter);
app.use("/samaj", samajRouter);
app.use("/surname", surnameRouter);

app.listen(PORT, () => {
  console.log(`Server is up and running on ${PORT}`);
});
