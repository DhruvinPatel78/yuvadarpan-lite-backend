const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ROLE_RANK,
  USER_LEVEL_FIELD_BY_ROLE,
  getRoleRank,
  getVisibleRolesForRole,
  buildUserVisibilityFilter,
} = require("../utils/userVisibility");

/**
 * Evaluate a MongoDB-style filter object against an in-memory user record.
 */
const matchesMongoFilter = (doc, filter) => {
  if (!filter || typeof filter !== "object") return true;
  const entries = Object.entries(filter);
  if (!entries.length) return true;

  return entries.every(([key, condition]) => {
    if (key === "$and") {
      return condition.every((sub) => matchesMongoFilter(doc, sub));
    }
    if (key === "$or") {
      return condition.some((sub) => matchesMongoFilter(doc, sub));
    }
    const value = doc[key];
    if (condition && typeof condition === "object" && !Array.isArray(condition)) {
      if (Object.prototype.hasOwnProperty.call(condition, "$in")) {
        return condition.$in.some((item) => String(item) === String(value));
      }
      if (Object.prototype.hasOwnProperty.call(condition, "$gte")) {
        return typeof value === "number" && value >= condition.$gte;
      }
      if (Object.prototype.hasOwnProperty.call(condition, "$eq")) {
        return String(value) === String(condition.$eq);
      }
      if (Object.prototype.hasOwnProperty.call(condition, "$exists")) {
        const exists = Object.prototype.hasOwnProperty.call(doc, key) && value !== undefined;
        return condition.$exists ? exists : !exists;
      }
    }
    return value === condition;
  });
};

const makeUser = (id, role, path = {}) => ({
  _id: id,
  id,
  role,
  roleRank: getRoleRank(role),
  country: path.country ?? null,
  state: path.state ?? null,
  region: path.region ?? null,
  vibhag: path.vibhag ?? null,
  district: path.district ?? null,
  city: path.city ?? null,
  localSamaj: path.localSamaj ?? null,
});

// Two countries: c1 -> s1 -> r1 -> v1 -> d1 -> ct1 -> sm1 (main subtree)
//                c1 -> s1 -> r1 -> v1 -> d1 -> ct1 -> sm2 (sibling samaj)
//                c1 -> s1 -> r1 -> v1 -> d1 -> ct2 -> sm3 (sibling city)
//                c1 -> s1 -> r1 -> v1 -> d2 -> ct3 -> sm4 (sibling district)
//                c1 -> s1 -> r1 -> v2 -> d3 -> ct4 -> sm5 (sibling vibhag)
//                c1 -> s1 -> r2 -> v3 -> d4 -> ct5 -> sm6 (sibling region)
//                c1 -> s2 -> r3 -> v4 -> d5 -> ct6 -> sm7 (sibling state)
//                c2 -> s3 -> r4 -> v5 -> d6 -> ct7 -> sm8 (sibling country)
const SUBTREE_PATH = {
  country: "c1",
  state: "s1",
  region: "r1",
  vibhag: "v1",
  district: "d1",
  city: "ct1",
  localSamaj: "sm1",
};

