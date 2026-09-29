import { describe, expect, it } from "vitest";
import { accountWhatsAppMessage, individualSubscriptionFinancialWhatsAppMessage, individualSubscriptionWhatsAppMessage, invoiceWhatsAppMessage, normalizeYemenPhone, receiptWhatsAppMessage, renderWhatsAppTemplate, whatsappUrl } from "./whatsapp";

describe("WhatsApp number formatting", () => {
  it("formats common Yemen customer phone formats for WhatsApp", () => {
    expect(normalizeYemenPhone("777000000")).toBe("967777000000");
    expect(normalizeYemenPhone("+967 777 000 000")).toBe("967777000000");
    expect(normalizeYemenPhone("00967777000000")).toBe("967777000000");
    expect(whatsappUrl("777000000", "فاتورة جديدة")).toContain("wa.me/967777000000");
  });

  it("renders a custom template with greeting, shop and invoice values", () => {
    const template = "أهلاً {{customer_name}} من {{shop_name}}\n{{document_type}}: {{document_number}}\n{{amount}} {{currency}}";
    const rendered = invoiceWhatsAppMessage("خالد", { invoiceNumber: "INV-000001", type: "credit", totalAmount: "25.00", dueAmount: "25.00", currencyCode: "SAR" }, template);
    expect(rendered).toContain("خالد");
    expect(rendered).toContain("الشامل لخدمات الإنترنت");
    expect(rendered).toContain("فاتورة آجلة: INV-000001");
    expect(rendered).toContain("25.00 SAR");
    expect(renderWhatsAppTemplate("{{greeting}} {{customer_name}}", { greeting: "صباح الخير", customer_name: "خالد" })).toBe("صباح الخير خالد");
  });

  it("applies the same custom greeting to account and receipt messages", () => {
    const template = "تحية مخصصة: {{customer_name}}\n{{shop_name}}\n{{message_body}}";
    expect(accountWhatsAppMessage("خالد", { YER: 1000 }, template)).toContain("تحية مخصصة: خالد");
    const receipt = receiptWhatsAppMessage("خالد", { receiptNumber: "RCP-000001", amount: "1000.00", currencyCode: "YER" }, template);
    expect(receipt).toContain("تحية مخصصة: خالد");
    expect(receipt).toContain("RCP-000001");
  });

  it("ينشئ رسالة مستقلة لفتح اشتراك فردي أو إضافته دون أي حقول مالية", () => {
    const message = individualSubscriptionWhatsAppMessage("أحمد", "subscription_added", { name: "واي فاي المنزل", status: "active" }, "{{customer_name}}\n{{subscription_action}}\n{{subscription_name}}\n{{subscription_status}}");
    expect(message).toBe("أحمد\nإضافة اشتراك\nواي فاي المنزل\nفعّال");
    expect(whatsappUrl("+966501234567", message)).toContain("wa.me/966501234567");
    expect(message).not.toContain("فاتورة");
  });

  it("يفرق بين فتح الحساب حديثاً وعرض حساب موجود وإضافة اشتراك", () => {
    expect(individualSubscriptionWhatsAppMessage("أحمد", "account_opened")).toContain("فتح حساب اشتراك");
    expect(individualSubscriptionWhatsAppMessage("أحمد", "account_viewed")).toContain("متابعة حساب الاشتراك");
    expect(individualSubscriptionWhatsAppMessage("أحمد", "subscription_added")).toContain("إضافة اشتراك");
  });

  it("ينشئ رسالة مستقلة لمبلغ الاشتراك وإيداع السداد دون ذكر فاتورة أو سند قبض", () => {
    const charge = individualSubscriptionFinancialWhatsAppMessage("خالد", "charge_added", { description: "اشتراك إنترنت", amount: "4000.00", currencyCode: "YER", dueAmount: "4000.00" });
    const payment = individualSubscriptionFinancialWhatsAppMessage("خالد", "payment_received", { description: "اشتراك إنترنت", amount: "4000.00", currencyCode: "YER", dueAmount: "0.00" });
    expect(charge).toContain("إضافة مبلغ اشتراك");
    expect(charge).toContain("المتبقي على الاشتراك: 4000.00 YER");
    expect(payment).toContain("إيداع مبلغ في حساب الاشتراك");
    expect(payment).toContain("4000.00 YER");
    expect(payment).not.toContain("فاتورة");
    expect(payment).not.toContain("سند قبض");
  });
});
