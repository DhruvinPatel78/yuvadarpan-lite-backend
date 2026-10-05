const fs = require("fs");
const path = require("path");
const fontkit = require("fontkit");
const PDFDocument = require("pdfkit");

const skipMarkPosition = {
  mark: false,
  mkmk: false,
  abvm: false,
  blwm: false,
  dist: false,
};

const plainRun = (font, string) => {
  const glyphs = font.glyphsForString(String(string || ""));
  const positions = glyphs.map((glyph) => ({
    xAdvance: glyph.advanceWidth || 0,
    yAdvance: 0,
    xOffset: 0,
    yOffset: 0,
    advanceWidth: glyph.advanceWidth || 0,
  }));
  return {
    glyphs,
    positions,
    advanceWidth: positions.reduce((sum, item) => sum + item.xAdvance, 0),
  };
};

const patchGujaratiLayout = () => {
  const sample = fontkit.openSync(path.join(__dirname, "../assets/fonts/NotoSansGujarati-Regular.ttf"));
  const proto = Object.getPrototypeOf(sample);
  if (proto.__yuvaLayoutPatched || typeof proto.layout !== "function") {
    return;
  }
  const original = proto.layout;
  proto.layout = function (string, features, script, language, direction) {
    try {
      return original.call(this, string, features, script, language, direction);
    } catch (error) {
      try {
        const safe = {
          ...(features && typeof features === "object" && !Array.isArray(features) ? features : {}),
          ...skipMarkPosition,
        };
        return original.call(this, string, safe, script, language, direction);
      } catch (again) {
        return plainRun(this, string);
      }
    }
  };
  proto.__yuvaLayoutPatched = true;
};

patchGujaratiLayout();

const FONT_DIR = path.join(__dirname, "../assets/fonts");
const FONT_REGULAR = path.join(FONT_DIR, "NotoSansGujarati-Regular.ttf");
const FONT_BOLD = path.join(FONT_DIR, "NotoSansGujarati-Bold.ttf");
const FONT_SEMI = path.join(FONT_DIR, "NotoSansGujarati-SemiBold.ttf");
const FONT_LATIN = path.join(FONT_DIR, "Roboto-Regular.ttf");
const FONT_LATIN_BOLD = path.join(FONT_DIR, "Roboto-Bold.ttf");
const FONT_LATIN_SEMI = path.join(FONT_DIR, "Roboto-Medium.ttf");
const FONT_FILES = [
  FONT_REGULAR,
  FONT_BOLD,
  FONT_SEMI,
  FONT_LATIN,
  FONT_LATIN_BOLD,
  FONT_LATIN_SEMI,
];

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const PER_PAGE = 7;

const C = {
  page: "#FFF8F1",
  maroon: "#8E2340",
  orange: "#E36A1E",
  name: "#D2652A",
  gold: "#F3A24A",
  goldDeep: "#C56A22",
  border: "#E39B4E",
  line: "#F0C48A",
  ink: "#4A342C",
  label: "#C4452D",
  cream: "#FFF8F2",
  photo: "#F6E7D8",
  family: "#FFF3E4",
  headerInk: "#6E3018",
};

const COPY = {
  en: {
    book: "YUVA DARPAN",
    female: "YUVATI",
    male: "YUVAK",
    other: "YUVA",
    mother: "Mother",
    firm: "Firm",
    firmAddress: "Firm address",
    gotra: "Gotra",
    contact: "Contact",
    ysk: "YSK",
    mama: "Maternal family",
    current: "Current place / Native",
    family: "FAMILY ID",
    empty: "No profiles match this export.",
    cols: {
      no: "No.",
      photo: "Photo",
      name: "Name",
      birth: "Birth place",
      when: "Date / time",
      study: "Education",
      weight: "Weight",
      height: "Height",
      blood: "Blood",
    },
  },
  gu: {
    book: "યુવા દર્પણ",
    female: "યુવતી",
    male: "યુવક",
    other: "યુવા",
    mother: "માતા",
    firm: "પેઢી",
    firmAddress: "પેઢી સરનામું",
    gotra: "ગોત્ર",
    contact: "સંપર્ક",
    ysk: "YSK",
    mama: "મોસાળ પક્ષ",
    current: "હાલનું ગામ/વતન",
    family: "FAMILY ID",
    empty: "આ નિકાસ માટે કોઈ પ્રોફાઇલ મળી નથી.",
    cols: {
      no: "ક્રમ",
      photo: "ફોટો",
      name: "નામ",
      birth: "જન્મ સ્થળ",
      when: "તા. / સમય",
      study: "અભ્યાસ પ્રવૃત્તિ",
      weight: "વજન",
      height: "ઊંચાઈ",
      blood: "બ્લડ ગ્રુપ",
    },
  },
};