const DATASET = [
  makeUser("admin-1", "ADMIN", SUBTREE_PATH),
  makeUser("admin-no-loc", "ADMIN", {}),

  makeUser("cm-c1", "COUNTRY_MANAGER", { country: "c1", state: "s1", region: "r1", vibhag: "v1", district: "d1", city: "ct1", localSamaj: "sm1" }),
  makeUser("cm-c1-sib", "COUNTRY_MANAGER", { country: "c1", state: "s2" }),
  makeUser("cm-c2", "COUNTRY_MANAGER", { country: "c2", state: "s3" }),

  makeUser("sm-s1", "STATE_MANAGER", { country: "c1", state: "s1", region: "r1", vibhag: "v1", district: "d1", city: "ct1", localSamaj: "sm1" }),
  makeUser("sm-s1-sib", "STATE_MANAGER", { country: "c1", state: "s1", region: "r2" }),
  makeUser("sm-s2", "STATE_MANAGER", { country: "c1", state: "s2", region: "r3" }),

  makeUser("rm-r1", "REGION_MANAGER", { country: "c1", state: "s1", region: "r1", vibhag: "v1", district: "d1", city: "ct1", localSamaj: "sm1" }),
  makeUser("rm-r1-sib", "REGION_MANAGER", { country: "c1", state: "s1", region: "r1", vibhag: "v2" }),
  makeUser("rm-r2", "REGION_MANAGER", { country: "c1", state: "s1", region: "r2", vibhag: "v3" }),

  makeUser("vm-v1", "VIBHAG_MANAGER", { country: "c1", state: "s1", region: "r1", vibhag: "v1", district: "d1", city: "ct1", localSamaj: "sm1" }),
  makeUser("vm-v1-sib", "VIBHAG_MANAGER", { country: "c1", state: "s1", region: "r1", vibhag: "v1", district: "d2" }),
  makeUser("vm-v2", "VIBHAG_MANAGER", { country: "c1", state: "s1", region: "r1", vibhag: "v2", district: "d3" }),

  makeUser("dm-d1", "DISTRICT_MANAGER", { country: "c1", state: "s1", region: "r1", vibhag: "v1", district: "d1", city: "ct1", localSamaj: "sm1" }),
  makeUser("dm-d1-sib", "DISTRICT_MANAGER", { country: "c1", state: "s1", region: "r1", vibhag: "v1", district: "d1", city: "ct2" }),
  makeUser("dm-d2", "DISTRICT_MANAGER", { country: "c1", state: "s1", region: "r1", vibhag: "v1", district: "d2", city: "ct3" }),

  makeUser("ctm-ct1", "CITY_MANAGER", { country: "c1", state: "s1", region: "r1", vibhag: "v1", district: "d1", city: "ct1", localSamaj: "sm1" }),
  makeUser("ctm-ct1-sib", "CITY_MANAGER", { country: "c1", state: "s1", region: "r1", vibhag: "v1", district: "d1", city: "ct1", localSamaj: "sm2" }),
  makeUser("ctm-ct2", "CITY_MANAGER", { country: "c1", state: "s1", region: "r1", vibhag: "v1", district: "d1", city: "ct2", localSamaj: "sm3" }),

  makeUser("sjm-sm1", "SAMAJ_MANAGER", { country: "c1", state: "s1", region: "r1", vibhag: "v1", district: "d1", city: "ct1", localSamaj: "sm1" }),
  makeUser("sjm-sm1-sib", "SAMAJ_MANAGER", { country: "c1", state: "s1", region: "r1", vibhag: "v1", district: "d1", city: "ct1", localSamaj: "sm1" }),
  makeUser("sjm-sm2", "SAMAJ_MANAGER", { country: "c1", state: "s1", region: "r1", vibhag: "v1", district: "d1", city: "ct1", localSamaj: "sm2" }),

  makeUser("user-sm1", "USER", SUBTREE_PATH),
  makeUser("user-sm2", "USER", { country: "c1", state: "s1", region: "r1", vibhag: "v1", district: "d1", city: "ct1", localSamaj: "sm2" }),
  makeUser("user-s2", "USER", { country: "c1", state: "s2", region: "r3", vibhag: "v4", district: "d5", city: "ct6", localSamaj: "sm7" }),
  makeUser("user-c2", "USER", { country: "c2", state: "s3", region: "r4", vibhag: "v5", district: "d6", city: "ct7", localSamaj: "sm8" }),
  makeUser("user-no-loc", "USER", {}),
];

const visibleIdsFor = (viewer, dataset = DATASET) => {
  const filter = buildUserVisibilityFilter(viewer);
  return dataset.filter((u) => matchesMongoFilter(u, filter)).map((u) => u.id);
};

test("ADMIN sees every user including unassigned users", () => {
  const admin = DATASET.find((u) => u.id === "admin-1");
  const ids = visibleIdsFor(admin);
  assert.deepEqual(ids, DATASET.map((u) => u.id));
});

