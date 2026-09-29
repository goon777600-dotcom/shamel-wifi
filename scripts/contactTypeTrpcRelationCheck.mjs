import mysql from "mysql2/promise";
import { appRouter } from "../server/routers.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const pool = mysql.createPool(databaseUrl);
const suffix = Date.now().toString(36).toUpperCase();
let contactId = null;

try {
  const [[owner]] = await pool.execute("SELECT id, openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn FROM users WHERE role = 'admin' LIMIT 1");
  if (!owner) throw new Error("No admin owner available for tRPC integration check");

  const [contactResult] = await pool.execute("INSERT INTO contacts (name, type, isActive) VALUES (?, 'customer', true)", [`اختبار tRPC نوع الحساب ${suffix}`]);
  contactId = Number(contactResult.insertId);
  await pool.execute("INSERT INTO invoices (invoiceNumber, contactId, type, status, issueDate, currencyCode, exchangeRateToBase, subtotal, discountAmount, totalAmount, paidAmount) VALUES (?, ?, 'credit', 'issued', NOW(), 'YER', '1', '100.00', '0.00', '100.00', '0.00')", [`TRPC-INV-${suffix}`, contactId]);
  await pool.execute("INSERT INTO receipts (receiptNumber, contactId, status, receiptDate, currencyCode, exchangeRateToBase, amount) VALUES (?, ?, 'active', NOW(), 'YER', '1', '25.00')", [`TRPC-RCP-${suffix}`, contactId]);
  await pool.execute("INSERT INTO expenses (expenseNumber, contactId, status, expenseDate, currencyCode, exchangeRateToBase, amount, description) VALUES (?, ?, 'active', NOW(), 'YER', '1', '10.00', 'اختبار مصروف tRPC')", [`TRPC-EXP-${suffix}`, contactId]);

  const caller = appRouter.createCaller({
    user: { ...owner, role: "admin" },
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => undefined },
  });
  await caller.accounting.updateContact({ id: contactId, name: `بقالة اختبار ${suffix}`, type: "grocery", phone: "+967777000000", address: "", notes: "", isActive: true });

  const [[contact]] = await pool.execute("SELECT type FROM contacts WHERE id = ?", [contactId]);
  const [[invoice]] = await pool.execute("SELECT contactId FROM invoices WHERE invoiceNumber = ?", [`TRPC-INV-${suffix}`]);
  const [[receipt]] = await pool.execute("SELECT contactId FROM receipts WHERE receiptNumber = ?", [`TRPC-RCP-${suffix}`]);
  const [[expense]] = await pool.execute("SELECT contactId FROM expenses WHERE expenseNumber = ?", [`TRPC-EXP-${suffix}`]);
  const pass = contact.type === "grocery" && invoice.contactId === contactId && receipt.contactId === contactId && expense.contactId === contactId;
  if (!pass) throw new Error("tRPC updateContact changed a linked financial document");
  console.log(JSON.stringify({ pass, contactId, type: contact.type, links: { invoice: invoice.contactId, receipt: receipt.contactId, expense: expense.contactId } }));
} finally {
  if (contactId) {
    await pool.execute("DELETE FROM audit_logs WHERE entityType = 'contact' AND entityId = ?", [contactId]);
    await pool.execute("DELETE FROM expenses WHERE contactId = ?", [contactId]);
    await pool.execute("DELETE FROM receipts WHERE contactId = ?", [contactId]);
    await pool.execute("DELETE FROM invoices WHERE contactId = ?", [contactId]);
    await pool.execute("DELETE FROM contacts WHERE id = ?", [contactId]);
  }
  await pool.end();
}
