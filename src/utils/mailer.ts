import nodemailer from "nodemailer";

/**
 * Create transporter lazily so env vars are loaded by the time we send.
 */
let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    const host = (process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com").trim();
    const port = Number((process.env.BREVO_SMTP_PORT || "587").trim());
    const user = (process.env.BREVO_SMTP_USER || "").trim();
    const pass = (process.env.BREVO_SMTP_PASS || "").trim().replace(/^["']|["']$/g, ""); // strip quotes

    console.log(`[MAILER] Connecting to ${host}:${port} as ${user}`);

    _transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false, // allow self-signed certs
      },
    });
  }
  return _transporter;
}

/**
 * Send OTP verification email
 */
export const sendOTPEmail = async (
  to: string,
  otp: string,
  customerName?: string
): Promise<void> => {
  const name = customerName || "there";

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0; padding:0; background:#f4f4f7; font-family: 'Segoe UI', Arial, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width:440px; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #FF6B35, #F7931E); padding: 30px 32px; text-align:center;">
                  <div style="font-size: 32px; margin-bottom: 8px;">&#127E7;</div>
                  <h1 style="color: #ffffff; font-size: 22px; margin: 0; font-weight: 700;">Kidroo</h1>
                  <p style="color: rgba(255,255,255,0.85); font-size: 13px; margin: 4px 0 0;">Where Imagination Comes to Play</p>
                </td>
              </tr>
              
              <!-- Body -->
              <tr>
                <td style="padding: 32px 32px 24px;">
                  <h2 style="color: #1a1d2e; font-size: 20px; margin: 0 0 8px; font-weight: 700;">Verify Your Email</h2>
                  <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
                    Hi <strong>${name}</strong>, use the verification code below to complete your signup. This code expires in <strong>5 minutes</strong>.
                  </p>
                  
                  <!-- OTP Code -->
                  <div style="background: #f8f9fa; border: 2px dashed #e0e0e0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
                    <p style="color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px; font-weight: 600;">Your Verification Code</p>
                    <div style="font-size: 36px; font-weight: 800; color: #FF6B35; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</div>
                  </div>
                  
                  <p style="color: #999; font-size: 13px; line-height: 1.5; margin: 0;">
                    If you didn't request this code, please ignore this email. Your account is safe.
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background: #f8f9fa; padding: 20px 32px; text-align: center; border-top: 1px solid #eee;">
                  <p style="color: #aaa; font-size: 12px; margin: 0;">
                    &copy; ${new Date().getFullYear()} Kidroo Toys. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const senderEmail = (process.env.BREVO_SMTP_USER || "noreply@kidroo.com").trim();

  const mailOptions = {
    from: `"Kidroo" <${senderEmail}>`,
    to,
    subject: `${otp} is your Kidroo verification code`,
    html: htmlContent,
  };

  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail(mailOptions);
    console.log(`[MAILER] OTP sent to ${to} — messageId: ${info.messageId}`);
  } catch (error: any) {
    console.error(`[MAILER] FAILED to send to ${to}:`, error.message);
    console.error(`[MAILER] Full error:`, error);
    throw new Error("Failed to send verification email. Please try again.");
  }
};

export default getTransporter;
