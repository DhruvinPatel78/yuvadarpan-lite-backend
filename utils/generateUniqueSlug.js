const slugify = require("slugify");
const { transliterate } = require("transliteration");
const { pairText, nameText } = require("./masterName");
const { findByAnyId } = require("./childCount");
const Surname = require("../models/surname");
const SlugHistory = require("../models/slugHistory");

const RESERVED_SLUGS = new Set([
  "admin",
  "login",
  "settings",
  "api",
  "register",
  "profile",
  "yuva",
]);

const MAX_BASE = 80;
const MAX_CREATE_RETRIES = 5;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const asPart = (value) => {
  if (value == null || value === "") return "";
  if (typeof value === "object" && !Array.isArray(value)) {
    return pairText(value, "en") || pairText(value, "gu") || "";
  }
  return String(value).trim();
};

const resolveSurnameText = async (lastNameId) => {
  if (!lastNameId) return "";
  const rows = await findByAnyId(Surname, String(lastNameId));
  const row = Array.isArray(rows) ? rows[0] : rows;
  return nameText(row, "en") || nameText(row, "gu") || "";
};

const normalizeSlug = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return { ok: false, slug: "", error: "Slug is required." };
  }
  const transliterated = transliterate(raw);
  let slug = slugify(transliterated, { lower: true, strict: true });
  if (slug.length > MAX_BASE) {
    slug = slug.slice(0, MAX_BASE).replace(/-+$/g, "");
  }
  if (!slug) {
    return { ok: false, slug: "", error: "Slug is invalid." };
  }
  if (!SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      slug,
      error: "Use lowercase letters, numbers, and hyphens only.",
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, slug, error: "This slug is reserved." };
  }
  return { ok: true, slug, error: null };
};

const buildBaseSlug = (parts = []) => {
  const joined = (Array.isArray(parts) ? parts : [])
    .map(asPart)
    .filter(Boolean)
    .map((part) => transliterate(part))
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");

  let base = slugify(joined, { lower: true, strict: true });
  if (base.length > MAX_BASE) {
    base = base.slice(0, MAX_BASE).replace(/-+$/g, "");
  }
  if (!base) {
    base = "member";
  }
  if (RESERVED_SLUGS.has(base)) {
    base = "u-" + base;
  }
  return base;
};

const isSlugConflictError = (error) => {
  if (!error || error.code !== 11000) return false;
  const key = error.keyPattern || error.keyValue || {};
  const msg = String(error.message || "");
  return Boolean(key.slug) || msg.includes(" slug") || msg.includes("slug_1");
};

const slugTaken = async (Model, slug, excludeId) => {
  const existing = await Model.findOne({ slug }).select("_id id").lean();
  if (existing) {
    const exclude = String(excludeId || "");
    const same =
      exclude &&
      (String(existing._id) === exclude || String(existing.id || "") === exclude);
    if (!same) {
      return true;
    }
  }
  const history = await SlugHistory.findOne({ slug, entityType: "YuvaList" }).lean();
  if (!history) {
    return false;
  }
  const exclude = String(excludeId || "");
  if (exclude && String(history.entityId) === exclude) {
    return false;
  }
  return true;
};

const generateUniqueSlug = async (Model, parts, options = {}) => {
  const excludeId = options.excludeId;
  const base = buildBaseSlug(parts);
  for (let n = 0; n < 1000; n += 1) {
    const candidate = n === 0 ? base : base + "-" + (n + 1);
    if (!(await slugTaken(Model, candidate, excludeId))) {
      return candidate;
    }
  }
  throw new Error("slug-generate-failed");
};

const namePartsForYuva = async (yuva = {}) => [
  yuva.firstName,
  yuva.fatherName,
  yuva.grandFatherName,
  await resolveSurnameText(yuva.lastName),
];

const resolveYuvaSlug = async (Model, options = {}) => {
  const clientSlug = options.clientSlug;
  const yuva = options.yuva;
  const excludeId = options.excludeId;
  const manual = Boolean(options.manual);
  const raw = String(clientSlug || "").trim();
  if (raw) {
    const normalized = normalizeSlug(raw);
    if (!normalized.ok) {
      const err = new Error(normalized.error);
      err.status = 400;
      throw err;
    }
    if (await slugTaken(Model, normalized.slug, excludeId)) {
      if (manual) {
        const err = new Error("This slug is already taken.");
        err.status = 400;
        throw err;
      }
      return generateUniqueSlug(Model, [normalized.slug.replace(/-\d+$/, "")], {
        excludeId,
      });
    }
    return normalized.slug;
  }
  return generateUniqueSlug(Model, await namePartsForYuva(yuva), { excludeId });
};

const createYuvaWithSlug = async (Model, buildDoc, options = {}) => {
  const clientSlug = options.clientSlug;
  const yuva = options.yuva;
  const manual = Boolean(options.manual);
  let lastError;
  for (let attempt = 0; attempt < MAX_CREATE_RETRIES; attempt += 1) {
    try {
      const slug = await resolveYuvaSlug(Model, {
        clientSlug: attempt === 0 ? clientSlug : "",
        yuva,
        manual: attempt === 0 && manual,
      });
      return await Model.create(await buildDoc(slug));
    } catch (error) {
      lastError = error;
      if (error.status === 400) throw error;
      if (!isSlugConflictError(error)) throw error;
    }
  }
  throw lastError || new Error("slug-generate-failed");
};

const recordSlugHistory = async (options = {}) => {
  const slug = String(options.oldSlug || "").trim();
  const entityId = options.entityId;
  if (!slug || !entityId) return;
  try {
    await SlugHistory.findOneAndUpdate(
      { slug },
      {
        $set: {
          slug,
          entityType: "YuvaList",
          entityId: String(entityId),
          createdAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );
  } catch (error) {
    if (!isSlugConflictError(error)) throw error;
  }
};

module.exports = {
  generateUniqueSlug,
  normalizeSlug,
  buildBaseSlug,
  namePartsForYuva,
  resolveSurnameText,
  resolveYuvaSlug,
  createYuvaWithSlug,
  recordSlugHistory,
  slugTaken,
  isSlugConflictError,
  RESERVED_SLUGS,
  MAX_CREATE_RETRIES,
  MAX_BASE,
  SLUG_PATTERN,
};
