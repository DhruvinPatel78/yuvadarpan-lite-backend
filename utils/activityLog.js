const ActivityLog = require("../models/activityLog");
const User = require("../models/user");
const Samaj = require("../models/samaj");
const City = require("../models/city");
const District = require("../models/district");
const Region = require("../models/region");
const State = require("../models/state");
const Country = require("../models/country");
const Native = require("../models/native");
const Surname = require("../models/surname");
const Gotra = require("../models/gotra");
const { findAccountByTokenId } = require("./managerScope");
const { idOrObjectIdFilter } = require("./childCount");
const { nameText, pairText } = require("./masterName");

const STAFF_ROLES = new Set([
  "ADMIN",
  "SAMAJ_MANAGER",
  "CITY_MANAGER",
  "DISTRICT_MANAGER",
  "REGION_MANAGER",
  "STATE_MANAGER",
  "COUNTRY_MANAGER",
]);

const SKIP_KEYS = new Set([
  "password",
  "confirmPassword",
  "__v",
  "updatedAt",
  "updatedBy",
  "createdAt",
  "createdBy",
  "fcmToken",
  "id",
  "_id",
]);

const FIELD_LABELS = {
  firstName: "First name",
  middleName: "Middle name",
  lastName: "Last name",
  fatherName: "Father name",
  motherName: "Mother name",
  grandFatherName: "Grandfather name",
  email: "Email",
  mobile: "Mobile",
  familyId: "Family ID",
  dob: "Date of birth",
  gender: "Gender",
  language: "Language",
  gu: "Gujarati",
  role: "Role",
  active: "Active",
  allowed: "Allowed",
  region: "Region",
  localSamaj: "Local samaj",
  city: "City",
  district: "District",
  state: "State",
  country: "Country",
  native: "Native",
  name: "Name",
  label: "Label",
  zipcode: "Zipcode",
  country_id: "Country",
  state_id: "State",
  region_id: "Region",
  district_id: "District",
  city_id: "City",
  bloodGroup: "Blood group",
  height: "Height",
  weight: "Weight",
  pob: "Place of birth",
  activity: "Activity",
  martialStatus: "Marital status",
  YSKno: "YSK no",
  abroadStudy: "Abroad study",
  handicap: "Handicap",
  handicapDetails: "Handicap details",
  manglik: "Manglik",
  firm: "Firm",
  firmAddress: "Firm address",
  address: "Address",
  "mamaInfo.name": "Mama name",
  "mamaInfo.lastName": "Mama last name",
  "mamaInfo.city": "Mama city",
  "mamaInfo.native": "Mama native",
  "contactInfo.name": "Contact name",
  "contactInfo.lastName": "Contact last name",
  "contactInfo.phone": "Contact phone",
  "contactInfo.relation": "Contact relation",
  "education.education": "Education",
  "education.fieldOfStudy": "Field of study",
  "profile.url": "Profile photo",
  "profile.name": "Profile photo name",
  password: "Password",
};

const LOOKUP_MODELS = {
  lastName: Surname,
  localSamaj: Samaj,
  region: Region,
  city: City,
  district: District,
  state: State,
  country: Country,
  native: Native,
  gotra: Gotra,
  country_id: Country,
  state_id: State,
  region_id: Region,
  district_id: District,
  city_id: City,
  "mamaInfo.native": Native,
  "mamaInfo.lastName": Surname,
  "contactInfo.lastName": Surname,
};

const isStaffRole = (role) => {
  const normalized = String(role || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  return STAFF_ROLES.has(normalized);
};

const toPlain = (doc) => {
  if (!doc) return null;
  if (typeof doc.toObject === "function") return doc.toObject();
  if (typeof doc.toJSON === "function") return doc.toJSON();
  return { ...doc };
};

const getEntityId = (doc) => {
  if (!doc) return "";
  if (doc._id) return String(doc._id);
  if (doc.id) return String(doc.id);
  return "";
};

const fieldLabel = (field) =>
  FIELD_LABELS[field] ||
  String(field || "")
    .replace(/[_.]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const emptyValue = (value) =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && !value.length);

const normalizeForCompare = (value) => {
  if (emptyValue(value)) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if (value._id) return String(value._id);
    if (typeof value.toISOString === "function") {
      try {
        return value.toISOString();
      } catch (e) {
        return String(value);
      }
    }
    try {
      return JSON.stringify(value);
    } catch (e) {
      return String(value);
    }
  }
  return String(value);
};

