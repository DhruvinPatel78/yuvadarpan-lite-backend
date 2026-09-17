const nodemailer = require("nodemailer");

const getMailAuth = () => {
  const rawUser = String(
    process.env.MAIL_USER || process.env.SMTP_USER || "",
  ).trim();
  const user = rawUser.includes("@")
    ? rawUser
    : String(process.env.USER || "").includes("@")
      ? String(process.env.USER).trim()
      : "";
  const pass = String(
    process.env.MAIL_PASSWORD ||
      process.env.SMTP_PASSWORD ||
      process.env.PASSWORD ||
      "",
  ).trim();
  if (!user.includes("@") || !pass) {
    throw new Error("mail-not-configured");
  }
  return { user, pass };
};

let transporter;

const resetTransporter = () => {
  if (!transporter) {
    return;
  }
  try {
    transporter.close();
  } catch (error) {
    // ignore close errors so the next send can rebuild the connection
  }
  transporter = null;
};

const getTransporter = () => {
  if (transporter) {
    return transporter;
  }
  const auth = getMailAuth();
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth,
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 20000,
  });
  return transporter;
};

const toPlainText = (html, title) => {
  const text = String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return text || title;
};

const mailSender = async (email, title, body) => {
  const to = String(email || "").trim();
  if (!to.includes("@")) {
    throw new Error("invalid-mail-recipient");
  }
  const auth = getMailAuth();
  try {
    const info = await getTransporter().sendMail({
      from: `"Yuvadarpan" <${auth.user}>`,
      to,
      replyTo: auth.user,
      subject: title,
      text: toPlainText(body, title),
      html: body,
    });
    if (info.rejected && info.rejected.length) {
      throw new Error(`mail-rejected:${info.rejected.join(",")}`);
    }
    console.log("mail-sent", to, info.messageId || info.response);
    return info;
  } catch (error) {
    resetTransporter();
    console.error("mail-failed", to, error.message);
    throw error;
  }
};

module.exports = mailSender;
