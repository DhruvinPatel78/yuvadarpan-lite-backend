const Samaj = require("../models/samaj");
const City = require("../models/city");
const District = require("../models/district");
const Vibhag = require("../models/vibhag");
const Region = require("../models/region");
const State = require("../models/state");
const User = require("../models/user");
const { idOrObjectIdFilter } = require("./childCount");
const { getRoleRank, normalizeRole } = require("./userVisibility");

const ANCESTOR_CHAIN = [
  { userField: "localSamaj", model: Samaj, parentKeys: { city: "city_id", district: "district_id", vibhag: "vibhag_id", region: "region_id", state: "state_id", country: "country_id" } },
  { userField: "city", model: City, parentKeys: { district: "district_id", vibhag: "vibhag_id", region: "region_id", state: "state_id", country: "country_id" } },
  { userField: "district", model: District, parentKeys: { vibhag: "vibhag_id", region: "region_id", state: "state_id", country: "country_id" } },
  { userField: "vibhag", model: Vibhag, parentKeys: { region: "region_id", state: "state_id", country: "country_id" } },
  { userField: "region", model: Region, parentKeys: { state: "state_id", country: "country_id" } },
  { userField: "state", model: State, parentKeys: { country: "country_id" } },
];

const asId = (value) => {
  if (value == null || value === "") return "";
  return String(value).trim();
};

const indexByAnyId = (docs = []) => {
  const map = new Map();
  docs.forEach((doc) => {
    if (doc?.id) map.set(String(doc.id), doc);
    if (doc?._id) map.set(String(doc._id), doc);
  });
  return map;
};

const deriveLocationPatchFromMaps = (user = {}, maps = {}) => {
  const resolved = {
    country: asId(user.country),
    state: asId(user.state),
    region: asId(user.region),
    vibhag: asId(user.vibhag),
    district: asId(user.district),
    city: asId(user.city),
    localSamaj: asId(user.localSamaj),
  };
  const patch = {};

  for (const step of ANCESTOR_CHAIN) {
    const key = resolved[step.userField];
    if (!key) continue;
    const doc = maps[step.userField]?.get(key);
    if (!doc) continue;
    Object.entries(step.parentKeys).forEach(([ancestorField, docField]) => {
      if (!resolved[ancestorField] && asId(doc[docField])) {
        const value = asId(doc[docField]);
        resolved[ancestorField] = value;
        patch[ancestorField] = value;
      }
    });
  }

  return patch;
};

const locationFromSamaj = (samaj) => {
  if (!samaj) return {};
  return {
    country: asId(samaj.country_id),
    state: asId(samaj.state_id),
    region: asId(samaj.region_id),
    vibhag: asId(samaj.vibhag_id),
    district: asId(samaj.district_id),
    city: asId(samaj.city_id),
    localSamaj: asId(samaj.id || samaj._id),
  };
};

const findSamajForUser = async (user = {}) => {
  const key = asId(user.localSamaj);
  if (!key) return null;
  return Samaj.findOne(idOrObjectIdFilter(key)).lean();
};

/**
 * Walk upward from the lowest assigned location node (localSamaj -> city -> ... -> state)
 * so every user record retains its full ancestor chain (country..localSamaj).
 */
const enrichUserLocation = async (user = {}) => {
  const plain = { ...user };
  const resolved = {
    country: asId(plain.country),
    state: asId(plain.state),
    region: asId(plain.region),
    vibhag: asId(plain.vibhag),
    district: asId(plain.district),
    city: asId(plain.city),
    localSamaj: asId(plain.localSamaj),
  };
  const patch = {};

  for (const step of ANCESTOR_CHAIN) {
    const key = resolved[step.userField];
    if (!key) continue;
    const doc = await step.model.findOne(idOrObjectIdFilter(key)).lean();
    if (!doc) continue;
    Object.entries(step.parentKeys).forEach(([ancestorField, docField]) => {
      if (!resolved[ancestorField] && asId(doc[docField])) {
        const value = asId(doc[docField]);
        resolved[ancestorField] = value;
        patch[ancestorField] = value;
      }
    });
  }

  return {
    user: { ...plain, ...patch },
    patch,
  };
};

let backfillPromise = null;

/**
 * Idempotently backfill roleRank and missing ancestor location fields on existing
 * User documents once per server process so materialized-path visibility filters
 * match legacy records without manual migration.
 */
const ensureUsersLocationAndRankBackfilled = async () => {
  if (backfillPromise) {
    return backfillPromise;
  }
  backfillPromise = (async () => {
    const [samajs, cities, districts, vibhags, regions, states, users] =
      await Promise.all([
        Samaj.find().select("id city_id district_id vibhag_id region_id state_id country_id").lean(),
        City.find().select("id district_id vibhag_id region_id state_id country_id").lean(),
        District.find().select("id vibhag_id region_id state_id country_id").lean(),
        Vibhag.find().select("id region_id state_id country_id").lean(),
        Region.find().select("id state_id country_id").lean(),
        State.find().select("id country_id").lean(),
        User.find()
          .select("role roleRank country state region vibhag district city localSamaj")
          .lean(),
      ]);

    const maps = {
      localSamaj: indexByAnyId(samajs),
      city: indexByAnyId(cities),
      district: indexByAnyId(districts),
      vibhag: indexByAnyId(vibhags),
      region: indexByAnyId(regions),
      state: indexByAnyId(states),
    };

    const ops = [];
    users.forEach((doc) => {
      const patch = deriveLocationPatchFromMaps(doc, maps);
      const expectedRole = normalizeRole(doc.role);
      const expectedRank = getRoleRank(expectedRole);
      if (expectedRole && doc.role !== expectedRole) {
        patch.role = expectedRole;
      }
      if (doc.roleRank !== expectedRank) {
        patch.roleRank = expectedRank;
      }
      if (Object.keys(patch).length > 0) {
        ops.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: patch },
          },
        });
      }
    });

    if (ops.length) {
      await User.bulkWrite(ops, { ordered: false });
    }
  })().catch((err) => {
    backfillPromise = null;
    throw err;
  });

  return backfillPromise;
};

module.exports = {
  enrichUserLocation,
  locationFromSamaj,
  findSamajForUser,
  deriveLocationPatchFromMaps,
  ensureUsersLocationAndRankBackfilled,
};
