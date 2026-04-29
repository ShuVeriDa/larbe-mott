export type EmailChangeLang = "ru" | "che" | "en" | "ar";

interface ConfirmTexts {
  subject: string;
  greeting: string;
  intro: (newEmail: string) => string;
  cta: string;
  ctaFallback: string;
  expiry: (hours: number) => string;
  ignore: string;
  signature: string;
  dir: "ltr" | "rtl";
}

interface NoticeTexts {
  subject: string;
  greeting: string;
  body: (newEmail: string) => string;
  hint: string;
  signature: string;
  dir: "ltr" | "rtl";
}

const CONFIRM: Record<EmailChangeLang, ConfirmTexts> = {
  ru: {
    subject: "Подтвердите новый email · Мотт Ларбе",
    greeting: "Здравствуйте,",
    intro: (e) =>
      `Вы запросили изменение email-адреса вашего аккаунта Мотт Ларбе на ${e}. Подтвердите, что этот ящик ваш.`,
    cta: "Подтвердить email",
    ctaFallback: "Если кнопка не работает, скопируйте ссылку в браузер:",
    expiry: (h) => `Ссылка действительна ${h} ч.`,
    ignore:
      "Если вы не запрашивали смену email — просто проигнорируйте это письмо.",
    signature: "— Команда Мотт Ларбе",
    dir: "ltr",
  },
  che: {
    subject: "Керла email тӀечӀагӀа · Мотт Ларбе",
    greeting: "Дика хан,",
    intro: (e) =>
      `Хьайн Мотт Ларбе аккаунтан email ${e}-чу хийца дехар динчу. ХӀара ящик хьан хилар тӀечӀагӀа.`,
    cta: "Email тӀечӀагӀа",
    ctaFallback: "Кнопка ца кхуьуш елахь, хьажар браузерехь чу деза:",
    expiry: (h) => `Хьажар ${h} сахьт ду бакъахь.`,
    ignore: "Нагахь сан дехар ца дина хилахь — кху письма ца тӀеэцал.",
    signature: "— Мотт Ларбе команда",
    dir: "ltr",
  },
  en: {
    subject: "Confirm your new email · Мотт Ларбе",
    greeting: "Hello,",
    intro: (e) =>
      `You requested to change your Мотт Ларбе account email to ${e}. Please confirm this mailbox is yours.`,
    cta: "Confirm email",
    ctaFallback: "If the button doesn't work, copy this link into your browser:",
    expiry: (h) => `This link is valid for ${h} hours.`,
    ignore: "If you didn't request this change — just ignore this email.",
    signature: "— The Мотт Ларбе team",
    dir: "ltr",
  },
  ar: {
    subject: "تأكيد البريد الإلكتروني الجديد · Мотт Ларбе",
    greeting: "مرحباً،",
    intro: (e) =>
      `لقد طلبت تغيير البريد الإلكتروني لحسابك في Мотт Ларбе إلى ${e}. يرجى تأكيد أن هذا الصندوق لك.`,
    cta: "تأكيد البريد",
    ctaFallback: "إذا لم يعمل الزر، انسخ الرابط في المتصفح:",
    expiry: (h) => `الرابط صالح لمدة ${h} ساعة.`,
    ignore: "إذا لم تطلب ذلك، تجاهل هذه الرسالة.",
    signature: "— فريق Мотт Ларбе",
    dir: "rtl",
  },
};