const assertFonts = () => {
  FONT_FILES.forEach((file) => {
    if (!fs.existsSync(file)) {
      throw new Error("Export font is missing.");
    }
  });
};

const fontName = (weight, script) => {
  const latin = script === "en";
  if (weight === "bold") return latin ? "latin-bold" : "bold";
  if (weight === "semibold") return latin ? "latin-semibold" : "semibold";
  return latin ? "latin" : "regular";
};

const scriptRuns = (text) => {
  const runs = [];
  let buf = "";
  let script = null;
  const flush = () => {
    if (!buf) return;
    runs.push({ script: script || "gu", text: buf });
    buf = "";
  };
  for (const ch of String(text || "")) {
    const next = /[\u0A80-\u0AFF]/.test(ch) ? "gu" : /[A-Za-z]/.test(ch) ? "en" : null;
    if (next && script && next !== script) {
      flush();
      script = next;
      buf = ch;
    } else {
      if (next) script = next;
      buf += ch;
    }
  }
  flush();
  return runs;
};

const primaryScript = (text) => {
  const runs = scriptRuns(String(text || "").replace(/\n/g, ""));
  const scripts = new Set(runs.map((run) => run.script));
  if (scripts.size > 1) return "mixed";
  return [...scripts][0] || "gu";
};

const sectionTitle = (copy, kind) => {
  if (kind === "female") return copy.female;
  if (kind === "male") return copy.male;
  return copy.other;
};

const chunk = (list, size) => {
  const pages = [];
  for (let index = 0; index < list.length; index += size) {
    pages.push(list.slice(index, index + size));
  }
  return pages;
};

const drawSwirl = (doc, x, y, direction) => {
  const s = direction;
  doc.save();
  doc.lineWidth(1.35).strokeColor(C.orange);
  doc
    .moveTo(x, y)
    .bezierCurveTo(x + 18 * s, y - 11, x + 36 * s, y + 10, x + 54 * s, y - 1)
    .stroke();
  doc
    .moveTo(x + 6 * s, y + 7)
    .bezierCurveTo(x + 24 * s, y + 16, x + 42 * s, y - 4, x + 60 * s, y + 5)
    .stroke();
  doc
    .moveTo(x + 48 * s, y - 2)
    .bezierCurveTo(x + 56 * s, y - 10, x + 64 * s, y - 4, x + 56 * s, y + 3)
    .stroke();
  doc.restore();
};

const drawHeader = (doc, { copy, title, samaj, pageNo, year }) => {
  doc.save();
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(C.page);

  const bookText = `${copy.book} - ${year}`;
  doc.fillColor(C.maroon).font(fontName("bold", primaryScript(bookText))).fontSize(11);
  doc.text(bookText, 16, 20, { lineBreak: false });

  if (title) {
    doc.font(fontName("bold", primaryScript(title))).fontSize(20);
    const titleWidth = doc.widthOfString(title);
    const titleX = (PAGE_W - titleWidth) / 2;
    drawSwirl(doc, titleX - 68, 30, 1);
    drawSwirl(doc, titleX + titleWidth + 68, 30, -1);
    doc.fillColor(C.orange).text(title, titleX, 16, { lineBreak: false });
    doc
      .moveTo(titleX - 8, 38)
      .lineTo(titleX + titleWidth + 8, 38)
      .lineWidth(0.8)
      .strokeColor(C.gold)
      .stroke();
    if (samaj) {
      doc
        .font(fontName("semibold", primaryScript(samaj)))
        .fontSize(9)
        .fillColor(C.maroon)
        .text(samaj, 78, 42, { width: PAGE_W - 156, align: "center", lineBreak: false });
    }
  }

  const badgeX = PAGE_W - 50;
  const badgeY = 12;
  doc.roundedRect(badgeX, badgeY, 36, 28, 4).fill(C.maroon);
  doc.fillColor(C.cream).font(fontName("bold", "en")).fontSize(12);
  doc.text(String(pageNo).padStart(2, "0"), badgeX, badgeY + 7, {
    width: 36,
    align: "center",
    lineBreak: false,
  });
  doc.restore();
};

