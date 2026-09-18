const fs = require("fs/promises");
const sharp = require("sharp");

const MAX_EDGE = 1600;
const JPEG_QUALITY = 85;

const withJpegExt = (name) =>
  `${String(name || "yuva_photo").replace(/\.[a-z0-9]+$/i, "")}.jpg`;

const compressYuvaPhoto = async (file) => {
  const original = await fs.readFile(file.path);
  const image = sharp(original, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  const needsResize = width > MAX_EDGE || height > MAX_EDGE;
  const prepared = needsResize
    ? image.resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
    : image;

  const compressed = await prepared
    .jpeg({
      quality: JPEG_QUALITY,
      mozjpeg: true,
      chromaSubsampling: "4:4:4",
    })
    .toBuffer();

  if (!needsResize && compressed.length >= original.length) {
    return {
      body: original,
      contentType: file.mimetype || "application/octet-stream",
      filename: null,
    };
  }

  return {
    body: compressed,
    contentType: "image/jpeg",
    filename: withJpegExt,
  };
};

module.exports = { compressYuvaPhoto, withJpegExt };
