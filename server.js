const path = require("path");
const fs = require("fs");

const appEnv = String(process.env.APP_ENV || process.argv[2] || "").toLowerCase();
const envFile =
  appEnv === "staging"
    ? ".env.staging"
    : appEnv === "production"
      ? ".env.production"
      : ".env";
const envPath = path.join(__dirname, envFile);
const loadedEnv = fs.existsSync(envPath) ? envPath : path.join(__dirname, ".env");
const dotenv = require("dotenv");
dotenv.config({ path: loadedEnv });
try {
  const parsed = dotenv.parse(fs.readFileSync(loadedEnv));
  if (parsed.MAIL_USER) process.env.MAIL_USER = parsed.MAIL_USER;
  if (parsed.MAIL_PASSWORD) process.env.MAIL_PASSWORD = parsed.MAIL_PASSWORD;
  if (parsed.SMTP_USER) process.env.SMTP_USER = parsed.SMTP_USER;
  if (parsed.SMTP_PASSWORD) process.env.SMTP_PASSWORD = parsed.SMTP_PASSWORD;
} catch (error) {
  console.error("env-mail-load-failed", error.message);
}
const mailUser = String(process.env.MAIL_USER || process.env.SMTP_USER || "").trim();
console.log("APP_ENV =>", appEnv || "local", "| env file =>", path.basename(loadedEnv));
console.log(
  "mail-configured =>",
  mailUser.includes("@") && Boolean(String(process.env.MAIL_PASSWORD || process.env.SMTP_PASSWORD || "").trim())
    ? mailUser
    : "no",
);

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const yuvaRouter = require("./routes/yuva");
const userRouter = require("./routes/user");
const yuvaListRoutes = require("./routes/yuvalist");
const imageRouter = require("./routes/image");
const countryRouter = require("./routes/country");
const nativeRouter = require("./routes/native");
const stateRouter = require("./routes/state");
const regionRouter = require("./routes/region");
const districtRouter = require("./routes/district");
const cityRouter = require("./routes/city");
const samajRouter = require("./routes/samaj");
const surnameRouter = require("./routes/surname");
const roleRouter = require("./routes/role");
const shortlistRouter = require("./routes/shortlist");
const { specs, swaggerUi } = require("./swagger");

const app = express();

const PORT = process.env.PORT;

console.log("port =>", PORT);

mongoose.connect(process.env.MONGO_URL).then(() => {
  console.log("Connected to MongoDB");
}).catch((err) => {
  console.error("MongoDB connection failed:", err.message);
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
app.use("/yuvaList", yuvaListRoutes);
app.use("/image", imageRouter);
app.use("/country", countryRouter);
app.use("/native", nativeRouter);
app.use("/state", stateRouter);
app.use("/region", regionRouter);
app.use("/district", districtRouter);
app.use("/city", cityRouter);
app.use("/samaj", samajRouter);
app.use("/surname", surnameRouter);
app.use("/role", roleRouter);
app.use("/shortlist", shortlistRouter);

app.listen(PORT, () => {
  console.log(`Server is up and running on ${PORT}`);
});
