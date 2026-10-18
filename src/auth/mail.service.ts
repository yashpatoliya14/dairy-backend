import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;
  private from?: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    const port = this.config.get<number>('SMTP_PORT', 587);
    const user = this.config.get<string>('SMTP_USER');
    const password = this.config.get<string>('SMTP_PASSWORD');
    if (host && user && password) {
      this.from = this.config.get<string>('SMTP_FROM', user);
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass: password },
      });
    }
  }

  async sendCode(
    email: string,
    code: string,
    purpose: 'verify' | 'reset',
  ): Promise<void> {
    if (!this.transporter || !this.from) {
      throw new Error(
        'Email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM.',
      );
    }
    const subject =
      purpose === 'verify'
        ? 'Verify your Dairy Desk email'
        : 'Reset your Dairy Desk password';
    const heading =
      purpose === 'verify'
        ? 'Verify your email address'
        : 'Reset your password';
    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject,
      text: `${heading}\n\nYour Dairy Desk verification code is ${code}.\nIt expires in 15 minutes.`,
      html: `<p>${heading}</p><p>Your Dairy Desk verification code is <strong>${code}</strong>.</p><p>It expires in 15 minutes.</p>`,
    });
    this.logger.log(`Sent ${purpose} email to ${email}`);
  }
}