const flatten = (obj, prefix = "") => {
  const out = {};
  if (obj == null || typeof obj !== "object" || obj instanceof Date) {
    if (prefix) out[prefix] = obj;
    return out;
  }
  if (Array.isArray(obj)) {
    out[prefix] = obj;
    return out;
  }
  Object.keys(obj).forEach((key) => {
    if (SKIP_KEYS.has(key)) return;
    const path = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      !value._bsontype
    ) {
      Object.assign(out, flatten(value, path));
      return;
    }
    out[path] = value;
  });
  return out;
};

const lookupName = async (Model, value) => {
  if (!Model || emptyValue(value)) return null;
  try {
    const doc = await Model.findOne(idOrObjectIdFilter(String(value))).lean();
    return nameText(doc) || doc?.label || null;
  } catch (e) {
    return null;
  }
};

const displayValue = async (field, value) => {
  if (emptyValue(value)) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toISOString();
  const Model = LOOKUP_MODELS[field] || LOOKUP_MODELS[field.split(".").pop()];
  if (Model) {
    const name = await lookupName(Model, value);
    if (name) return name;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (e) {
      return String(value);
    }
  }
  return String(value);
};

const personLabel = async (doc) => {
  if (!doc) return "";
  let last = doc.lastName || "";
  const surnameName = last ? await lookupName(Surname, last) : null;
  if (surnameName) last = surnameName;
  return [pairText(doc.firstName), pairText(doc.fatherName), last]
    .filter(Boolean)
    .join(" ")
    .trim();
};

const getEntityLabel = async (entityType, doc) => {
  if (!doc) return "";
  if (entityType === "user" || entityType === "yuva") {
    return personLabel(doc);
  }
  return nameText(doc) || doc.label || "";
};

const safeSnapshot = (doc) => {
  const plain = toPlain(doc);
  if (!plain) return {};
  const copy = { ...plain };
  delete copy.password;
  delete copy.confirmPassword;
  delete copy.fcmToken;
  delete copy.__v;
  if (copy._id) copy.id = String(copy._id);
  return copy;
};

