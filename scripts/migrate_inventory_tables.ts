import "dotenv/config";
import mysql from "mysql2/promise";
import { encryptInventorySecret } from "../server/inventoryCrypto";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not defined in environment");
  }
  const connection = await mysql.createConnection(url);
  console.log("Connected to TiDB MySQL database.");

  // 1. inventory_items
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`inventory_items\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`name\` varchar(160) NOT NULL,
      \`category\` enum('solar_power', 'network') NOT NULL,
      \`itemType\` enum(
        'solar_panel',
        'battery',
        'solar_controller',
        'power_output_inverter',
        'electrical_accessories',
        'antenna',
        'dish',
        'modem_router',
        'switch',
        'network_cables_accessories',
        'other'
      ) NOT NULL,
      \`modelOrSpecs\` varchar(200),
      \`unit\` varchar(30) NOT NULL DEFAULT 'قطعة',
      \`warehouseStock\` int NOT NULL DEFAULT 0,
      \`minStockAlert\` int NOT NULL DEFAULT 0,
      \`notes\` text,
      \`isActive\` boolean NOT NULL DEFAULT true,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      INDEX \`inv_items_cat_idx\` (\`category\`),
      INDEX \`inv_items_type_idx\` (\`itemType\`),
      INDEX \`inv_items_active_idx\` (\`isActive\`)
    );
  `);
  console.log("Table inventory_items verified/created.");

  // 2. inventory_sites
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`inventory_sites\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`name\` varchar(160) NOT NULL,
      \`area\` varchar(160),
      \`locationNotes\` text,
      \`status\` enum('active', 'maintenance', 'inactive') NOT NULL DEFAULT 'active',
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      INDEX \`inv_sites_name_idx\` (\`name\`),
      INDEX \`inv_sites_status_idx\` (\`status\`)
    );
  `);
  console.log("Table inventory_sites verified/created.");

  // 3. site_equipment_balances
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`site_equipment_balances\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`siteId\` int NOT NULL,
      \`itemId\` int NOT NULL,
      \`quantity\` int NOT NULL DEFAULT 0,
      \`notes\` text,
      \`installedDate\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`site_item_unique\` (\`siteId\`, \`itemId\`),
      INDEX \`site_equip_site_idx\` (\`siteId\`),
      INDEX \`site_equip_item_idx\` (\`itemId\`),
      CONSTRAINT \`site_equip_site_fk\` FOREIGN KEY (\`siteId\`) REFERENCES \`inventory_sites\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`site_equip_item_fk\` FOREIGN KEY (\`itemId\`) REFERENCES \`inventory_items\` (\`id\`) ON DELETE CASCADE
    );
  `);
  console.log("Table site_equipment_balances verified/created.");

  // 4. inventory_movements
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`inventory_movements\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`movementNumber\` varchar(50),
      \`type\` enum(
        'dispatch_to_site',
        'return_from_site',
        'stock_in',
        'adjustment',
        'damaged'
      ) NOT NULL,
      \`itemId\` int NOT NULL,
      \`siteId\` int,
      \`quantity\` int NOT NULL,
      \`movementDate\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`recipientOrTech\` varchar(120),
      \`reasonOrNotes\` text,
      \`createdByUserId\` int,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      INDEX \`inv_mov_type_idx\` (\`type\`),
      INDEX \`inv_mov_item_idx\` (\`itemId\`),
      INDEX \`inv_mov_site_idx\` (\`siteId\`),
      INDEX \`inv_mov_date_idx\` (\`movementDate\`),
      CONSTRAINT \`inv_mov_item_fk\` FOREIGN KEY (\`itemId\`) REFERENCES \`inventory_items\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`inv_mov_site_fk\` FOREIGN KEY (\`siteId\`) REFERENCES \`inventory_sites\` (\`id\`) ON DELETE SET NULL
    );
  `);
  console.log("Table inventory_movements verified/created.");

  // 5. site_devices
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`site_devices\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`siteId\` int NOT NULL,
      \`name\` varchar(160) NOT NULL,
      \`deviceType\` enum(
        'dish',
        'modem',
        'switch',
        'antenna',
        'solar_controller',
        'inverter',
        'other'
      ) NOT NULL,
      \`dishRole\` enum('transmitter', 'receiver', 'none') NOT NULL DEFAULT 'none',
      \`ipAddress\` varchar(64),
      \`macAddress\` varchar(32),
      \`username\` varchar(100),
      \`passwordEncrypted\` text,
      \`notes\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      INDEX \`site_dev_site_idx\` (\`siteId\`),
      INDEX \`site_dev_ip_idx\` (\`ipAddress\`),
      CONSTRAINT \`site_dev_site_fk\` FOREIGN KEY (\`siteId\`) REFERENCES \`inventory_sites\` (\`id\`) ON DELETE CASCADE
    );
  `);
  console.log("Table site_devices verified/created.");

  // 6. dish_links
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`dish_links\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`siteId\` int NOT NULL,
      \`transmitterDeviceId\` int NOT NULL,
      \`receiverDeviceId\` int NOT NULL,
      \`linkPasswordEncrypted\` text,
      \`notes\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      INDEX \`dish_links_site_idx\` (\`siteId\`),
      INDEX \`dish_links_tx_idx\` (\`transmitterDeviceId\`),
      INDEX \`dish_links_rx_idx\` (\`receiverDeviceId\`),
      CONSTRAINT \`dish_links_site_fk\` FOREIGN KEY (\`siteId\`) REFERENCES \`inventory_sites\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`dish_links_tx_fk\` FOREIGN KEY (\`transmitterDeviceId\`) REFERENCES \`site_devices\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`dish_links_rx_fk\` FOREIGN KEY (\`receiverDeviceId\`) REFERENCES \`site_devices\` (\`id\`) ON DELETE CASCADE
    );
  `);
  console.log("Table dish_links verified/created.");

  // 7. home_modems
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`home_modems\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`ownerName\` varchar(160) NOT NULL,
      \`ipAddress\` varchar(64) NOT NULL,
      \`siteId\` int,
      \`username\` varchar(100),
      \`passwordEncrypted\` text,
      \`notes\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      INDEX \`home_modems_ip_idx\` (\`ipAddress\`),
      INDEX \`home_modems_owner_idx\` (\`ownerName\`),
      INDEX \`home_modems_site_idx\` (\`siteId\`),
      CONSTRAINT \`home_modems_site_fk\` FOREIGN KEY (\`siteId\`) REFERENCES \`inventory_sites\` (\`id\`) ON DELETE SET NULL
    );
  `);
  console.log("Table home_modems verified/created.");

  // Check if we already have items seeded
  const [itemsRows] = await connection.query("SELECT COUNT(*) as cnt FROM `inventory_items`");
  const countItems = (itemsRows as any[])[0]?.cnt || 0;

  if (countItems === 0) {
    console.log("Seeding initial inventory items...");
    const sampleItems = [
      // Solar Power Equipment
      {
        name: "لوح شمسي 300 واط مونو",
        category: "solar_power",
        itemType: "solar_panel",
        modelOrSpecs: "300W Monocrystalline 24V",
        unit: "لوح",
        warehouseStock: 8,
        minStockAlert: 3,
        notes: "ألواح عالية الكفاءة لتغذية الأبراج والمواقع",
      },
      {
        name: "لوح شمسي 450 واط Half-Cell",
        category: "solar_power",
        itemType: "solar_panel",
        modelOrSpecs: "450W Tier 1 Solar Panel",
        unit: "لوح",
        warehouseStock: 5,
        minStockAlert: 2,
        notes: "ألواح طاقة للمحطات الرئيسية ذات الاستهلاك العالي",
      },
      {
        name: "بطارية جل 200 أمبير Ritar",
        category: "solar_power",
        itemType: "battery",
        modelOrSpecs: "12V 200Ah Deep Cycle Gel",
        unit: "بطارية",
        warehouseStock: 6,
        minStockAlert: 2,
        notes: "بطاريات ديب سايكل لتشغيل الأبراج أثناء انقطاع الشمس",
      },
      {
        name: "بطارية جل 150 أمبير Narada",
        category: "solar_power",
        itemType: "battery",
        modelOrSpecs: "12V 150Ah Gel",
        unit: "بطارية",
        warehouseStock: 4,
        minStockAlert: 2,
        notes: "بطاريات احتياطية للمحطات الثانوية",
      },
      {
        name: "منظم طاقة شمسية MPPT 40A",
        category: "solar_power",
        itemType: "solar_controller",
        modelOrSpecs: "EPEver Tracer 4210AN 40A MPPT",
        unit: "جهاز",
        warehouseStock: 3,
        minStockAlert: 1,
        notes: "منظم شحن ذكي بنظام MPPT لتتبع الطاقة القصوى",
      },
      {
        name: "منظم طاقة شمسية MPPT 60A",
        category: "solar_power",
        itemType: "solar_controller",
        modelOrSpecs: "Victron Energy SmartSolar 60A",
        unit: "جهاز",
        warehouseStock: 2,
        minStockAlert: 1,
        notes: "منظم للأبراج المركزية",
      },
      {
        name: "محول إنفرتر هجين 1000W",
        category: "solar_power",
        itemType: "power_output_inverter",
        modelOrSpecs: "1000W 24V DC to 220V AC Pure Sine",
        unit: "جهاز",
        warehouseStock: 3,
        minStockAlert: 1,
        notes: "محول موجة جيبية نقية لتغذية السويتشات والمودمات",
      },
      {
        name: "محول خافض جهد DC-DC 24V إلى 12V",
        category: "solar_power",
        itemType: "power_output_inverter",
        modelOrSpecs: "24V to 12V 20A DC Step-Down",
        unit: "قطعة",
        warehouseStock: 5,
        minStockAlert: 2,
        notes: "مخرجات تيار مستمر لتشغيل الراوترات الصغيرة ومعدات 12V",
      },
      {
        name: "أسلاك طاقة شمسية 6 ملم (لفة)",
        category: "solar_power",
        itemType: "electrical_accessories",
        modelOrSpecs: "Solar Cable 6mm2 UV Resistant (100m)",
        unit: "لفة",
        warehouseStock: 4,
        minStockAlert: 1,
        notes: "كابلات شمسية معزولة مقاومة للحرارة والشمس",
      },
      {
        name: "قاطع تيار DC 32A مزدوج",
        category: "solar_power",
        itemType: "electrical_accessories",
        modelOrSpecs: "DC Circuit Breaker 2P 500V 32A",
        unit: "قطعة",
        warehouseStock: 10,
        minStockAlert: 4,
        notes: "قواطع حماية للألواح والبطاريات",
      },

      // Network & Internet Equipment
      {
        name: "صحن ربط LiteBeam 5AC Gen2",
        category: "network",
        itemType: "dish",
        modelOrSpecs: "Ubiquiti LBE-5AC-Gen2 23dBi",
        unit: "صحن",
        warehouseStock: 4,
        minStockAlert: 2,
        notes: "صحون ربط مسافات متوسطة ومحطات ربط فرعية",
      },
      {
        name: "صحن ربط PowerBeam 5AC 500",
        category: "network",
        itemType: "dish",
        modelOrSpecs: "Ubiquiti PBE-5AC-500 27dBi",
        unit: "صحن",
        warehouseStock: 2,
        minStockAlert: 1,
        notes: "صحون ربط رئيسية للأبراج البعيدة",
      },
      {
        name: "أنتين بث سيكتور 120 درجة 5GHz",
        category: "network",
        itemType: "antenna",
        modelOrSpecs: "Ubiquiti AirMax Sector 5G-19-120",
        unit: "أنتين",
        warehouseStock: 3,
        minStockAlert: 1,
        notes: "أنتينات بث قطاعية لتغطية المشتركين",
      },
      {
        name: "راوتر MikroTik hEX RB750Gr3",
        category: "network",
        itemType: "modem_router",
        modelOrSpecs: "Gigabit 5-Port RouterOS L4",
        unit: "راوتر",
        warehouseStock: 5,
        minStockAlert: 2,
        notes: "راوترات توزيع وإدارة للأبراج والمحطات",
      },
      {
        name: "راوتر خارجي MikroTik NetMetal 5",
        category: "network",
        itemType: "modem_router",
        modelOrSpecs: "RB921UAGS-5SHPacD-NM",
        unit: "راوتر",
        warehouseStock: 2,
        minStockAlert: 1,
        notes: "أجهزة ربط وبث عالية القدرة في بيئات خارجية صعبة",
      },
      {
        name: "سويتش PoE 8 بورت جيجابت",
        category: "network",
        itemType: "switch",
        modelOrSpecs: "8-Port Gigabit PoE 120W Switch",
        unit: "سويتش",
        warehouseStock: 4,
        minStockAlert: 2,
        notes: "سويتشات توزيع لتشغيل الصحون والأنتينات عبر كابل الشبكة",
      },
      {
        name: "كابل شبكة Cat6 خارجي محمي (لفة 305م)",
        category: "network",
        itemType: "network_cables_accessories",
        modelOrSpecs: "Cat6 Outdoor Shielded SFTP 23AWG",
        unit: "لفة",
        warehouseStock: 3,
        minStockAlert: 1,
        notes: "كابلات مقاومة للشمس والعوامل الجوية مع سلك أرضي",
      },
    ];

    for (const item of sampleItems) {
      await connection.query(
        `INSERT INTO \`inventory_items\` (\`name\`, \`category\`, \`itemType\`, \`modelOrSpecs\`, \`unit\`, \`warehouseStock\`, \`minStockAlert\`, \`notes\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [item.name, item.category, item.itemType, item.modelOrSpecs, item.unit, item.warehouseStock, item.minStockAlert, item.notes]
      );
    }
    console.log("Seeded inventory items successfully.");
  }

  // Check if sites exist
  const [siteRows] = await connection.query("SELECT COUNT(*) as cnt FROM `inventory_sites`");
  const countSites = (siteRows as any[])[0]?.cnt || 0;

  if (countSites === 0) {
    console.log("Seeding initial sites...");
    const initialSites = [
      { name: "برج الجبل", area: "الجبل الأخضر", locationNotes: "أعلى نقطة بالجبل الأخضر - محطة ربط رئيسية", status: "active" },
      { name: "محطة السوق", area: "وسط المدينة", locationNotes: "فوق مبنى مركز السوق - توزيع للمحلات والمشتركين", status: "active" },
      { name: "برج الميناء", area: "الواجهة البحرية", locationNotes: "منطقة الميناء والواجهة البحرية", status: "active" },
      { name: "محطة الوادي", area: "طريق الوادي", locationNotes: "محطة تقوية لخدمة مزارع وقرى الوادي", status: "active" },
      { name: "برج الشروق", area: "المنطقة الشرقية", locationNotes: "تغطية الأحياء الشرقية والمخطط الجديد", status: "active" },
    ];

    for (const site of initialSites) {
      await connection.query(
        `INSERT INTO \`inventory_sites\` (\`name\`, \`area\`, \`locationNotes\`, \`status\`) VALUES (?, ?, ?, ?)`,
        [site.name, site.area, site.locationNotes, site.status]
      );
    }
    console.log("Seeded initial sites successfully.");

    // Retrieve inserted sites & items to populate site_equipment_balances & movements
    const [allSites] = await connection.query("SELECT id, name FROM `inventory_sites`");
    const [allItems] = await connection.query("SELECT id, name, itemType FROM `inventory_items`");

    const siteMap = new Map((allSites as any[]).map(s => [s.name, s.id]));
    const itemMap = new Map((allItems as any[]).map(i => [i.name, i.id]));

    // Distribute equipment to sites (e.g. برج الجبل)
    const siteBalances = [
      // برج الجبل (major hub: 4 panels, 4 batteries, 1 controller, 1 inverter, 2 dishes, 3 antennas, 1 switch, 1 router)
      { site: "برج الجبل", item: "لوح شمسي 300 واط مونو", qty: 4 },
      { site: "برج الجبل", item: "بطارية جل 200 أمبير Ritar", qty: 4 },
      { site: "برج الجبل", item: "منظم طاقة شمسية MPPT 60A", qty: 1 },
      { site: "برج الجبل", item: "محول إنفرتر هجين 1000W", qty: 1 },
      { site: "برج الجبل", item: "صحن ربط PowerBeam 5AC 500", qty: 2 },
      { site: "برج الجبل", item: "أنتين بث سيكتور 120 درجة 5GHz", qty: 3 },
      { site: "برج الجبل", item: "سويتش PoE 8 بورت جيجابت", qty: 1 },
      { site: "برج الجبل", item: "راوتر MikroTik hEX RB750Gr3", qty: 1 },

      // محطة السوق
      { site: "محطة السوق", item: "لوح شمسي 300 واط مونو", qty: 2 },
      { site: "محطة السوق", item: "بطارية جل 150 أمبير Narada", qty: 2 },
      { site: "محطة السوق", item: "منظم طاقة شمسية MPPT 40A", qty: 1 },
      { site: "محطة السوق", item: "صحن ربط LiteBeam 5AC Gen2", qty: 2 },
      { site: "محطة السوق", item: "سويتش PoE 8 بورت جيجابت", qty: 1 },
      { site: "محطة السوق", item: "أنتين بث سيكتور 120 درجة 5GHz", qty: 2 },

      // برج الميناء
      { site: "برج الميناء", item: "لوح شمسي 450 واط Half-Cell", qty: 2 },
      { site: "برج الميناء", item: "بطارية جل 200 أمبير Ritar", qty: 2 },
      { site: "برج الميناء", item: "منظم طاقة شمسية MPPT 40A", qty: 1 },
      { site: "برج الميناء", item: "صحن ربط LiteBeam 5AC Gen2", qty: 1 },
      { site: "برج الميناء", item: "سويتش PoE 8 بورت جيجابت", qty: 1 },

      // محطة الوادي
      { site: "محطة الوادي", item: "لوح شمسي 300 واط مونو", qty: 2 },
      { site: "محطة الوادي", item: "بطارية جل 150 أمبير Narada", qty: 2 },
      { site: "محطة الوادي", item: "منظم طاقة شمسية MPPT 40A", qty: 1 },
      { site: "محطة الوادي", item: "صحن ربط LiteBeam 5AC Gen2", qty: 1 },

      // برج الشروق
      { site: "برج الشروق", item: "لوح شمسي 300 واط مونو", qty: 2 },
      { site: "برج الشروق", item: "بطارية جل 150 أمبير Narada", qty: 2 },
      { site: "برج الشروق", item: "منظم طاقة شمسية MPPT 40A", qty: 1 },
      { site: "برج الشروق", item: "صحن ربط LiteBeam 5AC Gen2", qty: 1 },
    ];

    for (const b of siteBalances) {
      const siteId = siteMap.get(b.site);
      const itemId = itemMap.get(b.item);
      if (siteId && itemId) {
        await connection.query(
          `INSERT INTO \`site_equipment_balances\` (\`siteId\`, \`itemId\`, \`quantity\`, \`notes\`)
           VALUES (?, ?, ?, ?)`,
          [siteId, itemId, b.qty, "معدة مركبة مسبقاً في الموقع"]
        );

        // Record dispatch movement
        await connection.query(
          `INSERT INTO \`inventory_movements\` (\`movementNumber\`, \`type\`, \`itemId\`, \`siteId\`, \`quantity\`, \`recipientOrTech\`, \`reasonOrNotes\`)
           VALUES (?, 'dispatch_to_site', ?, ?, ?, 'مهندس التركيبات', ?)`,
          [`DSP-${Date.now().toString().slice(-6)}`, itemId, siteId, b.qty, `صرف وتركيب لموقع ${b.site}`]
        );
      }
    }
    console.log("Seeded site equipment balances and initial dispatch movements.");

    // Seed sample site devices and dish links for برج الجبل ومحطة السوق
    const jabalId = siteMap.get("برج الجبل");
    const souqId = siteMap.get("محطة السوق");

    if (jabalId) {
      const [txResult] = await connection.query(
        `INSERT INTO \`site_devices\` (\`siteId\`, \`name\`, \`deviceType\`, \`dishRole\`, \`ipAddress\`, \`username\`, \`passwordEncrypted\`, \`notes\`)
         VALUES (?, 'صحن الربط الرئيسي (مرسل للسوق)', 'dish', 'transmitter', '192.168.10.20', 'admin', ?, 'PowerBeam 500 مرسل للسوق')`,
        [jabalId, encryptInventorySecret("Jabal@Net#2026")]
      );
      const txDevId = (txResult as any).insertId;

      await connection.query(
        `INSERT INTO \`site_devices\` (\`siteId\`, \`name\`, \`deviceType\`, \`dishRole\`, \`ipAddress\`, \`username\`, \`passwordEncrypted\`, \`notes\`)
         VALUES (?, 'سويتش التوزيع الرئيسي', 'switch', 'none', '192.168.10.2', 'admin', ?, 'PoE Switch 8 Ports')`,
        [jabalId, encryptInventorySecret("Switch!Pass#88")]
      );

      await connection.query(
        `INSERT INTO \`site_devices\` (\`siteId\`, \`name\`, \`deviceType\`, \`dishRole\`, \`ipAddress\`, \`username\`, \`passwordEncrypted\`, \`notes\`)
         VALUES (?, 'راوتر البرج RB750', 'modem', 'none', '192.168.10.1', 'admin', ?, 'MikroTik Gateway')`,
        [jabalId, encryptInventorySecret("MikroTik*Jabal99")]
      );

      if (souqId && txDevId) {
        const [rxResult] = await connection.query(
          `INSERT INTO \`site_devices\` (\`siteId\`, \`name\`, \`deviceType\`, \`dishRole\`, \`ipAddress\`, \`username\`, \`passwordEncrypted\`, \`notes\`)
           VALUES (?, 'صحن استقبال السوق (مستلم من الجبل)', 'dish', 'receiver', '192.168.10.21', 'admin', ?, 'LiteBeam AC مستلم من برج الجبل')`,
          [souqId, encryptInventorySecret("Souq@Net#2026")]
        );
        const rxDevId = (rxResult as any).insertId;

        // Create dish link
        await connection.query(
          `INSERT INTO \`dish_links\` (\`siteId\`, \`transmitterDeviceId\`, \`receiverDeviceId\`, \`linkPasswordEncrypted\`, \`notes\`)
           VALUES (?, ?, ?, ?, 'وصلة الربط اللاسلكية الرئيسية بين برج الجبل ومحطة السوق')`,
          [jabalId, txDevId, rxDevId, encryptInventorySecret("Shamel-Wireless-Link-5Ghz-PTP")]
        );
      }
    }

    // Seed sample home modems
    const sampleHomeModems = [
      { owner: "أحمد محمد الحاشدي", ip: "192.168.88.101", site: "برج الجبل", user: "ahmed_modem", pass: "Ahmed@1234", notes: "مودم بيت مشترك حزمة ذهبية" },
      { owner: "عصام ناصر الشامي", ip: "192.168.88.102", site: "محطة السوق", user: "esam_net", pass: "Esam#2026", notes: "مودم منزل فوق البقالة" },
      { owner: "صالح علي باوزير", ip: "192.168.88.103", site: "برج الميناء", user: "saleh_bawazir", pass: "Saleh$Pass", notes: "مودم بيت - حي الميناء" },
      { owner: "فؤاد سعيد القدسي", ip: "192.168.88.104", site: "محطة الوادي", user: "fouad_qudsi", pass: "Fouad*88", notes: "مودم بيت وراوتر حديقة" },
    ];

    for (const m of sampleHomeModems) {
      const siteId = siteMap.get(m.site) || null;
      await connection.query(
        `INSERT INTO \`home_modems\` (\`ownerName\`, \`ipAddress\`, \`siteId\`, \`username\`, \`passwordEncrypted\`, \`notes\`)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [m.owner, m.ip, siteId, m.user, encryptInventorySecret(m.pass), m.notes]
      );
    }
    console.log("Seeded sample home modems successfully.");
  }

  await connection.end();
  console.log("Migration and seeding completed successfully!");
}

main().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
