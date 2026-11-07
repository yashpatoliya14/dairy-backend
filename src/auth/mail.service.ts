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

  async sendCode(
    email: string,
    code: string,
    purpose: 'verify' | 'reset',
  ): Promise<void> {
    const subject =
      purpose === 'verify'
        ? 'Verify your Dairy Desk email'
        : 'Reset your Dairy Desk password';
    const heading =
      purpose === 'verify'
        ? 'Verify your email address'
        : 'Reset your password';

    const text = `${heading}\n\nYour Dairy Desk verification code is ${code}.\nIt expires in 15 minutes.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; rounded: 12px; background: #ffffff;">
        <h2 style="color: #192342; font-size: 20px; font-weight: bold; margin-bottom: 8px;">${heading}</h2>
        <p style="color: #475569; font-size: 14px; margin-bottom: 20px;">Use the verification code below to complete your request. This code will expire in 15 minutes.</p>
        <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 20px;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #4768E8;">${code}</span>
        </div>
        <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">If you did not request this code, you can safely ignore this email.</p>
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
        await axios.post(
          'https://api.brevo.com/v3/smtp/email',
          {
            sender: {
              email: this.brevoFrom || 'noreply@dairydesk.in',
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
        this.logger.log(`Sent ${purpose} email to ${email} via Brevo HTTP API`);
        return;
      } catch (err: any) {
        this.logger.warn(`Brevo HTTP API failed: ${err?.response?.data?.message || err?.message}`);
        // Fall through to SMTP if configured
      }
    }

    // Try 3: Traditional SMTP (Nodemailer)
    if (this.transporter && this.from) {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject,
        text,
        html,
      });
      this.logger.log(`Sent ${purpose} email to ${email} via SMTP`);
      return;
    }

    // If no provider configured or all failed
    throw new Error(
      'Email service is not configured. Set RESEND_API_KEY, BREVO_API_KEY, or SMTP credentials in backend environment.',
    );
  }
}
