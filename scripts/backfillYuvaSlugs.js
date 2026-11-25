const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const dns = require("dns");

const usableDns = dns
  .getServers()
  .filter((server) => server !== "127.0.0.1" && server !== "::1");
if (usableDns.length === 0) {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

const appEnv = String(process.env.APP_ENV || process.argv[2] || "").toLowerCase();
const envFile =
  appEnv === "staging"
    ? ".env.staging"
    : appEnv === "production"
      ? ".env.production"
      : ".env";

const envPath = path.join(__dirname, "..", envFile);
const loadedEnv = fs.existsSync(envPath)
  ? envPath
  : path.join(__dirname, "..", ".env");
dotenv.config({ path: loadedEnv });

const mongoUrl = process.env.MONGO_URL;
if (!mongoUrl) {
  console.error(`No MONGO_URL found in ${path.basename(loadedEnv)}`);
  process.exit(1);
}

const Yuvalist = require("../models/yuvalist");
const {
  generateUniqueSlug,
  namePartsForYuva,
} = require("../utils/generateUniqueSlug");

async function backfill() {
  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 15000 });
  console.log("[BackfillYuvaSlugs] Connected.");

  const missing = await Yuvalist.find({
    $or: [{ slug: { $exists: false } }, { slug: null }, { slug: "" }],
  });
  console.log(`[BackfillYuvaSlugs] Need slugs: ${missing.length}`);

  let updated = 0;
  for (const yuva of missing) {
    const slug = await generateUniqueSlug(
      Yuvalist,
      await namePartsForYuva(yuva),
      { excludeId: yuva._id },
    );
    await Yuvalist.updateOne({ _id: yuva._id }, { $set: { slug } });
    updated += 1;
    if (updated % 50 === 0) {
      console.log(`[BackfillYuvaSlugs] Updated ${updated}/${missing.length}`);
    }
  }

  const stillMissing = await Yuvalist.countDocuments({
    $or: [{ slug: { $exists: false } }, { slug: null }, { slug: "" }],
  });
  if (stillMissing === 0) {
    await Yuvalist.collection.updateMany({}, [
      { $set: { slug: { $ifNull: ["$slug", ""] } } },
    ]);
    try {
      await Yuvalist.collection.dropIndex("slug_1");
    } catch (e) {
      // index may not exist yet
    }
    await Yuvalist.collection.createIndex(
      { slug: 1 },
      { unique: true, name: "slug_1" },
    );
    console.log("[BackfillYuvaSlugs] Unique non-sparse index ready.");
  } else {
    console.warn(
      `[BackfillYuvaSlugs] ${stillMissing} records still missing slug; skipped non-null index.`,
    );
  }

  console.log(`[BackfillYuvaSlugs] Done. Updated ${updated}.`);
  await mongoose.disconnect();
}

backfill().catch((error) => {
  console.error("[BackfillYuvaSlugs] Failed:", error);
  process.exit(1);
});
