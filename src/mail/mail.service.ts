import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import axios, { AxiosError } from "axios";
import type { Logger as WinstonLogger } from "winston";

import {
  PasswordResetEmailLang,
  buildPasswordChangedEmail,
  buildPasswordResetEmail,
} from "./templates/password-reset.template";
import {
  EmailChangeLang,
  buildEmailChangeConfirmEmail,
  buildEmailChangedNoticeEmail,
} from "./templates/email-change.template";
import {
  PaymentReceiptArgs,
  buildPaymentReceiptEmail,
} from "./templates/payment-receipt.template";

export interface SendMailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class MailService {
  private readonly fallbackLogger = new Logger(MailService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger,
  ) {}

  async sendPasswordResetEmail(args: {
    to: string;
    resetUrl: string;
    expiresAt: Date;
    lang: PasswordResetEmailLang;
  }) {
    const { subject, html, text } = buildPasswordResetEmail(args);
    await this.send({ to: args.to, subject, html, text });
  }

  async sendPasswordChangedEmail(args: {
    to: string;
    lang: PasswordResetEmailLang;
  }) {
    const { subject, html, text } = buildPasswordChangedEmail({ lang: args.lang });
    await this.send({ to: args.to, subject, html, text });
  }

  async sendEmailChangeConfirmEmail(args: {
    to: string;
    newEmail: string;
    confirmUrl: string;
    expiresAt: Date;
    lang: EmailChangeLang;
  }) {
    const { subject, html, text } = buildEmailChangeConfirmEmail(args);
    await this.send({ to: args.to, subject, html, text });
  }

  async sendEmailChangedNoticeEmail(args: {
    to: string;
    newEmail: string;
    lang: EmailChangeLang;
  }) {
    const { subject, html, text } = buildEmailChangedNoticeEmail({
      newEmail: args.newEmail,
      lang: args.lang,
    });
    await this.send({ to: args.to, subject, html, text });
  }

  async sendPaymentReceiptEmail(args: PaymentReceiptArgs & { to: string }) {
    const { subject, html, text } = buildPaymentReceiptEmail(args);
    await this.send({ to: args.to, subject, html, text });
  }

  private async send(params: SendMailParams) {
    const provider = this.config.get<string>("MAIL_PROVIDER") ?? "log";

    if (provider === "resend") {
      await this.sendViaResend(params);
      return;
    }

    // log-режим: ничего не отправляем, только пишем в журнал — удобно для dev/CI.
    this.logger.info("[mail:log] outgoing email skipped (MAIL_PROVIDER=log)", {
      to: params.to,
      subject: params.subject,
      preview: params.text.slice(0, 200),
    });
  }

  private async sendViaResend(params: SendMailParams) {
    const apiKey = this.config.getOrThrow<string>("RESEND_API_KEY");
    const from = this.config.getOrThrow<string>("MAIL_FROM");
    const replyTo = this.config.get<string>("MAIL_REPLY_TO") || undefined;

    try {
      await axios.post(
        "https://api.resend.com/emails",
        {
          from,
          to: [params.to],
          subject: params.subject,
          html: params.html,
          text: params.text,
          ...(replyTo ? { reply_to: replyTo } : {}),
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 10_000,
        },
      );
    } catch (e) {
      const err = e as AxiosError;
      // Не пробрасываем наружу — иначе по поведению ответа можно энумерировать email-ы.
      // Логируем и тихо выходим, фронту всегда отвечаем 200.
      const log = this.logger ?? this.fallbackLogger;
      const data = err.response?.data;
      const message = err.message;
      const status = err.response?.status;
      if ("error" in (log as object)) {
        (log as WinstonLogger).error("[mail:resend] send failed", {
          to: params.to,
          subject: params.subject,
          status,
          message,
          data,
        });
      } else {
        this.fallbackLogger.error(
          `[mail:resend] send failed to=${params.to} status=${status} msg=${message}`,
        );
      }
    }
  }
}