const formatDateTime = (date) => {
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}/${parsed.getFullYear()} ${pad(
    parsed.getHours(),
  )}:${pad(parsed.getMinutes())}`;
};

const buildSummary = ({
  actorName,
  actorId,
  action,
  entityType,
  entityId,
  entityLabel,
  createdAt,
}) => {
  const actor = actorName ? `${actorName} (${actorId})` : actorId;
  const target = entityId || entityLabel || "record";
  const when = formatDateTime(createdAt);
  const typeLabel = entityType === "samaj" ? "samaj" : entityType;
  if (action === "approve") return `${actor} approved ${target} request.`;
  if (action === "reject") return `${actor} rejected ${target} request.`;
  if (action === "create") {
    if (entityType === "samaj") {
      return `${actor} added new ${entityLabel || target} samaj.`;
    }
    if (entityType === "user" || entityType === "yuva") {
      return `${actor} added new ${target}.`;
    }
    return `${actor} added new ${entityLabel || target} ${typeLabel}.`;
  }
  if (action === "delete") return `${actor} deleted ${target} at ${when}.`;
  return `${actor} updated ${target} at ${when}.`;
};

const buildChanges = async (previous, next) => {
  const prevPlain = toPlain(previous) || {};
  const nextPlain = toPlain(next) || {};
  const passwordChanged =
    Object.prototype.hasOwnProperty.call(nextPlain, "password") &&
    Boolean(nextPlain.password) &&
    nextPlain.password !== prevPlain.password;
  const prevFlat = flatten(prevPlain);
  const nextFlat = flatten(nextPlain);
  const keys = new Set([...Object.keys(prevFlat), ...Object.keys(nextFlat)]);
  const changes = [];
  for (const field of keys) {
    if (normalizeForCompare(prevFlat[field]) === normalizeForCompare(nextFlat[field])) {
      continue;
    }
    changes.push({
      field,
      label: fieldLabel(field),
      from: await displayValue(field, prevFlat[field]),
      to: await displayValue(field, nextFlat[field]),
    });
  }
  if (passwordChanged) {
    changes.push({
      field: "password",
      label: "Password",
      from: "••••",
      to: "changed",
    });
  }
  return changes;
};

const inferUserAction = (previous, payload = {}) => {
  const keys = Object.keys(payload).filter((key) => !SKIP_KEYS.has(key));
  const hasAllowed = Object.prototype.hasOwnProperty.call(payload, "allowed");
  const hasActive = Object.prototype.hasOwnProperty.call(payload, "active");
  const statusOnly =
    keys.length > 0 && keys.every((key) => key === "allowed" || key === "active");
  if (statusOnly && hasAllowed && hasActive) {
    if (Boolean(payload.allowed) && !Boolean(previous?.allowed)) return "approve";
    if (!Boolean(payload.allowed)) return "reject";
  }
  return "update";
};

const boolLabel = (value) => (Boolean(value) ? "Yes" : "No");

const statusChangesFrom = (previous = {}, next = {}) => {
  const changes = [];
  ["allowed", "active"].forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(next, field)) return;
    if (Boolean(previous[field]) === Boolean(next[field])) return;
    changes.push({
      field,
      label: fieldLabel(field),
      from: boolLabel(previous[field]),
      to: boolLabel(next[field]),
    });
  });
  return changes;
};

const getActor = async (req) => {
  const account = req?.user?.id ? await findAccountByTokenId(req.user.id) : null;
  const actorId = account?._id
    ? String(account._id)
    : String(req?.user?.id || "");
  const actorName = account ? await personLabel(account) : req?.user?.email || "";
  return {
    actorId,
    actorName,
    actorRole: req?.user?.role || account?.role || "",
    account,
  };
};

const omitYuvaEmail = (entityType, doc) => {
  if (entityType !== "yuva" || !doc) return doc;
  const plain = toPlain(doc) || { ...doc };
  delete plain.email;
  return plain;
};

const writeLog = async ({
  req,
  action,
  entityType,
  previous = null,
  next = null,
  entity = null,
  extraChanges = [],
}) => {
  const actor = await getActor(req);
  if (!isStaffRole(req?.user?.role) && !isStaffRole(actor.account?.role)) {
    return null;
  }
  previous = omitYuvaEmail(entityType, previous);
  next = omitYuvaEmail(entityType, next);
  entity = omitYuvaEmail(entityType, entity);
  const source = next || entity || previous;
  if (!source && action !== "delete") return null;
  const createdAt = new Date();
  const entityDoc = source || previous;
  const changes =
    action === "update" || action === "approve" || action === "reject"
      ? await buildChanges(previous, next || entity)
      : [];
  const extras = [
    ...statusChangesFrom(previous, next || entity),
    ...(Array.isArray(extraChanges) ? extraChanges : []),
  ];
  extras.forEach((change) => {
    if (!changes.some((item) => item.field === change.field)) {
      changes.push(change);
    }
  });
  if (action === "update" && !changes.length) return null;
  const snapshot = safeSnapshot(action === "delete" ? previous || entity : entityDoc);
  const entityId = getEntityId(entityDoc || previous);
  const entityLabel = await getEntityLabel(entityType, entityDoc || previous);
  const { account, ...actorFields } = actor;
  const doc = await ActivityLog.create({
    ...actorFields,
    action,
    entityType,
    entityId,
    entityLabel,
    summary: buildSummary({
      ...actorFields,
      action,
      entityType,
      entityId,
      entityLabel,
      createdAt,
    }),
    changes,
    snapshot,
    createdAt,
  });
  return doc;
};

const recordActivity = async (opts) => {
  try {
    return await writeLog(opts);
  } catch (error) {
    console.error("activity-log-failed", error.message);
    return null;
  }
};

const recordActivityMany = async (req, action, entityType, entities = []) => {
  const list = Array.isArray(entities) ? entities.filter(Boolean) : [];
  for (const entity of list) {
    await recordActivity({
      req,
      action,
      entityType,
      entity,
      previous: action === "delete" ? entity : null,
      next: action === "create" ? entity : null,
    });
  }
};

module.exports = {
  isStaffRole,
  inferUserAction,
  recordActivity,
  recordActivityMany,
  safeSnapshot,
};
