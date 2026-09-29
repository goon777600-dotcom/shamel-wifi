export type ExpenseCategoryStatementOperation = {
  expenseNumber: string;
  description: string;
  expenseDate: Date | string;
  amount: string;
  currencyCode: string;
  status: string;
  supplierName?: string | null;
  supplierInvoiceNumber?: string | null;
  cashOverrideReason?: string | null;
};

type StatementData = { categoryName: string; month: string; operations: ExpenseCategoryStatementOperation[] };

const currencyLabels: Record<string, string> = { YER: "ر.ي", SAR: "ر.س", USD: "$" };

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function formatMoney(value: string, currencyCode: string) {
  return `${new Intl.NumberFormat("ar-YE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value))} ${currencyLabels[currencyCode] ?? currencyCode}`;
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("ar-YE", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function formatMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ar-YE", { year: "numeric", month: "long" }).format(new Date(year, Math.max(0, month - 1), 1));
}

export function createExpenseCategoryStatementHtml({ categoryName, month, operations }: StatementData) {
  const rows = operations.map(operation => `<tr><td>${escapeHtml(operation.expenseNumber)}</td><td>${escapeHtml(operation.description)}</td><td>${escapeHtml(formatDate(operation.expenseDate))}</td><td class="amount">${escapeHtml(formatMoney(operation.amount, operation.currencyCode))}</td><td>${escapeHtml(operation.status)}</td><td>${escapeHtml(operation.supplierName || operation.supplierInvoiceNumber ? `${operation.supplierName ?? ""}${operation.supplierName && operation.supplierInvoiceNumber ? " · " : ""}${operation.supplierInvoiceNumber ?? ""}` : "—")}</td><td>${escapeHtml(operation.cashOverrideReason ? `تجاوز موثق: ${operation.cashOverrideReason}` : "—")}</td></tr>`).join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>كشف مصروفات ${escapeHtml(categoryName)}</title><style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;color:#083f4c;margin:0;font-size:12px}.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0a6372;padding-bottom:14px;margin-bottom:18px}.brand{font-size:21px;font-weight:800}.muted{color:#64748b;margin-top:5px}.tag{color:#0a6372;font-weight:800}.meta{background:#f6fbfa;border:1px solid #dce8e5;border-radius:10px;padding:12px;margin-bottom:16px}.meta b{color:#083f4c}table{width:100%;border-collapse:collapse}th{background:#f0f8f6;color:#365c65;text-align:right;font-size:11px}th,td{border:1px solid #dce8e5;padding:9px;vertical-align:top}.amount{font-weight:800;color:#b9404a;white-space:nowrap}.footer{margin-top:18px;text-align:center;color:#64748b;font-size:10px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><header class="header"><div><div class="brand">الشامل لخدمات الإنترنت</div><div class="muted">يافع الصعيد · 777600474</div></div><div><div class="tag">كشف مصروفات حسب التصنيف</div><div class="muted">${escapeHtml(formatMonth(month))}</div></div></header><section class="meta"><b>التصنيف:</b> ${escapeHtml(categoryName)} &nbsp; | &nbsp; <b>عدد العمليات:</b> ${operations.length}</section><table><thead><tr><th>رقم القيد</th><th>البيان</th><th>التاريخ</th><th>المبلغ</th><th>الحالة</th><th>المورد / الفاتورة</th><th>ملاحظة التجاوز</th></tr></thead><tbody>${rows || '<tr><td colspan="7">لا توجد عمليات في هذا الشهر.</td></tr>'}</tbody></table><p class="footer">كشف صادر من تطبيق الشامل لخدمات الإنترنت</p></body></html>`;
}

export function printExpenseCategoryStatement(data: StatementData) {
  const popup = window.open("", "_blank", "width=960,height=760");
  if (!popup) return false;
  popup.document.open();
  popup.document.write(createExpenseCategoryStatementHtml(data));
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 250);
  return true;
}
