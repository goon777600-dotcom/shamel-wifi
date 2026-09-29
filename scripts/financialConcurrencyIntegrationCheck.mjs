import {
  createContact,
  createCurrencyTransfer,
  createExpense,
  createInvoice,
  createOpeningBalance,
  createReceipt,
  getContactStatement,
  getCashSummary,
  getSetup,
  listBackupSnapshots,
  restoreBackupSnapshot,
} from "../server/accounting.ts";

const ownerUserId = 1;
const snapshots = await listBackupSnapshots();
const baseline = snapshots.find(snapshot => snapshot.id === 1);
if (!baseline) throw new Error("لم يتم العثور على نسخة الأساس الآمنة قبل اختبار التزامن");

let result;
try {
  const setup = await getSetup();
  const expenseCategory = setup.movementCategories.find(category => category.name === "بترول" && category.kind === "expense");
  if (!expenseCategory) throw new Error("تصنيف البترول غير متاح لاختبار الصرف المتزامن");

  const contact = await createContact(ownerUserId, { name: "اختبار تنافسي مؤقت", type: "customer", phone: "777000000", notes: "سجل مؤقت لتدقيق التزامن، سيُزال بالاستعادة" });
  await createOpeningBalance(ownerUserId, { currencyCode: "YER", amount: "100.00", occurredAt: new Date(), notes: "رصيد اختبار مؤقت" });

  const expenseAttempts = await Promise.allSettled([
    createExpense(ownerUserId, { movementCategoryId: expenseCategory.id, expenseDate: new Date(), currencyCode: "YER", exchangeRateToBase: "1", amount: "70.00", description: "اختبار صرف متزامن أ" }),
    createExpense(ownerUserId, { movementCategoryId: expenseCategory.id, expenseDate: new Date(), currencyCode: "YER", exchangeRateToBase: "1", amount: "70.00", description: "اختبار صرف متزامن ب" }),
  ]);
  const successfulExpenses = expenseAttempts.filter(attempt => attempt.status === "fulfilled");
  if (successfulExpenses.length !== 1) {
    const reasons = expenseAttempts.map(attempt => attempt.status === "rejected" ? String(attempt.reason?.cause?.message ?? attempt.reason?.message ?? attempt.reason) : "نجحت").join(" | ");
    throw new Error(`فشل اختبار منع تجاوز رصيد الصندوق: عدد عمليات الصرف الناجحة ${successfulExpenses.length}; الأسباب: ${reasons}`);
  }

  const beforeRejectedTransfer = await getCashSummary();
  try {
    await createCurrencyTransfer(ownerUserId, { transferDate: new Date(), fromCurrencyCode: "YER", fromAmount: "40.00", toCurrencyCode: "USD", toAmount: "1.00", notes: "اختبار تحويل مرفوض" });
    throw new Error("قُبل تحويل عملات أكبر من الرصيد المتاح");
  } catch (error) {
    if (error instanceof Error && error.message === "قُبل تحويل عملات أكبر من الرصيد المتاح") throw error;
  }
  const afterRejectedTransfer = await getCashSummary();
  if (afterRejectedTransfer.movements.length !== beforeRejectedTransfer.movements.length) throw new Error("ترك فشل تحويل العملات حركة صندوق جزئية");

  await createCurrencyTransfer(ownerUserId, { transferDate: new Date(), fromCurrencyCode: "YER", fromAmount: "20.00", toCurrencyCode: "USD", toAmount: "1.00", notes: "اختبار تحويل صحيح" });
  const afterValidTransfer = await getCashSummary();
  const yerAfterTransfer = afterValidTransfer.balances.find(balance => balance.code === "YER")?.balance;
  const usdAfterTransfer = afterValidTransfer.balances.find(balance => balance.code === "USD")?.balance;
  if (yerAfterTransfer !== "10.00" || usdAfterTransfer !== "1.00") throw new Error(`رصيد التحويل غير متسق: YER=${yerAfterTransfer}, USD=${usdAfterTransfer}`);

  const invoice = await createInvoice(ownerUserId, {
    contactId: contact.id,
    type: "credit",
    issueDate: new Date(),
    currencyCode: "YER",
    exchangeRateToBase: "1",
    discountAmount: "0",
    items: [{ description: "فاتورة اختبار تنافسي", quantity: "1", unitPrice: "100.00" }],
  });
  const receiptInput = { contactId: contact.id, receiptDate: new Date(), currencyCode: "YER", exchangeRateToBase: "1", amount: "60.00", allocations: [{ invoiceId: invoice.id, amount: "60.00" }] };
  const receiptAttempts = await Promise.allSettled([
    createReceipt(ownerUserId, receiptInput),
    createReceipt(ownerUserId, receiptInput),
  ]);
  const successfulReceipts = receiptAttempts.filter(attempt => attempt.status === "fulfilled");
  if (successfulReceipts.length !== 1) throw new Error(`فشل اختبار منع تجاوز متبقي الفاتورة: عدد سندات القبض الناجحة ${successfulReceipts.length}`);

  const statementBeforeRejectedReceipt = await getContactStatement(contact.id);
  const invoiceAfterReceipt = statementBeforeRejectedReceipt.invoices.find(item => item.id === invoice.id);
  if (invoiceAfterReceipt?.status !== "partially_paid" || statementBeforeRejectedReceipt.receipts.length !== 1) throw new Error("حالة الفاتورة أو سجل القبض غير متسق بعد التزامن");
  try {
    await createReceipt(ownerUserId, { ...receiptInput, amount: "50.00", allocations: [{ invoiceId: invoice.id, amount: "50.00" }] });
    throw new Error("قُبل سند قبض أكبر من المتبقي على الفاتورة");
  } catch (error) {
    if (error instanceof Error && error.message === "قُبل سند قبض أكبر من المتبقي على الفاتورة") throw error;
  }
  const statementAfterRejectedReceipt = await getContactStatement(contact.id);
  if (statementAfterRejectedReceipt.receipts.length !== 1) throw new Error("ترك فشل سند القبض سجلاً جزئياً داخل المعاملة");

  result = { ok: true, successfulExpenses: successfulExpenses.length, successfulReceipts: successfulReceipts.length, invoiceStatus: invoiceAfterReceipt.status, validTransfer: true };
} finally {
  await restoreBackupSnapshot(ownerUserId, baseline.id);
}

console.log(JSON.stringify(result, null, 2));
