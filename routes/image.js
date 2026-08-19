const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const { s3, BUCKET } = require("../utils/s3");
const privateRoutes = ["POST", "DELETE", "PATCH"];

const verifyToken = (req, res, next) => {
  if (privateRoutes.includes(req.method)) {
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
const storage = multer.diskStorage({});

const upload = multer({ storage });
router.use(verifyToken);

const sanitizeFilename = (name, originalname) => {
  const ext = (path.extname(originalname || "") || ".jpg").toLowerCase();
  const source = name || path.basename(originalname || "photo", path.extname(originalname || ""));
  const base = String(source)
    .replace(path.extname(String(source)), "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 180) || "yuva_photo";
  return `${base}${ext}`;
};

router.post("/upload", upload.single("image"), async (req, res) => {
  if (!errorCheck(req, res)) {
    const file = req?.file;
    const filename = sanitizeFilename(req.body?.filename, file.originalname);
    const params = {
      Bucket: BUCKET,
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