const columnLayout = (copy) => {
  const x = 12;
  const width = PAGE_W - 24;
  const fixed = [
    { key: "no", width: 22, header: copy.cols.no },
    { key: "photo", width: 58, header: copy.cols.photo },
    { key: "name", width: 176, header: copy.cols.name },
    { key: "place", width: 62, header: copy.cols.birth },
    { key: "when", width: 62, header: copy.cols.when },
    { key: "study", width: 70, header: copy.cols.study },
    { key: "weight", width: 38, header: copy.cols.weight },
    { key: "height", width: 42, header: copy.cols.height },
  ];
  const used = fixed.reduce((sum, column) => sum + column.width, 0);
  const columns = [
    ...fixed,
    { key: "blood", width: width - used, header: copy.cols.blood },
  ];
  let cursor = x;
  return columns.map((column) => {
    const next = { ...column, x: cursor };
    cursor += column.width;
    return next;
  });
};

const drawCellText = (doc, text, x, y, w, h, options = {}) => {
  const value = String(text || "").trim();
  if (!value) {
    return;
  }
  const weight = options.font || "regular";
  const size = options.size || 6.5;
  const color = options.color || C.ink;
  const script = primaryScript(value);
  if (script !== "mixed") {
    doc.font(fontName(weight, script)).fontSize(size).fillColor(color);
    doc.text(value, x, y, {
      width: w,
      height: h,
      align: options.align || "left",
      ellipsis: true,
      lineGap: 0,
    });
    return;
  }
  let cursorY = y;
  const lineHeight = size + 1.8;
  value.split("\n").forEach((line) => {
    if (!line || cursorY > y + h - size) {
      return;
    }
    const runs = scriptRuns(line);
    const total = runs.reduce((sum, run) => {
      doc.font(fontName(weight, run.script)).fontSize(size);
      return sum + doc.widthOfString(run.text);
    }, 0);
    let cursorX = options.align === "center" ? x + Math.max(0, (w - total) / 2) : x;
    runs.forEach((run) => {
      doc.font(fontName(weight, run.script)).fontSize(size).fillColor(color);
      const runWidth = doc.widthOfString(run.text);
      if (cursorX < x + w) {
        doc.text(run.text, cursorX, cursorY, {
          lineBreak: false,
          width: Math.max(1, x + w - cursorX),
          ellipsis: true,
        });
      }
      cursorX += runWidth;
    });
    cursorY += lineHeight;
  });
};

const drawLabeledLine = (doc, label, value, x, y, w) => {
  const text = String(value || "").trim();
  if (!text) {
    return;
  }
  const prefix = `${label} : `;
  doc.font(fontName("bold", primaryScript(prefix))).fontSize(6.4).fillColor(C.label);
  const prefixWidth = Math.min(doc.widthOfString(prefix) + 1, w * 0.62);
  doc.text(prefix, x, y, { width: prefixWidth, lineBreak: false });
  drawCellText(doc, text, x + prefixWidth, y, Math.max(8, w - prefixWidth), 10, {
    size: 6.4,
    color: C.ink,
  });
};

const drawPhoto = (doc, image, x, y, w, h, initial) => {
  doc.save();
  doc.roundedRect(x, y, w, h, 2).clip();
  if (image) {
    try {
      doc.image(image, x, y, { fit: [w, h], align: "center", valign: "center" });
    } catch (error) {
      doc.rect(x, y, w, h).fill(C.photo);
    }
  } else {
    doc.rect(x, y, w, h).fill(C.photo);
    doc.fillColor(C.maroon).font(fontName("bold", primaryScript(initial || "•"))).fontSize(11);
    doc.text(initial || "•", x, y + h / 2 - 6, { width: w, align: "center", lineBreak: false });
  }
  doc.restore();
  doc.roundedRect(x, y, w, h, 2).lineWidth(0.7).strokeColor(C.border).stroke();
};

const dash = (value) => (String(value || "").trim() ? value : "—");

const currentLine = (row) => [row.city, row.native].filter(Boolean).join(" / ");

