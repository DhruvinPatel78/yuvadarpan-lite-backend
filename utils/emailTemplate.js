const COLORS = {
  primary: "#542b2b",
  primaryHover: "#462424",
  surface: "#f4f0ea",
  muted: "#f7f3ef",
  line: "#e4ddd4",
  text: "#542b2b",
  mutedText: "#6b7280",
  white: "#ffffff",
};

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const paragraph = (text) =>
  `<p style="margin:0 0 10px;font-size:15px;line-height:1.55;color:${COLORS.text};">${escapeHtml(text)}</p>`;

const renderEmail = ({
  heading,
  greeting,
  paragraphs = [],
  note,
  otp,
  footer,
}) => {
  const otpBlock = otp
    ? `
      <div style="margin:8px 0 12px;padding:14px 16px;background:${COLORS.muted};border:1px solid ${COLORS.line};border-radius:8px;text-align:center;">
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.mutedText};">OTP</p>
        <p style="margin:0;font-size:26px;letter-spacing:0.16em;font-weight:700;color:${COLORS.primary};">${escapeHtml(otp)}</p>
      </div>`
    : "";

  const noteBlock = note
    ? `<p style="margin:12px 0 0;font-size:13px;line-height:1.5;color:${COLORS.mutedText};">${escapeHtml(note)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:${COLORS.surface};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.surface};">
      <tr>
        <td align="center" style="padding:28px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:${COLORS.white};border:1px solid ${COLORS.line};border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:${COLORS.primary};padding:20px 28px;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;letter-spacing:0.08em;color:${COLORS.white};">YUVADARPAN</p>
<!--                <p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#f7f3ef;">Community directory</p>-->
              </td>
            </tr>
            <tr>
              <td style="padding:22px 24px;font-family:Arial,Helvetica,sans-serif;">
                ${greeting ? paragraph(greeting) : ""}
                <h1 style="margin:0 0 10px;font-size:20px;line-height:1.3;color:${COLORS.primary};">${escapeHtml(heading)}</h1>
                ${(paragraphs || []).map(paragraph).join("")}
                ${otpBlock}
                ${noteBlock}
                <p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:${COLORS.text};">Yuvadarpan team</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 24px;background:${COLORS.muted};border-top:1px solid ${COLORS.line};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${COLORS.mutedText};">
                ${escapeHtml(footer || "Do not reply to this email.")}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

module.exports = {
  COLORS,
  escapeHtml,
  renderEmail,
};
