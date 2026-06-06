export interface RepeatReminderArgs {
  recipientName: string;
  dueCount: number;
  appUrl: string;
}

export const buildRepeatReminderEmail = (args: RepeatReminderArgs) => {
  const reviewUrl = `${args.appUrl}/dashboard`;
  const wordLabel =
    args.dueCount === 1
      ? "слово ждёт повторения"
      : args.dueCount < 5
        ? "слова ждут повторения"
        : "слов ждут повторения";

  const subject = `Пора повторить слова · ${args.dueCount} ${wordLabel}`;

  const text = [
    `Здравствуйте, ${args.recipientName}!`,
    "",
    `Сегодня у вас ${args.dueCount} ${wordLabel}.`,
    "",
    "Откройте приложение, чтобы не потерять прогресс:",
    reviewUrl,
    "",
    "— Команда Мотт Ларбе",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f5f4f0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18180f">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid rgba(0,0,0,.08);border-radius:12px;overflow:hidden">
    <div style="padding:18px 22px;border-bottom:1px solid rgba(0,0,0,.06)">
      <div style="font-size:13px;color:#6b6a62">Мотт Ларбе</div>
      <div style="font-size:18px;font-weight:600;margin-top:4px">Пора повторить слова</div>
    </div>
    <div style="padding:20px 22px">
      <div style="font-size:14px;margin-bottom:16px">Здравствуйте, ${escapeHtml(args.recipientName)}!</div>
      <div style="font-size:32px;font-weight:700;color:#18180f;margin-bottom:4px">${args.dueCount}</div>
      <div style="font-size:14px;color:#6b6a62;margin-bottom:20px">${wordLabel}</div>
      <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;padding:10px 20px;background:#18180f;color:#ffffff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">Повторить сейчас</a>
    </div>
    <div style="padding:14px 22px;border-top:1px solid rgba(0,0,0,.06);font-size:12px;color:#6b6a62">
      — Команда Мотт Ларбе
    </div>
  </div>
</body></html>`;

  return { subject, html, text };
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
