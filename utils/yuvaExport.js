const sharp = require("sharp");
const ExcelJS = require("exceljs");
const Surname = require("../models/surname");
const Gotra = require("../models/gotra");
const Native = require("../models/native");
const City = require("../models/city");
const Samaj = require("../models/samaj");
const Country = require("../models/country");
const State = require("../models/state");
const Region = require("../models/region");
const District = require("../models/district");
const Yuvalist = require("../models/yuvalist");
const { pairText, asName } = require("./masterName");
const { renderYuvaPdf } = require("./yuvaExportPdf");

const EXPORT_LIMIT = 4000;

const CSV_COLUMNS = {
  en: [
    ["serial", "No."],
    ["photoUrl", "Profile Image"],
    ["familyId", "Family Id"],
    ["fullName", "Name"],
    ["motherName", "Mother Name"],
    ["gender", "Gender"],
    ["dobDate", "Date of Birth"],
    ["dobTime", "Time of Birth"],
    ["pob", "Place of Birth"],
    ["education", "Education"],
    ["fieldOfStudy", "Field of Study"],
    ["activity", "Activity"],
    ["height", "Height"],
    ["weight", "Weight"],
    ["bloodGroup", "Blood Group"],
    ["firm", "Firm"],
    ["city", "City"],
    ["native", "Native"],
    ["samaj", "Samaj"],
    ["mamaName", "Maternal Uncle"],
    ["mamaCity", "Maternal City"],
    ["mamaNative", "Maternal Native"],
    ["contactName", "Contact Name"],
    ["phone", "Contact Phone"],
    ["contactRelation", "Contact Relation"],
    ["maritalStatus", "Marital Status"],
    ["grandFatherName", "Grandfather"],
    ["firmAddress", "Firm Address"],
    ["country", "Country"],
    ["state", "State"],
    ["region", "Region"],
    ["district", "District"],
    ["yskNo", "YSK No"],
  ],
  gu: [
    ["serial", "ક્રમ"],
    ["photoUrl", "ફોટો"],
    ["familyId", "Family Id"],
    ["fullName", "નામ"],
    ["motherName", "માતા"],
    ["gender", "લિંગ"],
    ["dobDate", "જન્મ તારીખ"],
    ["dobTime", "જન્મ સમય"],
    ["pob", "જન્મ સ્થળ"],
    ["education", "અભ્યાસ"],
    ["fieldOfStudy", "વિષય"],
    ["activity", "પ્રવૃત્તિ"],
    ["height", "ઊંચાઈ"],
    ["weight", "વજન"],
    ["bloodGroup", "બ્લડ ગ્રુપ"],
    ["firm", "પેઢી"],
    ["city", "શહેર"],
    ["native", "વતન"],
    ["samaj", "સમાજ"],
    ["mamaName", "મોસાળ"],
    ["mamaCity", "મોસાળ શહેર"],
    ["mamaNative", "મોસાળ વતન"],
    ["contactName", "સંપર્ક નામ"],
    ["phone", "સંપર્ક"],
    ["contactRelation", "સંબંધ"],
    ["maritalStatus", "વૈવાહિક સ્થિતિ"],
    ["grandFatherName", "દાદા"],
    ["firmAddress", "પેઢીનું સરનામું"],
    ["country", "દેશ"],
    ["state", "રાજ્ય"],
    ["region", "પ્રદેશ"],
    ["district", "જિલ્લો"],
    ["yskNo", "YSK No"],
  ],
};

const formatDob = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return { date: "", time: "" };
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h12",
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value || "";
  const dayPeriod = pick("dayPeriod").toUpperCase();
  return {
    date: `${pick("day")}/${pick("month")}/${pick("year")}`,
    time: `${pick("hour")}:${pick("minute")}${dayPeriod ? ` ${dayPeriod}` : ""}`.trim(),
  };
};

const formatWeight = (value) => {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  if (/kg/i.test(text)) {
    return text;
  }
  return `${text} Kg.`;
};

const genderKind = (yuva) => {
  const en = pairText(yuva?.gender, "en").toLowerCase();
  const gu = pairText(yuva?.gender, "gu");
  if (en === "female" || en === "f" || gu === "સ્ત્રી") {
    return "female";
  }
  if (en === "male" || en === "m" || gu === "પુરુષ") {
    return "male";
  }
  return "other";
};

const uniqueIds = (docs, pick) => [
  ...new Set(
    docs
      .flatMap((doc) => {
        const value = pick(doc);
        return Array.isArray(value) ? value : [value];
      })
      .filter((value) => value != null && String(value).trim() !== "")
      .map((value) => String(value))
  ),
];

