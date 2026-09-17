const mailSender = require("./mailSender");
const { sendNotification } = require("./fcm");
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
    fcmToken: plain.fcmToken,
  };
};

const displayName = (user) => {
  const name = String(user?.firstName || "").trim();
  return name || (pickLang(user) === "gu" ? "સભ્ય" : "member");
};

const copyFor = (kind, lang, user) => {
  const entry = notification[kind];
  if (!entry) {
    return { title: "", heading: "", greeting: "", paragraphs: [], note: "", body: "" };
  }
  const name = displayName(user);
  return {
    title: pick(entry.title, lang),
    heading: pick(entry.heading, lang) || pick(entry.title, lang),
    greeting: pick(entry.greeting, lang).replace("{{name}}", name),
    paragraphs: entry.paragraphs?.[lang] || entry.paragraphs?.en || [],
    note: pick(entry.note, lang),
    body: pick(entry.body, lang),
  };
};

const sendAccountEmail = async (user, kind, extra = {}) => {
  const account = asUser(user);
  if (!account?.email) {
    throw new Error("invalid-mail-recipient");
  }
  const copy = copyFor(kind, pickLang(account), account);
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
  const copy = copyFor(kind, pickLang(account), account);
  try {
    await sendAccountEmail(account, kind, extra);
  } catch (error) {
    console.error("account-email-failed", kind, account.email, error.message);
  }
  if (account.fcmToken && copy.title) {
    try {
      await sendNotification(
        account.fcmToken,
        copy.title,
        extra.otp
          ? `${copy.body || copy.paragraphs[0] || ""} ${extra.otp}`.trim()
          : copy.body || copy.paragraphs[0] || "",
      );
    } catch (error) {
      console.error("account-push-failed", kind, error.message);
    }
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