const MANAGER_CASES = [
  {
    viewerId: "cm-c1",
    role: "COUNTRY_MANAGER",
    sameLocSibling: "cm-c1-sib",
    diffLocSibling: "cm-c2",
    expectedDescendants: [
      "sm-s1", "sm-s1-sib", "sm-s2",
      "rm-r1", "rm-r1-sib", "rm-r2",
      "vm-v1", "vm-v1-sib", "vm-v2",
      "dm-d1", "dm-d1-sib", "dm-d2",
      "ctm-ct1", "ctm-ct1-sib", "ctm-ct2",
      "sjm-sm1", "sjm-sm1-sib", "sjm-sm2",
      "user-sm1", "user-sm2", "user-s2",
    ],
    outsideSubtree: ["cm-c2", "user-c2", "user-no-loc"],
  },
  {
    viewerId: "sm-s1",
    role: "STATE_MANAGER",
    sameLocSibling: "sm-s1-sib",
    diffLocSibling: "sm-s2",
    expectedDescendants: [
      "rm-r1", "rm-r1-sib", "rm-r2",
      "vm-v1", "vm-v1-sib", "vm-v2",
      "dm-d1", "dm-d1-sib", "dm-d2",
      "ctm-ct1", "ctm-ct1-sib", "ctm-ct2",
      "sjm-sm1", "sjm-sm1-sib", "sjm-sm2",
      "user-sm1", "user-sm2",
    ],
    outsideSubtree: ["sm-s2", "user-s2", "user-c2", "user-no-loc"],
  },
  {
    viewerId: "rm-r1",
    role: "REGION_MANAGER",
    sameLocSibling: "rm-r1-sib",
    diffLocSibling: "rm-r2",
    expectedDescendants: [
      "vm-v1", "vm-v1-sib", "vm-v2",
      "dm-d1", "dm-d1-sib", "dm-d2",
      "ctm-ct1", "ctm-ct1-sib", "ctm-ct2",
      "sjm-sm1", "sjm-sm1-sib", "sjm-sm2",
      "user-sm1", "user-sm2",
    ],
    outsideSubtree: ["rm-r2", "user-s2", "user-c2", "user-no-loc"],
  },
  {
    viewerId: "vm-v1",
    role: "VIBHAG_MANAGER",
    sameLocSibling: "vm-v1-sib",
    diffLocSibling: "vm-v2",
    expectedDescendants: [
      "dm-d1", "dm-d1-sib", "dm-d2",
      "ctm-ct1", "ctm-ct1-sib", "ctm-ct2",
      "sjm-sm1", "sjm-sm1-sib", "sjm-sm2",
      "user-sm1", "user-sm2",
    ],
    outsideSubtree: ["vm-v2", "user-s2", "user-c2", "user-no-loc"],
  },
  {
    viewerId: "dm-d1",
    role: "DISTRICT_MANAGER",
    sameLocSibling: "dm-d1-sib",
    diffLocSibling: "dm-d2",
    expectedDescendants: [
      "ctm-ct1", "ctm-ct1-sib", "ctm-ct2",
      "sjm-sm1", "sjm-sm1-sib", "sjm-sm2",
      "user-sm1", "user-sm2",
    ],
    outsideSubtree: ["dm-d2", "user-s2", "user-c2", "user-no-loc"],
  },
  {
    viewerId: "ctm-ct1",
    role: "CITY_MANAGER",
    sameLocSibling: "ctm-ct1-sib",
    diffLocSibling: "ctm-ct2",
    expectedDescendants: [
      "sjm-sm1", "sjm-sm1-sib", "sjm-sm2",
      "user-sm1", "user-sm2",
    ],
    outsideSubtree: ["ctm-ct2", "user-s2", "user-c2", "user-no-loc"],
  },
  {
    viewerId: "sjm-sm1",
    role: "SAMAJ_MANAGER",
    sameLocSibling: "sjm-sm1-sib",
    diffLocSibling: "sjm-sm2",
    expectedDescendants: ["user-sm1"],
    outsideSubtree: ["sjm-sm2", "user-sm2", "user-s2", "user-c2", "user-no-loc"],
  },
];

