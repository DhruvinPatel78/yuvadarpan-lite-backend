const User = require("../models/user");
const Yuvalist = require("../models/yuvalist");
const Surname = require("../models/surname");
const {
  findUserIdsWithPermission,
  getPermissionByUserId,
} = require("../models/permission");
const { sendNotification } = require("./fcm");
const { sendAccountEmail } = require("./accountMail");
const notification = require("../data/locale/notifications.json");
const { idOrObjectIdFilter } = require("./childCount");
const { nameText } = require("./masterName");
const {
  isAdmin,
  isLocationMasterReadOnly,
  samajValueKeys,
  recordsInManagerCityQuery,
  recordsInManagerDistrictQuery,
  recordsInManagerVibhagQuery,
  recordsInManagerRegionQuery,
  recordsInManagerStateQuery,
  recordsInManagerCountryQuery,
  getYuvaWriteScopeFilter,
} = require("./managerScope");

const hasPermission = (permission, key) =>
  Boolean(permission && permission[key] === true);

const STAFF_ROLES = [
  "ADMIN",
  "SAMAJ_MANAGER",
  "CITY_MANAGER",
  "DISTRICT_MANAGER",
  "VIBHAG_MANAGER",
  "REGION_MANAGER",
  "STATE_MANAGER",
  "COUNTRY_MANAGER",
];

const pick = (value, lang) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value[lang] || value.en || "";
};

const resolveLastName = async (lastName, lang = "gu") => {
  const raw = String(lastName || "").trim();
  if (!raw) return "";
  try {
    const surname = await Surname.findOne(idOrObjectIdFilter(raw)).lean();
    return nameText(surname, lang) || "";
  } catch (error) {
    return "";
  }
};

const displayName = async (person, lang = "gu") => {
  const last = await resolveLastName(person?.lastName, lang);
  const name = [person?.firstName, person?.middleName, last]
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

/** Match managers to a new request by their location hierarchy (same samaj/city/…/country). */
const usersScopeForManager = async (manager) => {
  const role = String(manager?.role || "").toUpperCase();
  if (role === "SAMAJ_MANAGER") {
    const keys = await samajValueKeys(manager.localSamaj);
    if (!keys.length) return { _id: { $in: [] } };
    return { localSamaj: { $in: keys } };
  }
  if (role === "CITY_MANAGER") return recordsInManagerCityQuery(manager);
  if (role === "DISTRICT_MANAGER") return recordsInManagerDistrictQuery(manager);
  if (role === "VIBHAG_MANAGER") return recordsInManagerVibhagQuery(manager);
  if (role === "REGION_MANAGER") return recordsInManagerRegionQuery(manager);
  if (role === "STATE_MANAGER") return recordsInManagerStateQuery(manager);
  if (role === "COUNTRY_MANAGER") return recordsInManagerCountryQuery(manager);
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

const collectManagersForNewUserEmail = async (subject, excludeIds = []) => {
  const permittedIds = await findUserIdsWithPermission("newUserRequest");
  if (!permittedIds.length) return [];

  const excluded = asIdSet(excludeIds);
  const query = {
    role: { $in: STAFF_ROLES.filter((role) => role !== "ADMIN") },
    active: { $ne: false },
    allowed: { $ne: false },
    email: { $exists: true, $nin: [null, ""] },
    _id: { $in: permittedIds },
  };
  if (excluded.size) {
    query.$and = [
      { id: { $nin: [...excluded] } },
      { _id: { $nin: [...excluded] } },
    ];
  }

  const managers = await User.find(query)
    .select(
      "email role id _id firstName localSamaj city district region state country language",
    )
    .lean();

  const recipients = [];
  for (const manager of managers) {
    try {
      const permission = await getPermissionByUserId(manager?._id);
      if (
        isLocationMasterReadOnly(manager?.role) &&
        hasPermission(permission, "newUserRequest") &&
        (await managerSeesSubject(manager, subject, "user"))
      ) {
        recipients.push(manager);
      }
    } catch (error) {
      console.error("notify-staff-email-scope-failed", manager?.id, error.message);
    }
  }
  return recipients;
};

const emailManagersNewSignupRequest = async (subject, excludeIds = []) => {
  if (!subject) return;
  const managers = await collectManagersForNewUserEmail(subject, excludeIds);
  if (!managers.length) return;

  const requesterName = await displayName(subject, "gu");
  await Promise.allSettled(
    managers.map((manager) =>
      sendAccountEmail(
        { ...manager, language: "gu" },
        "NewSignupRequest",
        { language: "gu", displayName: requesterName },
      ).catch((error) => {
        console.error(
          "manager-new-user-email-failed",
          manager?.email,
          error?.message || error,
        );
      }),
    ),
  );
};

const pushCopy = async (kind, lang, person) => {
  const entry = notification[kind];
  if (!entry) {
    return { title: "Yuvadarpan", body: "" };
  }
  const name = await displayName(person, lang);
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

    if (kind === "NewSignupRequest" && subjectKind === "user") {
      emailManagersNewSignupRequest(subject, excludeIds).catch((error) => {
        console.error("notify-staff-email-failed", kind, error.message);
      });
    }

    const tokens = await collectStaffTokens(subject, subjectKind, excludeIds);
    if (!tokens.length) return;

    const copy = await pushCopy(
      kind,
      language === "gu" ? "gu" : "en",
      subject,
    );
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
  hasPermission,
};
