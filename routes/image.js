const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { s3, BUCKET } = require("../utils/s3");
const { verifyToken, errorCheck, WRITE_METHODS } = require("../utils/auth");
const { rejectUnlessStaff } = require("../utils/managerScope");
const { compressYuvaPhoto } = require("../utils/compressYuvaPhoto");

const storage = multer.diskStorage({});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
});
router.use(verifyToken({ methods: WRITE_METHODS }));

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

const removeTempFile = (filePath) => {
  if (!filePath) return;
  fs.unlink(filePath, () => {});
};

router.post("/upload", (req, res, next) => {
  upload.single("image")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "Photo must be 20 MB or smaller." });
    }
    return res.status(400).json({ message: "Could not upload image." });
  });
}, async (req, res) => {
  if (errorCheck(req, res) || rejectUnlessStaff(req, res)) {
    removeTempFile(req?.file?.path);
    return;
  }
  const file = req?.file;
  if (!file?.path) {
    return res.status(400).json({ message: "Please choose a photo." });
  }

  try {
    let filename = sanitizeFilename(req.body?.filename, file.originalname);
    let body = fs.createReadStream(file.path);
    let contentType = file.mimetype;

    try {
      const compressed = await compressYuvaPhoto(file);
      body = compressed.body;
      contentType = compressed.contentType;
      if (typeof compressed.filename === "function") {
        filename = compressed.filename(filename);
      }
    } catch (compressError) {
      console.error("yuva-photo-compress-failed", compressError.message);
    }

    await s3.upload({
      Bucket: BUCKET,
      Key: "yuva_images/" + filename,
      Body: body,
      ContentType: contentType,
    }).promise();

    res.status(200).json({
      data: {
        url: process.env.AWS_BASE_URL + "yuva_images/" + filename,
        name: filename,
        awsId: "yuva_images/" + filename,
      },
      message: "image-upload-successfully",
    });
  } catch (error) {
    res.status(500).json({ message: "Could not upload image." });
  } finally {
    removeTempFile(file.path);
  }
});
module.exports = router;
