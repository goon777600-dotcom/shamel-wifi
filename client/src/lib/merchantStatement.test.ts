import { describe, expect, it } from "vitest";
import {
  createMerchantStatementHtml,
  formatMerchantMoney,
  merchantWhatsAppMessage,
  MerchantContactInfo,
  MerchantTransactionRow,
} from "./merchantStatement";

describe("Merchant Statement & Transactions", () => {
  const mockMerchant: MerchantContactInfo = {
    id: 55,
    name: "مؤسسة الأمل للشبكات والتجارة",
    phone: "777888999",
    type: "supplier",
    notes: "تاجر راوترات وكيبلات",
  };

  const mockTransactions: MerchantTransactionRow[] = [
    {
      id: 1,
      contactId: 55,
      direction: "credit",
      transactionType: "purchase",
      invoiceNumber: "INV-401",
      transferAmount: null,
      amount: "50000",
      currencyCode: "YER",
      details: "10 راوترات توتو لينك بسعر 5000 للواحد",
      transactionDate: "2026-03-01T10:00:00Z",
      runningBalance: 50000,
    },
    {
      id: 2,
      contactId: 55,
      direction: "debit",
      transactionType: "transfer",
      invoiceNumber: "TR-902",
      transferAmount: "30000",
      amount: "30000",
      currencyCode: "YER",
      details: "مبلغ حوالة عبر بنك القطيبي لسداد جزء من الفاتورة 401",
      transactionDate: "2026-03-05T12:00:00Z",
      cashAccountName: "بنك القطيبي",
      runningBalance: 20000,
    },
  ];

  it("ينشئ قالب كشف حساب التاجر A4 متضمناً رقم الفاتورة والتفاصيل والتسعير ومبلغ الحوالة", () => {
    const html = createMerchantStatementHtml({
      merchant: mockMerchant,
      transactions: mockTransactions,
      totalCredit: 50000,
      totalDebit: 30000,
      netBalance: 20000,
      currencyCode: "YER",
      networkName: "الشامل لخدمات الإنترنت",
      location: "يافع الصعيد",
      phone: "777600474",
    });

    expect(html).toContain("الشامل لخدمات الإنترنت");
    expect(html).toContain("يافع الصعيد");
    expect(html).toContain("مؤسسة الأمل للشبكات والتجارة");
    expect(html).toContain("INV-401");
    expect(html).toContain("10 راوترات توتو لينك بسعر 5000 للواحد");
    expect(html).toContain("مبلغ حوالة عبر بنك القطيبي");
    expect(html).toContain("بنك القطيبي");
    expect(html).toContain("له (بضاعة مسحوبة)");
    expect(html).toContain("عليه (مبلغ حوالة)");
    expect(html).toContain("table");
  });

  it("يبني رسالة واتساب للتاجر توضح إجمالي البضاعة المسحوبة ومبالغ الحوالات والرصيد الصافي", () => {
    const msg = merchantWhatsAppMessage("مؤسسة الأمل", {
      totalCredit: 50000,
      totalDebit: 30000,
      netBalance: 20000,
      currencyCode: "YER",
      lastInvoice: "INV-401",
      lastTransfer: "TR-902",
    });

    expect(msg).toContain("مؤسسة الأمل");
    expect(msg).toContain("إجمالي البضاعة المسحوبة (لكم)");
    expect(msg).toContain("إجمالي مبالغ الحوالات والمسدد (عليكم)");
    expect(msg).toContain("المستحق لكم حالياً");
    expect(msg).toContain("INV-401");
    expect(msg).toContain("TR-902");
  });

  it("يتحقق من تنسيق مبالغ التاجر", () => {
    const formatted = formatMerchantMoney(50000, "YER");
    expect(formatted).toContain("ر.ي");
  });
});
