const asName = (name, nameEn, nameGu) => {
  if (name && typeof name === "object" && !Array.isArray(name)) {
    return {
      en: String(name.en || nameEn || "").trim(),
      gu: String(name.gu || nameGu || "").trim(),
    };
  }
  return {
    en: String(nameEn || name || "").trim(),
    gu: String(nameGu || "").trim(),
  };
};

const pairText = (value, lang = "en") => {
  if (value == null || value === "") return "";
  if (typeof value === "object" && !Array.isArray(value)) {
    const named = asName(value, value?.en, value?.gu);
    if (String(lang).toLowerCase() === "gu" && named.gu) {
      return named.gu;
    }
    return named.en || named.gu || "";
  }
  return String(value).trim();
};

const nameText = (doc, lang = "en") => {
  if (doc == null) return "";
  if (typeof doc === "string" || typeof doc === "number") {
    return String(doc).trim();
  }
  return pairText(doc.name, lang) || pairText(doc, lang);
};

const prepareMasterName = (record = {}) => {
  const next = { ...record };
  next.name = asName(next.name, next.nameEn, next.nameGu);
  delete next.nameEn;
  delete next.nameGu;
  return next;
};

const masterNameFields = {
  en: { type: String, required: true },
  gu: { type: String, default: "" },
};

const withMasterName = (schema) => {
  schema.add({
    name: masterNameFields,
  });
  schema.pre("validate", function () {
    this.name = asName(this.name, this.nameEn, this.nameGu);
    this.nameEn = undefined;
    this.nameGu = undefined;
  });
  const current = schema.get("toJSON") || {};
  const prevTransform = current.transform;
  schema.set("toJSON", {
    virtuals: true,
    ...current,
    transform: (doc, ret, options) => {
      const uuid = doc?._doc?.id != null ? String(doc._doc.id) : "";
      const objectId = ret._id != null ? String(ret._id) : "";
      if (typeof prevTransform === "function") {
        prevTransform(doc, ret, options);
      } else if (ret._id != null) {
        ret.id = ret._id;
        delete ret._id;
      }
      if (uuid) {
        ret.id = uuid;
        ret.uuid = uuid;
      }
      if (objectId && objectId !== uuid) {
        ret.mongoId = objectId;
      }
      ret.name = asName(ret.name, ret.nameEn, ret.nameGu);
      delete ret.nameEn;
      delete ret.nameGu;
      delete ret._id;
      return ret;
    },
  });
};

const { containsAny } = require("./caseInsensitiveSearch");

const nameContains = (value) => containsAny(value, ["name"]);

module.exports = {
  asName,
  pairText,
  nameText,
  prepareMasterName,
  withMasterName,
  nameContains,
  masterNameFields,
};
