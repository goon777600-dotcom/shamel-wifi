export type IndividualSubscriptionAccountInfo = {
  id: number;
  name: string;
  phone: string | null;
  status: "active" | "suspended" | "closed" | string;
  notes?: string | null;
  createdAt?: Date | string;
};

export type IndividualSubscriptionItem = {
  id: number;
  name: string;
  status: "active" | "suspended" | "cancelled" | string;
  notes?: string | null;
};

export type IndividualSubscriptionCharge = {
  id: number;
  subscriptionId?: number | null;
  description: string;
  currencyCode: string;
  amount: string;
  paidAmount: string;
  discountAmount: string;
  status: "unpaid" | "partial" | "paid" | "cancelled" | string;
  chargedAt: Date | string;
  notes?: string | null;
};

export type IndividualSubscriptionPayment = {
  id: number;
  chargeId: number;
  currencyCode: string;
  amount: string;
  paymentDate: Date | string;
  notes?: string | null;
};

export type IndividualSubscriptionAdjustment = {
  id: number;
  chargeId: number;
  currencyCode: string;
  amount: string;
  adjustmentDate: Date | string;
  notes?: string | null;
};

export type IndividualSubscriptionOutstanding = {
  currencyCode: string;
  amount: string;
};

export type StatementMovement = {
  id: string;
  rawDate: Date;
  dateStr: string;
  type: "charge" | "payment" | "discount";
  typeLabel: string;
  badgeClass: string;
  reference: string;
  description: string;
  debit: number;      // مدين (عليه)
  credit: number;     // دائن (مسدد)
  discount: number;   // خصم
  runningBalance: number; // الرصيد المتبقي بعد الحركة
  currencyCode: string;
  notes: string | null;
};

export type StatementLedger = {
  movements: StatementMovement[];
  totalDebit: number;
  totalCredit: number;
  totalDiscount: number;
  finalBalance: number;
  primaryCurrency: string;
};

const currencyLabels: Record<string, string> = {
  YER: "ر.ي",
  SAR: "ر.س",
  USD: "$",
};

