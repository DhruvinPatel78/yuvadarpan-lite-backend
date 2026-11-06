const User = require("../models/user");
const Yuvalist = require("../models/yuvalist");
const { sendNotification } = require("./fcm");
const notification = require("../data/locale/notifications.json");
const {
  isAdmin,
  isLocationMasterReadOnly,
  samajValueKeys,
  usersInManagerCityQuery,
  usersInManagerDistrictQuery,
  usersInManagerRegionQuery,
  usersInManagerStateQuery,
  usersInManagerCountryQuery,
  getYuvaWriteScopeFilter,
} = require("./managerScope");

const STAFF_ROLES = [
  "ADMIN",
  "SAMAJ_MANAGER",
  "CITY_MANAGER",
  "DISTRICT_MANAGER",
  "REGION_MANAGER",
  "STATE_MANAGER",
  "COUNTRY_MANAGER",
];

const pick = (value, lang) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value[lang] || value.en || "";
};

const displayName = (person) => {
  const name = [person?.firstName, person?.middleName, person?.lastName]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
  return name || "Member";
};

const asIdSet = (values = []) =>
  new Set(
    values
      .flatMap((value) => [value, value && String(value)])
      .filter(Boolean)
      .map(String),
  );

const staffTokenQuery = (excludeIds = []) => {
  const excluded = asIdSet(excludeIds);
  const query = {
    role: { $in: STAFF_ROLES },
    active: { $ne: false },
    allowed: { $ne: false },
    fcmToken: { $exists: true, $nin: [null, ""] },
  };
  if (excluded.size) {
    query.$and = [
      { id: { $nin: [...excluded] } },
      { _id: { $nin: [...excluded] } },
    ];
  }
  return query;
};

const usersScopeForManager = async (manager) => {
  const role = String(manager?.role || "").toUpperCase();
  if (role === "SAMAJ_MANAGER") {
    const keys = await samajValueKeys(manager.localSamaj);
    if (!keys.length) return { _id: { $in: [] } };
    return { localSamaj: { $in: keys } };
  }
  if (role === "CITY_MANAGER") return usersInManagerCityQuery(manager);
  if (role === "DISTRICT_MANAGER") return usersInManagerDistrictQuery(manager);
  if (role === "REGION_MANAGER") return usersInManagerRegionQuery(manager);
  if (role === "STATE_MANAGER") return usersInManagerStateQuery(manager);
  if (role === "COUNTRY_MANAGER") return usersInManagerCountryQuery(manager);
  return { _id: { $in: [] } };
};

const subjectIdFilter = (subject) => {
  const clauses = [];
  if (subject?._id) clauses.push({ _id: subject._id });
  if (subject?.id) clauses.push({ id: String(subject.id) });
  if (!clauses.length) return null;
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
};

const managerSeesSubject = async (manager, subject, kind) => {
  const role = String(manager?.role || "").toUpperCase();
  if (isAdmin(role)) return true;
  if (!isLocationMasterReadOnly(role)) return false;

  const idFilter = subjectIdFilter(subject);
  if (!idFilter) return false;

  if (kind === "yuva") {
    const scope = await getYuvaWriteScopeFilter(role, manager._id || manager.id);
    return !!(await Yuvalist.exists({ $and: [idFilter, scope] }));
  }

  const scope = await usersScopeForManager(manager);
  return !!(await User.exists({ $and: [idFilter, scope] }));
};

const collectStaffTokens = async (subject, kind, excludeIds = []) => {
  const staff = await User.find(staffTokenQuery(excludeIds))
    .select("fcmToken role id _id localSamaj city district region state country")
    .lean();

  const tokens = [];
  for (const manager of staff) {
    try {
      if (await managerSeesSubject(manager, subject, kind)) {
        tokens.push(manager.fcmToken);
      }
    } catch (error) {
      console.error("notify-staff-scope-failed", manager?.id, error.message);
    }
  }
  return [...new Set(tokens.filter(Boolean))];
};

const pushCopy = (kind, lang, person) => {
  const entry = notification[kind];
  if (!entry) {
    return { title: "Yuvadarpan", body: "" };
  }
  const name = displayName(person);
  return {
    title: pick(entry.title, lang).replace("{{name}}", name),
    body: pick(entry.body, lang).replace("{{name}}", name),
  };
};

/**
 * Notify admins/managers (with FCM tokens) about a new signup request, user, or yuva.
 * Fire-and-forget safe — never throws to the caller.
 */
const notifyStaffEvent = async ({
  kind,
  subject,
  subjectKind = "user",
  excludeIds = [],
  data = {},
  language = "en",
}) => {
  try {
    if (!subject) return;
    const tokens = await collectStaffTokens(subject, subjectKind, excludeIds);
    if (!tokens.length) return;

    const copy = pushCopy(kind, language === "gu" ? "gu" : "en", subject);
    if (!copy.title) return;

    await Promise.allSettled(
      tokens.map((token) =>
        sendNotification(token, copy.title, copy.body, {
          type: kind,
          ...data,
        }),
      ),
    );
  } catch (error) {
    console.error("notify-staff-failed", kind, error.message);
  }
};

module.exports = {
  notifyStaffEvent,
  STAFF_ROLES,
};
