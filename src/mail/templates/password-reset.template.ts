export type PasswordResetEmailLang = "ru" | "che" | "en" | "ar";

interface ResetTexts {
  subject: string;
  greeting: string;
  intro: string;
  cta: string;
  ctaFallback: string;
  expiry: (hours: number) => string;
  ignore: string;
  signature: string;
  dir: "ltr" | "rtl";
}

interface ChangedTexts {
  subject: string;
  greeting: string;
  body: string;
  hint: string;
  signature: string;
  dir: "ltr" | "rtl";
}

const RESET: Record<PasswordResetEmailLang, ResetTexts> = {
  ru: {
    subject: "Сброс пароля · Мотт Ларбе",
    greeting: "Здравствуйте,",
    intro:
      "Вы (или кто-то другой) запросили сброс пароля для вашего аккаунта в Мотт Ларбе.",
    cta: "Установить новый пароль",
    ctaFallback: "Если кнопка не работает, скопируйте ссылку в браузер:",
    expiry: (h) => `Ссылка действительна ${h} ч.`,
    ignore:
      "Если вы не запрашивали сброс — просто проигнорируйте это письмо, ваш пароль останется прежним.",
    signature: "— Команда Мотт Ларбе",
    dir: "ltr",
  },
  che: {
    subject: "Парольна хьалхара хьажар · Мотт Ларбе",
    greeting: "Дика хан,",
    intro:
      "Хьайн (я кхечо) Мотт Ларбе аккаунтан пароль хьалхара дехар динчу.",
    cta: "Керла пароль кхолла",
    ctaFallback: "Кнопка ца кхуьуш елахь, хьажар браузерехь чу деза:",
    expiry: (h) => `Хьажар ${h} сахьт ду бакъахь.`,
    ignore:
      "Нагахь сан хьажар ца дина хилахь — кху письма ца тӀеэцал, парол хийцалуш дац.",
    signature: "— Мотт Ларбе команда",
    dir: "ltr",
  },
  en: {
    subject: "Reset your password · Мотт Ларбе",
    greeting: "Hello,",
    intro:
      "Someone requested a password reset for your Мотт Ларбе account.",
    cta: "Set a new password",
    ctaFallback: "If the button doesn't work, copy this link into your browser:",
    expiry: (h) => `This link is valid for ${h} hours.`,
    ignore:
      "If you didn't request this — just ignore this email, your password will stay the same.",
    signature: "— The Мотт Ларбе team",
    dir: "ltr",
  },
  ar: {
    subject: "إعادة تعيين كلمة المرور · Мотт Ларбе",
    greeting: "مرحباً،",
    intro: "تم طلب إعادة تعيين كلمة المرور لحسابك في Мотт Ларбе.",
    cta: "تعيين كلمة مرور جديدة",
    ctaFallback: "إذا لم يعمل الزر، انسخ الرابط في المتصفح:",
    expiry: (h) => `الرابط صالح لمدة ${h} ساعة.`,
    ignore:
      "إذا لم تطلب ذلك، تجاهل هذه الرسالة وستبقى كلمة المرور كما هي.",
    signature: "— فريق Мотт Ларбе",
    dir: "rtl",
  },
};

const CHANGED: Record<PasswordResetEmailLang, ChangedTexts> = {
  ru: {
    subject: "Пароль изменён · Мотт Ларбе",
    greeting: "Здравствуйте,",
    body:
      "Пароль вашего аккаунта Мотт Ларбе был успешно изменён. Все активные сессии завершены — войдите снова, используя новый пароль.",
    hint: "Если это были не вы — немедленно свяжитесь с поддержкой и смените пароль.",
    signature: "— Команда Мотт Ларбе",
    dir: "ltr",
  },
  che: {
    subject: "Пароль хийцина · Мотт Ларбе",
    greeting: "Дика хан,",
    body:
      "Хьайн Мотт Ларбе аккаунтан пароль кхочушдина хийцина. Юьхьанца болу сессияш чекхбаьлла — керла пароль хӀоттабе юха.",
    hint: "Нагахь хьо вац хилахь — поддержка тӀелаца паргӀат.",
    signature: "— Мотт Ларбе команда",
    dir: "ltr",
  },
  en: {
    subject: "Password changed · Мотт Ларбе",
    greeting: "Hello,",
    body:
      "The password for your Мотт Ларбе account has been changed. All active sessions have been signed out — please sign in again with your new password.",
    hint: "If this wasn't you, contact support immediately.",
    signature: "— The Мотт Ларбе team",
    dir: "ltr",
  },
  ar: {
    subject: "تم تغيير كلمة المرور · Мотт Ларбе",
    greeting: "مرحباً،",
    body:
      "تم تغيير كلمة المرور لحسابك في Мотт Ларбе. تم إنهاء جميع الجلسات النشطة — يرجى تسجيل الدخول مجدداً بكلمة المرور الجديدة.",
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

export function buildPasswordResetEmail(args: {
  resetUrl: string;
  expiresAt: Date;
  lang: PasswordResetEmailLang;
}) {
  const t = RESET[args.lang] ?? RESET.ru;
  const hours = Math.max(
    1,
    Math.round((args.expiresAt.getTime() - Date.now()) / 3_600_000),
  );

  const safeUrl = escapeHtml(args.resetUrl);
  const html = wrapHtml({
    dir: t.dir,
    subject: t.subject,
    body: `
      <p style="font-size:14px;margin:0 0 12px;">${escapeHtml(t.greeting)}</p>
      <p style="font-size:14px;line-height:1.5;margin:0 0 20px;color:#3a3a32;">${escapeHtml(t.intro)}</p>
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
    t.intro,
    "",
    `${t.cta}: ${args.resetUrl}`,
    "",
    t.expiry(hours),
    t.ignore,
    "",
    t.signature,
  ].join("\n");

  return { subject: t.subject, html, text };
}

export function buildPasswordChangedEmail(args: {
  lang: PasswordResetEmailLang;
}) {
  const t = CHANGED[args.lang] ?? CHANGED.ru;
  const html = wrapHtml({
    dir: t.dir,
    subject: t.subject,
    body: `
      <p style="font-size:14px;margin:0 0 12px;">${escapeHtml(t.greeting)}</p>
      <p style="font-size:14px;line-height:1.5;margin:0 0 14px;color:#3a3a32;">${escapeHtml(t.body)}</p>
      <p style="font-size:12.5px;color:#6b6a62;margin:0 0 18px;">${escapeHtml(t.hint)}</p>
      <p style="font-size:12px;color:#a5a39a;margin:0;">${escapeHtml(t.signature)}</p>
    `,
  });

  const text = [t.greeting, "", t.body, "", t.hint, "", t.signature].join("\n");

  return { subject: t.subject, html, text };
}
