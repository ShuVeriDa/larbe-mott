export interface WeeklyReportArgs {
  recipientName: string;
  newWordsCount: number;
  reviewedWordsCount: number;
  streakDays: number;
  appUrl: string;
}

export const buildWeeklyReportEmail = (args: WeeklyReportArgs) => {
  const subject = "Ваш еженедельный отчёт · Мотт Ларбе";

  const text = [
    `Здравствуйте, ${args.recipientName}!`,
    "",
    "Итоги вашей недели в Мотт Ларбе:",
    "",
    `  Новых слов изучено: ${args.newWordsCount}`,
    `  Слов повторено: ${args.reviewedWordsCount}`,
    args.streakDays > 0 ? `  Дней подряд: ${args.streakDays}` : "",
    "",
    "Продолжайте в том же духе!",
    args.appUrl,
    "",
    "— Команда Мотт Ларбе",
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  const streakRow =
    args.streakDays > 0
      ? `<tr><td style="padding:6px 0;color:#6b6a62">Дней подряд</td><td style="padding:6px 0;text-align:right;font-weight:600">${args.streakDays} 🔥</td></tr>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f5f4f0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18180f">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid rgba(0,0,0,.08);border-radius:12px;overflow:hidden">
    <div style="padding:18px 22px;border-bottom:1px solid rgba(0,0,0,.06)">
      <div style="font-size:13px;color:#6b6a62">Мотт Ларбе</div>
      <div style="font-size:18px;font-weight:600;margin-top:4px">Еженедельный отчёт</div>
    </div>
    <div style="padding:20px 22px">
      <div style="font-size:14px;margin-bottom:16px">Здравствуйте, ${escapeHtml(args.recipientName)}!</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr><td style="padding:6px 0;color:#6b6a62">Новых слов изучено</td><td style="padding:6px 0;text-align:right;font-weight:600">${args.newWordsCount}</td></tr>
        <tr><td style="padding:6px 0;color:#6b6a62">Слов повторено</td><td style="padding:6px 0;text-align:right;font-weight:600">${args.reviewedWordsCount}</td></tr>
        ${streakRow}
      </table>
      <div style="margin-top:20px">
        <a href="${escapeHtml(args.appUrl)}" style="display:inline-block;padding:10px 20px;background:#18180f;color:#ffffff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">Открыть приложение</a>
      </div>
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
