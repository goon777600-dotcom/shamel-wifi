export const DEFAULT_WHATSAPP_TEMPLATE = "{{greeting}} {{customer_name}}\n{{shop_name}}\n{{message_body}}\nشكراً لتعاملكم معنا.";

export function normalizeYemenPhone(phone?: string | null) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00967")) digits = digits.slice(2);
  if (digits.startsWith("00966")) digits = digits.slice(2);
  if (digits.startsWith("967") || digits.startsWith("966")) return digits.length >= 12 ? digits : null;
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.length === 9 ? `967${digits}` : null;
}

export function whatsappUrl(phone: string | null | undefined, message: string) {
  const normalized = normalizeYemenPhone(phone);
  return normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}` : null;
}

export function renderWhatsAppTemplate(template: string | null | undefined, values: Record<string, string>) {
  const activeTemplate = template?.trim() || DEFAULT_WHATSAPP_TEMPLATE;
  return activeTemplate.replace(/{{\s*([a-z_]+)\s*}}/gi, (placeholder, key: string) => values[key] ?? placeholder).replace(/\n{3,}/g, "\n\n").trim();
}

function message(template: string | null | undefined, customerName: string, messageBody: string, extra: Record<string, string> = {}) {
  return renderWhatsAppTemplate(template, {
    greeting: "مرحباً",
    customer_name: customerName,
    shop_name: "الشامل لخدمات الإنترنت",
    message_body: messageBody,
    ...extra,
  });
}

export function accountWhatsAppMessage(name: string, totals: Record<string, number>, template?: string | null) {
  const balances = Object.entries(totals).filter(([, amount]) => amount > 0).map(([currency, amount]) => `${amount.toFixed(2)} ${currency}`).join(" · ") || "لا توجد مديونية مستحقة";
  return message(template, name, `ملخص حسابك الحالي:\nالمبلغ المتبقي: ${balances}`, { account_balance: balances });
}

export function invoiceWhatsAppMessage(name: string, invoice: { invoiceNumber: string; type: "cash" | "credit"; totalAmount: string; dueAmount: string; currencyCode: string }, template?: string | null) {
  const documentType = invoice.type === "credit" ? "فاتورة آجلة" : "فاتورة نقدية";
  return message(template, name, `تم إصدار ${documentType} رقم ${invoice.invoiceNumber}.\nالمبلغ: ${invoice.totalAmount} ${invoice.currencyCode}\nالمتبقي: ${invoice.dueAmount} ${invoice.currencyCode}`, { document_type: documentType, document_number: invoice.invoiceNumber, amount: invoice.totalAmount, due_amount: invoice.dueAmount, currency: invoice.currencyCode });
}

export function receiptWhatsAppMessage(name: string, receipt: { receiptNumber: string; amount: string; currencyCode: string }, template?: string | null) {
  return message(template, name, `تم استلام سند قبض رقم ${receipt.receiptNumber}.\nالمبلغ المقبوض: ${receipt.amount} ${receipt.currencyCode}`, { document_type: "سند قبض", document_number: receipt.receiptNumber, amount: receipt.amount, currency: receipt.currencyCode, due_amount: "" });
}

export function individualSubscriptionWhatsAppMessage(
  customerName: string,
  action: "account_opened" | "account_viewed" | "subscription_added",
  subscription?: { name?: string | null; status?: "active" | "suspended" | "cancelled" | null },
  template?: string | null,
) {
  const actionLabel = action === "account_opened" ? "فتح حساب اشتراك" : action === "subscription_added" ? "إضافة اشتراك" : "متابعة حساب الاشتراك";
  const statusLabel = subscription?.status === "suspended" ? "موقوف" : subscription?.status === "cancelled" ? "ملغي" : "فعّال";
  const subscriptionName = subscription?.name?.trim() || "اشتراك إنترنت";
  return message(
    template,
    customerName,
    `تم ${actionLabel} بنجاح.\nالخدمة: ${subscriptionName}\nحالة الاشتراك: ${statusLabel}`,
    { subscription_action: actionLabel, subscription_name: subscriptionName, subscription_status: statusLabel },
  );
}

export function individualSubscriptionFinancialWhatsAppMessage(
  customerName: string,
  action: "charge_added" | "payment_received",
  details: { description: string; amount: string; currencyCode: string; dueAmount?: string },
  template?: string | null,
) {
  const isPayment = action === "payment_received";
  const actionLabel = isPayment ? "إيداع مبلغ في حساب الاشتراك" : "إضافة مبلغ اشتراك";
  const dueLine = details.dueAmount !== undefined ? `\nالمتبقي على الاشتراك: ${details.dueAmount} ${details.currencyCode}` : "";
  return message(
    template,
    customerName,
    `تم ${actionLabel} بنجاح.\nالخدمة: ${details.description}\nالمبلغ: ${details.amount} ${details.currencyCode}${dueLine}`,
    { subscription_action: actionLabel, subscription_name: details.description, amount: details.amount, currency: details.currencyCode, due_amount: details.dueAmount ?? "" },
  );
}
