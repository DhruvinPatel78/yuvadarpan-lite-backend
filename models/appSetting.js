const mongoose = require("mongoose");

const appSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    updatedAt: Date,
    updatedBy: String,
  },
  {
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  }
);

const AppSetting = mongoose.model("AppSetting", appSettingSchema);

const ADVERTISEMENT_ENABLED_KEY = "advertisementEnabled";
const PAYMENT_ENABLED_KEY = "paymentEnabled";

const getAdvertisementEnabled = async () => {
  const row = await AppSetting.findOne({ key: ADVERTISEMENT_ENABLED_KEY }).lean();
  if (!row) {
    return true;
  }
  return row.value !== false;
};

const setAdvertisementEnabled = async (enabled, userId) => {
  return AppSetting.findOneAndUpdate(
    { key: ADVERTISEMENT_ENABLED_KEY },
    {
      $set: {
        key: ADVERTISEMENT_ENABLED_KEY,
        value: Boolean(enabled),
        updatedAt: new Date(),
        updatedBy: userId || null,
      },
    },
    { upsert: true, new: true }
  );
};

/** Admin-controlled via Settings. Default off until enabled. */
const getPaymentEnabled = async () => {
  const row = await AppSetting.findOne({ key: PAYMENT_ENABLED_KEY }).lean();
  if (!row) {
    return false;
  }
  return row.value !== false && row.value !== "false" && row.value !== 0;
};

const setPaymentEnabled = async (enabled, userId) => {
  return AppSetting.findOneAndUpdate(
    { key: PAYMENT_ENABLED_KEY },
    {
      $set: {
        key: PAYMENT_ENABLED_KEY,
        value: Boolean(enabled),
        updatedAt: new Date(),
        updatedBy: userId || null,
      },
    },
    { upsert: true, new: true }
  );
};

module.exports = {
  AppSetting,
  ADVERTISEMENT_ENABLED_KEY,
  PAYMENT_ENABLED_KEY,
  getAdvertisementEnabled,
  setAdvertisementEnabled,
  getPaymentEnabled,
  setPaymentEnabled,
};
