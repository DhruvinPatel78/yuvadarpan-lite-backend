const express = require("express");
const router = express.Router();
const AWS = require("aws-sdk");
const fs = require("fs");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const privateRoutes = ["/upload"];

const verifyToken = (req, res, next) => {
  if (privateRoutes.includes(req.url)) {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      jwt.verify(
        authHeader.replace("Bearer ", ""),
        process.env.JWT_SECRET,
        (error, res) => {
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
        }
      );
    } else {
      req.error = {
        message: "no-token",
      };
    }
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
const s3 = new AWS.S3({
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
});

const storage = multer.diskStorage({});

const upload = multer({ storage });
router.use(verifyToken);

router.post("/upload", upload.single("image"), async (req, res) => {
  if (!errorCheck(req, res)) {
    const file = req?.file;
    const filename = file.originalname.replace(/ /g, "_");
    const params = {
      Bucket: "yuvadarpanbucket",
      Key: "yuva_images/" + filename,
      Body: fs.createReadStream(file.path),
      ContentType: file?.mimetype,
    };

    try {
      await s3.upload(params).promise();
      res.status(200).json({
        data: {
          url: process.env.AWS_BASE_URL + "yuva_images/" + filename,
          name: filename,
          awsId: "yuva_images/" + filename,
        },
        message: "image-upload-successfully",
      });
    } catch (error) {
      res.status(500).json({ message: "failed-to-upload" });
    }
  }
});
module.exports = router;
