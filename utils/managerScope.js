const jwt = require("jsonwebtoken");
const User = require("../models/user");
const Samaj = require("../models/samaj");
const City = require("../models/city");
const District = require("../models/district");
const Region = require("../models/region");
const State = require("../models/state");
const Country = require("../models/country");
const { idOrObjectIdFilter } = require("./childCount");

const isSamajManager = (role) =>
  String(role || "").toUpperCase() === "SAMAJ_MANAGER";

const isCityManager = (role) =>
  String(role || "").toUpperCase() === "CITY_MANAGER";

const isDistrictManager = (role) =>
  String(role || "").toUpperCase() === "DISTRICT_MANAGER";

const isRegionManager = (role) =>
  String(role || "").toUpperCase() === "REGION_MANAGER";

const isStateManager = (role) =>
  String(role || "").toUpperCase() === "STATE_MANAGER";

const isCountryManager = (role) =>
  String(role || "").toUpperCase() === "COUNTRY_MANAGER";

const isLocationMasterReadOnly = (role) =>
  isSamajManager(role) ||
  isCityManager(role) ||
  isDistrictManager(role) ||
  isRegionManager(role) ||
  isStateManager(role) ||
  isCountryManager(role);

const getTokenPayload = (req) => {
  if (req.user?.role || req.user?.id) {
    return req.user;
  }
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return null;
  }
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return null;
  }
};

const getRoleFromRequest = (req) => getTokenPayload(req)?.role || null;

const rejectSamajManagerWrite = (req, res) => {
  if (isSamajManager(getRoleFromRequest(req))) {
    res.status(403).json({ message: "not-allowed" });
    return true;
  }
  return false;
};

