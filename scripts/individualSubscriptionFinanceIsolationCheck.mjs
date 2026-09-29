import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const pool = mysql.createPool(databaseUrl);
const connection = await pool.getConnection();
const suffix = Date.now().toString(36).toUpperCase();

try {
  await connection.beginTransaction();
  const [[user]] = await connection.execute("SELECT id FROM users ORDER BY id LIMIT 1");
  if (!user) throw new Error("No user is available for the integration check");

  const [[before]] = await connection.execute("SELECT (SELECT COUNT(*) FROM invoices) AS invoices, (SELECT COUNT(*) FROM receipts) AS receipts, (SELECT COUNT(*) FROM cash_movements) AS generalCashMovements, (SELECT COALESCE(SUM(balance), 0) FROM cash_balances) AS generalCashBalance");
  const [accountResult] = await connection.execute("INSERT INTO individual_subscription_accounts (name, status, createdByUserId) VALUES (?, 'active', ?)", [`اختبار صندوق أفراد ${suffix}`, user.id]);
  const accountId = Number(accountResult.insertId);
  const [subscriptionResult] = await connection.execute("INSERT INTO individual_subscriptions (accountId, name, status, createdByUserId) VALUES (?, 'اشتراك اختبار', 'active', ?)", [accountId, user.id]);
  const subscriptionId = Number(subscriptionResult.insertId);
  const [chargeResult] = await connection.execute("INSERT INTO individual_subscription_charges (accountId, subscriptionId, description, currencyCode, amount, paidAmount, status, chargedAt, createdByUserId) VALUES (?, ?, 'اشتراك اختبار', 'YER', '4000.00', '0.00', 'unpaid', NOW(), ?)", [accountId, subscriptionId, user.id]);
  const chargeId = Number(chargeResult.insertId);
  await connection.execute("INSERT INTO individual_subscription_cash_balances (currencyCode, balance) VALUES ('YER', '0.00') ON DUPLICATE KEY UPDATE currencyCode = VALUES(currencyCode)");
  const [paymentResult] = await connection.execute("INSERT INTO individual_subscription_payments (accountId, chargeId, currencyCode, amount, paymentDate, createdByUserId) VALUES (?, ?, 'YER', '4000.00', NOW(), ?)", [accountId, chargeId, user.id]);
  const paymentId = Number(paymentResult.insertId);
  await connection.execute("UPDATE individual_subscription_charges SET paidAmount = '4000.00', status = 'paid' WHERE id = ?", [chargeId]);
  await connection.execute("INSERT INTO individual_subscription_cash_movements (direction, type, currencyCode, amount, sourcePaymentId, occurredAt, description, createdByUserId) VALUES ('in', 'payment', 'YER', '4000.00', ?, NOW(), 'اختبار إيداع اشتراك فردي', ?)", [paymentId, user.id]);
  await connection.execute("UPDATE individual_subscription_cash_balances SET balance = balance + '4000.00' WHERE currencyCode = 'YER'");

  const [[after]] = await connection.execute("SELECT (SELECT COUNT(*) FROM invoices) AS invoices, (SELECT COUNT(*) FROM receipts) AS receipts, (SELECT COUNT(*) FROM cash_movements) AS generalCashMovements, (SELECT COALESCE(SUM(balance), 0) FROM cash_balances) AS generalCashBalance, (SELECT balance FROM individual_subscription_cash_balances WHERE currencyCode = 'YER') AS individualCashBalance, (SELECT status FROM individual_subscription_charges WHERE id = ?) AS chargeStatus", [chargeId]);
  const pass = after.invoices === before.invoices && after.receipts === before.receipts && after.generalCashMovements === before.generalCashMovements && String(after.generalCashBalance) === String(before.generalCashBalance) && String(after.individualCashBalance) === "4000.00" && after.chargeStatus === "paid";
  if (!pass) throw new Error("Individual subscription payment was not isolated from the general accounting tables");
  console.log(JSON.stringify({ pass, accountId, chargeId, paymentId, individualCashBalance: after.individualCashBalance, generalAccountingUnchanged: true }));
} finally {
  await connection.rollback();
  connection.release();
  await pool.end();
}
