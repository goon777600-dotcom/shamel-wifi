import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const pool = mysql.createPool(databaseUrl);
const connection = await pool.getConnection();
const suffix = Date.now().toString(36).toUpperCase();

try {
  await connection.beginTransaction();
  const [contactResult] = await connection.execute(
    "INSERT INTO contacts (name, type, isActive) VALUES (?, 'customer', true)",
    [`اختبار ربط نوع الحساب ${suffix}`],
  );
  const contactId = Number(contactResult.insertId);

  await connection.execute(
    "INSERT INTO invoices (invoiceNumber, contactId, type, status, issueDate, currencyCode, exchangeRateToBase, subtotal, discountAmount, totalAmount, paidAmount) VALUES (?, ?, 'credit', 'issued', NOW(), 'YER', '1', '100.00', '0.00', '100.00', '0.00')",
    [`TEST-INV-${suffix}`, contactId],
  );
  await connection.execute(
    "INSERT INTO receipts (receiptNumber, contactId, status, receiptDate, currencyCode, exchangeRateToBase, amount) VALUES (?, ?, 'active', NOW(), 'YER', '1', '25.00')",
    [`TEST-RCP-${suffix}`, contactId],
  );
  await connection.execute(
    "INSERT INTO expenses (expenseNumber, contactId, status, expenseDate, currencyCode, exchangeRateToBase, amount, description) VALUES (?, ?, 'active', NOW(), 'YER', '1', '10.00', 'اختبار مصروف مرتبط')",
    [`TEST-EXP-${suffix}`, contactId],
  );

  await connection.execute("UPDATE contacts SET type = 'grocery' WHERE id = ?", [contactId]);
  const [[contact]] = await connection.execute("SELECT id, type FROM contacts WHERE id = ?", [contactId]);
  const [[invoice]] = await connection.execute("SELECT contactId FROM invoices WHERE invoiceNumber = ?", [`TEST-INV-${suffix}`]);
  const [[receipt]] = await connection.execute("SELECT contactId FROM receipts WHERE receiptNumber = ?", [`TEST-RCP-${suffix}`]);
  const [[expense]] = await connection.execute("SELECT contactId FROM expenses WHERE expenseNumber = ?", [`TEST-EXP-${suffix}`]);

  const pass = contact.type === "grocery" && invoice.contactId === contactId && receipt.contactId === contactId && expense.contactId === contactId;
  if (!pass) throw new Error("Contact type update changed financial document links");
  console.log(JSON.stringify({ pass, contactId, contactType: contact.type, documentLinks: { invoice: invoice.contactId, receipt: receipt.contactId, expense: expense.contactId } }));
} finally {
  await connection.rollback();
  connection.release();
  await pool.end();
}