const masterMap = async (Model, ids) => {
  const map = new Map();
  if (!ids.length) {
    return map;
  }
  const objectIds = ids.filter((id) => /^[0-9a-fA-F]{24}$/.test(id));
  const docs = await Model.find({
    $or: [
      { id: { $in: ids } },
      ...(objectIds.length ? [{ _id: { $in: objectIds } }] : []),
    ],
  })
    .select("id name nameEn nameGu gotra")
    .lean();
  docs.forEach((doc) => {
    const named = asName(doc.name, doc.nameEn, doc.nameGu);
    const label = {
      en: named.en,
      gu: named.gu,
    };
    if (doc.gotra) {
      label.gotra = String(doc.gotra);
    }
    if (doc.id != null) {
      map.set(String(doc.id), label);
    }
    if (doc._id != null) {
      map.set(String(doc._id), label);
    }
  });
  return map;
};

const labelOf = (map, id, lang) => {
  if (id == null || id === "") {
    return "";
  }
  const found = map.get(String(id));
  if (!found) {
    return "";
  }
  return lang === "gu" ? found.gu || found.en : found.en || found.gu;
};

const toExportRow = (yuva, maps, lang) => {
  const text = (value) => pairText(value, lang);
  const dob = formatDob(yuva.dob);
  const education = String(yuva.education?.education || "").trim();
  const fieldOfStudy = String(yuva.education?.fieldOfStudy || "").trim();
  const firstName = text(yuva.firstName);
  const fatherName = text(yuva.fatherName);
  const grandFatherName = text(yuva.grandFatherName);
  const lastName = labelOf(maps.surname, yuva.lastName, lang);
  const mamaName = [text(yuva.mamaInfo?.name), labelOf(maps.surname, yuva.mamaInfo?.lastName, lang)]
    .filter(Boolean)
    .join(" ");
  return {
    kind: genderKind(yuva),
    photoUrl: String(yuva.profile?.url || "").trim(),
    samajId: String(yuva.localSamaj || ""),
    familyId: String(yuva.familyId || "").trim(),
    fullName: [firstName, fatherName, grandFatherName, lastName].filter(Boolean).join(" "),
    profileName: [firstName, fatherName, lastName].filter(Boolean).join(" "),
    grandFatherName,
    motherName: text(yuva.motherName),
    gender: text(yuva.gender),
    dobDate: dob.date,
    dobTime: dob.time,
    pob: text(yuva.pob),
    education,
    fieldOfStudy,
    studyLine: [education, fieldOfStudy].filter(Boolean).join(" "),
    activity: text(yuva.activity),
    height: String(yuva.height || "").trim(),
    weight: formatWeight(yuva.weight),
    bloodGroup: String(yuva.bloodGroup || "").trim(),
    firm: text(yuva.firm),
    firmAddress: text(yuva.firmAddress),
    city: labelOf(maps.city, yuva.city, lang),
    native: labelOf(maps.native, yuva.native, lang),
    country: labelOf(maps.country, yuva.country, lang),
    state: labelOf(maps.state, yuva.state, lang),
    region: labelOf(maps.region, yuva.region, lang),
    district: labelOf(maps.district, yuva.district, lang),
    samaj: labelOf(maps.samaj, yuva.localSamaj, lang),
    gotra: labelOf(maps.gotra, maps.surname.get(String(yuva.lastName || ""))?.gotra, lang),
    mamaName,
    mamaCity: text(yuva.mamaInfo?.city),
    mamaNative: labelOf(maps.native, yuva.mamaInfo?.native, lang),
    contactName: [
      text(yuva.contactInfo?.name),
      labelOf(maps.surname, yuva.contactInfo?.lastName, lang),
    ]
      .filter(Boolean)
      .join(" "),
    phone:
      yuva.contactInfo?.phone != null && yuva.contactInfo.phone !== ""
        ? String(yuva.contactInfo.phone)
        : "",
    contactRelation: String(yuva.contactInfo?.relation || "").trim(),
    maritalStatus: text(yuva.martialStatus),
    yskNo: String(yuva.YSKno || "").trim(),
    sortKey: firstName || pairText(yuva.firstName, "en"),
  };
};

