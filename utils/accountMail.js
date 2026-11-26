const mailSender = require("./mailSender");
const { renderEmail } = require("./emailTemplate");
const notification = require("../data/locale/notifications.json");

const pickLang = (user) => (user?.language === "gu" ? "gu" : "en");

const pick = (value, lang) => {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return value[lang] || value.en || "";
};

const asUser = (user) => {
  if (!user) {
    return null;
  }
  if (typeof user === "string") {
    return { email: String(user).trim() };
  }
  const plain = typeof user.toObject === "function" ? user.toObject() : { ...user };
  return {
    ...plain,
    email: String(plain.email || "").trim(),
    firstName: plain.firstName,
    language: plain.language,
  };
};

const displayName = (user) => {
  const name = String(user?.firstName || "").trim();
  return name || (pickLang(user) === "gu" ? "સભ્ય" : "member");
};

const withName = (text, name) =>
  String(text || "").replace(/\{\{name\}\}/g, name);

const copyFor = (kind, lang, user, nameOverride) => {
  const entry = notification[kind];
  if (!entry) {
    return { title: "", heading: "", greeting: "", paragraphs: [], note: "", body: "" };
  }
  const name = nameOverride || displayName(user);
  return {
    title: withName(pick(entry.title, lang), name),
    heading: withName(pick(entry.heading, lang) || pick(entry.title, lang), name),
    greeting: withName(pick(entry.greeting, lang), name),
    paragraphs: (entry.paragraphs?.[lang] || entry.paragraphs?.en || []).map(
      (line) => withName(line, name),
    ),
    note: withName(pick(entry.note, lang), name),
    body: withName(pick(entry.body, lang), name),
  };
};

const sendAccountEmail = async (user, kind, extra = {}) => {
  const account = asUser(user);
  if (!account?.email) {
    throw new Error("invalid-mail-recipient");
  }
  const lang = extra.language === "gu" || extra.language === "en"
    ? extra.language
    : pickLang(account);
  const copy = copyFor(kind, lang, account, extra.displayName);
  if (!copy.title) {
    throw new Error(`mail-copy-missing:${kind}`);
  }
  await mailSender(
    account.email,
    copy.title,
    renderEmail({
      heading: copy.heading,
      greeting: copy.greeting,
      paragraphs: copy.paragraphs,
      note: copy.note,
      otp: extra.otp,
    }),
  );
};

const notifyAccountEvent = async (user, kind, extra = {}) => {
  const account = asUser(user);
  if (!account) {
    return;
  }
  try {
    await sendAccountEmail(account, kind, extra);
  } catch (error) {
    console.error("account-email-failed", kind, account.email, error.message);
  }
};

const sendOtpEmail = async (user, otp) => {
  const account = asUser(user);
  if (!account?.email) {
    throw new Error("invalid-mail-recipient");
  }
  await sendAccountEmail(account, "PasswordOtp", { otp });
};

const notifyStatusChange = async (user, payload = {}) => {
  const allowedChanged = Object.prototype.hasOwnProperty.call(payload, "allowed");
  const activeChanged = Object.prototype.hasOwnProperty.call(payload, "active");
  if (allowedChanged) {
    await notifyAccountEvent(
      user,
      payload.allowed ? "AccountVerifySuccess" : "AccountVerifyFail",
    );
    return;
  }
  if (activeChanged) {
    await notifyAccountEvent(
      user,
      payload.active ? "AccountActive" : "AccountDeactive",
    );
  }
};

module.exports = {
  sendAccountEmail,
  notifyAccountEvent,
  sendOtpEmail,
  notifyStatusChange,
};