const drawProfileRow = (doc, row, image, columns, rowY, rowH, serial, copy) => {
  const byKey = Object.fromEntries(columns.map((column) => [column.key, column]));
  const statsH = Math.min(44, rowH * 0.42);
  const bandH = (rowH - statsH) / 3;
  const detailsX = byKey.place.x;
  const tableW = columns.reduce((sum, column) => sum + column.width, 0);
  const detailsW = columns[0].x + tableW - detailsX;
  const statKeys = new Set(["when", "study", "weight", "height", "blood"]);

  doc.save();
  doc.rect(detailsX, rowY + statsH + bandH * 2, detailsW, bandH).fill(C.family);
  doc.rect(columns[0].x, rowY, tableW, rowH).lineWidth(0.7).strokeColor(C.border).stroke();
  columns.forEach((column, index) => {
    if (index === 0) {
      return;
    }
    const lineH = statKeys.has(column.key) ? statsH : rowH;
    doc
      .moveTo(column.x, rowY)
      .lineTo(column.x, rowY + lineH)
      .strokeColor(C.line)
      .lineWidth(0.55)
      .stroke();
  });
  for (let band = 0; band < 3; band += 1) {
    const y = rowY + statsH + bandH * band;
    doc.moveTo(detailsX, y).lineTo(detailsX + detailsW, y).strokeColor(C.line).lineWidth(0.55).stroke();
  }
  doc.restore();

  drawCellText(doc, String(serial), byKey.no.x, rowY + rowH / 2 - 5, byKey.no.width, 12, {
    font: "bold",
    size: 8,
    color: C.maroon,
    align: "center",
  });

  const photoPad = 4;
  drawPhoto(
    doc,
    image,
    byKey.photo.x + photoPad,
    rowY + photoPad,
    byKey.photo.width - photoPad * 2,
    rowH - photoPad * 2,
    String(row.fullName || "").trim().charAt(0)
  );

  const nameX = byKey.name.x + 4;
  const nameW = byKey.name.width - 8;
  drawCellText(doc, row.profileName || row.fullName, nameX, rowY + 3, nameW, 16, {
    font: "semibold",
    size: 7.5,
    color: C.name,
  });
  const nameLines = [
    [copy.gotra, row.gotra],
    [copy.mother, row.motherName],
    [copy.firm, row.firm],
    [copy.firmAddress, row.firmAddress],
  ].filter(([, value]) => String(value || "").trim());
  nameLines.forEach(([label, value], index) => {
    const lineY = rowY + 20 + index * 9;
    if (lineY > rowY + rowH - 18) return;
    drawLabeledLine(doc, label, value, nameX, lineY, nameW);
  });
  const contactValue = [row.contactName, row.phone].filter(Boolean).join(" : ");
  drawLabeledLine(doc, copy.contact, contactValue, nameX, rowY + rowH - 12, nameW);

  const statY = rowY + 4;
  const statH = statsH - 6;
  drawCellText(doc, row.pob, byKey.place.x + 3, statY, byKey.place.width - 6, statH, { size: 6.3 });
  drawCellText(doc, [row.dobDate, row.dobTime].filter(Boolean).join("\n"), byKey.when.x + 3, statY, byKey.when.width - 6, statH, {
    size: 6.3,
    align: "center",
  });
  drawCellText(
    doc,
    [row.studyLine, row.activity].filter(Boolean).join("\n"),
    byKey.study.x + 3,
    statY,
    byKey.study.width - 6,
    statH,
    { size: 6.3, align: "center" }
  );
  [
    ["weight", row.weight],
    ["height", row.height],
    ["blood", row.bloodGroup],
  ].forEach(([key, value]) => {
    drawCellText(doc, dash(value), byKey[key].x + 1, rowY + 14, byKey[key].width - 2, 16, {
      font: "semibold",
      size: 7,
      align: "center",
      color: C.ink,
    });
  });

  const mamaTop = rowY + statsH + 2;
  drawLabeledLine(doc, copy.mama, row.mamaName, detailsX + 4, mamaTop, detailsW - 8);
  const mamaPlace = [row.mamaCity, row.mamaNative].filter(Boolean).join(" / ");
  if (mamaPlace) {
    drawCellText(doc, mamaPlace, detailsX + 4, mamaTop + 9, detailsW - 8, 10, { size: 6.2 });
  }
  drawLabeledLine(
    doc,
    copy.current,
    currentLine(row),
    detailsX + 4,
    rowY + statsH + bandH + 3,
    detailsW - 8
  );
  const familyY = rowY + statsH + bandH * 2 + 3;
  const yskNo = String(row.yskNo || "").trim();
  let yskReserve = 0;
  if (yskNo) {
    const yskLabel = `${copy.ysk} : `;
    doc.font(fontName("bold", "en")).fontSize(6.5);
    const yskLabelW = doc.widthOfString(yskLabel);
    doc.font(fontName("bold", primaryScript(yskNo))).fontSize(7.5);
    const yskValueW = doc.widthOfString(yskNo);
    yskReserve = yskLabelW + yskValueW + 10;
    const yskX = detailsX + detailsW - 4 - yskLabelW - yskValueW;
    doc.fillColor(C.goldDeep).font(fontName("bold", "en")).fontSize(6.5);
    doc.text(yskLabel, yskX, familyY, { lineBreak: false });
    drawCellText(doc, yskNo, yskX + yskLabelW, familyY, yskValueW + 2, 10, {
      font: "bold",
      size: 7.5,
      color: C.maroon,
    });
  }
  const familyLabel = `${copy.family} : `;
  doc.font(fontName("bold", primaryScript(familyLabel))).fontSize(6.5).fillColor(C.goldDeep);
  const familyLabelW = doc.widthOfString(familyLabel);
  doc.text(familyLabel, detailsX + 4, familyY, { lineBreak: false });
  drawCellText(
    doc,
    row.familyId,
    detailsX + 4 + familyLabelW,
    familyY,
    Math.max(20, detailsW - familyLabelW - yskReserve - 10),
    10,
    {
      font: "bold",
      size: 7.5,
      color: C.maroon,
    }
  );
};

