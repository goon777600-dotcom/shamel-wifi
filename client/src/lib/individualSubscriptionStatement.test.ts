import { describe, expect, it } from "vitest";
import {
  buildStatementLedger,
  createIndividualSubscriptionStatementHtml,
  getCurrencyLabel,
  formatMoney,
  IndividualSubscriptionAccountInfo,
  IndividualSubscriptionCharge,
  IndividualSubscriptionPayment,
  IndividualSubscriptionAdjustment,
} from "./individualSubscriptionStatement";

describe("Individual Subscription Statement & Ledger", () => {
  const mockAccount: IndividualSubscriptionAccountInfo = {
    id: 101,
    name: "سالم أحمد صالح",
    phone: "777123456",
    status: "active",
    notes: "مشترك عمارة السلام",
  };

  const mockCharges: IndividualSubscriptionCharge[] = [
    {
      id: 1,
      description: "اشتراك باقة شهرية 20GB",
      currencyCode: "YER",
      amount: "20000",
      paidAmount: "15000",
      discountAmount: "2000",
      status: "partial",
      chargedAt: "2026-03-01T10:00:00Z",
      notes: "سرعة 8 ميجا",
    },
  ];

  const mockPayments: IndividualSubscriptionPayment[] = [
    {
      id: 1,
      chargeId: 1,
      currencyCode: "YER",
      amount: "15000",
      paymentDate: "2026-03-05T12:00:00Z",
      notes: "حوالة كاش",
    },
  ];

  const mockAdjustments: IndividualSubscriptionAdjustment[] = [
    {
      id: 1,
      chargeId: 1,
      currencyCode: "YER",
      amount: "2000",
      adjustmentDate: "2026-03-03T09:00:00Z",
      notes: "خصم تشجيعي",
    },
  ];

  it("يحسب حركات كشف الحساب والرصيد التراكمي بدقة بالغة", () => {
    const ledger = buildStatementLedger({
      charges: mockCharges,
      payments: mockPayments,
      adjustments: mockAdjustments,
    });

    expect(ledger.totalDebit).toBe(20000);
    expect(ledger.totalCredit).toBe(15000);
    expect(ledger.totalDiscount).toBe(2000);
    // 20000 debit - 2000 discount - 15000 credit = 3000 balance remaining
    expect(ledger.finalBalance).toBe(3000);
    expect(ledger.primaryCurrency).toBe("YER");
    expect(ledger.movements.length).toBe(3);

    // Verify chronological order:
    // 1: Charge on 2026-03-01 -> running balance = 20000
    // 2: Discount on 2026-03-03 -> running balance = 18000
    // 3: Payment on 2026-03-05 -> running balance = 3000
    expect(ledger.movements[0].type).toBe("charge");
    expect(ledger.movements[0].debit).toBe(20000);
    expect(ledger.movements[0].runningBalance).toBe(20000);

    expect(ledger.movements[1].type).toBe("discount");
    expect(ledger.movements[1].discount).toBe(2000);
    expect(ledger.movements[1].runningBalance).toBe(18000);

    expect(ledger.movements[2].type).toBe("payment");
    expect(ledger.movements[2].credit).toBe(15000);
    expect(ledger.movements[2].runningBalance).toBe(3000);
  });

  it("ينشئ قالب HTML لكشف الحساب متضمناً اسم المشترك والشبكة والجداول", () => {
    const html = createIndividualSubscriptionStatementHtml({
      account: mockAccount,
      charges: mockCharges,
      payments: mockPayments,
      adjustments: mockAdjustments,
    });

    expect(html).toContain("الشامل لخدمات الإنترنت");
    expect(html).toContain("يافع الصعيد");
    expect(html).toContain("سالم أحمد صالح");
    expect(html).toContain("777123456");
    expect(html).toContain("كشف حساب مشترك");
    expect(html).toContain("اشتراك باقة شهرية 20GB");
    expect(html).toContain("سند قبض");
    expect(html).toContain("خصم معتمد");
    expect(html).toContain("table");
  });

  it("يتحقق من تسميات العملات وتنسيق المبالغ", () => {
    expect(getCurrencyLabel("YER")).toBe("ر.ي");
    expect(getCurrencyLabel("SAR")).toBe("ر.س");
    expect(getCurrencyLabel("USD")).toBe("$");
    const formatted = formatMoney(20000, "YER");
    expect(formatted).toContain("ر.ي");
  });
});
