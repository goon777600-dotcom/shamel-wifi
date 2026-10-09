export type MerchantTransactionRow = {
  id: number;
  contactId: number;
  direction: "credit" | "debit" | string; // 'credit' = له, 'debit' = عليه
  transactionType: "purchase" | "transfer" | string;
  invoiceNumber: string | null;
  transferAmount: string | null;
  amount: string;
  currencyCode: string;
  details: string | null;
  transactionDate: Date | string;
  cashAccountName?: string | null;
  notes?: string | null;
  runningBalance?: number;
};

export type MerchantContactInfo = {
  id: number;
  name: string;
  phone: string | null;
  type: string;
  address?: string | null;
  notes?: string | null;
};

const currencyLabels: Record<string, string> = {
  YER: "ر.ي",
  SAR: "ر.س",
  USD: "$",
};

export function getCurrencyLabel(code: string): string {
  return currencyLabels[code] || code;
}

export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatMerchantMoney(amount: number | string, currencyCode: string = "YER"): string {
  const numeric = typeof amount === "number" ? amount : Number(amount || 0);
  const formatted = new Intl.NumberFormat("ar-YE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numeric);
  return `${formatted} ${getCurrencyLabel(currencyCode)}`;
}

export function formatMerchantDate(date: Date | string): string {
  try {
    return new Intl.DateTimeFormat("ar-YE", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(date));
  } catch {
    return String(date);
  }
}

/**
 * Builds printable A4 HTML for the merchant statement of account.
 */
export function createMerchantStatementHtml(data: {
  merchant: MerchantContactInfo;
  transactions: MerchantTransactionRow[];
  totalCredit: number; // إجمالي المسحوب (له)
  totalDebit: number;  // إجمالي الحوالات والمسدد (عليه)
  netBalance: number;  // الصافي (له أو عليه)
  currencyCode?: string;
  networkName?: string;
  location?: string;
  phone?: string;
}): string {
  const currency = data.currencyCode || (data.transactions[0]?.currencyCode ?? "YER");
  const currencyLabel = getCurrencyLabel(currency);
  const issueDateStr = new Intl.DateTimeFormat("ar-YE", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const balanceText =
    data.netBalance > 0
      ? `مستحق للتاجر (له): ${formatMerchantMoney(data.netBalance, currency)}`
      : data.netBalance < 0
      ? `متبقي لنا عند التاجر (عليه): ${formatMerchantMoney(Math.abs(data.netBalance), currency)}`
      : "الحساب مصفّر وخالص";

  const rowsHtml = data.transactions.length
    ? data.transactions
        .map((tx, idx) => {
          const isCredit = tx.direction === "credit";
          const typeLabel = isCredit ? "له (بضاعة مسحوبة)" : "عليه (مبلغ حوالة)";
          const typeColor = isCredit ? "#b45309" : "#08735d";
          const typeBg = isCredit ? "#fef3c7" : "#ecfdf5";
          const invoiceStr = tx.invoiceNumber ? `#${tx.invoiceNumber}` : "—";
          const detailsStr = tx.details || (isCredit ? "سحب بضاعة" : "حوالة مسددة");
          const creditAmt = isCredit ? formatMerchantMoney(tx.amount, tx.currencyCode) : "—";
          const debitAmt = !isCredit ? formatMerchantMoney(tx.amount, tx.currencyCode) : "—";
          const bal = tx.runningBalance !== undefined ? formatMerchantMoney(tx.runningBalance, tx.currencyCode) : "—";

          return `
      <tr>
        <td style="text-align: center; color: #64748b; font-weight: 700;">${idx + 1}</td>
        <td style="white-space: nowrap;">${escapeHtml(formatMerchantDate(tx.transactionDate))}</td>
        <td style="text-align: center;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 800; background: ${typeBg}; color: ${typeColor};">
            ${escapeHtml(typeLabel)}
          </span>
        </td>
        <td style="font-weight: 800; color: #0a6372; text-align: center;">${escapeHtml(invoiceStr)}</td>
        <td>
          <div style="font-weight: 800; color: #083f4c;">${escapeHtml(detailsStr)}</div>
          ${tx.notes ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">ملاحظات: ${escapeHtml(tx.notes)}</div>` : ""}
          ${tx.cashAccountName ? `<div style="font-size: 10px; color: #0284c7; margin-top: 1px;">عبر: ${escapeHtml(tx.cashAccountName)}</div>` : ""}
        </td>
        <td style="text-align: left; font-weight: 800; color: ${isCredit ? "#b45309" : "#94a3b8"};">
          ${escapeHtml(creditAmt)}
        </td>
        <td style="text-align: left; font-weight: 800; color: ${!isCredit ? "#08735d" : "#94a3b8"};">
          ${escapeHtml(debitAmt)}
        </td>
        <td style="text-align: left; font-weight: 900; color: #083f4c; background: #fafdfc;">
          ${escapeHtml(bal)}
        </td>
      </tr>
          `;
        })
        .join("")
    : `
      <tr>
        <td colspan="8" style="text-align: center; padding: 24px; color: #64748b;">
          لا توجد حركات مسجلة مع هذا التاجر حتى الآن.
        </td>
      </tr>
    `;

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>كشف حساب تاجر - ${escapeHtml(data.merchant.name)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm;
    }
    * {
      box-sizing: border-box;
      -webkit-font-smoothing: antialiased;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      color: #083f4c;
      background: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 12px;
      line-height: 1.5;
    }
    .statement-wrap {
      max-width: 820px;
      margin: 0 auto;
    }
    .header-box {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0a6372;
      padding-bottom: 14px;
      margin-bottom: 16px;
    }
    .brand-title {
      font-size: 20px;
      font-weight: 900;
      color: #083f4c;
    }
    .brand-subtitle {
      font-size: 12px;
      color: #475569;
      margin-top: 3px;
    }
    .doc-badge {
      text-align: left;
    }
    .doc-title {
      font-size: 18px;
      font-weight: 800;
      color: #0a6372;
    }
    .doc-meta {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
    }
    .merchant-card {
      background: #f7fbfa;
      border: 1px solid #cfe3dd;
      border-radius: 12px;
      padding: 12px 16px;
      margin-bottom: 16px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 24px;
    }
    .info-item {
      display: flex;
      gap: 8px;
    }
    .info-label {
      font-weight: 700;
      color: #334155;
      min-width: 85px;
    }
    .info-value {
      font-weight: 600;
      color: #083f4c;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 18px;
    }
    .summary-card {
      border: 1px solid #dce8e5;
      border-radius: 10px;
      padding: 12px 14px;
      background: #ffffff;
      text-align: center;
    }
    .summary-label {
      font-size: 11px;
      color: #64748b;
      font-weight: 700;
    }
    .summary-num {
      font-size: 16px;
      font-weight: 900;
      margin-top: 4px;
    }
    .card-credit { border-color: #fde68a; background: #fefce8; }
    .card-credit .summary-num { color: #b45309; }
    .card-debit { border-color: #a7f3d0; background: #f0fdf4; }
    .card-debit .summary-num { color: #08735d; }
    .card-balance { border-color: #bcd9d2; background: #f0fdfa; }
    .card-balance .summary-num { color: #083f4c; }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 18px;
      font-size: 11px;
    }
    th {
      background: #083f4c;
      color: #ffffff;
      padding: 9px 8px;
      font-weight: 800;
      border: 1px solid #083f4c;
      text-align: right;
    }
    td {
      padding: 8px 8px;
      border: 1px solid #e2e8f0;
      color: #1e293b;
      vertical-align: middle;
    }
    tr:nth-child(even) td {
      background: #fbfdfc;
    }
    .footer-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px dashed #cbd5e1;
    }
    .stamp-box {
      border: 1.5px dashed #94a3b8;
      border-radius: 8px;
      width: 170px;
      height: 75px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 6px 10px;
      background: #fafdfc;
      text-align: center;
    }
    .stamp-title {
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
    }
    .stamp-line {
      border-bottom: 1px solid #cbd5e1;
      height: 20px;
    }
    .system-note {
      text-align: center;
      font-size: 10px;
      color: #94a3b8;
      margin-top: 18px;
    }
    .no-print {
      margin-bottom: 16px;
      display: flex;
      gap: 8px;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      border: none;
      font-weight: 700;
      cursor: pointer;
      font-size: 12px;
    }
    .btn-print {
      background: #0a6372;
      color: #ffffff;
    }
    .btn-close {
      background: #e2e8f0;
      color: #334155;
    }
    @media print {
      .no-print {
        display: none !important;
      }
      body {
        padding: 0 !important;
      }
    }
  </style>
</head>
<body>
  <div class="statement-wrap">
    <div class="no-print">
      <button class="btn btn-print" onclick="window.print()">🖨️ طباعة / حفظ بتنسيق PDF</button>
      <button class="btn btn-close" onclick="window.close()">إغلاق</button>
    </div>

    <header class="header-box">
      <div>
        <div class="brand-title">${escapeHtml(data.networkName || "الشامل لخدمات الإنترنت")}</div>
        <div class="brand-subtitle">${escapeHtml(data.location || "يافع الصعيد")} · هاتف: ${escapeHtml(data.phone || "777600474")}</div>
      </div>
      <div class="doc-badge">
        <div class="doc-title">كشف حساب تاجر / مشتريات</div>
        <div class="doc-meta">تاريخ الإصدار: ${escapeHtml(issueDateStr)}</div>
      </div>
    </header>

    <section class="merchant-card">
      <div class="info-item">
        <span class="info-label">اسم التاجر:</span>
        <span class="info-value" style="font-size: 14px; font-weight: 800; color: #083f4c;">${escapeHtml(data.merchant.name)}</span>
      </div>
      <div class="info-item">
        <span class="info-label">رقم التواصل:</span>
        <span class="info-value" dir="ltr" style="text-align: right;">${escapeHtml(data.merchant.phone || "غير مسجل")}</span>
      </div>
      <div class="info-item">
        <span class="info-label">التصنيف:</span>
        <span class="info-value">التجار (سحب بضاعة وتوريد)</span>
      </div>
      <div class="info-item">
        <span class="info-label">حالة الحساب:</span>
        <span class="info-value">${escapeHtml(balanceText)}</span>
      </div>
      ${data.merchant.notes ? `
      <div class="info-item" style="grid-column: 1 / -1;">
        <span class="info-label">ملاحظات:</span>
        <span class="info-value">${escapeHtml(data.merchant.notes)}</span>
      </div>` : ""}
    </section>

    <section class="summary-grid">
      <div class="summary-card card-credit">
        <div class="summary-label">إجمالي البضاعة المسحوبة (له)</div>
        <div class="summary-num">${formatMerchantMoney(data.totalCredit, currency)}</div>
      </div>
      <div class="summary-card card-debit">
        <div class="summary-label">إجمالي الحوالات والمسدد (عليه)</div>
        <div class="summary-num">${formatMerchantMoney(data.totalDebit, currency)}</div>
      </div>
      <div class="summary-card card-balance">
        <div class="summary-label">الرصيد الصافي المتبقي</div>
        <div class="summary-num" style="color: ${data.netBalance > 0 ? "#b45309" : data.netBalance < 0 ? "#08735d" : "#083f4c"};">
          ${formatMerchantMoney(Math.abs(data.netBalance), currency)} ${data.netBalance > 0 ? "(له)" : data.netBalance < 0 ? "(عليه)" : ""}
        </div>
      </div>
    </section>

    <table>
      <thead>
        <tr>
          <th style="width: 30px; text-align: center;">#</th>
          <th style="width: 95px;">التاريخ</th>
          <th style="width: 110px; text-align: center;">نوع القيد</th>
          <th style="width: 90px; text-align: center;">رقم الفاتورة</th>
          <th>التفاصيل والتسعير (البيان)</th>
          <th style="width: 110px; text-align: left;">المسحوب (له)</th>
          <th style="width: 110px; text-align: left;">مبلغ الحوالة (عليه)</th>
          <th style="width: 110px; text-align: left;">الرصيد التراكمي</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
      <tfoot>
        <tr style="background: #eef6f4; font-weight: 800;">
          <td colspan="5" style="text-align: right; padding: 10px;">الإجمالي العام (${currencyLabel})</td>
          <td style="text-align: left; color: #b45309;">${formatMerchantMoney(data.totalCredit, currency)}</td>
          <td style="text-align: left; color: #08735d;">${formatMerchantMoney(data.totalDebit, currency)}</td>
          <td style="text-align: left; font-size: 13px; color: ${data.netBalance > 0 ? "#b45309" : "#08735d"};">
            ${formatMerchantMoney(Math.abs(data.netBalance), currency)}
          </td>
        </tr>
      </tfoot>
    </table>

    <div class="footer-section">
      <div style="color: #64748b; font-size: 11px;">
        <div>يرجى مراجعة كافة الفواتير والتسعيرات والحوالات أعلاه.</div>
        <div>للمراجعة والاستفسار: ${escapeHtml(data.location || "يافع الصعيد")} · هاتف: ${escapeHtml(data.phone || "777600474")}</div>
      </div>
      <div class="stamp-box">
        <div class="stamp-title">ختم وتوقيع الإدارة</div>
        <div class="stamp-line"></div>
      </div>
    </div>

    <p class="system-note">تم إصدار هذا الكشف آلياً من نظام الشامل لخدمات الإنترنت</p>
  </div>
</body>
</html>`;
}

export function printMerchantStatement(data: Parameters<typeof createMerchantStatementHtml>[0]): boolean {
  const html = createMerchantStatementHtml(data);
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  return true;
}

/**
 * Builds a ready-to-send WhatsApp message for a merchant.
 */
export function merchantWhatsAppMessage(
  merchantName: string,
  summary: {
    totalCredit: number; // له
    totalDebit: number;  // عليه
    netBalance: number;  // الصافي
    currencyCode?: string;
    lastInvoice?: string | null;
    lastTransfer?: string | null;
  },
  networkName: string = "الشامل لخدمات الإنترنت"
): string {
  const cur = getCurrencyLabel(summary.currencyCode || "YER");
  const balanceNote =
    summary.netBalance > 0
      ? `المستحق لكم حالياً: ${summary.netBalance.toLocaleString()} ${cur}`
      : summary.netBalance < 0
      ? `المتبقي لصالحنا: ${Math.abs(summary.netBalance).toLocaleString()} ${cur}`
      : "الحساب مصفّر وخالص بالكامل";

  const lines = [
    `السلام عليكم ورحمة الله وبركاته،`,
    `التاجر الكريم: *${merchantName}*،`,
    `تحية طيبة من *${networkName}*.`,
    ``,
    `ملخص مطابقة الحساب حتى تاريخه:`,
    `▪️ إجمالي البضاعة المسحوبة (لكم): *${summary.totalCredit.toLocaleString()} ${cur}*`,
    `▪️ إجمالي مبالغ الحوالات والمسدد (عليكم): *${summary.totalDebit.toLocaleString()} ${cur}*`,
    `▪️ *${balanceNote}*`,
  ];

  if (summary.lastInvoice) {
    lines.push(`▪️ آخر فاتورة مقيدة: #${summary.lastInvoice}`);
  }
  if (summary.lastTransfer) {
    lines.push(`▪️ آخر حوالة مسددة: #${summary.lastTransfer}`);
  }

  lines.push(``);
  lines.push(`شاكرين ومقدرين حسن تعاملكم وتعاونكم الدائم.`);

  return lines.join("\n");
}
