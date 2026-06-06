export interface NewTextsEmailText {
  title: string;
  url: string;
}

export interface NewTextsArgs {
  recipientName: string;
  texts: NewTextsEmailText[];
  appUrl: string;
}

export const buildNewTextsEmail = (args: NewTextsArgs) => {
  const count = args.texts.length;
  const countLabel =
    count === 1 ? "новый текст" : count < 5 ? "новых текста" : "новых текстов";

  const subject = `${count} ${countLabel} на вашем уровне · Мотт Ларбе`;

  const textLines = args.texts.map((t) => `  • ${t.title}\n    ${t.url}`);

  const text = [
    `Здравствуйте, ${args.recipientName}!`,
    "",
    `В библиотеке появилось ${count} ${countLabel} на вашем уровне:`,
    "",
    ...textLines,
    "",
    "Приятного чтения!",
    args.appUrl,
    "",
    "— Команда Мотт Ларбе",
  ].join("\n");

  const textRows = args.texts
    .map(
      (t) =>
        `<tr><td style="padding:6px 0"><a href="${escapeHtml(t.url)}" style="color:#18180f;font-weight:500;text-decoration:none">${escapeHtml(t.title)}</a></td></tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f5f4f0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18180f">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid rgba(0,0,0,.08);border-radius:12px;overflow:hidden">
    <div style="padding:18px 22px;border-bottom:1px solid rgba(0,0,0,.06)">
      <div style="font-size:13px;color:#6b6a62">Мотт Ларбе</div>
      <div style="font-size:18px;font-weight:600;margin-top:4px">Новые тексты в библиотеке</div>
    </div>
    <div style="padding:20px 22px">
      <div style="font-size:14px;margin-bottom:16px">Здравствуйте, ${escapeHtml(args.recipientName)}! В библиотеке появилось ${count} ${countLabel} на вашем уровне:</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        ${textRows}
      </table>
      <div style="margin-top:20px">
        <a href="${escapeHtml(args.appUrl)}" style="display:inline-block;padding:10px 20px;background:#18180f;color:#ffffff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">Перейти в библиотеку</a>
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
