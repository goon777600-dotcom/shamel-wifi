import { arabicDate } from "@/components/accounting/ui";

export interface ClientContactInfo {
  id: number;
  name: string;
  phone: string | null;
  type: string;
  address?: string | null;
  notes?: string | null;
}

export interface ClientInvoiceRow {
  id: number;
  invoiceNumber: string;
  type: "cash" | "credit";
  totalAmount: string | number;
  dueAmount: string | number;
  issueDate: string | Date;
  notes?: string | null;
  currencyCode?: string;
}

export interface ClientReceiptRow {
  id: number;
  receiptNumber: string;
  amount: string | number;
  receiptDate: string | Date;
  notes?: string | null;
  currencyCode?: string;
}

export interface ClientLedgerItem {
  date: string | Date;
  typeLabel: string;
  referenceNumber: string;
  details: string;
  debit: number;   // مدين (أخذ بضاعة / عليه)
  credit: number;  // دائن (سدد مبالغ / له)
  runningBalance: number;
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMoney(amount: number, currency = "ر.ي"): string {
  const formatted = new Intl.NumberFormat("ar-YE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${formatted} ${currency}`;
}

export function buildClientLedger(
  invoices: ClientInvoiceRow[],
  receipts: ClientReceiptRow[],
): {
  ledger: ClientLedgerItem[];
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
} {
  const items: Array<{
    date: Date;
    typeLabel: string;
    referenceNumber: string;
    details: string;
    debit: number;
    credit: number;
  }> = [];

  let totalDebit = 0;
  let totalCredit = 0;

  invoices.forEach(inv => {
    const isCredit = inv.type === "credit";
    const amt = Number(inv.totalAmount || 0);
    totalDebit += amt;

    if (isCredit) {
      items.push({
        date: new Date(inv.issueDate),
        typeLabel: "فاتورة آجلة",
        referenceNumber: inv.invoiceNumber,
        details: inv.notes || "مبيعات كروت / خدمات آجلة",
        debit: amt,
        credit: 0,
      });
    } else {
      // Cash invoice: recorded and settled
      totalCredit += amt;
      items.push({
        date: new Date(inv.issueDate),
        typeLabel: "فاتورة نقدية",
        referenceNumber: inv.invoiceNumber,
        details: inv.notes || "مبيعات نقدية مدفوعة",
        debit: amt,
        credit: amt,
      });
    }
  });

  receipts.forEach(rec => {
    const amt = Number(rec.amount || 0);
    totalCredit += amt;
    items.push({
      date: new Date(rec.receiptDate),
      typeLabel: "سند قبض / سداد",
      referenceNumber: rec.receiptNumber,
      details: rec.notes || "سداد دفعة من الحساب",
      debit: 0,
      credit: amt,
    });
  });

  // Sort chronologically ascending
  items.sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = 0;
  const ledger: ClientLedgerItem[] = items.map(item => {
    running += item.debit - item.credit;
    return {
      date: item.date,
      typeLabel: item.typeLabel,
      referenceNumber: item.referenceNumber,
      details: item.details,
      debit: item.debit,
      credit: item.credit,
      runningBalance: running,
    };
  });

  return {
    ledger,
    totalDebit,
    totalCredit,
    netBalance: totalDebit - totalCredit,
  };
}

export function createClientStatementHtml(data: {
  contact: ClientContactInfo;
  invoices: ClientInvoiceRow[];
  receipts: ClientReceiptRow[];
  networkName?: string;
  phone?: string;
  location?: string;
}): string {
  const networkName = data.networkName || "شبكة الشامل للواي فاي";
  const phone = data.phone || "777600474";
  const location = data.location || "الإدارة العامة";

  const { ledger, totalDebit, totalCredit, netBalance } = buildClientLedger(
    data.invoices,
    data.receipts,
  );

  const issueDateStr = new Intl.DateTimeFormat("ar-YE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const balanceText =
    netBalance > 0
      ? `المبلغ المستحق والمتبقي عليكم (مدين): ${formatMoney(netBalance)}`
      : netBalance < 0
      ? `رصيد دائن لكم: ${formatMoney(Math.abs(netBalance))}`
      : "الحساب متزن وخالص تماماً (0.00 ر.ي)";

  const balanceColor = netBalance > 0 ? "#b45309" : netBalance < 0 ? "#08735d" : "#0a6372";
  const balanceBg = netBalance > 0 ? "#fffbeb" : netBalance < 0 ? "#ecfdf5" : "#f0fdfa";

  const rowsHtml = ledger.length
    ? ledger
        .map((item, idx) => {
          const isDebit = item.debit > 0 && item.credit === 0;
          const isReceipt = item.credit > 0 && item.debit === 0;
          const badgeBg = isDebit ? "#fef3c7" : isReceipt ? "#ecfdf5" : "#f1f5f9";
          const badgeColor = isDebit ? "#b45309" : isReceipt ? "#08735d" : "#475569";

          const formattedDate = new Intl.DateTimeFormat("ar-YE", {
            year: "numeric",
            month: "short",
            day: "numeric",
          }).format(new Date(item.date));

          return `
      <tr>
        <td style="text-align: center; color: #64748b; font-weight: 700;">${idx + 1}</td>
        <td style="white-space: nowrap; font-size: 12px;">${escapeHtml(formattedDate)}</td>
        <td style="text-align: center;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 800; background: ${badgeBg}; color: ${badgeColor};">
            ${escapeHtml(item.typeLabel)}
          </span>
        </td>
        <td style="font-weight: 800; color: #0a6372; text-align: center;">#${escapeHtml(item.referenceNumber)}</td>
        <td style="font-size: 12px; color: #334155;">${escapeHtml(item.details)}</td>
        <td style="text-align: left; font-weight: 800; color: ${item.debit > 0 ? "#b45309" : "#94a3b8"};">
          ${item.debit > 0 ? formatMoney(item.debit) : "—"}
        </td>
        <td style="text-align: left; font-weight: 800; color: ${item.credit > 0 ? "#08735d" : "#94a3b8"};">
          ${item.credit > 0 ? formatMoney(item.credit) : "—"}
        </td>
        <td style="text-align: left; font-weight: 900; color: #083f4c; background: #fafdfc;">
          ${formatMoney(item.runningBalance)}
        </td>
      </tr>
          `;
        })
        .join("")
    : `
      <tr>
        <td colspan="8" style="text-align: center; padding: 24px; color: #64748b;">
          لا توجد حركات مسجلة في كشف الحساب حتى الآن.
        </td>
      </tr>
    `;

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>كشف حساب - ${escapeHtml(data.contact.name)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Kufi Arabic", "Cairo", Tahoma, sans-serif;
      margin: 0;
      padding: 20px;
      color: #0f172a;
      background: #f8fafc;
      direction: rtl;
    }
    .statement-wrap {
      max-width: 900px;
      margin: 0 auto;
      background: #ffffff;
      padding: 28px;
      border-radius: 16px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.06);
    }
    .header-box {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #0a6372;
      padding-bottom: 18px;
      margin-bottom: 20px;
    }
    .network-title {
      font-size: 22px;
      font-weight: 900;
      color: #083f4c;
      margin: 0;
    }
    .network-sub {
      font-size: 12px;
      color: #64748b;
      margin-top: 4px;
    }
    .statement-tag {
      background: #eff8f5;
      color: #0a6372;
      padding: 6px 14px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 900;
      border: 1px solid #bcd9d2;
      text-align: center;
    }
    .client-card {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 16px;
      background: #f8fbfb;
      border: 1px solid #dce8e5;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .client-name {
      font-size: 18px;
      font-weight: 900;
      color: #083f4c;
      margin-bottom: 4px;
    }
    .client-meta {
      font-size: 12px;
      color: #475569;
    }
    .balance-banner {
      background: ${balanceBg};
      border: 2px solid ${balanceColor};
      border-radius: 12px;
      padding: 14px 20px;
      margin-bottom: 22px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .balance-title {
      font-size: 13px;
      font-weight: 800;
      color: #475569;
      margin: 0;
    }
    .balance-val {
      font-size: 24px;
      font-weight: 900;
      color: ${balanceColor};
      margin: 0;
    }
    .summary-pills {
      display: flex;
      gap: 12px;
      font-size: 12px;
      font-weight: 700;
    }
    .summary-pill {
      background: #ffffff;
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-bottom: 20px;
    }
    th {
      background: #083f4c;
      color: #ffffff;
      padding: 10px 12px;
      text-align: right;
      font-weight: 800;
      font-size: 11px;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: middle;
    }
    .footer-note {
      text-align: center;
      font-size: 11px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
      padding-top: 16px;
      margin-top: 24px;
    }
    .no-print {
      margin-bottom: 16px;
      display: flex;
      gap: 8px;
    }
    .btn {
      padding: 10px 18px;
      border-radius: 8px;
      font-weight: 800;
      cursor: pointer;
      border: none;
      font-size: 13px;
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
      body {
        background: #ffffff !important;
        padding: 0 !important;
      }
      .statement-wrap {
        box-shadow: none !important;
        padding: 0 !important;
        max-width: 100% !important;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="statement-wrap">
    <div class="no-print">
      <button class="btn btn-print" onclick="window.print()">🖨️ طباعة كشف الحساب / حفظ بتنسيق PDF</button>
      <button class="btn btn-close" onclick="window.close()">إغلاق</button>
    </div>

    <header class="header-box">
      <div>
        <h1 class="network-title">${escapeHtml(networkName)}</h1>
        <div class="network-sub">${escapeHtml(location)} • هاتف الإدارة: ${escapeHtml(phone)}</div>
      </div>
      <div>
        <div class="statement-tag">كشف حساب تفصيلي</div>
        <div style="font-size: 11px; color: #64748b; margin-top: 4px; text-align: center;">التاريخ: ${escapeHtml(issueDateStr)}</div>
      </div>
    </header>

    <div class="client-card">
      <div>
        <div class="client-name">${escapeHtml(data.contact.name)}</div>
        <div class="client-meta">
          ${data.contact.phone ? `<span>رقم الهاتف: <b>${escapeHtml(data.contact.phone)}</b></span> • ` : ""}
          <span>نوع الحساب: <b>${escapeHtml(data.contact.type === "grocery" ? "بقالة" : "عميل")}</b></span>
          ${data.contact.address ? ` • <span>العنوان: ${escapeHtml(data.contact.address)}</span>` : ""}
        </div>
      </div>
      <div style="text-align: left; font-size: 11px; color: #64748b;">
        <div>عدد الحركات: <b>${ledger.length}</b></div>
        <div>كود الحساب: <b>#${data.contact.id}</b></div>
      </div>
    </div>

    <div class="balance-banner">
      <div>
        <p class="balance-title">الرصيد الصافي المتبقي:</p>
        <p class="balance-val">${formatMoney(Math.abs(netBalance))}</p>
        <div style="font-size: 12px; font-weight: 700; color: ${balanceColor}; margin-top: 2px;">${balanceText}</div>
      </div>
      <div class="summary-pills">
        <div class="summary-pill">
          <span style="color: #64748b;">إجمالي الفواتير:</span>
          <span style="color: #b45309; font-weight: 800; margin-right: 4px;">${formatMoney(totalDebit)}</span>
        </div>
        <div class="summary-pill">
          <span style="color: #64748b;">إجمالي السدادات:</span>
          <span style="color: #08735d; font-weight: 800; margin-right: 4px;">${formatMoney(totalCredit)}</span>
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 40px; text-align: center;">م</th>
          <th style="width: 100px;">التاريخ</th>
          <th style="width: 110px; text-align: center;">نوع العملية</th>
          <th style="width: 100px; text-align: center;">رقم المرجع</th>
          <th>البيان والتفاصيل</th>
          <th style="width: 110px; text-align: left;">مدين (عليه)</th>
          <th style="width: 110px; text-align: left;">دائن (سدد)</th>
          <th style="width: 120px; text-align: left;">الرصيد بعد الحركة</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="footer-note">
      هذا الكشف صادر آلياً من نظام شبكة الشامل للواي فاي المحاسبي • يرجى مراجعة الرصيد واعتماده
    </div>
  </div>
</body>
</html>`;
}

export function printClientStatement(data: Parameters<typeof createClientStatementHtml>[0]): boolean {
  const html = createClientStatementHtml(data);
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  return true;
}

export function buildClientWhatsAppStatement(data: {
  contactName: string;
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
  lastMovement?: string;
}): string {
  const currency = "ر.ي";
  const balanceText =
    data.netBalance > 0
      ? `🔴 المبلغ المتبقي والمستحق عليكم: *${formatMoney(data.netBalance, currency)}*`
      : data.netBalance < 0
      ? `🟢 رصيد دائن لكم: *${formatMoney(Math.abs(data.netBalance), currency)}*`
      : `⚪ الحساب متزن وخالص تماماً (0.00 ${currency})`;

  const dateStr = new Intl.DateTimeFormat("ar-YE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return `مرحباً الأخ / *${data.contactName}* المحترم،
تحية طيبة من *شبكة الشامل للواي فاي* 📶

📄 *ملخص كشف الحساب حتى تاريخ ${dateStr}:*
━━━━━━━━━━━━━━━━━━━━
▪️ إجمالي المبيعات / الفواتير: ${formatMoney(data.totalDebit, currency)}
▪️ إجمالي السدادات / المقبوضات: ${formatMoney(data.totalCredit, currency)}
━━━━━━━━━━━━━━━━━━━━
📊 *صافي الرصيد الحالي:*
${balanceText}
━━━━━━━━━━━━━━━━━━━━
${data.lastMovement ? `📌 آخر عملية: ${data.lastMovement}\n` : ""}
مرفق لكم كشف الحساب التفصيلي (PDF).
شاكرين لكم حسن التعاون والتعامل الدائم معنا.`;
}
