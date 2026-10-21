import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("No DATABASE_URL in environment");
  const conn = await mysql.createConnection(url);
  console.log("Connected to database for migration...");

  // 1. Add currentStock to wifi_card_profiles if missing
  const [cols]: any = await conn.query("SHOW COLUMNS FROM wifi_card_profiles LIKE 'currentStock'");
  if (cols.length === 0) {
    console.log("Adding currentStock column to wifi_card_profiles...");
    await conn.query("ALTER TABLE wifi_card_profiles ADD COLUMN currentStock int NOT NULL DEFAULT 0");
    console.log("currentStock column added successfully.");
  } else {
    console.log("currentStock column already exists.");
  }

  // 2. Create card_inventory_movements table
  console.log("Ensuring card_inventory_movements table exists...");
  await conn.query(`
    CREATE TABLE IF NOT EXISTS \`card_inventory_movements\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`movementNumber\` varchar(50) NOT NULL,
      \`profileId\` int NOT NULL,
      \`movementType\` enum('print_supply', 'sale_invoice', 'adjustment', 'damaged') NOT NULL,
      \`quantity\` int NOT NULL,
      \`unitPrice\` decimal(18, 2) NOT NULL DEFAULT '0.00',
      \`totalAmount\` decimal(18, 2) NOT NULL DEFAULT '0.00',
      \`contactId\` int NULL,
      \`contactName\` varchar(160) NULL,
      \`invoiceId\` int NULL,
      \`invoiceNumber\` varchar(120) NULL,
      \`paymentType\` enum('cash', 'credit', 'none') NOT NULL DEFAULT 'none',
      \`cashAccountId\` int NULL,
      \`balanceAfter\` int NOT NULL DEFAULT 0,
      \`notes\` text NULL,
      \`createdByUserId\` int NULL,
      \`movementDate\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      INDEX \`card_mov_profile_idx\` (\`profileId\`),
      INDEX \`card_mov_type_idx\` (\`movementType\`),
      INDEX \`card_mov_contact_idx\` (\`contactId\`),
      INDEX \`card_mov_invoice_idx\` (\`invoiceId\`),
      INDEX \`card_mov_date_idx\` (\`movementDate\`)
    );
  `);
  console.log("card_inventory_movements table verified/created.");

  await conn.end();
  console.log("Migration complete!");
}

main().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
