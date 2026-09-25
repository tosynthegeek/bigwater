// src/email/otp.ts
import { Resend } from "resend";

const resend = new Resend(Bun.env.RESEND_API_KEY);
const OTP_FROM = Bun.env.AUTH_EMAIL_FROM;

export async function sendOtpEmail(to: string, code: string) {
  await resend.emails.send({
    from: OTP_FROM,
    to,
    subject: "Your verification code",
    text: `Your verification code is ${code}. It expires in 5 minutes.`,
  });
}
