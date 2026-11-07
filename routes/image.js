const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { s3, BUCKET } = require("../utils/s3");
const { verifyToken, errorCheck, WRITE_METHODS } = require("../utils/auth");
const { rejectUnlessStaff } = require("../utils/managerScope");
const { convertToModernFormat } = require("../utils/compressYuvaPhoto");

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
    let body = await fs.promises.readFile(file.path);
    let contentType = file.mimetype;
    const folder =
      String(req.body?.folder || "").trim() === "ad_images"
        ? "ad_images"
        : "yuva_images";

    try {
      const optimized = await convertToModernFormat(body, file.mimetype);
      body = optimized.body;
      contentType = optimized.contentType;
      if (typeof optimized.filename === "function") {
        filename = optimized.filename(filename);
      }
    } catch (compressError) {
      console.error("yuva-photo-compress-failed", compressError.message);
    }

    const key = folder + "/" + filename;
    const uploadParams = {
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    };

    try {
      await s3
        .upload({
          ...uploadParams,
          ...(folder === "ad_images" ? { ACL: "public-read" } : {}),
        })
        .promise();
    } catch (aclError) {
      // Buckets with ACLs disabled reject public-read; retry without ACL.
      if (
        folder === "ad_images" &&
        /AccessControlListNotSupported|InvalidRequest|AccessDenied/i.test(
          String(aclError.code || aclError.message || "")
        )
      ) {
        console.error("ad-image-acl-rejected-retrying", aclError.message);
        await s3.upload(uploadParams).promise();
      } else {
        throw aclError;
      }
    }

    res.status(200).json({
      data: {
        url: process.env.AWS_BASE_URL + folder + "/" + filename,
        name: filename,
        awsId: key,
      },
      message: "image-upload-successfully",
    });
  } catch (error) {
    console.error("image-upload-failed", error.code || error.name, error.message);
    res.status(500).json({ message: "Could not upload image." });
  } finally {
    removeTempFile(file.path);
  }
});
module.exports = router;
