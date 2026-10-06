import "dotenv/config";
import { getDb } from "../server/db";

const sqlStatements = [
  `CREATE TABLE IF NOT EXISTS \`network_routers\` (
    \`id\` int AUTO_INCREMENT PRIMARY KEY,
    \`name\` varchar(120) NOT NULL DEFAULT 'موجّه الشامل الرئيسي',
    \`host\` varchar(255) NOT NULL DEFAULT '3.3.3.3',
    \`apiPort\` int NOT NULL DEFAULT 8728,
    \`username\` varchar(100) NOT NULL DEFAULT 'admin',
    \`password\` varchar(255) NOT NULL DEFAULT '',
    \`useTls\` boolean NOT NULL DEFAULT false,
    \`mode\` enum('usermanager_v6','usermanager_v7','hotspot') NOT NULL DEFAULT 'usermanager_v6',
    \`customer\` varchar(100) NOT NULL DEFAULT 'admin',
    \`isDefault\` boolean NOT NULL DEFAULT true,
    \`status\` enum('online','offline','error','unknown') NOT NULL DEFAULT 'unknown',
    \`lastCheckedAt\` timestamp NULL DEFAULT NULL,
    \`lastError\` text,
    \`systemIdentity\` varchar(120) NULL DEFAULT NULL,
    \`routerosVersion\` varchar(60) NULL DEFAULT NULL,
    \`boardName\` varchar(120) NULL DEFAULT NULL,
    \`uptime\` varchar(120) NULL DEFAULT NULL,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX \`network_routers_status_idx\` (\`status\`)
  )`,

  `CREATE TABLE IF NOT EXISTS \`wifi_card_profiles\` (
    \`id\` int AUTO_INCREMENT PRIMARY KEY,
    \`name\` varchar(160) NOT NULL,
    \`price\` decimal(18, 2) NOT NULL,
    \`currencyCode\` varchar(3) NOT NULL DEFAULT 'YER',
    \`timeLimit\` varchar(60) NULL DEFAULT NULL,
    \`dataLimitBytes\` decimal(18, 0) NOT NULL DEFAULT 0,
    \`dataLimitLabel\` varchar(60) NULL DEFAULT NULL,
    \`routerProfileName\` varchar(120) NULL DEFAULT NULL,
    \`notes\` text,
    \`isActive\` boolean NOT NULL DEFAULT true,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX \`wifi_card_profiles_active_idx\` (\`isActive\`)
  )`,

  `CREATE TABLE IF NOT EXISTS \`wifi_card_batches\` (
    \`id\` int AUTO_INCREMENT PRIMARY KEY,
    \`batchNumber\` varchar(50) NOT NULL UNIQUE,
    \`routerId\` int NULL DEFAULT NULL,
    \`profileId\` int NULL DEFAULT NULL,
    \`profileName\` varchar(160) NOT NULL,
    \`quantity\` int NOT NULL,
    \`unitPrice\` decimal(18, 2) NOT NULL,
    \`totalAmount\` decimal(18, 2) NOT NULL,
    \`currencyCode\` varchar(3) NOT NULL DEFAULT 'YER',
    \`codeFormat\` enum('username_only','username_password') NOT NULL DEFAULT 'username_only',
    \`codeLength\` int NOT NULL DEFAULT 6,
    \`codeType\` enum('numbers','alphanumeric') NOT NULL DEFAULT 'numbers',
    \`prefix\` varchar(20) NOT NULL DEFAULT '',
    \`status\` enum('ready','synced','partial_sync','sync_failed') NOT NULL DEFAULT 'ready',
    \`syncError\` text,
    \`notes\` text,
    \`createdByUserId\` int NULL DEFAULT NULL,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX \`wifi_card_batches_created_idx\` (\`createdAt\`)
  )`,

  `CREATE TABLE IF NOT EXISTS \`wifi_cards\` (
    \`id\` int AUTO_INCREMENT PRIMARY KEY,
    \`batchId\` int NOT NULL,
    \`routerId\` int NULL DEFAULT NULL,
    \`profileId\` int NULL DEFAULT NULL,
    \`username\` varchar(100) NOT NULL,
    \`password\` varchar(100) NOT NULL,
    \`price\` decimal(18, 2) NOT NULL,
    \`currencyCode\` varchar(3) NOT NULL DEFAULT 'YER',
    \`profileName\` varchar(160) NOT NULL,
    \`timeLimit\` varchar(60) NULL DEFAULT NULL,
    \`dataLimitLabel\` varchar(60) NULL DEFAULT NULL,
    \`status\` enum('available','sold','used','disabled') NOT NULL DEFAULT 'available',
    \`syncedToRouter\` boolean NOT NULL DEFAULT false,
    \`soldAt\` timestamp NULL DEFAULT NULL,
    \`soldToContactId\` int NULL DEFAULT NULL,
    \`soldNotes\` varchar(255) NULL DEFAULT NULL,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX \`wifi_cards_batch_idx\` (\`batchId\`),
    INDEX \`wifi_cards_username_idx\` (\`username\`),
    INDEX \`wifi_cards_status_idx\` (\`status\`)
  )`,
];

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("Database connection failed!");
    process.exit(1);
  }

  for (const sql of sqlStatements) {
    try {
      await db.execute(sql);
      console.log("Executed migration statement.");
    } catch (err: any) {
      console.error("Error executing statement:", err.message);
    }
  }

  // Insert default router if not exists
  try {
    const [routers]: any = await db.execute("SELECT COUNT(*) as count FROM network_routers");
    if (routers[0].count === 0) {
      await db.execute(`
        INSERT INTO network_routers (name, host, apiPort, username, password, useTls, mode, customer, isDefault, status)
        VALUES ('موجّه الشامل الرئيسي', '3.3.3.3', 8728, 'admin', '', false, 'usermanager_v6', 'admin', true, 'unknown')
      `);
      console.log("Inserted default MikroTik router (3.3.3.3).");
    }
  } catch (err: any) {
    console.warn("Could not insert default router:", err.message);
  }

  // Insert default Yemeni Wi-Fi card profiles (200 YER, 500 YER, 1000 YER) if empty
  try {
    const [profiles]: any = await db.execute("SELECT COUNT(*) as count FROM wifi_card_profiles");
    if (profiles[0].count === 0) {
      await db.execute(`
        INSERT INTO wifi_card_profiles (name, price, currencyCode, timeLimit, dataLimitBytes, dataLimitLabel, routerProfileName, notes)
        VALUES 
        ('كرت 200 ريال - 3 ساعات (500 ميجا)', 200.00, 'YER', '3h', 524288000, '500 ميجابايت', 'profile-200', 'كرت فئة 200 ريال يمني'),
        ('كرت 500 ريال - 24 ساعة (1.5 جيجا)', 500.00, 'YER', '24h', 1610612736, '1.5 جيجابايت', 'profile-500', 'كرت فئة 500 ريال يمني'),
        ('كرت 1000 ريال - 7 أيام (4 جيجا)', 1000.00, 'YER', '168h', 4294967296, '4 جيجابايت', 'profile-1000', 'كرت فئة 1000 ريال يمني')
      `);
      console.log("Inserted default Wi-Fi card profiles (200, 500, 1000 YER).");
    }
  } catch (err: any) {
    console.warn("Could not insert default profiles:", err.message);
  }

  console.log("MikroTik and Wi-Fi Cards migration completed successfully!");
  process.exit(0);
}

main().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
