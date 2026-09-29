import { describe, expect, it } from "vitest";
import {
  canAllocateReceipt,
  calculateLineTotal,
  centsToMoney,
  convertFromBaseCents,
  convertToBaseCents,
  getCreditInvoiceStatus,
  hasSufficientCash,
  moneyToCents,
  quantityToMillis,
  rateToMicros,
  sumCents,
} from "./accountingMath";

describe("accountingMath", () => {
  it("يحفظ المبالغ النقدية بدقة صحيحة", () => {
    expect(moneyToCents("100.50")).toBe(10050n);
    expect(centsToMoney(10050n)).toBe("100.50");
  });

  it("يحسب إجمالي بند الفاتورة دون أخطاء كسور عائمة", () => {
    const total = calculateLineTotal(moneyToCents("12.50"), quantityToMillis("2.000"));
    expect(centsToMoney(total)).toBe("25.00");
  });

  it("يحول مبلغ العملية إلى عملة التقرير وفق سعر الصرف المحفوظ", () => {
    const converted = convertToBaseCents(moneyToCents("100.00"), rateToMicros("530.000000"));
    expect(centsToMoney(converted)).toBe("53000.00");
    expect(centsToMoney(convertFromBaseCents(converted, rateToMicros("530.000000")))).toBe("100.00");
  });

  it("يحدث حالة الفاتورة الآجلة فقط بعد القبض ولا يسمح بتجاوز المتبقي", () => {
    const total = moneyToCents("100.00");
    const firstReceipt = moneyToCents("40.00");
    const finalReceipt = moneyToCents("60.00");

    expect(canAllocateReceipt(total, 0n, firstReceipt)).toBe(true);
    expect(getCreditInvoiceStatus(total, firstReceipt)).toBe("partially_paid");
    expect(canAllocateReceipt(total, firstReceipt, moneyToCents("61.00"))).toBe(false);
    expect(getCreditInvoiceStatus(total, firstReceipt + finalReceipt)).toBe("paid");
  });

  it("لا يسمح للمصروف أو التحويل بسحب مبلغ أكبر من رصيد الصندوق", () => {
    const balance = moneyToCents("250.00");
    expect(hasSufficientCash(balance, moneyToCents("249.99"))).toBe(true);
    expect(hasSufficientCash(balance, moneyToCents("250.01"))).toBe(false);
  });

  it("يحاكي فاتورة آجلة ثم سند قبض دون اعتبار القبض إيراداً جديداً", () => {
    const invoiceRevenue = moneyToCents("100.00");
    const firstReceipt = moneyToCents("30.00");
    const finalReceipt = moneyToCents("70.00");

    expect(getCreditInvoiceStatus(invoiceRevenue, 0n)).toBe("issued");
    expect(canAllocateReceipt(invoiceRevenue, 0n, firstReceipt)).toBe(true);
    expect(getCreditInvoiceStatus(invoiceRevenue, firstReceipt)).toBe("partially_paid");
    expect(getCreditInvoiceStatus(invoiceRevenue, firstReceipt + finalReceipt)).toBe("paid");
    expect(sumCents([invoiceRevenue])).toBe(invoiceRevenue);
    expect(sumCents([firstReceipt, finalReceipt])).toBe(invoiceRevenue);
  });

  it("يحاكي فاتورة نقدية ومصروفاً وتحويل عملات دون خلطها في الربح", () => {
    const cashSale = moneyToCents("200.00");
    const operatingExpense = moneyToCents("50.00");
    const cashAfterExpense = cashSale - operatingExpense;
    const dollarsTransferredOut = moneyToCents("20.00");
    const yemeniTransferredIn = moneyToCents("10600.00");

    expect(hasSufficientCash(cashSale, operatingExpense)).toBe(true);
    expect(centsToMoney(cashAfterExpense)).toBe("150.00");
    expect(centsToMoney(cashSale - operatingExpense)).toBe("150.00");
    expect(centsToMoney(dollarsTransferredOut)).toBe("20.00");
    expect(centsToMoney(yemeniTransferredIn)).toBe("10600.00");
  });

  it("يحاكي التحويل الداخلي من صندوق الشبكة الرئيسي إلى بنك الشمول دون تغيير الإجمالي أو الربح", () => {
    const mainCashBefore = moneyToCents("100000.00");
    const bankBefore = moneyToCents("0.00");
    const internalTransfer = moneyToCents("40000.00");
    const revenue = moneyToCents("150000.00");
    const expenses = moneyToCents("30000.00");

    expect(hasSufficientCash(mainCashBefore, internalTransfer)).toBe(true);
    const mainCashAfter = mainCashBefore - internalTransfer;
    const bankAfter = bankBefore + internalTransfer;

    expect(centsToMoney(mainCashAfter)).toBe("60000.00");
    expect(centsToMoney(bankAfter)).toBe("40000.00");
    expect(mainCashAfter + bankAfter).toBe(mainCashBefore + bankBefore);
    expect(revenue - expenses).toBe(moneyToCents("120000.00"));
  });

  it("يحاكي قبض العميل في البنك ومصروفاً منه مع رفض السحب فوق رصيد الحساب المحدد", () => {
    const bankOpening = moneyToCents("10000.00");
    const customerReceipt = moneyToCents("25000.00");
    const bankExpense = moneyToCents("18000.00");
    const bankBalance = bankOpening + customerReceipt - bankExpense;

    expect(centsToMoney(bankBalance)).toBe("17000.00");
    expect(hasSufficientCash(bankBalance, moneyToCents("17000.00"))).toBe(true);
    expect(hasSufficientCash(bankBalance, moneyToCents("17000.01"))).toBe(false);
  });
});
