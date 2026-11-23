const sharp = require("sharp");
const { s3, BUCKET } = require("./s3");
const { getPublicYuvaById, sanitizeYuvaId } = require("./yuvaPublic");
const { pairText } = require("./masterName");

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const OG_JPEG_QUALITY = 84;

const getS3KeyFromProfile = (profile) => {
  const awsId = profile?.awsId;
  if (awsId) {
    return String(awsId).replace(/^\//, "");
  }
  const url = String(profile?.url || "").trim();
  if (!url) return null;
  const base = String(process.env.AWS_BASE_URL || "").trim();
  if (base && url.startsWith(base)) {
    return url.slice(base.length).replace(/^\//, "");
  }
  try {
    const pathName = new URL(url).pathname.replace(/^\//, "");
    if (pathName.startsWith("yuva_images/")) {
      return pathName;
    }
  } catch (e) {
    return null;
  }
  return null;
};

const loadProfilePhotoBuffer = async (yuva) => {
  const key = getS3KeyFromProfile(yuva?.profile);
  if (key) {
    try {
      const object = await s3
        .getObject({
          Bucket: BUCKET,
          Key: key,
        })
        .promise();
      if (object?.Body) {
        return Buffer.isBuffer(object.Body)
          ? object.Body
          : Buffer.from(object.Body);
      }
    } catch (error) {
      console.error("og-image-s3-load-failed", key, error.message);
    }
  }

  const url = String(yuva?.profile?.url || "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return null;
  }
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error("og-image-url-load-failed", url, error.message);
    return null;
  }
};

const escapeXml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const langText = (value, lang = "gu") =>
  pairText(value, lang) || pairText(value, "en") || "";

const buildDisplayName = (yuva) => {
  const labels = yuva?.labels || {};
  const last =
    langText(labels.lastName, "gu") ||
    langText(labels.lastName, "en") ||
    langText(yuva?.lastName, "gu") ||
    langText(yuva?.lastName, "en");
  return [langText(yuva?.firstName, "gu") || langText(yuva?.firstName, "en"), last]
    .filter(Boolean)
    .join(" ")
    .trim();
};

const renderBrandBannerSvg = (subtitle = "") => {
  const line = escapeXml(subtitle).slice(0, 48);
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3a1c1c"/>
      <stop offset="55%" stop-color="#542b2b"/>
      <stop offset="100%" stop-color="#7a4545"/>
    </linearGradient>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#bg)"/>
  <circle cx="980" cy="120" r="220" fill="#ffffff" fill-opacity="0.05"/>
  <circle cx="180" cy="520" r="180" fill="#ffffff" fill-opacity="0.04"/>
  <circle cx="600" cy="250" r="118" fill="#e8ddd8"/>
  <circle cx="600" cy="220" r="54" fill="#3a1c1c"/>
  <path d="M470 390c16-78 70-120 130-120s114 42 130 120" fill="#3a1c1c"/>
  <text x="600" y="480" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="700" fill="#ffffff" letter-spacing="10">YUVADARPAN</text>
  ${
    line
      ? `<text x="600" y="545" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#f4f0ea" fill-opacity="0.92">${line}</text>`
      : ""
  }
</svg>`;
};

const renderDefaultOgJpeg = async (subtitle = "") =>
  sharp(Buffer.from(renderBrandBannerSvg(subtitle)))
    .jpeg({ quality: OG_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

const renderPhotoBannerJpeg = async (photoBuffer, displayName = "") => {
  // Blurred full-bleed background from the photo.
  const background = await sharp(photoBuffer, { failOn: "none" })
    .rotate()
    .resize(OG_WIDTH, OG_HEIGHT, { fit: "cover", position: "centre" })
    .blur(28)
    .modulate({ brightness: 0.55, saturation: 0.85 })
    .jpeg({ quality: 70 })
    .toBuffer();

  // Large circular portrait for the WhatsApp/Facebook large card.
  const portraitSize = 360;
  const portrait = await sharp(photoBuffer, { failOn: "none" })
    .rotate()
    .resize(portraitSize, portraitSize, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  const roundMask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${portraitSize}" height="${portraitSize}">
      <circle cx="${portraitSize / 2}" cy="${portraitSize / 2}" r="${portraitSize / 2}" fill="#fff"/>
    </svg>`
  );
  const roundPortrait = await sharp(portrait)
    .composite([{ input: roundMask, blend: "dest-in" }])
    .png()
    .toBuffer();

  const ring = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${portraitSize + 16}" height="${portraitSize + 16}">
      <circle cx="${(portraitSize + 16) / 2}" cy="${(portraitSize + 16) / 2}" r="${portraitSize / 2 + 6}" fill="none" stroke="#f4f0ea" stroke-width="8"/>
    </svg>`
  );

  const name = escapeXml(displayName).slice(0, 42);
  const caption = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}">
      <rect x="0" y="520" width="${OG_WIDTH}" height="110" fill="#000000" fill-opacity="0.38"/>
      <text x="600" y="575" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#ffffff" letter-spacing="6">YUVADARPAN</text>
      ${
        name
          ? `<text x="600" y="612" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#f4f0ea">${name}</text>`
          : ""
      }
    </svg>`
  );

  return sharp(background)
    .composite([
      {
        input: ring,
        top: Math.round((OG_HEIGHT - portraitSize) / 2) - 28,
        left: Math.round((OG_WIDTH - portraitSize) / 2) - 8,
      },
      {
        input: roundPortrait,
        top: Math.round((OG_HEIGHT - portraitSize) / 2) - 20,
        left: Math.round((OG_WIDTH - portraitSize) / 2),
      },
      { input: caption, top: 0, left: 0 },
    ])
    .jpeg({ quality: OG_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
};

const renderProfileOgJpeg = async (photoBuffer, yuva = null) => {
  const displayName = buildDisplayName(yuva);
  if (!photoBuffer?.length) {
    return renderDefaultOgJpeg(displayName || "Profile");
  }
  try {
    return await renderPhotoBannerJpeg(photoBuffer, displayName);
  } catch (error) {
    console.error("og-image-convert-failed", error.message);
    return renderDefaultOgJpeg(displayName || "Profile");
  }
};

const getYuvaOgJpeg = async (id) => {
  const sanitized = sanitizeYuvaId(id);
  const yuva = await getPublicYuvaById(sanitized);
  if (!yuva) {
    return null;
  }
  const photo = await loadProfilePhotoBuffer(yuva);
  const body = await renderProfileOgJpeg(photo, yuva);
  return {
    id: sanitized,
    body,
    contentType: "image/jpeg",
    width: OG_WIDTH,
    height: OG_HEIGHT,
    hasPhoto: Boolean(photo?.length),
  };
};

module.exports = {
  getYuvaOgJpeg,
  renderDefaultOgJpeg,
  getS3KeyFromProfile,
  OG_WIDTH,
  OG_HEIGHT,
};