const drawTableHeader = (doc, columns, y, height) => {
  const width = columns.reduce((sum, column) => sum + column.width, 0);
  doc.save();
  doc.rect(columns[0].x, y, width, height).fill(C.gold);
  columns.forEach((column, index) => {
    if (index > 0) {
      doc
        .moveTo(column.x, y)
        .lineTo(column.x, y + height)
        .strokeColor("#E7B56A")
        .lineWidth(0.4)
        .stroke();
    }
    drawCellText(doc, column.header, column.x + 1, y + 3, column.width - 2, height - 4, {
      font: "bold",
      size: 6,
      color: C.headerInk,
      align: "center",
    });
  });
  doc.rect(columns[0].x, y, width, height).lineWidth(0.8).strokeColor(C.goldDeep).stroke();
  doc.restore();
};

const drawPage = (doc, { copy, title, samaj, pageNo, year, columns, rows, images, startSerial }) => {
  drawHeader(doc, { copy, title, samaj, pageNo, year });
  const headerY = samaj ? 64 : 58;
  const headerH = 18;
  const tableBottom = PAGE_H - 12;
  const rowH = (tableBottom - headerY - headerH) / PER_PAGE;
  drawTableHeader(doc, columns, headerY, headerH);
  rows.forEach((row, index) => {
    drawProfileRow(
      doc,
      row,
      images[index],
      columns,
      headerY + headerH + rowH * index,
      rowH,
      startSerial + index,
      copy
    );
  });
};

const renderYuvaPdf = (rows, language, loadPhoto) =>
  new Promise((resolve, reject) => {
    assertFonts();
    const copy = COPY[language] || COPY.en;
    const year = new Date().getFullYear();
    const chunks = [];
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      autoFirstPage: false,
      info: {
        Title: copy.book,
        Author: "Yuvadarpan",
      },
    });
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.registerFont("regular", FONT_REGULAR);
    doc.registerFont("bold", FONT_BOLD);
    doc.registerFont("semibold", FONT_SEMI);
    doc.registerFont("latin", FONT_LATIN);
    doc.registerFont("latin-bold", FONT_LATIN_BOLD);
    doc.registerFont("latin-semibold", FONT_LATIN_SEMI);

    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      doc.end();
    };

    const draw = async () => {
      const columns = columnLayout(copy);
      const samajKeys = [];
      rows.forEach((row) => {
        const key = row.samajId || row.samaj || "";
        if (!samajKeys.includes(key)) {
          samajKeys.push(key);
        }
      });

      if (!samajKeys.length) {
        doc.addPage({ size: "A4", margin: 0 });
        drawHeader(doc, { copy, title: "", pageNo: 1, year });
        doc.fillColor(C.ink).font(fontName("regular", primaryScript(copy.empty))).fontSize(12);
        doc.text(copy.empty, 48, 380, { width: PAGE_W - 96, align: "center" });
        return;
      }

      for (const samajKey of samajKeys) {
        const samajRows = rows.filter((row) => (row.samajId || row.samaj || "") === samajKey);
        const samajName = samajRows.find((row) => row.samaj)?.samaj || "";
        let pageNo = 1;
        for (const kind of ["female", "male", "other"]) {
          const kindRows = samajRows.filter((row) => row.kind === kind);
          if (!kindRows.length) {
            continue;
          }
          let serial = 1;
          for (const pageRows of chunk(kindRows, PER_PAGE)) {
            const images = await Promise.all(pageRows.map((row) => loadPhoto(row.photoUrl)));
            doc.addPage({ size: "A4", margin: 0 });
            try {
              drawPage(doc, {
                copy,
                title: sectionTitle(copy, kind),
                samaj: samajName,
                pageNo,
                year,
                columns,
                rows: pageRows,
                images,
                startSerial: serial,
              });
            } catch (error) {
              console.error("yuva pdf page failed", error);
            }
            serial += pageRows.length;
            pageNo += 1;
          }
        }
      }
    };

    draw()
      .catch((error) => {
        console.error("yuva pdf draw failed", error);
      })
      .then(finish);
  });

module.exports = { renderYuvaPdf };
