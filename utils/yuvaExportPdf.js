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

// ISO A4 in PDF points (1pt = 1/72in)
const PAGE_W = 595.28;
const PAGE_H = 841.89;
/** Readable layout: taller rows + larger type (uses page height, less truncation). */
const STATS_H = 44;
const BAND_H = 20;
const PHOTO_PAD = 1;
const TARGET_ROW_H = STATS_H + BAND_H * 3; // 104
const TABLE_HEADER_H = 22;
const PAGE_BOTTOM = 10;

const rowsPerPageFor = (headerY) => {
  const available = PAGE_H - PAGE_BOTTOM - headerY - TABLE_HEADER_H;
  return Math.max(1, Math.floor(available / TARGET_ROW_H));
};

const C = {
  page: "#FFF8F1",
  maroon: "#8E2340",
  orange: "#E36A1E",
  name: "#D2652A",
  gold: "#F3A24A",
  goldDeep: "#C56A22",
  border: "#C56A22",
  line: "#E39B4E",
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
  const x = 10;
  const width = PAGE_W - 20;
  const fixed = [
    { key: "no", width: 20, header: copy.cols.no },
    { key: "photo", width: 100, header: copy.cols.photo },
    { key: "name", width: 150, header: copy.cols.name },
    { key: "place", width: 52, header: copy.cols.birth },
    { key: "when", width: 72, header: copy.cols.when },
    { key: "study", width: 74, header: copy.cols.study },
    { key: "weight", width: 36, header: copy.cols.weight },
    { key: "height", width: 36, header: copy.cols.height },
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
  const size = options.size || 9;
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
  doc.font(fontName("bold", primaryScript(prefix))).fontSize(9).fillColor(C.label);
  const prefixWidth = Math.min(doc.widthOfString(prefix) + 1, w * 0.55);
  doc.text(prefix, x, y, { width: prefixWidth, lineBreak: false });
  drawCellText(doc, text, x + prefixWidth, y, Math.max(10, w - prefixWidth), 12, {
    size: 9,
    color: C.ink,
  });
};

const drawPhoto = (doc, image, x, y, w, h, initial) => {
  doc.save();
  doc.rect(x, y, w, h).clip();
  if (image) {
    try {
      // Cover the full photo cell (crop overflow) — no letterbox gaps
      doc.image(image, x, y, { cover: [w, h], align: "center", valign: "center" });
    } catch (error) {
      doc.rect(x, y, w, h).fill(C.photo);
    }
  } else {
    doc.rect(x, y, w, h).fill(C.photo);
    doc.fillColor(C.maroon).font(fontName("bold", primaryScript(initial || "•"))).fontSize(18);
    doc.text(initial || "•", x, y + h / 2 - 10, { width: w, align: "center", lineBreak: false });
  }
  doc.restore();
  doc.rect(x, y, w, h).lineWidth(0.7).strokeColor(C.border).stroke();
};

const dash = (value) => (String(value || "").trim() ? value : "—");

const currentLine = (row) => [row.city, row.native].filter(Boolean).join(" / ");

/** Single line: "Mama Name (city / native)" */
const mamaLine = (row) => {
  const name = String(row.mamaName || "").trim();
  const place = [row.mamaCity, row.mamaNative].filter(Boolean).join(" / ");
  if (name && place) return `${name} (${place})`;
  return name || place;
};

const strokeRect = (doc, x, y, w, h, color, lineWidth = 1) => {
  doc
    .lineWidth(lineWidth)
    .strokeColor(color)
    .moveTo(x, y)
    .lineTo(x + w, y)
    .lineTo(x + w, y + h)
    .lineTo(x, y + h)
    .lineTo(x, y)
    .stroke();
};

const drawProfileRow = (doc, row, image, columns, rowY, rowH, serial, copy) => {
  const byKey = Object.fromEntries(columns.map((column) => [column.key, column]));
  const statsH = STATS_H;
  const bandH = BAND_H;
  const tableX = columns[0].x;
  const tableW = columns.reduce((sum, column) => sum + column.width, 0);
  const tableRight = tableX + tableW;
  const detailsX = byKey.place.x;
  const detailsW = tableRight - detailsX;
  const statKeys = new Set(["place", "when", "study", "weight", "height", "blood"]);
  const lineGap = 12.5;
  const mamaY = rowY + statsH;
  const currentY = mamaY + bandH;
  const familyY = currentY + bandH;
  const bandTextY = (top) => top + 4.5;

  // Fills first
  doc.save();
  doc.rect(detailsX, familyY, detailsW, bandH).fill(C.family);
  doc.restore();

  drawCellText(doc, String(serial), byKey.no.x, rowY + rowH / 2 - 6, byKey.no.width, 14, {
    font: "bold",
    size: 11,
    color: C.maroon,
    align: "center",
  });

  const photoW = byKey.photo.width - PHOTO_PAD * 2;
  const photoH = rowH - PHOTO_PAD * 2;
  drawPhoto(
    doc,
    image,
    byKey.photo.x + PHOTO_PAD,
    rowY + PHOTO_PAD,
    photoW,
    photoH,
    String(row.fullName || "").trim().charAt(0)
  );

  const nameX = byKey.name.x + 4;
  const nameW = byKey.name.width - 8;
  drawCellText(doc, row.profileName || row.fullName, nameX, rowY + 5, nameW, 14, {
    font: "semibold",
    size: 10.5,
    color: C.name,
  });
  const nameLines = [
    [copy.gotra, row.gotra],
    [copy.mother, row.motherName],
    [copy.firm, row.firm],
    [copy.firmAddress, row.firmAddress],
  ].filter(([, value]) => String(value || "").trim());
  nameLines.forEach(([label, value], index) => {
    const lineY = rowY + 22 + index * lineGap;
    if (lineY > rowY + rowH - 16) return;
    drawLabeledLine(doc, label, value, nameX, lineY, nameW);
  });
  const contactValue = [row.contactName, row.phone].filter(Boolean).join(" : ");
  drawLabeledLine(doc, copy.contact, contactValue, nameX, rowY + rowH - 15, nameW);

  // Stats: 2-line wrap for date/education so values stay readable
  const statY = rowY + 6;
  const statH = statsH - 10;
  drawCellText(doc, row.pob, byKey.place.x + 2, statY, byKey.place.width - 4, statH, {
    size: 9,
    align: "center",
  });
  drawCellText(
    doc,
    [row.dobDate, row.dobTime].filter(Boolean).join("\n"),
    byKey.when.x + 2,
    statY,
    byKey.when.width - 4,
    statH,
    { size: 8.5, align: "center" }
  );
  drawCellText(
    doc,
    [row.studyLine, row.activity].filter(Boolean).join("\n"),
    byKey.study.x + 2,
    statY,
    byKey.study.width - 4,
    statH,
    { size: 8.5, align: "center" }
  );
  [
    ["weight", row.weight],
    ["height", row.height],
    ["blood", row.bloodGroup],
  ].forEach(([key, value]) => {
    drawCellText(doc, dash(value), byKey[key].x + 1, rowY + statsH / 2 - 6, byKey[key].width - 2, 14, {
      font: "semibold",
      size: 10,
      align: "center",
      color: C.ink,
    });
  });

  drawLabeledLine(doc, copy.mama, mamaLine(row), detailsX + 4, bandTextY(mamaY), detailsW - 8);
  drawLabeledLine(
    doc,
    copy.current,
    currentLine(row),
    detailsX + 4,
    bandTextY(currentY),
    detailsW - 8
  );

  const yskNo = String(row.yskNo || "").trim();
  let yskReserve = 0;
  if (yskNo) {
    const yskLabel = `${copy.ysk} : `;
    doc.font(fontName("bold", "en")).fontSize(9);
    const yskLabelW = doc.widthOfString(yskLabel);
    doc.font(fontName("bold", primaryScript(yskNo))).fontSize(10);
    const yskValueW = doc.widthOfString(yskNo);
    yskReserve = yskLabelW + yskValueW + 10;
    const yskX = Math.max(detailsX + 8, tableRight - 4 - yskLabelW - yskValueW);
    doc.fillColor(C.goldDeep).font(fontName("bold", "en")).fontSize(9);
    doc.text(yskLabel, yskX, bandTextY(familyY), { lineBreak: false });
    drawCellText(doc, yskNo, yskX + yskLabelW, bandTextY(familyY), yskValueW + 2, 12, {
      font: "bold",
      size: 10,
      color: C.maroon,
    });
  }
  const familyLabel = `${copy.family} : `;
  doc.font(fontName("bold", primaryScript(familyLabel))).fontSize(9).fillColor(C.goldDeep);
  const familyLabelW = doc.widthOfString(familyLabel);
  doc.text(familyLabel, detailsX + 4, bandTextY(familyY), { lineBreak: false });
  drawCellText(
    doc,
    row.familyId,
    detailsX + 4 + familyLabelW,
    bandTextY(familyY),
    Math.max(20, detailsW - familyLabelW - yskReserve - 8),
    12,
    {
      font: "bold",
      size: 10,
      color: C.maroon,
    }
  );

  // Borders last so nothing covers left/right/top/bottom edges
  doc.save();
  columns.forEach((column, index) => {
    if (index === 0) return;
    // Name|details divider runs full row; other stats dividers only through stats band
    const lineH = column.key === "place" || !statKeys.has(column.key) ? rowH : statsH;
    doc
      .moveTo(column.x, rowY)
      .lineTo(column.x, rowY + lineH)
      .strokeColor(C.line)
      .lineWidth(0.7)
      .stroke();
  });
  [mamaY, currentY, familyY].forEach((y) => {
    doc
      .moveTo(detailsX, y)
      .lineTo(tableRight, y)
      .strokeColor(C.line)
      .lineWidth(0.7)
      .stroke();
  });
  // Outer box — explicit path so left AND right edges always render
  strokeRect(doc, tableX, rowY, tableW, rowH, C.border, 1.15);
  doc.restore();
};

const drawTableHeader = (doc, columns, y, height) => {
  const width = columns.reduce((sum, column) => sum + column.width, 0);
  const tableX = columns[0].x;
  doc.save();
  doc.rect(tableX, y, width, height).fill(C.gold);
  columns.forEach((column, index) => {
    if (index > 0) {
      doc
        .moveTo(column.x, y)
        .lineTo(column.x, y + height)
        .strokeColor("#E7B56A")
        .lineWidth(0.7)
        .stroke();
    }
    drawCellText(doc, column.header, column.x + 1, y + 5, column.width - 2, height - 6, {
      font: "bold",
      size: 9,
      color: C.headerInk,
      align: "center",
    });
  });
  strokeRect(doc, tableX, y, width, height, C.goldDeep, 1.15);
  doc.restore();
};

const drawPage = (doc, { copy, title, samaj, pageNo, year, columns, rows, images, startSerial }) => {
  drawHeader(doc, { copy, title, samaj, pageNo, year });
  const headerY = samaj ? 60 : 54;
  // Fixed row height (= photo height). Do not stretch rows to fill the page.
  const rowH = TARGET_ROW_H;
  drawTableHeader(doc, columns, headerY, TABLE_HEADER_H);
  rows.forEach((row, index) => {
    drawProfileRow(
      doc,
      row,
      images[index],
      columns,
      headerY + TABLE_HEADER_H + rowH * index,
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
      size: [PAGE_W, PAGE_H],
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
        doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
        drawHeader(doc, { copy, title: "", pageNo: 1, year });
        doc.fillColor(C.ink).font(fontName("regular", primaryScript(copy.empty))).fontSize(12);
        doc.text(copy.empty, 48, 380, { width: PAGE_W - 96, align: "center" });
        return;
      }

      for (const samajKey of samajKeys) {
        const samajRows = rows.filter((row) => (row.samajId || row.samaj || "") === samajKey);
        const samajName = samajRows.find((row) => row.samaj)?.samaj || "";
        const headerY = samajName ? 60 : 54;
        const perPage = rowsPerPageFor(headerY);
        let pageNo = 1;
        for (const kind of ["female", "male", "other"]) {
          const kindRows = samajRows.filter((row) => row.kind === kind);
          if (!kindRows.length) {
            continue;
          }
          let serial = 1;
          for (const pageRows of chunk(kindRows, perPage)) {
            const images = await Promise.all(pageRows.map((row) => loadPhoto(row.photoUrl)));
            doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
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
