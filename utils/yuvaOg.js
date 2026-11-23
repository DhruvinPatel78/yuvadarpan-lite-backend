const { pairText } = require("./masterName");
const { getPublicYuvaById, sanitizeYuvaId } = require("./yuvaPublic");

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const langText = (value, lang = "gu") => {
  const preferred = pairText(value, lang);
  if (preferred) return preferred;
  return pairText(value, "en");
};

const labelText = (labels, key, lang = "gu") => {
  const value = labels?.[key];
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  return langText(value, lang);
};

const absoluteUrl = (value, fallback = "") => {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  return fallback;
};

const frontendBase = () =>
  String(process.env.FRONTEND_URL || "https://yuvadarpan.in")
    .trim()
    .replace(/\/+$/, "");

const apiPublicBase = () =>
  String(
    process.env.API_PUBLIC_URL ||
      process.env.PUBLIC_API_URL ||
      process.env.BACKEND_PUBLIC_URL ||
      "https://yuvadarpan-lite-backend.onrender.com"
  )
    .trim()
    .replace(/\/+$/, "");

// Same-origin JPEG proxy on the web app (WhatsApp-friendly; not raw S3 WebP).
const ogImageUrlForId = (id) => {
  const safeId = encodeURIComponent(String(id || "").replace(/\.jpe?g$/i, ""));
  return `${frontendBase()}/og-image/${safeId}.jpg`;
};

const defaultOgImage = () => `${frontendBase()}/default-og-user.png`;

const buildYuvaOgMeta = (yuva, { requestUrl, profileId } = {}) => {
  const lang = "gu";
  const labels = yuva?.labels || {};
  const id = String(profileId || yuva?.id || yuva?._id || "").trim();
  const firstName = langText(yuva?.firstName, lang);
  const fatherName = langText(yuva?.fatherName, lang);
  const lastName =
    labelText(labels, "lastName", lang) || langText(yuva?.lastName, lang);
  const fullName = [firstName, fatherName, lastName].filter(Boolean).join(" ");
  const city = labelText(labels, "city", lang);
  const state = labelText(labels, "state", lang);
  const activity = langText(yuva?.activity, lang);
  const gender = langText(yuva?.gender, lang);
  const location = [city, state].filter(Boolean).join(", ");

  const descriptionParts = [];
  if (yuva?.familyId) descriptionParts.push(`Family ID ${yuva.familyId}`);
  if (location) descriptionParts.push(location);
  if (activity) descriptionParts.push(activity);
  if (gender) descriptionParts.push(gender);
  descriptionParts.push("Yuvadarpan profile");

  const title = fullName || "Yuvadarpan Profile";
  const description = descriptionParts.filter(Boolean).join(" · ");
  const hasPhoto = Boolean(String(yuva?.profile?.url || yuva?.profile?.awsId || "").trim());
  // Always use JPEG proxy URL so WhatsApp/Facebook can fetch a compatible image.
  const image = id ? ogImageUrlForId(id) : defaultOgImage();
  const url =
    absoluteUrl(requestUrl, "") ||
    `${frontendBase()}/yuva/${encodeURIComponent(id)}`;

  return {
    id,
    title,
    description,
    image,
    imageWidth: 1200,
    imageHeight: 630,
    imageType: "image/jpeg",
    url,
    siteName: "Yuvadarpan",
    fullName,
    hasPhoto,
    sourcePhoto: String(yuva?.profile?.url || "").trim(),
  };
};

const renderOgHtml = (meta, { redirectUrl } = {}) => {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const image = escapeHtml(meta.image);
  const url = escapeHtml(meta.url);
  const siteName = escapeHtml(meta.siteName || "Yuvadarpan");
  const target = escapeHtml(redirectUrl || meta.url);
  const width = escapeHtml(meta.imageWidth || 1200);
  const height = escapeHtml(meta.imageHeight || 630);
  const imageType = escapeHtml(meta.imageType || "image/jpeg");

  return `<!DOCTYPE html>
<html lang="gu">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${siteName}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:image:secure_url" content="${image}" />
  <meta property="og:image:type" content="${imageType}" />
  <meta property="og:image:width" content="${width}" />
  <meta property="og:image:height" content="${height}" />
  <meta property="og:image:alt" content="${title}" />
  <meta property="og:url" content="${url}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${image}" />
  <meta http-equiv="refresh" content="0;url=${target}" />
</head>
<body>
  <p>Redirecting to <a href="${target}">${title}</a>…</p>
  <script>window.location.replace(${JSON.stringify(redirectUrl || meta.url)});</script>
</body>
</html>`;
};

const getYuvaOgPayload = async (id, options = {}) => {
  const sanitized = sanitizeYuvaId(id);
  const yuva = await getPublicYuvaById(sanitized);
  if (!yuva) {
    return null;
  }
  return buildYuvaOgMeta(yuva, {
    ...options,
    profileId: sanitized,
  });
};

module.exports = {
  escapeHtml,
  buildYuvaOgMeta,
  renderOgHtml,
  getYuvaOgPayload,
  defaultOgImage,
  frontendBase,
  apiPublicBase,
  ogImageUrlForId,
};
