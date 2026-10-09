import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const connection = await mysql.createConnection(url);
  console.log("Connected to database.");

  // Insert account categories if they don't exist
  await connection.execute(`
    INSERT INTO account_categories (name, kind, isSystem, isActive)
    VALUES 
      ('الصدقات والمساعدات', 'expense', 1, 1),
      ('إيجارات سنوية', 'expense', 1, 1)
    ON DUPLICATE KEY UPDATE isActive = 1, isSystem = 1;
  `);

  // Query id of the account categories
  const [accRows] = await connection.execute(
    `SELECT id, name FROM account_categories WHERE name IN ('الصدقات والمساعدات', 'إيجارات سنوية', 'مصروفات تشغيلية')`
  );
  const accMap = new Map((accRows as any[]).map(r => [r.name, r.id]));
  const charityAccId = accMap.get('الصدقات والمساعدات') ?? accMap.get('مصروفات تشغيلية') ?? null;
  const rentAccId = accMap.get('إيجارات سنوية') ?? accMap.get('مصروفات تشغيلية') ?? null;

  // Insert movement categories
  await connection.execute(`
    INSERT INTO movement_categories (name, kind, accountCategoryId, isSystem, isActive)
    VALUES 
      ('الصدقات والمساعدات', 'expense', ${charityAccId ? charityAccId : 'NULL'}, 1, 1),
      ('الإيجارات السنوية', 'expense', ${rentAccId ? rentAccId : 'NULL'}, 1, 1)
    ON DUPLICATE KEY UPDATE isActive = 1, isSystem = 1;
  `);

  console.log("Successfully seeded 'الصدقات والمساعدات' and 'الإيجارات السنوية' categories.");
  await connection.end();
  process.exit(0);
}

main().catch(err => {
  console.error("Error seeding categories:", err);
  process.exit(1);
});
