const express = require("express");
const router = express.Router();
const {
  S3Client,
} = require("@aws-sdk/client-s3");
const AWS = require("aws-sdk");
const fs = require("fs");
const Images = require("../models/image");
const multer = require("multer");

const s3Client = new S3Client({
  region: "eu-north-1", // Replace with your preferred region
  credentials: {
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
  },
});
const s3 = new AWS.S3({
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
});

const storage = multer.diskStorage({});

const upload = multer({ storage });

router.post("/upload", upload.single("image"), async (req, res) => {
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
    const image = await Images.create({
      url: process.env.AWS_BASE_URL + "yuva_images/" + filename,
      name: filename,
      awsId: "yuva_images/" + filename,
    });
    res.status(200).json({ data: image, message: "image-upload-successfully" });
  } catch (error) {
    res.status(500).json({ message: "failed-to-upload" });
  }
});

router.delete("/:id", async (req, res) => {
  await Images.findByIdAndDelete(req.params.id);
  const updatedData = await Images.find();
  res.status(200).json(updatedData);
});

router.get("/get-image", async (req, res) => {
  try {
    const Image = await Images.find({});
    res.status(200).json(Image);
  } catch (err) {
    res.status(500).json({ message: "failed-to-get-image" });
  }
});

module.exports = router;
