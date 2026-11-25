const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const dns = require("dns");

const usableDns = dns.getServers().filter((server) => server !== "127.0.0.1" && server !== "::1");
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
const loadedEnv = fs.existsSync(envPath) ? envPath : path.join(__dirname, "..", ".env");
dotenv.config({ path: loadedEnv });

const mongoUrl = process.env.MONGO_URL;

if (!mongoUrl) {
  console.error(`No MONGO_URL found in ${path.basename(loadedEnv)}`);
  process.exit(1);
}

const safeUrl = mongoUrl.replace(/:([^:@]+)@/, ":****@");
console.log(`[RemoveYuvaAddress] Target env: ${appEnv || "default"} (${path.basename(loadedEnv)})`);
console.log(`[RemoveYuvaAddress] Connecting to MongoDB: ${safeUrl}...`);

async function removeYuvaAddress() {
  try {
    await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 10000 });
    console.log("[RemoveYuvaAddress] Connected to MongoDB.");

    const collection = mongoose.connection.collection("yuvalists");
    const totalCount = await collection.countDocuments();
    const query = {
      $or: [
        { address: { $exists: true } },
        { "gu.address": { $exists: true } },
      ],
    };

    const matchingCount = await collection.countDocuments(query);
    console.log(`[RemoveYuvaAddress] Total Yuvas: ${totalCount}`);
    console.log(`[RemoveYuvaAddress] Yuvas with address: ${matchingCount}`);

    if (matchingCount === 0) {
      console.log("[RemoveYuvaAddress] No Yuvas found with an address. Nothing to update.");
      await mongoose.disconnect();
      return;
    }

    const result = await collection.updateMany(query, {
      $unset: {
        address: "",
        "gu.address": "",
      },
    });

    console.log(`[RemoveYuvaAddress] Update result: matched ${result.matchedCount}, modified ${result.modifiedCount}`);

    const remaining = await collection.countDocuments(query);
    console.log(`[RemoveYuvaAddress] Remaining Yuvas with address after cleanup: ${remaining}`);

    await mongoose.disconnect();
    console.log("[RemoveYuvaAddress] Done.");
  } catch (err) {
    console.error("[RemoveYuvaAddress] Error during migration:", err);
    process.exit(1);
  }
}

removeYuvaAddress();
