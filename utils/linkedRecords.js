const Country = require("../models/country");
const State = require("../models/state");
const Region = require("../models/region");
const District = require("../models/district");
const City = require("../models/city");
const Samaj = require("../models/samaj");
const Surname = require("../models/surname");
const Native = require("../models/native");
const Role = require("../models/role");
const User = require("../models/user");
const Yuvalist = require("../models/yuvalist");
const { idsFilter } = require("./childCount");

const ITEM_LIMIT = 100;
const PERSON_SELECT = "id firstName middleName fatherName lastName name email allowed";
const NAME_SELECT = "id name";

const uniqueKeys = (...lists) => [
  ...new Set(
    lists
      .flat()
      .filter(Boolean)
      .map(String),
  ),
];

const docKeys = (docs = []) =>
  uniqueKeys(
    docs.flatMap((doc) => [doc?.id, doc?._id && String(doc._id)]),
  );

const collectKeys = async (Model, ids = []) => {
  const values = (Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(String);
  if (!values.length) {
    return [];
  }
  const docs = await Model.find(idsFilter(values)).select("id").lean();
  return uniqueKeys(values, docKeys(docs));
};

const findByField = async (Model, field, keys, extra = {}, select = NAME_SELECT) => {
  if (!keys.length) {
    return [];
  }
  return Model.find({ ...extra, [field]: { $in: keys } })
    .select(select)
    .lean();
};

const personName = (doc) => {
  const name = [doc?.firstName, doc?.middleName, doc?.fatherName]
    .filter(Boolean)
    .join(" ");
  return name || doc?.name || doc?.email || "Unnamed";
};

const placeName = (doc) => doc?.name || doc?.label || "Unnamed";

const toPersonItems = (docs = []) =>
  docs.map((doc) => ({
    id: String(doc._id || doc.id),
    name: personName(doc),
    detail: doc.email || "",
  }));

const toPlaceItems = (docs = []) =>
  docs.map((doc) => ({
    id: String(doc._id || doc.id),
    name: placeName(doc),
  }));

const group = (key, label, docs, formatter) => {
  const items = formatter(docs);
  return {
    key,
    label,
    total: items.length,
    items: items.slice(0, ITEM_LIMIT),
  };
};

const splitUsers = (users = []) => {
  const requests = [];
  const accepted = [];
  users.forEach((user) => {
    if (user?.allowed === true) {
      accepted.push(user);
    } else {
      requests.push(user);
    }
  });
  return { requests, accepted };
};

const peopleGroups = (users = [], yuvas = []) => {
  const { requests, accepted } = splitUsers(users);
  return [
    group("newRequests", "New Requests", requests, toPersonItems),
    group("users", "Users", accepted, toPersonItems),
    group("yuvas", "Yuva", yuvas, toPersonItems),
  ];
};

const orFieldQuery = (fields, keys) => {
  const clauses = fields
    .map((field) => (keys.length ? { [field]: { $in: keys } } : null))
    .filter(Boolean);
  if (!clauses.length) {
    return null;
  }
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
};

const findByAnyField = async (Model, fields, keys, extra = {}, select) => {
  const query = orFieldQuery(fields, keys);
  if (!query) {
    return [];
  }
  return Model.find({ ...extra, ...query })
    .select(select)
    .lean();
};

const usersAndYuvasBySamaj = async (samajKeys) => {
  if (!samajKeys.length) {
    return { users: [], yuvas: [] };
  }
  const [users, yuvas] = await Promise.all([
    findByField(User, "localSamaj", samajKeys, {}, PERSON_SELECT),
    findByField(Yuvalist, "localSamaj", samajKeys, {}, PERSON_SELECT),
  ]);
  return { users, yuvas };
};

const getCountryLinks = async (ids) => {
  const countryKeys = await collectKeys(Country, ids);
  const [states, regions, districts, cities, samajs, yuvas] = await Promise.all([
    findByField(State, "country_id", countryKeys),
    findByField(Region, "country_id", countryKeys),
    findByField(District, "country_id", countryKeys),
    findByField(City, "country_id", countryKeys),
    findByField(Samaj, "country_id", countryKeys),
    findByAnyField(Yuvalist, ["country"], countryKeys, {}, PERSON_SELECT),
  ]);
  const { users, yuvas: samajYuvas } = await usersAndYuvasBySamaj(docKeys(samajs));
  const allYuvas = [
    ...yuvas,
    ...samajYuvas.filter(
      (item) => !yuvas.some((yuva) => String(yuva._id || yuva.id) === String(item._id || item.id)),
    ),
  ];
  return [
    ...peopleGroups(users, allYuvas),
    group("states", "State", states, toPlaceItems),
    group("regions", "Region", regions, toPlaceItems),
    group("districts", "District", districts, toPlaceItems),
    group("cities", "City", cities, toPlaceItems),
    group("samajs", "Samaj", samajs, toPlaceItems),
  ];
};

const getStateLinks = async (ids) => {
  const stateKeys = await collectKeys(State, ids);
  const [regions, districts, cities, samajs, yuvas] = await Promise.all([
    findByField(Region, "state_id", stateKeys),
    findByField(District, "state_id", stateKeys),
    findByField(City, "state_id", stateKeys),
    findByField(Samaj, "state_id", stateKeys),
    findByAnyField(Yuvalist, ["state"], stateKeys, {}, PERSON_SELECT),
  ]);
  const regionKeys = docKeys(regions);
  const samajKeys = docKeys(samajs);
  const [regionUsers, samajPeople] = await Promise.all([
    findByField(User, "region", regionKeys, {}, PERSON_SELECT),
    usersAndYuvasBySamaj(samajKeys),
  ]);
  const usersById = new Map();
  [...regionUsers, ...samajPeople.users].forEach((user) => {
    usersById.set(String(user._id || user.id), user);
  });
  const yuvasById = new Map();
  [...yuvas, ...samajPeople.yuvas].forEach((yuva) => {
    yuvasById.set(String(yuva._id || yuva.id), yuva);
  });
  return [
    ...peopleGroups([...usersById.values()], [...yuvasById.values()]),
    group("regions", "Region", regions, toPlaceItems),
    group("districts", "District", districts, toPlaceItems),
    group("cities", "City", cities, toPlaceItems),
    group("samajs", "Samaj", samajs, toPlaceItems),
  ];
};

const getRegionLinks = async (ids) => {
  const regionKeys = await collectKeys(Region, ids);
  const [districts, cities, samajs, users, yuvas] = await Promise.all([
    findByField(District, "region_id", regionKeys),
    findByField(City, "region_id", regionKeys),
    findByField(Samaj, "region_id", regionKeys),
    findByField(User, "region", regionKeys, {}, PERSON_SELECT),
    findByAnyField(Yuvalist, ["region"], regionKeys, {}, PERSON_SELECT),
  ]);
  const { users: samajUsers, yuvas: samajYuvas } = await usersAndYuvasBySamaj(
    docKeys(samajs),
  );
  const usersById = new Map();
  [...users, ...samajUsers].forEach((user) => {
    usersById.set(String(user._id || user.id), user);
  });
  const yuvasById = new Map();
  [...yuvas, ...samajYuvas].forEach((yuva) => {
    yuvasById.set(String(yuva._id || yuva.id), yuva);
  });
  return [
    ...peopleGroups([...usersById.values()], [...yuvasById.values()]),
    group("districts", "District", districts, toPlaceItems),
    group("cities", "City", cities, toPlaceItems),
    group("samajs", "Samaj", samajs, toPlaceItems),
  ];
};

const getDistrictLinks = async (ids) => {
  const districtKeys = await collectKeys(District, ids);
  const cities = await findByField(City, "district_id", districtKeys);
  const cityKeys = docKeys(cities);
  const [samajs, yuvas, cityYuvas] = await Promise.all([
    findByAnyField(Samaj, ["district_id", "city_id"], uniqueKeys(districtKeys, cityKeys)),
    findByAnyField(Yuvalist, ["district"], districtKeys, {}, PERSON_SELECT),
    findByField(Yuvalist, "city", cityKeys, {}, PERSON_SELECT),
  ]);
  const { users, yuvas: samajYuvas } = await usersAndYuvasBySamaj(docKeys(samajs));
  const yuvasById = new Map();
  [...yuvas, ...cityYuvas, ...samajYuvas].forEach((yuva) => {
    yuvasById.set(String(yuva._id || yuva.id), yuva);
  });
  return [
    ...peopleGroups(users, [...yuvasById.values()]),
    group("cities", "City", cities, toPlaceItems),
    group("samajs", "Samaj", samajs, toPlaceItems),
  ];
};

const getCityLinks = async (ids) => {
  const cityKeys = await collectKeys(City, ids);
  const [samajs, yuvas] = await Promise.all([
    findByField(Samaj, "city_id", cityKeys),
    findByAnyField(Yuvalist, ["city"], cityKeys, {}, PERSON_SELECT),
  ]);
  const { users, yuvas: samajYuvas } = await usersAndYuvasBySamaj(docKeys(samajs));
  const yuvasById = new Map();
  [...yuvas, ...samajYuvas].forEach((yuva) => {
    yuvasById.set(String(yuva._id || yuva.id), yuva);
  });
  return [
    ...peopleGroups(users, [...yuvasById.values()]),
    group("samajs", "Samaj", samajs, toPlaceItems),
  ];
};

const getSamajLinks = async (ids) => {
  const samajKeys = await collectKeys(Samaj, ids);
  const { users, yuvas } = await usersAndYuvasBySamaj(samajKeys);
  return peopleGroups(users, yuvas);
};

const getSurnameLinks = async (ids) => {
  const surnameKeys = await collectKeys(Surname, ids);
  const [users, yuvas] = await Promise.all([
    findByField(User, "lastName", surnameKeys, {}, PERSON_SELECT),
    findByField(Yuvalist, "lastName", surnameKeys, {}, PERSON_SELECT),
  ]);
  return peopleGroups(users, yuvas);
};

const getNativeLinks = async (ids) => {
  const nativeKeys = await collectKeys(Native, ids);
  const yuvas = await findByAnyField(
    Yuvalist,
    ["native", "mamaInfo.native"],
    nativeKeys,
    {},
    PERSON_SELECT,
  );
  return peopleGroups([], yuvas);
};

const getRoleLinks = async (ids) => {
  const values = (Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(String);
  const roles = await Role.find(idsFilter(values)).select("id name").lean();
  const roleKeys = uniqueKeys(
    values,
    docKeys(roles),
    roles.map((role) => role.name),
    roles.map((role) => String(role.name || "").toUpperCase()),
  );
  const users = await findByField(User, "role", roleKeys, {}, PERSON_SELECT);
  return peopleGroups(users, []);
};

const getUserLinks = async (ids) => {
  const userKeys = await collectKeys(User, ids);
  const yuvas = await findByAnyField(
    Yuvalist,
    ["createdBy"],
    userKeys,
    {},
    PERSON_SELECT,
  );
  return peopleGroups([], yuvas);
};

const getYuvaLinks = async () => [];

const HANDLERS = {
  country: getCountryLinks,
  state: getStateLinks,
  region: getRegionLinks,
  district: getDistrictLinks,
  city: getCityLinks,
  samaj: getSamajLinks,
  surname: getSurnameLinks,
  native: getNativeLinks,
  role: getRoleLinks,
  user: getUserLinks,
  yuva: getYuvaLinks,
};

const getLinkedRecords = async (entity, ids = []) => {
  const handler = HANDLERS[entity];
  if (!handler) {
    return { mapped: false, groups: [] };
  }
  const groups = (await handler(ids)).filter((item) => item.total > 0);
  return {
    mapped: groups.length > 0,
    groups,
  };
};

const attachLinkedRoute = (router, entity, errorCheck) => {
  router.post("/linked", async (req, res) => {
    try {
      if (errorCheck && errorCheck(req, res)) {
        return;
      }
      const ids = req.body?.ids || [];
      const result = await getLinkedRecords(entity, ids);
      res.status(200).json(result);
    } catch (error) {
      console.error("linked records failed", error);
      res.status(500).json({ mapped: false, groups: [], message: "failed-to-fetch" });
    }
  });
};

module.exports = {
  getLinkedRecords,
  attachLinkedRoute,
};
