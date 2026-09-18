const AWS = require("aws-sdk");
const Yuvalist = require("../models/yuvalist");

const bucketFromBaseUrl = (url) => {
  try {
    const host = new URL(url).hostname;
    const match = host.match(/^(.+)\.s3[.-]/i);
    return match?.[1] || "";
  } catch (e) {
    return "";
  }
};

const BUCKET =
  process.env.AWS_S3_BUCKET ||
  bucketFromBaseUrl(process.env.AWS_BASE_URL) ||
  "yuvadarpanbucket";

const regionFromBaseUrl = (url) => {
  try {
    const host = new URL(url).hostname;
    const match = host.match(/s3[.-]([a-z0-9-]+)\.amazonaws\.com$/i);
    return match?.[1] || "";
  } catch (e) {
    return "";
  }
};

const s3 = new AWS.S3({
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
  region:
    process.env.AWS_REGION ||
    regionFromBaseUrl(process.env.AWS_BASE_URL) ||
    "eu-north-1",
});

const getS3KeyFromYuva = (doc) => {
  const awsId = doc?.profile?.awsId;
  if (awsId) {
    return String(awsId).replace(/^\//, "");
  }
  const url = doc?.profile?.url;
  if (!url) {
    return null;
  }
  const base = process.env.AWS_BASE_URL || "";
  if (base && url.startsWith(base)) {
    return url.slice(base.length).replace(/^\//, "");
  }
  try {
    return new URL(url).pathname.replace(/^\//, "");
  } catch (e) {
    return null;
  }
};

const deleteYuvaImages = async (deletedDocs = []) => {
  const keys = [
    ...new Set(deletedDocs.map(getS3KeyFromYuva).filter(Boolean)),
  ];
  if (!keys.length) {
    return;
  }

  const stillUsed = await Yuvalist.find({ "profile.awsId": { $in: keys } })
    .select("profile.awsId")
    .lean();
  const usedKeys = new Set(
    stillUsed.map((doc) => doc?.profile?.awsId).filter(Boolean)
  );
  const objects = keys
    .filter((key) => !usedKeys.has(key))
    .map((Key) => ({ Key }));
  if (!objects.length) {
    return;
  }

  await s3
    .deleteObjects({
      Bucket: BUCKET,
      Delete: { Objects: objects, Quiet: true },
    })
    .promise();
};

module.exports = { s3, BUCKET, deleteYuvaImages };
