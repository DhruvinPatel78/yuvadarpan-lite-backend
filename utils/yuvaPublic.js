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

const nameOf = async (Model, id) => {
  if (!id) {
    return "";
  }
  const rows = await findByAnyId(Model, String(id));
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row?.name || "";
};

const resolveYuvaLabels = async (yuva) => {
  const [
    lastName,
    native,
    country,
    state,
    region,
    district,
    city,
    localSamaj,
  ] = await Promise.all([
    nameOf(Surname, yuva.lastName),
    nameOf(Native, yuva.native),
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

const getPublicYuvaById = async (id) => {
  const rows = await findByAnyId(Yuvalist, sanitizeYuvaId(id));
  const yuva = Array.isArray(rows) ? rows[0] : rows;
  if (!yuva) {
    return null;
  }
  const json = typeof yuva.toJSON === "function" ? yuva.toJSON() : { ...yuva };
  json.labels = await resolveYuvaLabels(yuva);
  return json;
};

module.exports = { getPublicYuvaById };
