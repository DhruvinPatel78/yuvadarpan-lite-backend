const fs = require("fs/promises");
const sharp = require("sharp");

const MAX_EDGE = 1200;
const WEBP_QUALITY = 90;
const WEBP_EFFORT = 6;

const withWebpExt = (name) =>
  `${String(name || "yuva_photo").replace(/\.[a-z0-9]+$/i, "")}.webp`;

/**
 * Direct WebP optimization: rotate, resize, and encode once.
 * Skips JPEG so quality is not reduced by a double encode.
 */
const convertToModernFormat = async (input, contentType = "application/octet-stream") => {
  if (!input) {
    return {
      body: input,
      contentType,
      filename: null,
    };
  }

  const source = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (!source.length) {
    return {
      body: source,
      contentType,
      filename: null,
    };
  }

  const body = await sharp(source, { failOn: "none" })
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    })
    .webp({
      quality: WEBP_QUALITY,
      alphaQuality: 100,
      effort: WEBP_EFFORT,
      smartSubsample: true,
    })
    .toBuffer();

  return {
    body,
    contentType: "image/webp",
    filename: withWebpExt,
  };
};

const compressYuvaPhoto = async (file) => {
  const original = await fs.readFile(file.path);
  return convertToModernFormat(original, file.mimetype);
};

module.exports = {
  compressYuvaPhoto,
  convertToModernFormat,
  withWebpExt,
};
