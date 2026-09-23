const { asName, pairText } = require("./masterName");

const TEXT_KEYS = [
  "firstName",
  "fatherName",
  "grandFatherName",
  "motherName",
  "pob",
  "firm",
  "firmAddress",
  "address",
  "handicapDetails",
  "gender",
  "martialStatus",
  "activity",
];

const MASTER_KEYS = [
  "lastName",
  "native",
  "country",
  "state",
  "region",
  "district",
  "city",
  "localSamaj",
];

const NESTED_TEXT = {
  mamaInfo: ["name", "city"],
  contactInfo: ["name"],
};

const toPlain = (doc) => {
  if (doc == null) {
    return doc;
  }
  if (typeof doc.toJSON === "function") {
    return doc.toJSON();
  }
  if (typeof doc.toObject === "function") {
    return doc.toObject();
  }
  return { ...doc };
};

const asOtherPair = (other, otherEn, otherGu) => {
  const asMap = (value) =>
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  if (other && typeof other === "object" && !Array.isArray(other)) {
    const enIsMap =
      other.en && typeof other.en === "object" && !Array.isArray(other.en);
    const guIsMap =
      other.gu && typeof other.gu === "object" && !Array.isArray(other.gu);
    if (enIsMap || guIsMap) {
      return { en: asMap(other.en), gu: asMap(other.gu) };
    }
    if (!("en" in other) && !("gu" in other)) {
      return { en: other, gu: asMap(otherGu) };
    }
  }
  return { en: asMap(otherEn || other), gu: asMap(otherGu) };
};

const stripLangFlats = (obj = {}) => {
  const next = { ...obj };
  [...TEXT_KEYS, ...MASTER_KEYS].forEach((key) => {
    delete next[`${key}En`];
    delete next[`${key}Gu`];
  });
  delete next.otherEn;
  delete next.otherGu;
  delete next.gu;
  Object.keys(NESTED_TEXT).forEach((parent) => {
    if (!next[parent] || typeof next[parent] !== "object") {
      return;
    }
    next[parent] = { ...next[parent] };
    ["nameEn", "nameGu", "cityEn", "cityGu", "lastNameEn", "lastNameGu", "nativeEn", "nativeGu"].forEach(
      (key) => {
        delete next[parent][key];
      }
    );
  });
  return next;
};

const applyLangPairs = (record = {}) => {
  const next = { ...record };
  TEXT_KEYS.forEach((key) => {
    next[key] = asName(next[key], next[`${key}En`], next[`${key}Gu`]);
  });
  Object.entries(NESTED_TEXT).forEach(([parent, keys]) => {
    if (!next[parent] || typeof next[parent] !== "object") {
      return;
    }
    next[parent] = { ...next[parent] };
    keys.forEach((key) => {
      next[parent][key] = asName(
        next[parent][key],
        next[parent][`${key}En`],
        next[parent][`${key}Gu`]
      );
    });
  });
  next.other = asOtherPair(next.other, next.otherEn, next.otherGu);
  return stripLangFlats(next);
};

const omitGu = (value) => {
  if (value == null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value), (key, nested) => {
    if (
      key !== "gu" ||
      !nested ||
      typeof nested !== "object" ||
      Array.isArray(nested)
    ) {
      return nested;
    }
    const isLegacyYuvaGu =
      "firstName" in nested ||
      "fatherName" in nested ||
      "motherName" in nested ||
      "mamaInfo" in nested ||
      "contactInfo" in nested;
    return isLegacyYuvaGu ? undefined : nested;
  });
};

const withEnGu = (doc) => {
  const json = toPlain(doc);
  if (!json || typeof json !== "object") {
    return json;
  }
  return omitGu(applyLangPairs(json));
};

const prepareYuvaRecord = (record = {}) => {
  const next = applyLangPairs(record);
  if (next.contactInfo) {
    next.contactInfo = { ...next.contactInfo };
    const digits = String(next.contactInfo.phone ?? "").replace(/\D/g, "");
    if (digits) {
      next.contactInfo.phone = Number(digits);
    } else {
      delete next.contactInfo.phone;
    }
  }
  if (next.familyId != null && next.familyId !== "") {
    next.familyId = String(next.familyId);
  }
  return next;
};

module.exports = { prepareYuvaRecord, withEnGu, omitGu, pairText, TEXT_KEYS };