for (const tc of MANAGER_CASES) {
  test(`${tc.role}: hides higher roles, shows same-node sibling, hides different-node sibling, shows descendants, hides outside subtree`, () => {
    const viewer = DATASET.find((u) => u.id === tc.viewerId);
    const viewerRank = getRoleRank(tc.role);
    const visible = visibleIdsFor(viewer);

    // Self is always visible
    assert.ok(visible.includes(viewer.id), `${tc.role} must see self`);

    // All higher roles are hidden (even in same subtree)
    const higherRoleUsers = DATASET.filter(
      (u) => getRoleRank(u.role) < viewerRank,
    );
    for (const higher of higherRoleUsers) {
      assert.ok(
        !visible.includes(higher.id),
        `${tc.role} must NOT see higher role ${higher.role} (${higher.id})`,
      );
    }

    // Same-role sibling in same location node is visible
    assert.ok(
      visible.includes(tc.sameLocSibling),
      `${tc.role} must see same-location sibling ${tc.sameLocSibling}`,
    );

    // Same-role sibling in different location node (even under same parent) is hidden
    assert.ok(
      !visible.includes(tc.diffLocSibling),
      `${tc.role} must NOT see different-location sibling ${tc.diffLocSibling}`,
    );

    // Descendants inside subtree are visible
    for (const descendantId of tc.expectedDescendants) {
      assert.ok(
        visible.includes(descendantId),
        `${tc.role} must see descendant ${descendantId}`,
      );
    }

    // Users outside subtree and unassigned users are hidden
    for (const outsideId of tc.outsideSubtree) {
      assert.ok(
        !visible.includes(outsideId),
        `${tc.role} must NOT see outside/unassigned user ${outsideId}`,
      );
    }
  });
}

test("manager with missing or null location sees only themselves", () => {
  for (const [role, levelField] of Object.entries(USER_LEVEL_FIELD_BY_ROLE)) {
    const unassignedManager = makeUser(`unassigned-${role}`, role, {
      country: "c1",
      state: "s1",
      region: "r1",
      vibhag: "v1",
      district: "d1",
      city: "ct1",
      localSamaj: "sm1",
      [levelField]: null,
    });
    const datasetWithSelf = [...DATASET, unassignedManager];
    const visible = visibleIdsFor(unassignedManager, datasetWithSelf);
    assert.deepEqual(
      visible,
      [unassignedManager.id],
      `${role} with null ${levelField} must only see themselves`,
    );
  }
});

test("query filters cannot widen manager visibility", () => {
  const stateManager = DATASET.find((u) => u.id === "sm-s1");
  const baseFilter = buildUserVisibilityFilter(stateManager);

  const widenStateFilter = { $and: [baseFilter, { state: "s2" }] };
  assert.deepEqual(
    DATASET.filter((u) => matchesMongoFilter(u, widenStateFilter)),
    [],
  );

  const widenAdminFilter = { $and: [baseFilter, { role: { $in: ["ADMIN"] } }] };
  assert.deepEqual(
    DATASET.filter((u) => matchesMongoFilter(u, widenAdminFilter)),
    [],
  );
});

test("legacy records without roleRank still respect role hierarchy", () => {
  const stateManager = DATASET.find((u) => u.id === "sm-s1");
  const filter = buildUserVisibilityFilter(stateManager);
  const legacyAdmin = { ...makeUser("legacy-admin", "ADMIN", SUBTREE_PATH), roleRank: undefined };
  const legacyDistrict = { ...makeUser("legacy-dm", "DISTRICT_MANAGER", SUBTREE_PATH), roleRank: undefined };

  assert.equal(matchesMongoFilter(legacyAdmin, filter), false);
  assert.equal(matchesMongoFilter(legacyDistrict, filter), true);
});

test("getVisibleRolesForRole returns only roles with rank >= viewer rank", () => {
  assert.equal(getVisibleRolesForRole("ADMIN").length, Object.keys(ROLE_RANK).length);
  assert.deepEqual(getVisibleRolesForRole("CITY_MANAGER"), [
    "CITY_MANAGER",
    "SAMAJ_MANAGER",
    "USER",
  ]);
  assert.deepEqual(getVisibleRolesForRole("SAMAJ_MANAGER"), [
    "SAMAJ_MANAGER",
    "USER",
  ]);
});
