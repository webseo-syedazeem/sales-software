import nodemailer from "nodemailer";

export interface EmailDispatchResult {
  status: "Delivered (SMTP)" | "Failed (SMTP Error)" | "Not Sent (SMTP Unconfigured)";
  detail: string;
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

export async function sendEnterpriseEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<EmailDispatchResult> {
  if (!isSmtpConfigured()) {
    return {
      status: "Not Sent (SMTP Unconfigured)",
      detail: "Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM in Vercel Environment Variables to enable live email delivery.",
    };
  }

  try {
    const port = Number(process.env.SMTP_PORT || 587);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST!.trim(),
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER!.trim(),
        pass: process.env.SMTP_PASS!.trim(),
      },
    });

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM?.trim() || process.env.SMTP_USER!.trim(),
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });

    return {
      status: "Delivered (SMTP)",
      detail: `Message ID: ${info.messageId}`,
    };
  } catch (err) {
    return {
      status: "Failed (SMTP Error)",
      detail: err instanceof Error ? err.message : "SMTP transport failure",
    };
  }
}
