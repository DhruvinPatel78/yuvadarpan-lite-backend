const mongoose = require("mongoose");

const permissionSchema = new mongoose.Schema(
  {
    UserId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Flexible flags for future use (e.g. newUserRequest).
    Permission: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
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
  },
);

const Permission = mongoose.model("Permission", permissionSchema);

const asPermissionObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const next = {};
  Object.entries(value).forEach(([key, flag]) => {
    if (typeof key === "string" && key.trim()) {
      next[key.trim()] = Boolean(flag);
    }
  });
  return next;
};

const getPermissionByUserId = async (userId) => {
  const id = String(userId || "").trim();
  if (!id) return {};
  const row = await Permission.findOne({ UserId: id }).lean();
  return asPermissionObject(row?.Permission);
};

const setPermissionForUser = async (userId, permission) => {
  const id = String(userId || "").trim();
  if (!id) return {};
  const flags = asPermissionObject(permission);
  if (!Object.keys(flags).length) {
    await Permission.deleteOne({ UserId: id });
    return {};
  }
  await Permission.findOneAndUpdate(
    { UserId: id },
    { $set: { UserId: id, Permission: flags } },
    { upsert: true, new: true },
  );
  return flags;
};

const clearPermissionForUser = async (userId) => {
  const id = String(userId || "").trim();
  if (!id) return;
  await Permission.deleteOne({ UserId: id });
};

const findUserIdsWithPermission = async (key) => {
  if (!key) return [];
  const rows = await Permission.find({
    [`Permission.${key}`]: true,
  })
    .select("UserId")
    .lean();
  return rows.map((row) => String(row.UserId)).filter(Boolean);
};

module.exports = {
  Permission,
  asPermissionObject,
  getPermissionByUserId,
  setPermissionForUser,
  clearPermissionForUser,
  findUserIdsWithPermission,
};
