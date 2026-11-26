import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import axios from 'axios';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;
  private from?: string;
  private resendApiKey?: string;
  private resendFrom?: string;
  private brevoApiKey?: string;
  private brevoFrom?: string;

  constructor(private readonly config: ConfigService) {
    // 1. Resend HTTP API (Port 443, works reliably on Render/Vercel free tiers)
    this.resendApiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    this.resendFrom =
      this.config.get<string>('RESEND_FROM')?.trim() ||
      this.config.get<string>('SMTP_FROM')?.trim();

    // 2. Brevo HTTP API (Port 443)
    this.brevoApiKey = this.config.get<string>('BREVO_API_KEY')?.trim();
    this.brevoFrom =
      this.config.get<string>('BREVO_FROM')?.trim() ||
      this.config.get<string>('SMTP_FROM')?.trim();

    // 3. Traditional SMTP (Nodemailer)
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const rawPort = this.config.get<string | number>('SMTP_PORT', 587);
    const port = Number(rawPort) || 587;
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const password = this.config.get<string>('SMTP_PASSWORD')?.trim();

    if (host && user && password) {
      this.from = this.config.get<string>('SMTP_FROM')?.trim() || user;
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass: password },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 10000,
        tls: {
          rejectUnauthorized: false,
        },
      });
    }
  }

  isConfigured(): boolean {
    return Boolean(
      this.resendApiKey ||
      this.brevoApiKey ||
      (this.transporter && this.from)
    );
  }

  getDiagnostics(): Record<string, unknown> {
    return {
      brevoConfigured: Boolean(this.brevoApiKey),
      brevoKeyPrefix: this.brevoApiKey
        ? `${this.brevoApiKey.slice(0, 10)}...`
        : null,
      brevoKeyType: this.brevoApiKey
        ? this.brevoApiKey.startsWith('xkeysib-')
          ? 'VALID_REST_API_KEY'
          : this.brevoApiKey.startsWith('xsmtpsib-')
          ? 'INVALID_SMTP_KEY_NEEDS_XKEYSIB'
          : 'UNKNOWN'
        : 'NOT_SET',
      brevoFrom:
        this.brevoFrom ||
        'NOT_SET (defaults to unverified noreply@dairydesk.in)',
      resendConfigured: Boolean(this.resendApiKey),
      smtpConfigured: Boolean(this.transporter && this.from),
    };
  }

  async sendCode(
    email: string,
    code: string,
    purpose: 'verify' | 'reset',
  ): Promise<void> {
    const isVerify = purpose === 'verify';
    const subject = isVerify
      ? `Dairy Desk - Verification Code: ${code}`
      : `Dairy Desk - Password Reset Code: ${code}`;
    const heading = isVerify
      ? 'Verify your email address'
      : 'Reset your password';
    const guHeading = isVerify
      ? 'તમારું ઇમેઇલ વેરિફાય કરો'
      : 'પાસવર્ડ રીસેટ કરો';

    const text = `${heading} (${guHeading})\n\nYour Dairy Desk verification code is ${code}.\nThis code is valid for 15 minutes.\nDo not share this code with anyone.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #166534; font-size: 24px; font-weight: 800; margin: 0;">Dairy Desk</h1>
          <p style="color: #64748b; font-size: 13px; margin-top: 4px;">Smart Dairy Milk Management</p>
        </div>
        <h2 style="color: #0f172a; font-size: 18px; font-weight: 700; margin-bottom: 4px;">${heading}</h2>
        <p style="color: #166534; font-size: 14px; font-weight: 600; margin-bottom: 16px;">${guHeading}</p>
        <p style="color: #475569; font-size: 14px; margin-bottom: 20px; line-height: 1.5;">
          ${isVerify 
            ? 'Use the verification code below to verify your email address and activate your Dairy Desk account. This code is valid for 15 minutes.' 
            : 'We received a request to reset your password. Use the verification code below to proceed. This code is valid for 15 minutes.'}
        </p>
        <div style="background-color: #f0fdf4; border: 2px dashed #86efac; border-radius: 10px; padding: 18px; text-align: center; margin-bottom: 20px;">
          <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #166534; font-family: monospace;">${code}</span>
        </div>
        <p style="color: #64748b; font-size: 12px; margin-bottom: 8px;">If you did not request this verification code, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">Dairy Desk &copy; ${new Date().getFullYear()} &bull; Dairy Management System</p>
      </div>
    `.trim();

    // Always log code in server logs for visibility & debugging
    this.logger.log(`[AUTH] Generated ${purpose} verification code for ${email}: ${code}`);

    // Try 1: Resend HTTP API (Port 443)
    if (this.resendApiKey) {
      try {
        await axios.post(
          'https://api.resend.com/emails',
          {
            from: this.resendFrom || 'Dairy Desk <onboarding@resend.dev>',
            to: [email],
            subject,
            text,
            html,
          },
          {
            headers: {
              Authorization: `Bearer ${this.resendApiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          },
        );
        this.logger.log(`Sent ${purpose} email to ${email} via Resend HTTP API`);
        return;
      } catch (err: any) {
        this.logger.warn(`Resend HTTP API failed: ${err?.response?.data?.message || err?.message}`);
        // Fall through to SMTP if configured
      }
    }

    // Try 2: Brevo HTTP API (Port 443)
    if (this.brevoApiKey) {
      try {
        const response = await axios.post(
          'https://api.brevo.com/v3/smtp/email',
          {
            sender: {
              email: this.brevoFrom || 'milk.agent.go@gmail.com',
              name: 'Dairy Desk',
            },
            to: [{ email }],
            subject,
            textContent: text,
            htmlContent: html,
          },
          {
            headers: {
              'api-key': this.brevoApiKey,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          },
        );
        this.logger.log(`Sent ${purpose} email to ${email} via Brevo HTTP API (status: ${response.status})`);
        return;
      } catch (err: any) {
        this.logger.warn(`Brevo HTTP API failed: ${err?.response?.data?.message || err?.message}`);
        // Avoid hanging on blocked SMTP ports in cloud environments
        return;
      }
    }

    // Try 3: Traditional SMTP (Nodemailer)
    if (this.transporter && this.from) {
      try {
        await this.transporter.sendMail({
          from: this.from,
          to: email,
          subject,
          text,
          html,
        });
        this.logger.log(`Sent ${purpose} email to ${email} via SMTP`);
        return;
      } catch (err: any) {
        this.logger.error(
          `SMTP sending failed to ${email}: ${err?.message || err}. Note: Render free tier blocks outbound SMTP ports 25, 465, 587. For cloud email delivery, set RESEND_API_KEY (resend.com) or BREVO_API_KEY (brevo.com) in Render environment variables.`,
        );
        throw err;
      }
    }

    // If no provider configured or all failed
    throw new Error(
      'Email service is not configured. Set RESEND_API_KEY, BREVO_API_KEY, or SMTP credentials in backend environment.',
    );
  }
}
