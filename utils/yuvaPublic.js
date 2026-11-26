const Yuvalist = require("../models/yuvalist");
const Surname = require("../models/surname");
const Native = require("../models/native");
const Country = require("../models/country");
const State = require("../models/state");
const Region = require("../models/region");
const Vibhag = require("../models/vibhag");
const District = require("../models/district");
const City = require("../models/city");
const Samaj = require("../models/samaj");
const { findByAnyId, idOrObjectIdFilter } = require("./childCount");
const { nameText } = require("./masterName");
const { withEnGu } = require("./yuvaGu");
const { escapeRegex } = require("./escapeRegex");
const SlugHistory = require("../models/slugHistory");

const MEMBER_HIDDEN_MARITAL = {
  engaged: ["engaged", "Engaged", "વગ્દાન"],
  married: ["married", "Married", "પરણિત"],
};

const memberHiddenMaritalValues = () =>
  [...new Set(Object.values(MEMBER_HIDDEN_MARITAL).flat())];

const maritalStatusTexts = (martialStatus) => {
  if (martialStatus == null || martialStatus === "") {
    return [];
  }
  if (typeof martialStatus === "object" && !Array.isArray(martialStatus)) {
    return [martialStatus.en, martialStatus.gu, martialStatus.name]
      .filter((value) => value != null && value !== "")
      .map((value) => String(value).trim().toLowerCase());
  }
  return [String(martialStatus).trim().toLowerCase()];
};

const isHiddenFromMembers = (martialStatus) => {
  const blocked = new Set(
    memberHiddenMaritalValues().map((value) => String(value).trim().toLowerCase())
  );
  return maritalStatusTexts(martialStatus).some((value) => blocked.has(value));
};

const memberBrowseMaritalFilter = () => {
  const blocked = memberHiddenMaritalValues();
  return {
    $nor: blocked.flatMap((item) => {
      const rx = {
        $regex: `^${escapeRegex(String(item).trim())}$`,
        $options: "i",
      };
      return [
        { martialStatus: rx },
        { "martialStatus.en": rx },
        { "martialStatus.gu": rx },
      ];
    }),
  };
};

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
    vibhag,
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
    nameOf(Vibhag, yuva.vibhag),
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
    vibhag,
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
  "slug",
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
  "vibhag",
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

const findYuvaBySlugOrId = async (raw) => {
  const key = sanitizeYuvaId(raw);
  if (!key) {
    return { yuva: null, redirectSlug: null };
  }

  let yuva = await Yuvalist.findOne({ slug: key });
  if (yuva) {
    return { yuva, redirectSlug: null };
  }

  const history = await SlugHistory.findOne({
    slug: key,
    entityType: "YuvaList",
  }).lean();
  if (history?.entityId) {
    yuva =
      (await Yuvalist.findById(history.entityId)) ||
      (await Yuvalist.findOne(idOrObjectIdFilter(String(history.entityId))));
    if (yuva?.slug) {
      return { yuva, redirectSlug: yuva.slug };
    }
  }

  const rows = await findByAnyId(Yuvalist, key);
  yuva = Array.isArray(rows) ? rows[0] : rows;
  if (!yuva) {
    return { yuva: null, redirectSlug: null };
  }
  return {
    yuva,
    redirectSlug: yuva.slug && yuva.slug !== key ? yuva.slug : null,
  };
};

const getPublicYuvaById = async (id) => {
  const { yuva, redirectSlug } = await findYuvaBySlugOrId(id);
  if (!yuva) {
    return null;
  }
  const json = pickYuvaFields(withEnGu(yuva), PUBLIC_PROFILE_KEYS);
  json.labels = await resolveYuvaLabels(yuva);
  delete json.email;
  if (redirectSlug) {
    json.redirectSlug = redirectSlug;
  }
  return json;
};

module.exports = {
  getPublicYuvaById,
  findYuvaBySlugOrId,
  pickYuvaFields,
  resolveYuvaLabels,
  sanitizeYuvaId,
  isHiddenFromMembers,
  memberBrowseMaritalFilter,
  MEMBER_YUVA_KEYS,
  MEMBER_YUVA_SELECT,
  MEMBER_PROFILE_KEYS,
  PUBLIC_PROFILE_KEYS,
};
