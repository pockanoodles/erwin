/**
 * The sender is configuration, never a default. A server with a Resend key but
 * no EMAIL_FROM must log an error and send nothing.
 */

const send = jest.fn().mockResolvedValue({ data: { id: "msg_1" }, error: null });

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
}));

jest.mock("@/lib/logger", () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from "@/lib/logger";

import { EmailService } from "../email/email-service";

const message = { to: "a@example.com", subject: "Hi", html: "<p>Hi</p>" };

describe("EmailService", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    delete process.env.RESEND_FROM_EMAIL;
  });

  afterAll(() => {
    process.env = saved;
  });

  it("logs an error and sends nothing when the key is set without EMAIL_FROM", async () => {
    process.env.RESEND_API_KEY = "re_test";

    await expect(EmailService.sendEmail(message)).rejects.toThrow("EMAIL_FROM");

    expect(send).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("EMAIL_FROM"),
      expect.anything(),
      "EmailService"
    );
  });

  it("sends nothing when no key is set", async () => {
    process.env.EMAIL_FROM = "hello@example.com";

    await expect(EmailService.sendEmail(message)).rejects.toThrow("RESEND_API_KEY");

    expect(send).not.toHaveBeenCalled();
  });

  it("sends as the brand name from EMAIL_FROM", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "hello@example.com";

    await expect(EmailService.sendEmail(message)).resolves.toEqual({ jobId: "msg_1" });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ from: "Sigwald <hello@example.com>", to: "a@example.com" })
    );
  });

  it("still reads the old RESEND_FROM_EMAIL name", () => {
    process.env.RESEND_FROM_EMAIL = "old@example.com";

    expect(EmailService.sender()).toBe("Sigwald <old@example.com>");
  });
});