const rejectLocationMasterWrite = (req, res) => {
  if (isLocationMasterReadOnly(getRoleFromRequest(req))) {
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

const entityValueKeys = async (Model, value) => {
  if (!value) {
    return [];
  }
  const doc = await Model.findOne(idOrObjectIdFilter(String(value)));
  return [
    ...new Set(
      [value, doc?.id, doc?._id && String(doc._id)].filter(Boolean).map(String),
    ),
  ];
};

const samajValueKeys = (samajId) => entityValueKeys(Samaj, samajId);

const cityValueKeys = (cityId) => entityValueKeys(City, cityId);

const getManagerCityId = async (manager) => {
  if (!manager) {
    return null;
  }
  if (manager.city) {
    return manager.city;
  }
  if (!manager.localSamaj) {
    return null;
  }
  const samaj = await Samaj.findOne(
    idOrObjectIdFilter(String(manager.localSamaj)),
  );
  return samaj?.city_id || null;
};

const samajIdsForCity = async (cityId) => {
  const cityKeys = await cityValueKeys(cityId);
  if (!cityKeys.length) {
    return [];
  }
  const samajs = await Samaj.find({ city_id: { $in: cityKeys } }).lean();
  return [
    ...new Set(
      samajs.flatMap((item) =>
        [item.id, item._id && String(item._id)].filter(Boolean).map(String),
      ),
    ),
  ];
};

const usersInManagerCityQuery = async (manager) => {
  const samajIds = await samajIdsForCity(await getManagerCityId(manager));
  if (!samajIds.length) {
    return { _id: { $in: [] } };
  }
  return { localSamaj: { $in: samajIds } };
};

const recordsInManagerCityQuery = async (manager) => {
  const cityId = await getManagerCityId(manager);
  const cityKeys = await cityValueKeys(cityId);
  const samajIds = await samajIdsForCity(cityId);
  const clauses = [];
  if (cityKeys.length) {
    clauses.push({ city: { $in: cityKeys } });
  }
  if (samajIds.length) {
    clauses.push({ localSamaj: { $in: samajIds } });
  }
  if (!clauses.length) {
    return { _id: { $in: [] } };
  }
  return { $or: clauses };
};

const isOwnSamajQuery = (query) =>
  query?.ownSamaj === true || String(query?.ownSamaj).toLowerCase() === "true";

const isOwnCityQuery = (query) =>
  query?.ownCity === true || String(query?.ownCity).toLowerCase() === "true";

const isOwnDistrictQuery = (query) =>
  query?.ownDistrict === true ||
  String(query?.ownDistrict).toLowerCase() === "true";

const isOwnRegionQuery = (query) =>
  query?.ownRegion === true || String(query?.ownRegion).toLowerCase() === "true";

const isOwnStateQuery = (query) =>
  query?.ownState === true || String(query?.ownState).toLowerCase() === "true";

const isOwnCountryQuery = (query) =>
  query?.ownCountry === true ||
  String(query?.ownCountry).toLowerCase() === "true";

const collectIds = (docs) => [
  ...new Set(
    (docs || []).flatMap((item) =>
      [item.id, item._id && String(item._id)].filter(Boolean).map(String),
    ),
  ),
];

const districtValueKeys = (districtId) => entityValueKeys(District, districtId);

const regionValueKeys = (regionId) => entityValueKeys(Region, regionId);

const stateValueKeys = (stateId) => entityValueKeys(State, stateId);

const countryValueKeys = (countryId) => entityValueKeys(Country, countryId);

const getManagerDistrictId = async (manager) => {
  if (!manager) {
    return null;
  }
  if (manager.district) {
    return manager.district;
  }
  if (manager.localSamaj) {
    const samaj = await Samaj.findOne(
      idOrObjectIdFilter(String(manager.localSamaj)),
    );
    if (samaj?.district_id) {
      return samaj.district_id;
    }
    if (samaj?.city_id) {
      const city = await City.findOne(
        idOrObjectIdFilter(String(samaj.city_id)),
      );
      if (city?.district_id) {
        return city.district_id;
      }
    }
  }
  if (manager.city) {
    const city = await City.findOne(idOrObjectIdFilter(String(manager.city)));
    return city?.district_id || null;
  }
  return null;
};

const cityIdsForDistrict = async (districtId) => {
  const districtKeys = await districtValueKeys(districtId);
  if (!districtKeys.length) {
    return [];
  }
  const cities = await City.find({ district_id: { $in: districtKeys } }).lean();
  return [
    ...new Set(
      cities.flatMap((item) =>
        [item.id, item._id && String(item._id)].filter(Boolean).map(String),
      ),
    ),
  ];
};

const samajIdsForDistrict = async (districtId) => {
  const districtKeys = await districtValueKeys(districtId);
  const cityIds = await cityIdsForDistrict(districtId);
  if (!districtKeys.length && !cityIds.length) {
    return [];
  }
  const clauses = [];
  if (districtKeys.length) {
    clauses.push({ district_id: { $in: districtKeys } });
  }
  if (cityIds.length) {
    clauses.push({ city_id: { $in: cityIds } });
  }
  const samajs = await Samaj.find(clauses.length === 1 ? clauses[0] : { $or: clauses }).lean();
  return [
    ...new Set(
      samajs.flatMap((item) =>
        [item.id, item._id && String(item._id)].filter(Boolean).map(String),
      ),
    ),
  ];
};

const usersInManagerDistrictQuery = async (manager) => {
  const samajIds = await samajIdsForDistrict(await getManagerDistrictId(manager));
  if (!samajIds.length) {
    return { _id: { $in: [] } };
  }
  return { localSamaj: { $in: samajIds } };
};

const recordsInManagerDistrictQuery = async (manager) => {
  const districtId = await getManagerDistrictId(manager);
  const districtKeys = await districtValueKeys(districtId);
  const cityKeys = await cityIdsForDistrict(districtId);
  const samajIds = await samajIdsForDistrict(districtId);
  const clauses = [];
  if (districtKeys.length) {
    clauses.push({ district: { $in: districtKeys } });
  }
  if (cityKeys.length) {
    clauses.push({ city: { $in: cityKeys } });
  }
  if (samajIds.length) {
    clauses.push({ localSamaj: { $in: samajIds } });
  }
  if (!clauses.length) {
    return { _id: { $in: [] } };
  }
  return { $or: clauses };
};

const getManagerRegionId = async (manager) => {
  if (!manager) {
    return null;
  }
  if (manager.region) {
    return manager.region;
  }
  if (manager.localSamaj) {
    const samaj = await Samaj.findOne(
      idOrObjectIdFilter(String(manager.localSamaj)),
    );
    return samaj?.region_id || null;
  }
  return null;
};

const districtIdsForRegion = async (regionId) => {
  const regionKeys = await regionValueKeys(regionId);
  if (!regionKeys.length) {
    return [];
  }
  const districts = await District.find({ region_id: { $in: regionKeys } }).lean();
  return collectIds(districts);
};

const cityIdsForRegion = async (regionId) => {
  const regionKeys = await regionValueKeys(regionId);
  const districtIds = await districtIdsForRegion(regionId);
  const clauses = [];
  if (regionKeys.length) {
    clauses.push({ region_id: { $in: regionKeys } });
  }
  if (districtIds.length) {
    clauses.push({ district_id: { $in: districtIds } });
  }
  if (!clauses.length) {
    return [];
  }
  const cities = await City.find(
    clauses.length === 1 ? clauses[0] : { $or: clauses },
  ).lean();
  return collectIds(cities);
};

const samajIdsForRegion = async (regionId) => {
  const regionKeys = await regionValueKeys(regionId);
  const cityIds = await cityIdsForRegion(regionId);
  const districtIds = await districtIdsForRegion(regionId);
  const clauses = [];
  if (regionKeys.length) {
    clauses.push({ region_id: { $in: regionKeys } });
  }
  if (districtIds.length) {
    clauses.push({ district_id: { $in: districtIds } });
  }
  if (cityIds.length) {
    clauses.push({ city_id: { $in: cityIds } });
  }
  if (!clauses.length) {
    return [];
  }
  const samajs = await Samaj.find(
    clauses.length === 1 ? clauses[0] : { $or: clauses },
  ).lean();
  return collectIds(samajs);
};

const usersInManagerRegionQuery = async (manager) => {
  const regionKeys = await regionValueKeys(await getManagerRegionId(manager));
  if (!regionKeys.length) {
    return { _id: { $in: [] } };
  }
  return { region: { $in: regionKeys } };
};

const recordsInManagerRegionQuery = async (manager) => {
  const regionId = await getManagerRegionId(manager);
  const regionKeys = await regionValueKeys(regionId);
  const districtKeys = await districtIdsForRegion(regionId);
  const cityKeys = await cityIdsForRegion(regionId);
  const samajIds = await samajIdsForRegion(regionId);
  const clauses = [];
  if (regionKeys.length) {
    clauses.push({ region: { $in: regionKeys } });
  }
  if (districtKeys.length) {
    clauses.push({ district: { $in: districtKeys } });
  }
  if (cityKeys.length) {
    clauses.push({ city: { $in: cityKeys } });
  }
  if (samajIds.length) {
    clauses.push({ localSamaj: { $in: samajIds } });
  }
  if (!clauses.length) {
    return { _id: { $in: [] } };
  }
  return { $or: clauses };
};

const getManagerStateId = async (manager) => {
  if (!manager) {
    return null;
  }
  if (manager.state) {
    return manager.state;
  }
  if (manager.localSamaj) {
    const samaj = await Samaj.findOne(
      idOrObjectIdFilter(String(manager.localSamaj)),
    );
    if (samaj?.state_id) {
      return samaj.state_id;
    }
  }
  if (manager.region) {
    const region = await Region.findOne(
      idOrObjectIdFilter(String(manager.region)),
    );
    return region?.state_id || null;
  }
  return null;
};

const regionIdsForState = async (stateId) => {
  const stateKeys = await stateValueKeys(stateId);
  if (!stateKeys.length) {
    return [];
  }
  const regions = await Region.find({ state_id: { $in: stateKeys } }).lean();
  return collectIds(regions);
};

const districtIdsForState = async (stateId) => {
  const stateKeys = await stateValueKeys(stateId);
  const regionIds = await regionIdsForState(stateId);
  const clauses = [];
  if (stateKeys.length) {
    clauses.push({ state_id: { $in: stateKeys } });
  }
  if (regionIds.length) {
    clauses.push({ region_id: { $in: regionIds } });
  }
  if (!clauses.length) {
    return [];
  }
  const districts = await District.find(
    clauses.length === 1 ? clauses[0] : { $or: clauses },
  ).lean();
  return collectIds(districts);
};

const cityIdsForState = async (stateId) => {
  const stateKeys = await stateValueKeys(stateId);
  const regionIds = await regionIdsForState(stateId);
  const districtIds = await districtIdsForState(stateId);
  const clauses = [];
  if (stateKeys.length) {
    clauses.push({ state_id: { $in: stateKeys } });
  }
  if (regionIds.length) {
    clauses.push({ region_id: { $in: regionIds } });
  }
  if (districtIds.length) {
    clauses.push({ district_id: { $in: districtIds } });
  }
  if (!clauses.length) {
    return [];
  }
  const cities = await City.find(
    clauses.length === 1 ? clauses[0] : { $or: clauses },
  ).lean();
  return collectIds(cities);
};

const samajIdsForState = async (stateId) => {
  const stateKeys = await stateValueKeys(stateId);
  const regionIds = await regionIdsForState(stateId);
  const districtIds = await districtIdsForState(stateId);
  const cityIds = await cityIdsForState(stateId);
  const clauses = [];
  if (stateKeys.length) {
    clauses.push({ state_id: { $in: stateKeys } });
  }
  if (regionIds.length) {
    clauses.push({ region_id: { $in: regionIds } });
  }
  if (districtIds.length) {
    clauses.push({ district_id: { $in: districtIds } });
  }
  if (cityIds.length) {
    clauses.push({ city_id: { $in: cityIds } });
  }
  if (!clauses.length) {
    return [];
  }
  const samajs = await Samaj.find(
    clauses.length === 1 ? clauses[0] : { $or: clauses },
  ).lean();
  return collectIds(samajs);
};

const usersInManagerStateQuery = async (manager) => {
  const stateId = await getManagerStateId(manager);
  const regionIds = await regionIdsForState(stateId);
  const samajIds = await samajIdsForState(stateId);
  const clauses = [];
  if (regionIds.length) {
    clauses.push({ region: { $in: regionIds } });
  }
  if (samajIds.length) {
    clauses.push({ localSamaj: { $in: samajIds } });
  }
  if (!clauses.length) {
    return { _id: { $in: [] } };
  }
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
};

const recordsInManagerStateQuery = async (manager) => {
  const stateId = await getManagerStateId(manager);
  const stateKeys = await stateValueKeys(stateId);
  const regionKeys = await regionIdsForState(stateId);
  const districtKeys = await districtIdsForState(stateId);
  const cityKeys = await cityIdsForState(stateId);
  const samajIds = await samajIdsForState(stateId);
  const clauses = [];
  if (stateKeys.length) {
    clauses.push({ state: { $in: stateKeys } });
  }
  if (regionKeys.length) {
    clauses.push({ region: { $in: regionKeys } });
  }
  if (districtKeys.length) {
    clauses.push({ district: { $in: districtKeys } });
  }
  if (cityKeys.length) {
    clauses.push({ city: { $in: cityKeys } });
  }
  if (samajIds.length) {
    clauses.push({ localSamaj: { $in: samajIds } });
  }
  if (!clauses.length) {
    return { _id: { $in: [] } };
  }
  return { $or: clauses };
};

const getManagerCountryId = async (manager) => {
  if (!manager) {
    return null;
  }
  if (manager.country) {
    return manager.country;
  }
  if (manager.localSamaj) {
    const samaj = await Samaj.findOne(
      idOrObjectIdFilter(String(manager.localSamaj)),
    );
    if (samaj?.country_id) {
      return samaj.country_id;
    }
  }
  if (manager.region) {
    const region = await Region.findOne(
      idOrObjectIdFilter(String(manager.region)),
    );
    if (region?.country_id) {
      return region.country_id;
    }
  }
  if (manager.state) {
    const state = await State.findOne(idOrObjectIdFilter(String(manager.state)));
    return state?.country_id || null;
  }
  return null;
};

const idsByCountry = async (Model, countryId) => {
  const countryKeys = await countryValueKeys(countryId);
  if (!countryKeys.length) {
    return [];
  }
  const docs = await Model.find({ country_id: { $in: countryKeys } }).lean();
  return collectIds(docs);
};

const stateIdsForCountry = (countryId) => idsByCountry(State, countryId);
const regionIdsForCountry = (countryId) => idsByCountry(Region, countryId);
const districtIdsForCountry = (countryId) => idsByCountry(District, countryId);
const cityIdsForCountry = (countryId) => idsByCountry(City, countryId);
const samajIdsForCountry = (countryId) => idsByCountry(Samaj, countryId);

const usersInManagerCountryQuery = async (manager) => {
  const countryId = await getManagerCountryId(manager);
  const regionIds = await regionIdsForCountry(countryId);
  const samajIds = await samajIdsForCountry(countryId);
  const clauses = [];
  if (regionIds.length) {
    clauses.push({ region: { $in: regionIds } });
  }
  if (samajIds.length) {
    clauses.push({ localSamaj: { $in: samajIds } });
  }
  if (!clauses.length) {
    return { _id: { $in: [] } };
  }
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
};

const recordsInManagerCountryQuery = async (manager) => {
  const countryId = await getManagerCountryId(manager);
  const countryKeys = await countryValueKeys(countryId);
  const stateKeys = await stateIdsForCountry(countryId);
  const regionKeys = await regionIdsForCountry(countryId);
  const districtKeys = await districtIdsForCountry(countryId);
  const cityKeys = await cityIdsForCountry(countryId);
  const samajIds = await samajIdsForCountry(countryId);
  const clauses = [];
  if (countryKeys.length) {
    clauses.push({ country: { $in: countryKeys } });
  }
  if (stateKeys.length) {
    clauses.push({ state: { $in: stateKeys } });
  }
  if (regionKeys.length) {
    clauses.push({ region: { $in: regionKeys } });
  }
  if (districtKeys.length) {
    clauses.push({ district: { $in: districtKeys } });
  }
  if (cityKeys.length) {
    clauses.push({ city: { $in: cityKeys } });
  }
  if (samajIds.length) {
    clauses.push({ localSamaj: { $in: samajIds } });
  }
  if (!clauses.length) {
    return { _id: { $in: [] } };
  }
  return { $or: clauses };
};

module.exports = {
  findAccountByTokenId,
  samajValueKeys,
  cityValueKeys,
  districtValueKeys,
  regionValueKeys,
  stateValueKeys,
  countryValueKeys,
  getManagerCityId,
  getManagerDistrictId,
  getManagerRegionId,
  getManagerStateId,
  getManagerCountryId,
  samajIdsForCity,
  cityIdsForDistrict,
  samajIdsForDistrict,
  districtIdsForRegion,
  cityIdsForRegion,
  samajIdsForRegion,
  regionIdsForState,
  districtIdsForState,
  cityIdsForState,
  samajIdsForState,
  stateIdsForCountry,
  regionIdsForCountry,
  districtIdsForCountry,
  cityIdsForCountry,
  samajIdsForCountry,
  usersInManagerCityQuery,
  recordsInManagerCityQuery,
  usersInManagerDistrictQuery,
  recordsInManagerDistrictQuery,
  usersInManagerRegionQuery,
  recordsInManagerRegionQuery,
  usersInManagerStateQuery,
  recordsInManagerStateQuery,
  usersInManagerCountryQuery,
  recordsInManagerCountryQuery,
  isOwnSamajQuery,
  isOwnCityQuery,
  isOwnDistrictQuery,
  isOwnRegionQuery,
  isOwnStateQuery,
  isOwnCountryQuery,
  isSamajManager,
  isCityManager,
  isDistrictManager,
  isRegionManager,
  isStateManager,
  isCountryManager,
  isLocationMasterReadOnly,
  getTokenPayload,
  getRoleFromRequest,
  rejectSamajManagerWrite,
  rejectLocationMasterWrite,
};