const NOTICE: Record<EmailChangeLang, NoticeTexts> = {
  ru: {
    subject: "Email аккаунта изменён · Мотт Ларбе",
    greeting: "Здравствуйте,",
    body: (e) =>
      `Email вашего аккаунта Мотт Ларбе был изменён на ${e}. Все активные сессии завершены — войдите снова, используя новый email.`,
    hint: "Если это были не вы — немедленно свяжитесь с поддержкой.",
    signature: "— Команда Мотт Ларбе",
    dir: "ltr",
  },
  che: {
    subject: "Аккаунтан email хийцина · Мотт Ларбе",
    greeting: "Дика хан,",
    body: (e) =>
      `Хьайн Мотт Ларбе аккаунтан email хийцина ${e}-чу. Юьхьанца болу сессияш чекхбаьлла — керла email хӀоттабе юха.`,
    hint: "Нагахь хьо вац хилахь — поддержка тӀелаца паргӀат.",
    signature: "— Мотт Ларбе команда",
    dir: "ltr",
  },
  en: {
    subject: "Account email changed · Мотт Ларбе",
    greeting: "Hello,",
    body: (e) =>
      `The email for your Мотт Ларбе account has been changed to ${e}. All active sessions have been signed out — please sign in again with your new email.`,
    hint: "If this wasn't you, contact support immediately.",
    signature: "— The Мотт Ларбе team",
    dir: "ltr",
  },
  ar: {
    subject: "تم تغيير بريد الحساب · Мотт Ларбе",
    greeting: "مرحباً،",
    body: (e) =>
      `تم تغيير البريد الإلكتروني لحسابك في Мотт Ларбе إلى ${e}. تم إنهاء جميع الجلسات النشطة — يرجى تسجيل الدخول مجدداً.`,
    hint: "إذا لم تكن أنت، تواصل مع الدعم فوراً.",
    signature: "— فريق Мотт Ларбе",
    dir: "rtl",
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapHtml(args: { dir: "ltr" | "rtl"; subject: string; body: string }) {
  return `<!doctype html>
<html dir="${args.dir}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(args.subject)}</title>
</head>
<body style="margin:0;padding:24px;background:#f5f4f0;font-family:'Golos Text',Arial,sans-serif;color:#18180f;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;padding:28px 24px;box-shadow:0 1px 3px rgba(0,0,0,0.07);">
    ${args.body}
  </div>
</body>
</html>`;
}

export function buildEmailChangeConfirmEmail(args: {
  newEmail: string;
  confirmUrl: string;
  expiresAt: Date;
  lang: EmailChangeLang;
}) {
  const t = CONFIRM[args.lang] ?? CONFIRM.ru;
  const hours = Math.max(
    1,
    Math.round((args.expiresAt.getTime() - Date.now()) / 3_600_000),
  );
  const safeUrl = escapeHtml(args.confirmUrl);
  const html = wrapHtml({
    dir: t.dir,
    subject: t.subject,
    body: `
      <p style="font-size:14px;margin:0 0 12px;">${escapeHtml(t.greeting)}</p>
      <p style="font-size:14px;line-height:1.5;margin:0 0 20px;color:#3a3a32;">${escapeHtml(t.intro(args.newEmail))}</p>
      <p style="margin:0 0 22px;">
        <a href="${safeUrl}" style="display:inline-block;padding:11px 20px;background:#2254d3;color:#fff;text-decoration:none;border-radius:7px;font-weight:600;font-size:14px;">${escapeHtml(t.cta)}</a>
      </p>
      <p style="font-size:12.5px;color:#6b6a62;margin:0 0 6px;">${escapeHtml(t.ctaFallback)}</p>
      <p style="font-size:12px;color:#2254d3;word-break:break-all;margin:0 0 18px;"><a href="${safeUrl}" style="color:#2254d3;">${safeUrl}</a></p>
      <p style="font-size:12px;color:#a5a39a;margin:0 0 6px;">${escapeHtml(t.expiry(hours))}</p>
      <p style="font-size:12px;color:#a5a39a;margin:0 0 18px;">${escapeHtml(t.ignore)}</p>
      <p style="font-size:12px;color:#a5a39a;margin:0;">${escapeHtml(t.signature)}</p>
    `,
  });

  const text = [
    t.greeting,
    "",
    t.intro(args.newEmail),
    "",
    `${t.cta}: ${args.confirmUrl}`,
    "",
    t.expiry(hours),
    t.ignore,
    "",
    t.signature,
  ].join("\n");

  return { subject: t.subject, html, text };
}

export function buildEmailChangedNoticeEmail(args: {
  newEmail: string;
  lang: EmailChangeLang;
}) {
  const t = NOTICE[args.lang] ?? NOTICE.ru;
  const html = wrapHtml({
    dir: t.dir,
    subject: t.subject,
    body: `
      <p style="font-size:14px;margin:0 0 12px;">${escapeHtml(t.greeting)}</p>
      <p style="font-size:14px;line-height:1.5;margin:0 0 14px;color:#3a3a32;">${escapeHtml(t.body(args.newEmail))}</p>
      <p style="font-size:12.5px;color:#6b6a62;margin:0 0 18px;">${escapeHtml(t.hint)}</p>
      <p style="font-size:12px;color:#a5a39a;margin:0;">${escapeHtml(t.signature)}</p>
    `,
  });

  const text = [t.greeting, "", t.body(args.newEmail), "", t.hint, "", t.signature].join("\n");

  return { subject: t.subject, html, text };
}
