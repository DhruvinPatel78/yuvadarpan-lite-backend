const jwt = require("jsonwebtoken");
const User = require("../models/user");
const Samaj = require("../models/samaj");
const { idOrObjectIdFilter } = require("./childCount");

const isSamajManager = (role) =>
  String(role || "").toUpperCase() === "SAMAJ_MANAGER";

const getRoleFromRequest = (req) => {
  if (req.user?.role) {
    return req.user.role;
  }
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return null;
  }
  try {
    return jwt.verify(token, process.env.JWT_SECRET)?.role;
  } catch (e) {
    return null;
  }
};

const rejectSamajManagerWrite = (req, res) => {
  if (isSamajManager(getRoleFromRequest(req))) {
    res.status(403).json({ message: "not-allowed" });
    return true;
  }
  return false;
};

const findAccountByTokenId = async (id) => {
  if (!id) {
    return null;
  }
  return (
    (await User.findById(id)) ||
    (await User.findOne(idOrObjectIdFilter(String(id))))
  );
};

const samajValueKeys = async (samajId) => {
  if (!samajId) {
    return [];
  }
  const samaj = await Samaj.findOne(idOrObjectIdFilter(String(samajId)));
  return [
    ...new Set(
      [samajId, samaj?.id, samaj?._id && String(samaj._id)]
        .filter(Boolean)
        .map(String),
    ),
  ];
};

const isOwnSamajQuery = (query) =>
  query?.ownSamaj === true || String(query?.ownSamaj).toLowerCase() === "true";

module.exports = {
  findAccountByTokenId,
  samajValueKeys,
  isOwnSamajQuery,
  isSamajManager,
  rejectSamajManagerWrite,
};
