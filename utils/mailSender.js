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
  return { user, pass };
};

const parseFrom = (fallbackEmail = "") => {
  const raw = String(process.env.MAIL_FROM || "").trim();
  if (raw) {
    const match = raw.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+@[^>]+)>?$/);
    if (match) {
      const name = String(match[1] || "").trim() || "Yuvadarpan";
      const email = String(match[2] || "").trim();
      if (email.includes("@")) {
        return { name, email };
      }
    }
    if (raw.includes("@")) {
      return { name: "Yuvadarpan", email: raw };
    }
  }
  if (fallbackEmail.includes("@")) {
    return { name: "Yuvadarpan", email: fallbackEmail };
  }
  return { name: "Yuvadarpan", email: "" };
};

const hasSmtpConfig = () => {
  const auth = getMailAuth();
  return auth.user.includes("@") && Boolean(auth.pass);
};

const hasBrevoConfig = () =>
  Boolean(String(process.env.BREVO_API_KEY || "").trim());

const hasResendConfig = () =>
  Boolean(String(process.env.RESEND_API_KEY || "").trim());

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
  if (!auth.user.includes("@") || !auth.pass) {
    throw new Error("mail-not-configured");
  }
  // Fail faster when Brevo/Resend can take over after SMTP is blocked.
  const hasFallback = hasBrevoConfig() || hasResendConfig();
  const connectionTimeout = hasFallback ? 8000 : 12000;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure =
    String(process.env.SMTP_SECURE || (port === 465 ? "true" : "false"))
      .toLowerCase() !== "false";
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure,
    auth,
    connectionTimeout,
    greetingTimeout: connectionTimeout,
    socketTimeout: hasFallback ? 12000 : 20000,
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

const sendWithBrevo = async (email, title, body) => {
  const apiKey = String(process.env.BREVO_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("mail-not-configured");
  }
  const auth = getMailAuth();
  const sender = parseFrom(auth.user);
  if (!sender.email) {
    throw new Error("mail-from-not-configured");
  }
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { name: sender.name, email: sender.email },
      to: [{ email }],
      replyTo: auth.user.includes("@")
        ? { email: auth.user, name: sender.name }
        : undefined,
      subject: title,
      htmlContent: body,
      textContent: toPlainText(body, title),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload?.message || payload?.error || `brevo-failed:${response.status}`,
    );
  }
  console.log("mail-sent-brevo", email, payload?.messageId || "ok");
  return payload;
};

const sendWithResend = async (email, title, body) => {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("mail-not-configured");
  }
  const auth = getMailAuth();
  const sender = parseFrom(auth.user);
  const from = sender.email
    ? `"${sender.name}" <${sender.email}>`
    : `"Yuvadarpan" <onboarding@resend.dev>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      reply_to: auth.user.includes("@") ? auth.user : undefined,
      subject: title,
      html: body,
      text: toPlainText(body, title),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || `resend-failed:${response.status}`);
  }
  console.log("mail-sent-resend", email, payload?.id || "ok");
  return payload;
};

const sendWithSmtp = async (email, title, body) => {
  const auth = getMailAuth();
  if (!auth.user.includes("@") || !auth.pass) {
    throw new Error("mail-not-configured");
  }
  const sender = parseFrom(auth.user);
  const info = await getTransporter().sendMail({
    from: `"${sender.name}" <${sender.email || auth.user}>`,
    to: email,
    replyTo: auth.user,
    subject: title,
    text: toPlainText(body, title),
    html: body,
  });
  if (info.rejected && info.rejected.length) {
    throw new Error(`mail-rejected:${info.rejected.join(",")}`);
  }
  console.log("mail-sent-smtp", email, info.messageId || info.response);
  return info;
};

const mailSender = async (email, title, body) => {
  const to = String(email || "").trim();
  if (!to.includes("@")) {
    throw new Error("invalid-mail-recipient");
  }

  let smtpError = null;
  if (hasSmtpConfig()) {
    try {
      return await sendWithSmtp(to, title, body);
    } catch (error) {
      resetTransporter();
      smtpError = error;
      console.warn(
        "mail-smtp-failed",
        to,
        error?.message || error,
        hasBrevoConfig() || hasResendConfig()
          ? "| falling back to API provider"
          : "",
      );
    }
  }

  if (hasBrevoConfig()) {
    try {
      return await sendWithBrevo(to, title, body);
    } catch (error) {
      console.error("mail-brevo-failed", to, error?.message || error);
      throw error;
    }
  }

  if (hasResendConfig()) {
    try {
      return await sendWithResend(to, title, body);
    } catch (error) {
      console.error("mail-resend-failed", to, error?.message || error);
      throw error;
    }
  }

  if (smtpError) {
    console.error("mail-failed", to, smtpError?.message || smtpError);
    throw smtpError;
  }
  throw new Error("mail-not-configured");
};

module.exports = mailSender;
