import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not defined in environment");
  }
  const connection = await mysql.createConnection(url);
  console.log("Connected to TiDB MySQL database.");

  const createTableSql = `
    CREATE TABLE IF NOT EXISTS \`merchant_transactions\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`contactId\` int NOT NULL,
      \`direction\` enum('credit', 'debit') NOT NULL,
      \`transactionType\` enum('purchase', 'transfer') NOT NULL DEFAULT 'purchase',
      \`invoiceNumber\` varchar(120),
      \`transferAmount\` decimal(18, 2),
      \`amount\` decimal(18, 2) NOT NULL,
      \`currencyCode\` varchar(3) NOT NULL DEFAULT 'YER',
      \`exchangeRateToBase\` decimal(18, 6) NOT NULL DEFAULT '1',
      \`details\` text,
      \`transactionDate\` timestamp NOT NULL,
      \`cashAccountId\` int,
      \`notes\` text,
      \`createdByUserId\` int,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      INDEX \`merchant_tx_contact_idx\` (\`contactId\`),
      INDEX \`merchant_tx_date_idx\` (\`transactionDate\`),
      INDEX \`merchant_tx_dir_idx\` (\`direction\`),
      CONSTRAINT \`merchant_tx_contact_fk\` FOREIGN KEY (\`contactId\`) REFERENCES \`contacts\` (\`id\`) ON DELETE CASCADE
    );
  `;

  await connection.query(createTableSql);
  console.log("merchant_transactions table created successfully!");

  const [cols] = await connection.query("SHOW COLUMNS FROM `merchant_transactions`;");
  console.log("Columns:", (cols as any[]).map(c => c.Field));
  await connection.end();
}

main().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
