const nodemailer = require("nodemailer");

const getMailAuth = () => {
  const user = process.env.MAIL_USER || process.env.SMTP_USER;
  const pass = process.env.MAIL_PASSWORD || process.env.SMTP_PASSWORD;
  if (!user || !pass) {
    throw new Error("mail-not-configured");
  }
  return { user, pass };
};

let transporter;

const getTransporter = () => {
  if (transporter) {
    return transporter;
  }
  const auth = getMailAuth();
  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return transporter;
};

const mailSender = async (email, title, body) => {
  if (!email || !String(email).includes("@")) {
    throw new Error("invalid-mail-recipient");
  }
  const auth = getMailAuth();
  return getTransporter().sendMail({
    from: {
      name: "Yuvadarpan",
      address: auth.user,
    },
    to: email,
    subject: title,
    text: `${title}\n\nPlease use this verification code: ${String(body).replace(/<[^>]+>/g, " ").trim()}`,
    html: body,
  });
};

module.exports = mailSender;