export function getCurrencyLabel(code: string) {
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

export function formatMoney(amount: number | string, currencyCode: string): string {
  const numeric = typeof amount === "number" ? amount : Number(amount || 0);
  const formatted = new Intl.NumberFormat("ar-YE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numeric);
  return `${formatted} ${getCurrencyLabel(currencyCode)}`;
}

export function formatDate(date: Date | string): string {
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

export function formatDateTime(date: Date | string): string {
  try {
    return new Intl.DateTimeFormat("ar-YE", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  } catch {
    return String(date);
  }
}

/**
 * Builds a chronological ledger of transactions with running balance.
 */
export function buildStatementLedger(data: {
  charges: IndividualSubscriptionCharge[];
  payments: IndividualSubscriptionPayment[];
  adjustments?: IndividualSubscriptionAdjustment[];
}): StatementLedger {
  const rawItems: Array<{
    rawDate: Date;
    sortPriority: number; // 1: charge, 2: discount, 3: payment
    type: "charge" | "payment" | "discount";
    typeLabel: string;
    badgeClass: string;
    reference: string;
    description: string;
    debit: number;
    credit: number;
    discount: number;
    currencyCode: string;
    notes: string | null;
  }> = [];

  for (const charge of data.charges) {
    if (charge.status === "cancelled") continue;
    rawItems.push({
      rawDate: new Date(charge.chargedAt),
      sortPriority: 1,
      type: "charge",
      typeLabel: "مبلغ اشتراك",
      badgeClass: "badge-charge",
      reference: `#C-${charge.id}`,
      description: charge.description || "اشتراك إنترنت",
      debit: Number(charge.amount || 0),
      credit: 0,
      discount: 0,
      currencyCode: charge.currencyCode || "YER",
      notes: charge.notes || null,
    });
  }

  for (const payment of data.payments) {
    rawItems.push({
      rawDate: new Date(payment.paymentDate),
      sortPriority: 3,
      type: "payment",
      typeLabel: "سند قبض",
      badgeClass: "badge-payment",
      reference: `#R-${payment.id}`,
      description: `سند قبض مسدد (مرتبط بعملية #${payment.chargeId})`,
      debit: 0,
      credit: Number(payment.amount || 0),
      discount: 0,
      currencyCode: payment.currencyCode || "YER",
      notes: payment.notes || null,
    });
  }

  for (const adj of data.adjustments || []) {
    rawItems.push({
      rawDate: new Date(adj.adjustmentDate),
      sortPriority: 2,
      type: "discount",
      typeLabel: "خصم معتمد",
      badgeClass: "badge-discount",
      reference: `#D-${adj.id}`,
      description: `خصم مالي معتمد (مرتبط بعملية #${adj.chargeId})`,
      debit: 0,
      credit: 0,
      discount: Number(adj.amount || 0),
      currencyCode: adj.currencyCode || "YER",
      notes: adj.notes || null,
    });
  }

  // Sort chronologically ascending
  rawItems.sort((a, b) => {
    const diff = a.rawDate.getTime() - b.rawDate.getTime();
    if (diff !== 0) return diff;
    return a.sortPriority - b.sortPriority;
  });

  let runningBalance = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  let totalDiscount = 0;
  let primaryCurrency = "YER";

  const movements: StatementMovement[] = rawItems.map((item, index) => {
    primaryCurrency = item.currencyCode;
    totalDebit += item.debit;
    totalCredit += item.credit;
    totalDiscount += item.discount;
    runningBalance += item.debit - item.credit - item.discount;

    return {
      id: `${item.type}-${index + 1}`,
      rawDate: item.rawDate,
      dateStr: formatDate(item.rawDate),
      type: item.type,
      typeLabel: item.typeLabel,
      badgeClass: item.badgeClass,
      reference: item.reference,
      description: item.description,
      debit: item.debit,
      credit: item.credit,
      discount: item.discount,
      runningBalance: Math.max(0, runningBalance),
      currencyCode: item.currencyCode,
      notes: item.notes,
    };
  });

  return {
    movements,
    totalDebit,
    totalCredit,
    totalDiscount,
    finalBalance: Math.max(0, runningBalance),
    primaryCurrency,
  };
}

/**
 * Generates an A4 print-ready HTML page for the detailed account statement.
 */
export function createIndividualSubscriptionStatementHtml(data: {
  account: IndividualSubscriptionAccountInfo;
  subscriptions?: IndividualSubscriptionItem[];
  charges: IndividualSubscriptionCharge[];
  payments: IndividualSubscriptionPayment[];
  adjustments?: IndividualSubscriptionAdjustment[];
  outstandingByCurrency?: IndividualSubscriptionOutstanding[];
}): string {
  const ledger = buildStatementLedger({
    charges: data.charges,
    payments: data.payments,
    adjustments: data.adjustments,
  });

  const now = new Date();
  const issueDateStr = formatDateTime(now);
  const accountStatusLabel =
    data.account.status === "active"
      ? "نشط"
      : data.account.status === "suspended"
      ? "موقوف"
      : "مغلق";

  const rowsHtml = ledger.movements.length
    ? ledger.movements
        .map(
          (m, idx) => `
      <tr>
        <td style="text-align: center; color: #64748b; font-weight: 700;">${idx + 1}</td>
        <td style="white-space: nowrap;">${escapeHtml(m.dateStr)}</td>
        <td style="font-weight: 700; color: #0a6372;">${escapeHtml(m.reference)}</td>
        <td>
          <div style="font-weight: 700; color: #083f4c;">${escapeHtml(m.description)}</div>
          <div style="font-size: 11px; color: #64748b;">${escapeHtml(m.typeLabel)}${m.notes ? ` · ${escapeHtml(m.notes)}` : ""}</div>
        </td>
        <td style="text-align: left; font-weight: 700; color: ${m.debit > 0 ? "#b9404a" : "#94a3b8"};">
          ${m.debit > 0 ? escapeHtml(formatMoney(m.debit, m.currencyCode)) : "—"}
        </td>
        <td style="text-align: left; font-weight: 700; color: ${m.credit > 0 ? "#08735d" : "#94a3b8"};">
          ${m.credit > 0 ? escapeHtml(formatMoney(m.credit, m.currencyCode)) : "—"}
        </td>
        <td style="text-align: left; font-weight: 700; color: ${m.discount > 0 ? "#b45309" : "#94a3b8"};">
          ${m.discount > 0 ? escapeHtml(formatMoney(m.discount, m.currencyCode)) : "—"}
        </td>
        <td style="text-align: left; font-weight: 800; color: ${m.runningBalance > 0 ? "#9c711a" : "#08735d"}; background: #fafdfc;">
          ${escapeHtml(formatMoney(m.runningBalance, m.currencyCode))}
        </td>
      </tr>
    `
        )
        .join("")
    : `
      <tr>
        <td colspan="8" style="text-align: center; padding: 24px; color: #64748b;">
          لا توجد عمليات مسجلة على هذا الحساب حتى الآن.
        </td>
      </tr>
    `;

  const servicesNames = (data.subscriptions || [])
    .map(s => s.name)
    .filter(Boolean)
    .join(" ، ") || "اشتراك إنترنت";

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>كشف حساب المشترك - ${escapeHtml(data.account.name)}</title>
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
    /* Header */
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
    /* Info Card */
    .client-card {
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
      min-width: 80px;
    }
    .info-value {
      font-weight: 600;
      color: #083f4c;
    }
    /* Summary Cards */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 18px;
    }
    .summary-card {
      border: 1px solid #dce8e5;
      border-radius: 10px;
      padding: 10px 12px;
      background: #ffffff;
      text-align: center;
    }
    .summary-label {
      font-size: 11px;
      color: #64748b;
      font-weight: 700;
    }
    .summary-num {
      font-size: 15px;
      font-weight: 900;
      margin-top: 4px;
    }
    .card-debit { border-color: #fecdd3; background: #fff5f5; }
    .card-debit .summary-num { color: #b9404a; }
    .card-credit { border-color: #a7f3d0; background: #f0fdf4; }
    .card-credit .summary-num { color: #08735d; }
    .card-discount { border-color: #fde68a; background: #fefce8; }
    .card-discount .summary-num { color: #b45309; }
    .card-balance { border-color: #fed7aa; background: #fff7ed; }
    .card-balance .summary-num { color: #c2410c; }
    /* Table */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th {
      background: #eef6f4;
      color: #083f4c;
      font-weight: 800;
      text-align: right;
      padding: 9px 10px;
      font-size: 11px;
      border: 1px solid #cfe3dd;
    }
    td {
      padding: 8px 10px;
      font-size: 11.5px;
      border: 1px solid #e2e8f0;
      vertical-align: middle;
    }
    tr:nth-child(even) {
      background: #fafcfb;
    }
    /* Footer */
    .footer-section {
      margin-top: 24px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-top: 1px dashed #cbd5e1;
      padding-top: 16px;
    }
    .stamp-box {
      text-align: center;
      width: 180px;
    }
    .stamp-title {
      font-size: 11px;
      font-weight: 700;
      color: #475569;
      margin-bottom: 40px;
    }
    .stamp-line {
      border-bottom: 1px dotted #94a3b8;
    }
    .system-note {
      font-size: 10px;
      color: #94a3b8;
      text-align: center;
      margin-top: 16px;
    }
    /* Print media */
    @media print {
      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print {
        display: none !important;
      }
    }
    .print-actions {
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-bottom: 20px;
      padding: 12px;
      background: #f1f5f9;
      border-radius: 8px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      border: none;
    }
    .btn-print {
      background: #0a6372;
      color: #ffffff;
    }
    .btn-close {
      background: #e2e8f0;
      color: #334155;
    }
  </style>
</head>
<body>
  <div class="statement-wrap">
    <div class="print-actions no-print">
      <button class="btn btn-print" onclick="window.print()">🖨️ طباعة / حفظ بتنسيق PDF</button>
      <button class="btn btn-close" onclick="window.close()">إغلاق النافذة</button>
    </div>

    <!-- Header -->
    <header class="header-box">
      <div>
        <div class="brand-title">الشامل لخدمات الإنترنت</div>
        <div class="brand-subtitle">يافع الصعيد · هاتف: 777600474</div>
      </div>
      <div class="doc-badge">
        <div class="doc-title">كشف حساب مشترك</div>
        <div class="doc-meta">تاريخ الإصدار: ${escapeHtml(issueDateStr)}</div>
      </div>
    </header>

    <!-- Client Info Box -->
    <section class="client-card">
      <div class="info-item">
        <span class="info-label">اسم المشترك:</span>
        <span class="info-value" style="font-size: 14px; font-weight: 800; color: #083f4c;">${escapeHtml(data.account.name)}</span>
      </div>
      <div class="info-item">
        <span class="info-label">رقم الهاتف:</span>
        <span class="info-value" dir="ltr" style="text-align: right;">${escapeHtml(data.account.phone || "غير مسجل")}</span>
      </div>
      <div class="info-item">
        <span class="info-label">الخدمات:</span>
        <span class="info-value">${escapeHtml(servicesNames)}</span>
      </div>
      <div class="info-item">
        <span class="info-label">حالة الحساب:</span>
        <span class="info-value">${escapeHtml(accountStatusLabel)}</span>
      </div>
      ${data.account.notes ? `
      <div class="info-item" style="grid-column: 1 / -1;">
        <span class="info-label">ملاحظات:</span>
        <span class="info-value">${escapeHtml(data.account.notes)}</span>
      </div>` : ""}
    </section>

    <!-- Summary Statistics Cards -->
    <section class="summary-grid">
      <div class="summary-card card-debit">
        <div class="summary-label">إجمالي الاشتراكات (المطلوب)</div>
        <div class="summary-num">${escapeHtml(formatMoney(ledger.totalDebit, ledger.primaryCurrency))}</div>
      </div>
      <div class="summary-card card-credit">
        <div class="summary-label">إجمالي المسدد (سندات القبض)</div>
        <div class="summary-num">${escapeHtml(formatMoney(ledger.totalCredit, ledger.primaryCurrency))}</div>
      </div>
      <div class="summary-card card-discount">
        <div class="summary-label">إجمالي الخصومات</div>
        <div class="summary-num">${escapeHtml(formatMoney(ledger.totalDiscount, ledger.primaryCurrency))}</div>
      </div>
      <div class="summary-card card-balance">
        <div class="summary-label">الرصيد المتبقي المستحق</div>
        <div class="summary-num">${escapeHtml(formatMoney(ledger.finalBalance, ledger.primaryCurrency))}</div>
      </div>
    </section>

    <!-- Detailed Ledger Table -->
    <table>
      <thead>
        <tr>
          <th style="width: 30px; text-align: center;">#</th>
          <th style="width: 95px;">التاريخ</th>
          <th style="width: 80px;">رقم القيد</th>
          <th>البيان والتفاصيل</th>
          <th style="width: 105px; text-align: left;">المبلغ (عليه)</th>
          <th style="width: 105px; text-align: left;">المسدد (له)</th>
          <th style="width: 85px; text-align: left;">الخصم</th>
          <th style="width: 110px; text-align: left;">المتبقي</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
      <tfoot>
        <tr style="background: #eef6f4; font-weight: 800;">
          <td colspan="4" style="text-align: right; padding: 10px;">الإجمالي العام</td>
          <td style="text-align: left; color: #b9404a;">${escapeHtml(formatMoney(ledger.totalDebit, ledger.primaryCurrency))}</td>
          <td style="text-align: left; color: #08735d;">${escapeHtml(formatMoney(ledger.totalCredit, ledger.primaryCurrency))}</td>
          <td style="text-align: left; color: #b45309;">${escapeHtml(formatMoney(ledger.totalDiscount, ledger.primaryCurrency))}</td>
          <td style="text-align: left; color: ${ledger.finalBalance > 0 ? "#c2410c" : "#08735d"}; font-size: 13px;">${escapeHtml(formatMoney(ledger.finalBalance, ledger.primaryCurrency))}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Footer & Signatures -->
    <div class="footer-section">
      <div style="color: #64748b; font-size: 11px;">
        <div>يرجى مراجعة العمليات، وسرعة سداد المبالغ المستحقة.</div>
        <div>للاستفسار والتواصل: يافع الصعيد · 777600474</div>
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

/**
 * Opens a print popup and triggers window.print() (which lets user Save as PDF).
 */
export function printIndividualSubscriptionStatement(data: {
  account: IndividualSubscriptionAccountInfo;
  subscriptions?: IndividualSubscriptionItem[];
  charges: IndividualSubscriptionCharge[];
  payments: IndividualSubscriptionPayment[];
  adjustments?: IndividualSubscriptionAdjustment[];
  outstandingByCurrency?: IndividualSubscriptionOutstanding[];
}): boolean {
  const popup = window.open("", "_blank", "width=980,height=820");
  if (!popup) return false;
  popup.document.open();
  popup.document.write(createIndividualSubscriptionStatementHtml(data));
  popup.document.close();
  popup.focus();
  window.setTimeout(() => {
    try {
      popup.print();
    } catch (e) {
      console.warn("Auto-print triggered an error:", e);
    }
  }, 350);
  return true;
}
