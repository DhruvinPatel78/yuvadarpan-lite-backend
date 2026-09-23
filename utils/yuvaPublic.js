const Yuvalist = require("../models/yuvalist");
const Surname = require("../models/surname");
const Native = require("../models/native");
const Country = require("../models/country");
const State = require("../models/state");
const Region = require("../models/region");
const District = require("../models/district");
const City = require("../models/city");
const Samaj = require("../models/samaj");
const { findByAnyId } = require("./childCount");
const { nameText } = require("./masterName");
const { withEnGu } = require("./yuvaGu");

const nameOf = async (Model, id) => {
  if (!id) {
    return { en: "", gu: "" };
  }
  const rows = await findByAnyId(Model, String(id));
  const row = Array.isArray(rows) ? rows[0] : rows;
  return {
    en: nameText(row, "en"),
    gu: nameText(row, "gu"),
  };
};

const resolveYuvaLabels = async (yuva) => {
  const [
    lastName,
    native,
    mamaNative,
    mamaLastName,
    contactLastName,
    country,
    state,
    region,
    district,
    city,
    localSamaj,
  ] = await Promise.all([
    nameOf(Surname, yuva.lastName),
    nameOf(Native, yuva.native),
    nameOf(Native, yuva.mamaInfo?.native),
    nameOf(Surname, yuva.mamaInfo?.lastName),
    nameOf(Surname, yuva.contactInfo?.lastName),
    nameOf(Country, yuva.country),
    nameOf(State, yuva.state),
    nameOf(Region, yuva.region),
    nameOf(District, yuva.district),
    nameOf(City, yuva.city),
    nameOf(Samaj, yuva.localSamaj),
  ]);
  return {
    lastName,
    native,
    mamaNative,
    mamaLastName,
    contactLastName,
    country,
    state,
    region,
    district,
    city,
    localSamaj,
  };
};

const sanitizeYuvaId = (value) => {
  const raw = decodeURIComponent(String(value || "")).trim();
  const objectId = raw.match(/[a-fA-F0-9]{24}/);
  if (objectId) {
    return objectId[0];
  }
  const compactId = raw.match(/[a-fA-F0-9]{32}/);
  if (compactId) {
    return compactId[0];
  }
  return raw.split(/[\s/?&#]/)[0];
};

const MEMBER_YUVA_KEYS = [
  "id",
  "firstName",
  "fatherName",
  "grandFatherName",
  "motherName",
  "lastName",
  "dob",
  "gender",
  "city",
  "state",
  "region",
  "district",
  "localSamaj",
  "native",
  "mamaInfo",
  "firm",
  "martialStatus",
  "bloodGroup",
  "education",
  "height",
  "weight",
  "profile",
  "active",
];

const MEMBER_YUVA_SELECT = MEMBER_YUVA_KEYS.join(" ");

const MEMBER_PROFILE_KEYS = [
  ...MEMBER_YUVA_KEYS,
  "familyId",
  "pob",
  "YSKno",
  "activity",
  "country",
  "firmAddress",
  "address",
  "contactInfo",
  "handicap",
  "handicapDetails",
  "other",
  "abroadStudy",
  "manglik",
];

// Unauthenticated GET /public/:id allowlist. Currently matches GET /list/:id.
// Remove keys from this list later to hide fields without adding auth.
const PUBLIC_PROFILE_KEYS = [...MEMBER_PROFILE_KEYS];

const pickYuvaFields = (yuva, keys) => {
  if (!yuva) {
    return null;
  }
  const json = typeof yuva.toJSON === "function" ? yuva.toJSON() : { ...yuva };
  delete json.gu;
  const picked = {};
  keys.forEach((key) => {
    if (json[key] !== undefined) {
      picked[key] = json[key];
    }
  });
  picked.id = json.id || json._id;
  return picked;
};

const getPublicYuvaById = async (id) => {
  const rows = await findByAnyId(Yuvalist, sanitizeYuvaId(id));
  const yuva = Array.isArray(rows) ? rows[0] : rows;
  if (!yuva) {
    return null;
  }
  const json = pickYuvaFields(withEnGu(yuva), PUBLIC_PROFILE_KEYS);
  json.labels = await resolveYuvaLabels(yuva);
  delete json.email;
  return json;
};

module.exports = {
  getPublicYuvaById,
  pickYuvaFields,
  resolveYuvaLabels,
  MEMBER_YUVA_KEYS,
  MEMBER_YUVA_SELECT,
  MEMBER_PROFILE_KEYS,
  PUBLIC_PROFILE_KEYS,
};
