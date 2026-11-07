import { describe, expect, it, vi } from 'vitest';
import { MailService } from '../src/auth/mail.service.js';
import { ConfigService } from '@nestjs/config';

describe('MailService & Forgot Password', () => {
  it('instantiates correctly without SMTP configuration', () => {
    const config = new ConfigService({});
    const mailService = new MailService(config);
    expect(mailService.isConfigured()).toBe(false);
  });

  it('detects Resend API configuration', () => {
    const config = new ConfigService({
      RESEND_API_KEY: 're_test_key_123',
    });
    const mailService = new MailService(config);
    expect(mailService.isConfigured()).toBe(true);
  });

  it('detects SMTP configuration', () => {
    const config = new ConfigService({
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '587',
      SMTP_USER: 'test@example.com',
      SMTP_PASSWORD: 'app-password',
    });
    const mailService = new MailService(config);
    expect(mailService.isConfigured()).toBe(true);
  });

  it('throws descriptive error if sendCode called with no provider configured', async () => {
    const config = new ConfigService({});
    const mailService = new MailService(config);
    await expect(
      mailService.sendCode('user@example.com', '123456', 'reset'),
    ).rejects.toThrow('Email service is not configured');
  });
});
