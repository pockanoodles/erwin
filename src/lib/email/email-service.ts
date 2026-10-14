import { Resend } from "resend";

import { brand } from "@/lib/brand";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "EmailService";

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * The one place mail leaves the server (see DATAFLOW.md). Sending needs two
 * environment variables: `RESEND_API_KEY` and `EMAIL_FROM`, an address on a
 * domain the Resend account has verified. There is no default sender, so a
 * server that sets the key but not the address refuses to send.
 */
export class EmailService {
  /**
   * `<name> <address>` from `EMAIL_FROM`, or null when it is not set.
   * `RESEND_FROM_EMAIL`, the name this variable had before, is still read.
   */
  static sender(): string | null {
    const address = (
      process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL
    )?.trim();
    return address ? `${brand.name} <${address}>` : null;
  }

  static async sendEmail(emailData: EmailJobData): Promise<{ jobId: string }> {
    const { to, subject } = emailData;
    const apiKey = process.env.RESEND_API_KEY;
    const from = EmailService.sender();

    if (!apiKey) {
      const message =
        "Email is not configured: set RESEND_API_KEY and EMAIL_FROM to send mail";
      logger.error(message, { to, subject }, LOG_SOURCE);
      throw new Error(message);
    }
    if (!from) {
      const message =
        "RESEND_API_KEY is set but EMAIL_FROM is not: no email was sent. Set EMAIL_FROM to an address on a domain verified in Resend";
      logger.error(message, { to, subject }, LOG_SOURCE);
      throw new Error(message);
    }

    try {
      logger.info(`Sending email to ${to}`, { to, subject }, LOG_SOURCE);

      const { data, error } = await new Resend(apiKey).emails.send({
        from,
        to,
        subject,
        html: emailData.html,
        text: emailData.text,
      });

      if (error) {
        throw new Error(`Resend API error: ${error.message}`);
      }

      logger.info(
        `Email sent successfully to ${to}`,
        { to, subject, resendId: data?.id || null },
        LOG_SOURCE
      );

      return { jobId: data?.id || "" };
    } catch (error) {
      logger.error(
        "Failed to send email",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          to,
          subject,
        },
        LOG_SOURCE
      );
      throw error;
    }
  }
}
