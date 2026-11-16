/** Branded HTML + plain-text for the 6-digit auth verification email. */

const FOREST = "#102c25";
const FOREST_DEEP = "#0b1f1a";
const CREAM = "#fbf6f3";
const MUTED = "#6b7a74";
const LINE = "#E4DDD2";

/** Match platform fonts from layout.tsx / globals.css */
const FONT_SANS =
  "'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const VERIFICATION_LOGO_CID = "realora-logo";

export function verificationCodeEmail(code: string): {
  subject: string;
  text: string;
  html: string;
} {
  const digits = code.replace(/\D/g, "").padStart(6, "0").slice(0, 6);

  const digitCells = digits
    .split("")
    .map(
      (d) => `
        <td align="center" valign="middle" style="width:40px;height:48px;border:1px solid ${LINE};border-radius:12px;background:#ffffff;font-family:${FONT_SANS};font-size:22px;font-weight:700;letter-spacing:0.04em;color:${FOREST};">
          ${d}
        </td>`,
    )
    .join(`
        <td style="width:8px;font-size:0;line-height:0;">&nbsp;</td>`);

  const subject = `Your Realora code is ${digits}`;
  const text = [
    "REALORA",
    "",
    `Your verification code is ${digits}.`,
    "",
    "It expires in 10 minutes.",
    "",
    "If this wasn't you, someone may have access to your account. Change your password now and contact support@realora.com.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${subject}</title>
  <!--[if !mso]><!-->
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
  <!--<![endif]-->
  <style type="text/css">
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap');
  </style>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border:1px solid ${LINE};border-radius:24px;overflow:hidden;">
          <tr>
            <td align="center" style="background:${FOREST_DEEP};padding:24px 32px;text-align:center;">
              <img src="cid:${VERIFICATION_LOGO_CID}" width="150" height="33" alt="Realora" style="display:inline-block;margin:0 auto;border:0;outline:none;text-decoration:none;height:auto;max-width:150px;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;font-family:${FONT_SANS};font-size:28px;line-height:1.15;font-weight:600;color:${FOREST};">
                Confirm it&apos;s you
              </p>
              <p style="margin:0 0 28px;font-family:${FONT_SANS};font-size:15px;line-height:1.55;color:${MUTED};">
                Use this code to finish signing in to Realora. It expires in 10 minutes.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                <tr>
                  ${digitCells}
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 28px;border-top:1px solid ${LINE};">
              <p style="margin:0;font-family:${FONT_SANS};font-size:12px;line-height:1.5;color:${MUTED};">
                If this wasn&apos;t you, someone may have access to your account. Change your password now and contact <a href="mailto:support@realora.com" style="color:${FOREST};text-decoration:underline;">support@realora.com</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
