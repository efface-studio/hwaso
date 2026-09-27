import { Global, Injectable, Logger, Module } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** 개발: Mailpit(SMTP 1025, 웹 8025), 운영: SMTP_URL. 설정이 없으면 로그로만 남긴다 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null = env().SMTP_URL
    ? nodemailer.createTransport(env().SMTP_URL)
    : null;

  async send(msg: MailMessage): Promise<void> {
    if (!this.transport) {
      this.logger.warn(`SMTP 미설정 — 메일 미발송: ${msg.subject}`);
      return;
    }
    await this.transport.sendMail({
      from: env().MAIL_FROM,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
    });
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
