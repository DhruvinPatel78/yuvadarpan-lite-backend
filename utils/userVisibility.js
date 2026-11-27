const ROLE_RANK = Object.freeze({
  ADMIN: 0,
  COUNTRY_MANAGER: 1,
  STATE_MANAGER: 2,
  REGION_MANAGER: 3,
  VIBHAG_MANAGER: 4,
  DISTRICT_MANAGER: 5,
  CITY_MANAGER: 6,
  SAMAJ_MANAGER: 7,
  USER: 8,
});

const ORDERED_ROLES = Object.freeze(
  Object.entries(ROLE_RANK)
    .sort(([, a], [, b]) => a - b)
    .map(([role]) => role),
);

const USER_LEVEL_FIELD_BY_ROLE = Object.freeze({
  COUNTRY_MANAGER: "country",
  STATE_MANAGER: "state",
  REGION_MANAGER: "region",
  VIBHAG_MANAGER: "vibhag",
  DISTRICT_MANAGER: "district",
  CITY_MANAGER: "city",
  SAMAJ_MANAGER: "localSamaj",
});

const ALIAS_FIELD_BY_LEVEL = Object.freeze({
  country: "country_id",
  state: "state_id",
  region: "region_id",
  vibhag: "vibhag_id",
  district: "district_id",
  city: "city_id",
  localSamaj: "samaj_id",
});

const DENY_ALL_FILTER = Object.freeze({ _id: { $in: [] } });

/** Normalize role names so case/whitespace differences map cleanly. */
const normalizeRole = (role) => {
  const raw =
    typeof role === "object" && role
      ? role.name || role.value || role.role || ""
      : role;
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
};

const getRoleRank = (role) => {
  const normalized = normalizeRole(role);
  if (Object.prototype.hasOwnProperty.call(ROLE_RANK, normalized)) {
    return ROLE_RANK[normalized];
  }
  return ROLE_RANK.USER;
};

const getVisibleRolesForRole = (role) => {
  const viewerRank = getRoleRank(role);
  return ORDERED_ROLES.filter((candidate) => ROLE_RANK[candidate] >= viewerRank);
};

const asIdString = (value) => {
  if (value == null) return "";
  if (typeof value === "object") {
    const nested = value._id ?? value.id ?? value.value;
    return nested == null ? "" : String(nested).trim();
  }
  return String(value).trim();
};

const buildSelfClauses = (currentUser) => {
  const clauses = [];
  if (currentUser?._id != null && String(currentUser._id).trim() !== "") {
    clauses.push({ _id: currentUser._id });
  }
  const customId = asIdString(currentUser?.id);
  if (customId && customId !== String(currentUser?._id || "").trim()) {
    clauses.push({ id: customId });
  }
  return clauses;
};

const buildSelfFilter = (currentUser) => {
  const clauses = buildSelfClauses(currentUser);
  if (!clauses.length) {
    return { ...DENY_ALL_FILTER };
  }
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
};

const isSameUserRecord = (viewer, targetUser) => {
  const viewerIds = [viewer?._id, viewer?.id]
    .filter((val) => val != null && String(val).trim() !== "")
    .map((val) => String(val).trim());
  const targetIds = [targetUser?._id, targetUser?.id]
    .filter((val) => val != null && String(val).trim() !== "")
    .map((val) => String(val).trim());
  return viewerIds.some((id) => targetIds.includes(id));
};

/**
 * Whether `viewer` can edit/delete `targetUser` (once `targetUser` is in visibility scope).
 * ADMIN can manage anyone (including other ADMINs). Managers can only manage strictly
 * lower-ranked users (never same-role siblings or higher roles), unless `allowSelf` is true
 * for self-profile updates.
 */
const canManageTargetUser = (viewer, targetUser, { allowSelf = false } = {}) => {
  if (!viewer || !targetUser) return false;
  const viewerRank = getRoleRank(viewer.role);
  if (viewerRank === ROLE_RANK.ADMIN) {
    return true;
  }
  if (allowSelf && isSameUserRecord(viewer, targetUser)) {
    return true;
  }
  const targetRank =
    typeof targetUser.roleRank === "number"
      ? targetUser.roleRank
      : getRoleRank(targetUser.role);
  return targetRank > viewerRank;
};

const resolveViewerLocationKeys = (currentUser, levelField, options = {}) => {
  if (Array.isArray(options?.locationKeys)) {
    return [
      ...new Set(options.locationKeys.map(asIdString).filter(Boolean)),
    ];
  }
  const aliasField = ALIAS_FIELD_BY_LEVEL[levelField];
  const raw =
    asIdString(currentUser?.[levelField]) ||
    (aliasField ? asIdString(currentUser?.[aliasField]) : "");
  return raw ? [raw] : [];
};

/**
 * Single source of truth for user table / detail / mutation visibility.
 * Admin sees all users; managers see same-or-lower role rank within their own
 * location subtree, plus always their own record (or only themselves if unassigned).
 */
const buildUserVisibilityFilter = (currentUser, options = {}) => {
  if (!currentUser) {
    return { ...DENY_ALL_FILTER };
  }
  const role = normalizeRole(currentUser.role);
  if (!role) {
    return { ...DENY_ALL_FILTER };
  }
  const viewerRank = getRoleRank(role);
  if (viewerRank === ROLE_RANK.ADMIN) {
    return {};
  }

  const selfFilter = buildSelfFilter(currentUser);
  if (viewerRank >= ROLE_RANK.USER) {
    return selfFilter;
  }

  const levelField = USER_LEVEL_FIELD_BY_ROLE[role];
  const locationKeys = levelField
    ? resolveViewerLocationKeys(currentUser, levelField, options)
    : [];

  // Managers without an assigned location node can only see themselves.
  if (!locationKeys.length) {
    return selfFilter;
  }

  const visibleRoles = getVisibleRolesForRole(role);
  const roleCondition = {
    $and: [
      { role: { $in: visibleRoles } },
      {
        $or: [
          { roleRank: { $gte: viewerRank } },
          { roleRank: { $exists: false } },
          { roleRank: null },
        ],
      },
    ],
  };
  const locationCondition = { [levelField]: { $in: locationKeys } };
  const subtreeCondition = { $and: [locationCondition, roleCondition] };

  const selfClauses = buildSelfClauses(currentUser);
  if (!selfClauses.length) {
    return subtreeCondition;
  }
  return {
    $or: [...selfClauses, subtreeCondition],
  };
};

module.exports = {
  ROLE_RANK,
  ORDERED_ROLES,
  USER_LEVEL_FIELD_BY_ROLE,
  DENY_ALL_FILTER,
  normalizeRole,
  getRoleRank,
  getVisibleRolesForRole,
  buildSelfFilter,
  isSameUserRecord,
  canManageTargetUser,
  buildUserVisibilityFilter,
};