const loadExportRows = async (filter, language) => {
  const docs = await Yuvalist.find(filter)
    .select("-gu -address -email")
    .limit(EXPORT_LIMIT)
    .lean();
  const surname = await masterMap(
    Surname,
    uniqueIds(docs, (doc) => [
      doc.lastName,
      doc.mamaInfo?.lastName,
      doc.contactInfo?.lastName,
    ])
  );
  const gotraIds = [
    ...new Set([...surname.values()].map((item) => item.gotra).filter(Boolean)),
  ];
  const [native, city, samaj, country, state, region, district, gotra] = await Promise.all([
    masterMap(
      Native,
      uniqueIds(docs, (doc) => [doc.native, doc.mamaInfo?.native])
    ),
    masterMap(City, uniqueIds(docs, (doc) => doc.city)),
    masterMap(Samaj, uniqueIds(docs, (doc) => doc.localSamaj)),
    masterMap(Country, uniqueIds(docs, (doc) => doc.country)),
    masterMap(State, uniqueIds(docs, (doc) => doc.state)),
    masterMap(Region, uniqueIds(docs, (doc) => doc.region)),
    masterMap(District, uniqueIds(docs, (doc) => doc.district)),
    masterMap(Gotra, gotraIds),
  ]);
  const maps = { surname, native, city, samaj, country, state, region, district, gotra };
  const rank = { female: 0, male: 1, other: 2 };
  const locale = language === "gu" ? "gu" : "en";
  const samajSort = (name) => name || "\uffff";
  return docs
    .map((doc) => toExportRow(doc, maps, language))
    .sort((a, b) => {
      const bySamaj = samajSort(a.samaj).localeCompare(samajSort(b.samaj), locale, {
        sensitivity: "base",
      });
      if (bySamaj) {
        return bySamaj;
      }
      const byGender = rank[a.kind] - rank[b.kind];
      if (byGender) {
        return byGender;
      }
      return a.sortKey.localeCompare(b.sortKey, locale, { sensitivity: "base" });
    });
};

const buildYuvaSheet = async (rows, language, loadPhoto) => {
  const columns = CSV_COLUMNS[language] || CSV_COLUMNS.en;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Yuva List");
  const photoKey = columns.findIndex(([key]) => key === "photoUrl");
  sheet.columns = columns.map(([key, label]) => ({
    header: label,
    key,
    width: key === "photoUrl" ? 14 : key === "fullName" || key === "firmAddress" ? 28 : 16,
  }));
  sheet.getRow(1).font = { name: "Nirmala UI", bold: true, size: 11 };
  sheet.getRow(1).height = 22;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  rows.forEach((row, index) => {
    const values = {};
    columns.forEach(([key]) => {
      values[key] = key === "serial" ? index + 1 : key === "photoUrl" ? "" : row[key] ?? "";
    });
    const excelRow = sheet.addRow(values);
    excelRow.height = 68;
    excelRow.font = { name: "Nirmala UI", size: 10 };
    excelRow.alignment = { vertical: "middle", wrapText: true };
  });
  const photos = [];
  for (let index = 0; index < rows.length; index += 6) {
    const batch = await Promise.all(
      rows.slice(index, index + 6).map((row) => loadPhoto(row.photoUrl, { thumb: true }))
    );
    photos.push(...batch);
  }
  photos.forEach((image, index) => {
    if (!image || photoKey < 0) {
      return;
    }
    const imageId = workbook.addImage({ buffer: image, extension: "jpeg" });
    sheet.addImage(imageId, {
      tl: { col: photoKey + 0.12, row: index + 1 + 0.08 },
      ext: { width: 52, height: 64 },
      editAs: "oneCell",
    });
  });
  return workbook.xlsx.writeBuffer();
};

const loadPhoto = async (url, options = {}) => {
  if (!url || !/^https?:\/\//i.test(url)) {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    const input = Buffer.from(await response.arrayBuffer());
    if (!input.length) {
      return null;
    }
    if (options.thumb) {
      return await sharp(input)
        .rotate()
        .resize({ width: 160, height: 200, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();
    }
    return await sharp(input).rotate().jpeg({ quality: 90 }).toBuffer();
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const stamp = () => new Date().toISOString().slice(0, 10);

const exportYuvaList = async ({ res, filter, format, language }) => {
  const rows = await loadExportRows(filter, language);
  const filename = `yuva-list-${stamp()}.${format === "csv" ? "xlsx" : format}`;
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  if (format === "csv") {
    const sheet = await buildYuvaSheet(rows, language, loadPhoto);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Length", sheet.length);
    res.status(200).end(Buffer.from(sheet));
    return;
  }
  const pdf = await renderYuvaPdf(rows, language, loadPhoto);
  const trailer = pdf.subarray(Math.max(0, pdf.length - 16)).toString("latin1");
  if (!pdf.length || !trailer.includes("%%EOF")) {
    throw new Error("Could not export data.");
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", pdf.length);
  res.status(200).end(pdf);
};

module.exports = { exportYuvaList };
