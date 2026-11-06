const Samaj = require("../models/samaj");
const { idOrObjectIdFilter } = require("./childCount");

const asId = (value) => {
  if (value == null || value === "") return "";
  return String(value).trim();
};

const locationFromSamaj = (samaj) => {
  if (!samaj) return {};
  return {
    country: asId(samaj.country_id),
    state: asId(samaj.state_id),
    region: asId(samaj.region_id),
    district: asId(samaj.district_id),
    city: asId(samaj.city_id),
    localSamaj: asId(samaj.id || samaj._id),
  };
};

const missingLocationPatch = (user = {}, fromSamaj = {}) => {
  const patch = {};
  ["country", "state", "region", "district", "city"].forEach((key) => {
    if (!asId(user[key]) && asId(fromSamaj[key])) {
      patch[key] = fromSamaj[key];
    }
  });
  if (!asId(user.localSamaj) && asId(fromSamaj.localSamaj)) {
    patch.localSamaj = fromSamaj.localSamaj;
  }
  return patch;
};

const findSamajForUser = async (user = {}) => {
  const key = asId(user.localSamaj);
  if (!key) return null;
  return Samaj.findOne(idOrObjectIdFilter(key)).lean();
};

/**
 * Ensure country/state/region/district/city are filled from localSamaj hierarchy.
 * Returns { user, patch } where patch is what was missing and derived.
 */
const enrichUserLocation = async (user = {}) => {
  const plain = { ...user };
  const samaj = await findSamajForUser(plain);
  if (!samaj) {
    return { user: plain, patch: {} };
  }
  const fromSamaj = locationFromSamaj(samaj);
  const patch = missingLocationPatch(plain, fromSamaj);
  return {
    user: { ...plain, ...patch },
    patch,
  };
};

module.exports = {
  enrichUserLocation,
  locationFromSamaj,
  findSamajForUser,
};
