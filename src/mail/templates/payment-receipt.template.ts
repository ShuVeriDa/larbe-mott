export interface PaymentReceiptArgs {
  recipientName: string;
  email: string;
  paymentId: string;
  providerPaymentId?: string | null;
  provider: string;
  status: "SUCCEEDED" | "REFUNDED" | "FAILED" | "PENDING" | string;
  planName?: string | null;
  planCode?: string | null;
  period?: string | null;
  amountCents: number;
  refundedCents: number;
  currency: string;
  paidAt: Date;
}

const STATUS_LABEL: Record<string, string> = {
  SUCCEEDED: "Оплачен",
  REFUNDED: "Возврат",
  FAILED: "Сбой",
  PENDING: "Ожидание",
};

const fmtAmount = (cents: number, currency: string) => {
  const value = (cents / 100).toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const sym =
    currency === "RUB" ? "₽" : currency === "USD" ? "$" : currency === "EUR" ? "€" : currency;
  return `${value} ${sym}`;
};

const fmtDate = (d: Date) =>
  d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function buildPaymentReceiptEmail(args: PaymentReceiptArgs) {
  const subject = `Чек по платежу · ${fmtAmount(args.amountCents, args.currency)} · Мотт Ларбе`;
  const statusLabel = STATUS_LABEL[args.status] ?? args.status;
  const netCents = args.amountCents - args.refundedCents;
  const planLine = args.planName
    ? `${args.planName}${args.period ? ` · ${args.period}` : ""}`
    : args.planCode ?? "—";

  const text = [
    `Здравствуйте, ${args.recipientName}!`,
    "",
    "Это чек по вашему платежу в Мотт Ларбе.",
    "",
    `ID транзакции: ${args.providerPaymentId ?? args.paymentId}`,
    `Дата: ${fmtDate(args.paidAt)}`,
    `Тариф: ${planLine}`,
    `Провайдер: ${args.provider}`,
    `Статус: ${statusLabel}`,
    `Сумма: ${fmtAmount(args.amountCents, args.currency)}`,
    args.refundedCents > 0
      ? `Возвращено: ${fmtAmount(args.refundedCents, args.currency)}`
      : "",
    args.refundedCents > 0
      ? `Итого к зачислению: ${fmtAmount(netCents, args.currency)}`
      : "",
    "",
    "— Команда Мотт Ларбе",
  ]
    .filter(Boolean)
    .join("\n");

  const refundRow =
    args.refundedCents > 0
      ? `<tr><td style="padding:6px 0;color:#6b6a62">Возвращено</td><td style="padding:6px 0;text-align:right;color:#991b1b;font-weight:600">−${fmtAmount(args.refundedCents, args.currency)}</td></tr>
         <tr><td style="padding:6px 0;color:#6b6a62">Итого</td><td style="padding:6px 0;text-align:right;font-weight:700">${fmtAmount(netCents, args.currency)}</td></tr>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f5f4f0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18180f">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid rgba(0,0,0,.08);border-radius:12px;overflow:hidden">
    <div style="padding:18px 22px;border-bottom:1px solid rgba(0,0,0,.06)">
      <div style="font-size:13px;color:#6b6a62">Мотт Ларбе</div>
      <div style="font-size:18px;font-weight:600;margin-top:4px">Чек по платежу</div>
    </div>
    <div style="padding:18px 22px">
      <div style="font-size:14px;margin-bottom:12px">Здравствуйте, ${escapeHtml(args.recipientName)}!</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr><td style="padding:6px 0;color:#6b6a62">ID транзакции</td><td style="padding:6px 0;text-align:right;font-family:Courier New,monospace">${escapeHtml(args.providerPaymentId ?? args.paymentId)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b6a62">Дата</td><td style="padding:6px 0;text-align:right">${escapeHtml(fmtDate(args.paidAt))}</td></tr>
        <tr><td style="padding:6px 0;color:#6b6a62">Тариф</td><td style="padding:6px 0;text-align:right">${escapeHtml(planLine)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b6a62">Провайдер</td><td style="padding:6px 0;text-align:right">${escapeHtml(args.provider)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b6a62">Статус</td><td style="padding:6px 0;text-align:right">${escapeHtml(statusLabel)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b6a62">Сумма</td><td style="padding:6px 0;text-align:right;font-weight:600">${fmtAmount(args.amountCents, args.currency)}</td></tr>
        ${refundRow}
      </table>
    </div>
    <div style="padding:14px 22px;border-top:1px solid rgba(0,0,0,.06);font-size:12px;color:#6b6a62">
      — Команда Мотт Ларбе
    </div>
  </div>
</body></html>`;

  return { subject, html, text };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
