import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  dishLinks,
  homeModems,
  inventoryItems,
  inventoryMovements,
  inventorySites,
  siteDevices,
  siteEquipmentBalances,
  type DishLink,
  type HomeModem,
  type InventoryItem,
  type InventoryMovement,
  type InventorySite,
  type SiteDevice,
  type SiteEquipmentBalance,
} from "../drizzle/schema";
import { decryptInventorySecret, encryptInventorySecret } from "./inventoryCrypto";

export interface InventoryStats {
  // Solar Power Totals
  solarPanelsInWarehouse: number;
  solarPanelsDeployed: number;
  batteriesInWarehouse: number;
  batteriesDeployed: number;
  controllersInWarehouse: number;
  controllersDeployed: number;
  invertersInWarehouse: number;
  invertersDeployed: number;
  electricalInWarehouse: number;
  electricalDeployed: number;

  // Network Totals
  dishesInWarehouse: number;
  dishesDeployed: number;
  antennasInWarehouse: number;
  antennasDeployed: number;
  modemsInWarehouse: number;
  modemsDeployed: number;
  switchesInWarehouse: number;
  switchesDeployed: number;
  networkCablesInWarehouse: number;
  networkCablesDeployed: number;

  // General Totals
  totalItemsInWarehouse: number;
  totalItemsDeployed: number;
  totalCatalogItems: number;
  activeSitesCount: number;
  lowStockItemsCount: number;
  homeModemsCount: number;
}

/**
 * Returns complete KPI and inventory statistics across solar energy and network systems.
 */
export async function getInventoryStats(): Promise<InventoryStats> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Get items with warehouse stock
  const allItems = await db.select().from(inventoryItems).where(eq(inventoryItems.isActive, true));

  // Get all deployed balances
  const balances = await db.select().from(siteEquipmentBalances);

  // Map of itemId -> deployed quantity
  const deployedMap = new Map<number, number>();
  for (const b of balances) {
    const cur = deployedMap.get(b.itemId) || 0;
    deployedMap.set(b.itemId, cur + Number(b.quantity));
  }

  // Count active sites
  const sites = await db.select().from(inventorySites).where(eq(inventorySites.status, "active"));

  // Count home modems
  const modems = await db.select().from(homeModems);

  const stats: InventoryStats = {
    solarPanelsInWarehouse: 0,
    solarPanelsDeployed: 0,
    batteriesInWarehouse: 0,
    batteriesDeployed: 0,
    controllersInWarehouse: 0,
    controllersDeployed: 0,
    invertersInWarehouse: 0,
    invertersDeployed: 0,
    electricalInWarehouse: 0,
    electricalDeployed: 0,

    dishesInWarehouse: 0,
    dishesDeployed: 0,
    antennasInWarehouse: 0,
    antennasDeployed: 0,
    modemsInWarehouse: 0,
    modemsDeployed: 0,
    switchesInWarehouse: 0,
    switchesDeployed: 0,
    networkCablesInWarehouse: 0,
    networkCablesDeployed: 0,

    totalItemsInWarehouse: 0,
    totalItemsDeployed: 0,
    totalCatalogItems: allItems.length,
    activeSitesCount: sites.length,
    lowStockItemsCount: 0,
    homeModemsCount: modems.length,
  };

  for (const item of allItems) {
    const whStock = Number(item.warehouseStock) || 0;
    const depStock = deployedMap.get(item.id) || 0;

    stats.totalItemsInWarehouse += whStock;
    stats.totalItemsDeployed += depStock;

    if (item.minStockAlert > 0 && whStock <= item.minStockAlert) {
      stats.lowStockItemsCount++;
    }

    switch (item.itemType) {
      case "solar_panel":
        stats.solarPanelsInWarehouse += whStock;
        stats.solarPanelsDeployed += depStock;
        break;
      case "battery":
        stats.batteriesInWarehouse += whStock;
        stats.batteriesDeployed += depStock;
        break;
      case "solar_controller":
        stats.controllersInWarehouse += whStock;
        stats.controllersDeployed += depStock;
        break;
      case "power_output_inverter":
        stats.invertersInWarehouse += whStock;
        stats.invertersDeployed += depStock;
        break;
      case "electrical_accessories":
        stats.electricalInWarehouse += whStock;
        stats.electricalDeployed += depStock;
        break;
      case "dish":
        stats.dishesInWarehouse += whStock;
        stats.dishesDeployed += depStock;
        break;
      case "antenna":
        stats.antennasInWarehouse += whStock;
        stats.antennasDeployed += depStock;
        break;
      case "modem_router":
        stats.modemsInWarehouse += whStock;
        stats.modemsDeployed += depStock;
        break;
      case "switch":
        stats.switchesInWarehouse += whStock;
        stats.switchesDeployed += depStock;
        break;
      case "network_cables_accessories":
        stats.networkCablesInWarehouse += whStock;
        stats.networkCablesDeployed += depStock;
        break;
    }
  }

  return stats;
}

export interface InventoryItemWithStock extends InventoryItem {
  deployedStock: number;
  totalStock: number;
}

/**
 * Lists catalog items with calculated warehouse stock and deployed site stock.
 */
export async function listInventoryItems(filters?: {
  category?: "solar_power" | "network";
  itemType?: string;
  search?: string;
  onlyLowStock?: boolean;
}): Promise<InventoryItemWithStock[]> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const items = await db.select().from(inventoryItems).where(eq(inventoryItems.isActive, true));
  const balances = await db.select().from(siteEquipmentBalances);

  const deployedMap = new Map<number, number>();
  for (const b of balances) {
    const cur = deployedMap.get(b.itemId) || 0;
    deployedMap.set(b.itemId, cur + Number(b.quantity));
  }

  let result: InventoryItemWithStock[] = items.map(item => {
    const deployedStock = deployedMap.get(item.id) || 0;
    const warehouseStock = Number(item.warehouseStock) || 0;
    return {
      ...item,
      deployedStock,
      totalStock: warehouseStock + deployedStock,
    };
  });

  if (filters?.category) {
    result = result.filter(i => i.category === filters.category);
  }
  if (filters?.itemType && filters.itemType !== "all") {
    result = result.filter(i => i.itemType === filters.itemType);
  }
  if (filters?.onlyLowStock) {
    result = result.filter(i => i.minStockAlert > 0 && i.warehouseStock <= i.minStockAlert);
  }
  if (filters?.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    result = result.filter(
      i =>
        i.name.toLowerCase().includes(q) ||
        (i.modelOrSpecs && i.modelOrSpecs.toLowerCase().includes(q)) ||
        (i.notes && i.notes.toLowerCase().includes(q))
    );
  }

  return result.sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/**
 * Creates a new catalog item, optionally recording initial stock in warehouse.
 */
export async function createInventoryItem(data: {
  name: string;
  category: "solar_power" | "network";
  itemType:
    | "solar_panel"
    | "battery"
    | "solar_controller"
    | "power_output_inverter"
    | "electrical_accessories"
    | "antenna"
    | "dish"
    | "modem_router"
    | "switch"
    | "network_cables_accessories"
    | "other";
  modelOrSpecs?: string;
  unit?: string;
  warehouseStock?: number;
  minStockAlert?: number;
  notes?: string;
  userId?: number;
}): Promise<InventoryItem> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const initialStock = Math.max(0, Number(data.warehouseStock) || 0);

  const [inserted] = await db.insert(inventoryItems).values({
    name: data.name.trim(),
    category: data.category,
    itemType: data.itemType,
    modelOrSpecs: data.modelOrSpecs?.trim() || null,
    unit: data.unit?.trim() || "قطعة",
    warehouseStock: initialStock,
    minStockAlert: Math.max(0, Number(data.minStockAlert) || 0),
    notes: data.notes?.trim() || null,
    isActive: true,
  });

  const itemId = inserted.insertId;

  if (initialStock > 0) {
    await db.insert(inventoryMovements).values({
      movementNumber: `STK-${Date.now().toString().slice(-6)}`,
      type: "stock_in",
      itemId,
      quantity: initialStock,
      recipientOrTech: "إدارة المخزون",
      reasonOrNotes: "رصيد افتتاحي للمعدة في المخزون",
      createdByUserId: data.userId || null,
    });
  }

  const [created] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
  return created;
}

/**
 * Updates a catalog item.
 */
export async function updateInventoryItem(
  id: number,
  data: {
    name?: string;
    modelOrSpecs?: string;
    unit?: string;
    minStockAlert?: number;
    notes?: string;
  }
): Promise<InventoryItem> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const updateSet: Record<string, any> = {};
  if (data.name !== undefined) updateSet.name = data.name.trim();
  if (data.modelOrSpecs !== undefined) updateSet.modelOrSpecs = data.modelOrSpecs.trim() || null;
  if (data.unit !== undefined) updateSet.unit = data.unit.trim() || "قطعة";
  if (data.minStockAlert !== undefined) updateSet.minStockAlert = Math.max(0, Number(data.minStockAlert) || 0);
  if (data.notes !== undefined) updateSet.notes = data.notes.trim() || null;

  await db.update(inventoryItems).set(updateSet).where(eq(inventoryItems.id, id));
  const [updated] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
  return updated;
}

export async function deleteInventoryItem(id: number): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const balances = await db.select().from(siteEquipmentBalances).where(eq(siteEquipmentBalances.itemId, id));
  const hasQuantity = balances.some(b => Number(b.quantity) > 0);
  if (hasQuantity) {
    throw new Error("لا يمكن حذف هذا الصنف لوجود وحدات منه مركبة في المواقع. يرجى إرجاعها أولاً.");
  }

  await db.update(inventoryItems).set({ isActive: false }).where(eq(inventoryItems.id, id));
  return { success: true };
}

export interface InventorySiteSummary extends InventorySite {
  // Solar equipment deployed counts
  solarPanelsCount: number;
  batteriesCount: number;
  controllersCount: number;
  invertersCount: number;
  electricalCount: number;

  // Network equipment deployed counts
  dishesCount: number;
  antennasCount: number;
  modemsCount: number;
  switchesCount: number;
  cablesCount: number;

  totalEquipmentCount: number;
  ipDevicesCount: number;
  dishLinksCount: number;
}

/**
 * Lists all sites with their aggregate equipment counts and IP devices.
 */
export async function listInventorySites(): Promise<InventorySiteSummary[]> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const sites = await db.select().from(inventorySites);
  const balances = await db.select().from(siteEquipmentBalances);
  const items = await db.select().from(inventoryItems);
  const devices = await db.select().from(siteDevices);
  const links = await db.select().from(dishLinks);

  const itemsMap = new Map(items.map(i => [i.id, i]));

  // Device counts per site
  const devCountMap = new Map<number, number>();
  for (const d of devices) {
    devCountMap.set(d.siteId, (devCountMap.get(d.siteId) || 0) + 1);
  }

  // Link counts per site
  const linkCountMap = new Map<number, number>();
  for (const l of links) {
    linkCountMap.set(l.siteId, (linkCountMap.get(l.siteId) || 0) + 1);
  }

  // Balances grouped by siteId
  const siteEquipMap = new Map<number, typeof balances>();
  for (const b of balances) {
    const list = siteEquipMap.get(b.siteId) || [];
    list.push(b);
    siteEquipMap.set(b.siteId, list);
  }

  return sites.map(site => {
    const bList = siteEquipMap.get(site.id) || [];
    let solarPanelsCount = 0;
    let batteriesCount = 0;
    let controllersCount = 0;
    let invertersCount = 0;
    let electricalCount = 0;

    let dishesCount = 0;
    let antennasCount = 0;
    let modemsCount = 0;
    let switchesCount = 0;
    let cablesCount = 0;
    let totalEquipmentCount = 0;

    for (const b of bList) {
      const it = itemsMap.get(b.itemId);
      const qty = Number(b.quantity) || 0;
      totalEquipmentCount += qty;

      if (!it) continue;
      switch (it.itemType) {
        case "solar_panel":
          solarPanelsCount += qty;
          break;
        case "battery":
          batteriesCount += qty;
          break;
        case "solar_controller":
          controllersCount += qty;
          break;
        case "power_output_inverter":
          invertersCount += qty;
          break;
        case "electrical_accessories":
          electricalCount += qty;
          break;
        case "dish":
          dishesCount += qty;
          break;
        case "antenna":
          antennasCount += qty;
          break;
        case "modem_router":
          modemsCount += qty;
          break;
        case "switch":
          switchesCount += qty;
          break;
        case "network_cables_accessories":
          cablesCount += qty;
          break;
      }
    }

    return {
      ...site,
      solarPanelsCount,
      batteriesCount,
      controllersCount,
      invertersCount,
      electricalCount,
      dishesCount,
      antennasCount,
      modemsCount,
      switchesCount,
      cablesCount,
      totalEquipmentCount,
      ipDevicesCount: devCountMap.get(site.id) || 0,
      dishLinksCount: linkCountMap.get(site.id) || 0,
    };
  });
}

export interface SiteEquipmentDetail extends SiteEquipmentBalance {
  itemName: string;
  itemCategory: "solar_power" | "network";
  itemType: string;
  itemModelOrSpecs: string | null;
  itemUnit: string;
}

export interface SiteDeviceDetail extends Omit<SiteDevice, "passwordEncrypted"> {
  hasPassword: boolean;
}

export interface DishLinkDetail extends Omit<DishLink, "linkPasswordEncrypted"> {
  transmitterName: string;
  transmitterIp: string | null;
  receiverName: string;
  receiverIp: string | null;
  hasPassword: boolean;
}

/**
 * Returns full details of a specific site including its installed equipment,
 * registered IP devices, dish links, and recent movements.
 */
export async function getSiteDetail(siteId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [site] = await db.select().from(inventorySites).where(eq(inventorySites.id, siteId));
  if (!site) throw new Error("الموقع غير موجود");

  // Installed equipment
  const balances = await db.select().from(siteEquipmentBalances).where(eq(siteEquipmentBalances.siteId, siteId));
  const items = await db.select().from(inventoryItems);
  const itemsMap = new Map(items.map(i => [i.id, i]));

  const equipmentList: SiteEquipmentDetail[] = balances
    .map(b => {
      const it = itemsMap.get(b.itemId);
      return {
        ...b,
        itemName: it?.name || "صنف غير معروف",
        itemCategory: (it?.category as any) || "network",
        itemType: it?.itemType || "other",
        itemModelOrSpecs: it?.modelOrSpecs || null,
        itemUnit: it?.unit || "قطعة",
      };
    })
    .sort((a, b) => a.itemName.localeCompare(b.itemName, "ar"));

  // IP devices at this site
  const devices = await db.select().from(siteDevices).where(eq(siteDevices.siteId, siteId));
  const deviceList: SiteDeviceDetail[] = devices.map(d => ({
    id: d.id,
    siteId: d.siteId,
    name: d.name,
    deviceType: d.deviceType,
    dishRole: d.dishRole,
    ipAddress: d.ipAddress,
    macAddress: d.macAddress,
    username: d.username,
    notes: d.notes,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    hasPassword: Boolean(d.passwordEncrypted && d.passwordEncrypted.length > 0),
  }));

  // Dish links
  const links = await db.select().from(dishLinks).where(eq(dishLinks.siteId, siteId));
  const devMap = new Map(devices.map(d => [d.id, d]));

  // Also include devices from other sites if receiver is linked across sites
  const allDevs = await db.select().from(siteDevices);
  const allDevMap = new Map(allDevs.map(d => [d.id, d]));

  const linkList: DishLinkDetail[] = links.map(l => {
    const tx = devMap.get(l.transmitterDeviceId) || allDevMap.get(l.transmitterDeviceId);
    const rx = devMap.get(l.receiverDeviceId) || allDevMap.get(l.receiverDeviceId);
    return {
      id: l.id,
      siteId: l.siteId,
      transmitterDeviceId: l.transmitterDeviceId,
      receiverDeviceId: l.receiverDeviceId,
      transmitterName: tx?.name || "صحن مرسل غير معروف",
      transmitterIp: tx?.ipAddress || null,
      receiverName: rx?.name || "صحن مستلم غير معروف",
      receiverIp: rx?.ipAddress || null,
      notes: l.notes,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
      hasPassword: Boolean(l.linkPasswordEncrypted && l.linkPasswordEncrypted.length > 0),
    };
  });

  // Recent movements for this site
  const movements = await db
    .select()
    .from(inventoryMovements)
    .where(eq(inventoryMovements.siteId, siteId))
    .orderBy(desc(inventoryMovements.movementDate))
    .limit(30);

  const movementsDetailed = movements.map(m => {
    const it = itemsMap.get(m.itemId);
    return {
      ...m,
      itemName: it?.name || "صنف غير معروف",
      itemUnit: it?.unit || "قطعة",
      itemCategory: it?.category || "network",
    };
  });

  return {
    site,
    equipment: equipmentList,
    devices: deviceList,
    links: linkList,
    recentMovements: movementsDetailed,
  };
}

export async function createSite(data: {
  name: string;
  area?: string;
  locationNotes?: string;
  status?: "active" | "maintenance" | "inactive";
}): Promise<InventorySite> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [inserted] = await db.insert(inventorySites).values({
    name: data.name.trim(),
    area: data.area?.trim() || null,
    locationNotes: data.locationNotes?.trim() || null,
    status: data.status || "active",
  });

  const [created] = await db.select().from(inventorySites).where(eq(inventorySites.id, inserted.insertId));
  return created;
}

export async function updateSite(
  id: number,
  data: {
    name?: string;
    area?: string;
    locationNotes?: string;
    status?: "active" | "maintenance" | "inactive";
  }
): Promise<InventorySite> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const updateSet: Record<string, any> = {};
  if (data.name !== undefined) updateSet.name = data.name.trim();
  if (data.area !== undefined) updateSet.area = data.area.trim() || null;
  if (data.locationNotes !== undefined) updateSet.locationNotes = data.locationNotes.trim() || null;
  if (data.status !== undefined) updateSet.status = data.status;

  await db.update(inventorySites).set(updateSet).where(eq(inventorySites.id, id));
  const [updated] = await db.select().from(inventorySites).where(eq(inventorySites.id, id));
  return updated;
}

export async function deleteSite(id: number): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const balances = await db.select().from(siteEquipmentBalances).where(eq(siteEquipmentBalances.siteId, id));
  const hasQuantity = balances.some(b => Number(b.quantity) > 0);
  if (hasQuantity) {
    throw new Error("لا يمكن حذف الموقع لوجود معدات مركبة فيه حالياً. يرجى إرجاع المعدات للمستودع أولاً.");
  }

  await db.delete(siteDevices).where(eq(siteDevices.siteId, id));
  await db.delete(dishLinks).where(eq(dishLinks.siteId, id));
  await db.delete(siteEquipmentBalances).where(eq(siteEquipmentBalances.siteId, id));
  await db.delete(inventorySites).where(eq(inventorySites.id, id));
  return { success: true };
}

/**
 * DISPATCH EQUIPMENT TO A SITE:
 * Crucial user requirement:
 * Decrements warehouse stock of the item, increments the site's deployed equipment balance,
 * and creates a permanent inventory movement record.
 */
export async function dispatchEquipmentToSite(params: {
  siteId: number;
  itemId: number;
  quantity: number;
  recipientOrTech?: string;
  reasonOrNotes?: string;
  userId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const qty = Math.floor(Number(params.quantity));
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("يجب تحديد كمية صحيحة أكبر من صفر");
  }

  // 1. Fetch item and check warehouse stock
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, params.itemId));
  if (!item) throw new Error("المعدة غير موجودة في الكتالوج");

  if (item.warehouseStock < qty) {
    throw new Error(
      `الكمية المطلوبة (${qty}) غير متوفرة في المخزون! الرصيد الحالي المتوفر في المخزون هو ${item.warehouseStock} ${item.unit}.`
    );
  }

  // 2. Fetch site
  const [site] = await db.select().from(inventorySites).where(eq(inventorySites.id, params.siteId));
  if (!site) throw new Error("الموقع غير موجود");

  // 3. Decrement warehouse stock
  const newWarehouseStock = item.warehouseStock - qty;
  await db
    .update(inventoryItems)
    .set({ warehouseStock: newWarehouseStock })
    .where(eq(inventoryItems.id, params.itemId));

  // 4. Update or insert site balance
  const [existingBalance] = await db
    .select()
    .from(siteEquipmentBalances)
    .where(
      sql`${siteEquipmentBalances.siteId} = ${params.siteId} AND ${siteEquipmentBalances.itemId} = ${params.itemId}`
    );

  if (existingBalance) {
    const newQty = existingBalance.quantity + qty;
    await db
      .update(siteEquipmentBalances)
      .set({ quantity: newQty, updatedAt: new Date() })
      .where(eq(siteEquipmentBalances.id, existingBalance.id));
  } else {
    await db.insert(siteEquipmentBalances).values({
      siteId: params.siteId,
      itemId: params.itemId,
      quantity: qty,
      notes: params.reasonOrNotes?.trim() || null,
    });
  }

  // 5. Insert movement record
  const movementNumber = `DSP-${Date.now().toString().slice(-6)}`;
  await db.insert(inventoryMovements).values({
    movementNumber,
    type: "dispatch_to_site",
    itemId: params.itemId,
    siteId: params.siteId,
    quantity: qty,
    recipientOrTech: params.recipientOrTech?.trim() || null,
    reasonOrNotes: params.reasonOrNotes?.trim() || `صرف من المخزون إلى موقع ${site.name}`,
    createdByUserId: params.userId || null,
  });

  return {
    success: true,
    movementNumber,
    itemId: params.itemId,
    siteId: params.siteId,
    dispatchedQuantity: qty,
    remainingWarehouseStock: newWarehouseStock,
    siteName: site.name,
    itemName: item.name,
  };
}

/**
 * RETURN EQUIPMENT FROM A SITE TO WAREHOUSE:
 * Decrements site's deployed equipment balance, increments warehouse stock of the item,
 * and creates a permanent inventory movement record.
 */
export async function returnEquipmentFromSite(params: {
  siteId: number;
  itemId: number;
  quantity: number;
  recipientOrTech?: string;
  reasonOrNotes?: string;
  userId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const qty = Math.floor(Number(params.quantity));
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("يجب تحديد كمية صحيحة أكبر من صفر");
  }

  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, params.itemId));
  if (!item) throw new Error("المعدة غير موجودة");

  const [site] = await db.select().from(inventorySites).where(eq(inventorySites.id, params.siteId));
  if (!site) throw new Error("الموقع غير موجود");

  const [existingBalance] = await db
    .select()
    .from(siteEquipmentBalances)
    .where(
      sql`${siteEquipmentBalances.siteId} = ${params.siteId} AND ${siteEquipmentBalances.itemId} = ${params.itemId}`
    );

  if (!existingBalance || existingBalance.quantity < qty) {
    const cur = existingBalance?.quantity || 0;
    throw new Error(`الكمية المراد إرجاعها (${qty}) أكبر من الرصيد المركب في هذا الموقع (${cur} ${item.unit})`);
  }

  // Decrement site balance
  const newSiteQty = existingBalance.quantity - qty;
  await db
    .update(siteEquipmentBalances)
    .set({ quantity: newSiteQty, updatedAt: new Date() })
    .where(eq(siteEquipmentBalances.id, existingBalance.id));

  // Increment warehouse stock
  const newWarehouseStock = item.warehouseStock + qty;
  await db
    .update(inventoryItems)
    .set({ warehouseStock: newWarehouseStock })
    .where(eq(inventoryItems.id, params.itemId));

  // Record movement
  const movementNumber = `RET-${Date.now().toString().slice(-6)}`;
  await db.insert(inventoryMovements).values({
    movementNumber,
    type: "return_from_site",
    itemId: params.itemId,
    siteId: params.siteId,
    quantity: qty,
    recipientOrTech: params.recipientOrTech?.trim() || null,
    reasonOrNotes: params.reasonOrNotes?.trim() || `إرجاع من موقع ${site.name} للمستودع`,
    createdByUserId: params.userId || null,
  });

  return {
    success: true,
    movementNumber,
    itemId: params.itemId,
    siteId: params.siteId,
    returnedQuantity: qty,
    newWarehouseStock,
    siteName: site.name,
    itemName: item.name,
  };
}

/**
 * STOCK IN / SUPPLY TO WAREHOUSE:
 * Increases warehouse stock of an item (new purchase or supply arrival) and logs movement.
 */
export async function stockIn(params: {
  itemId: number;
  quantity: number;
  supplierOrSource?: string;
  reasonOrNotes?: string;
  userId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const qty = Math.floor(Number(params.quantity));
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("يجب تحديد كمية صحيحة أكبر من صفر");
  }

  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, params.itemId));
  if (!item) throw new Error("المعدة غير موجودة");

  const newStock = item.warehouseStock + qty;
  await db.update(inventoryItems).set({ warehouseStock: newStock }).where(eq(inventoryItems.id, params.itemId));

  const movementNumber = `STK-${Date.now().toString().slice(-6)}`;
  await db.insert(inventoryMovements).values({
    movementNumber,
    type: "stock_in",
    itemId: params.itemId,
    quantity: qty,
    recipientOrTech: params.supplierOrSource?.trim() || null,
    reasonOrNotes: params.reasonOrNotes?.trim() || "توريد جديد للمخزون",
    createdByUserId: params.userId || null,
  });

  return {
    success: true,
    movementNumber,
    itemId: params.itemId,
    addedQuantity: qty,
    newWarehouseStock: newStock,
    itemName: item.name,
  };
}

export interface MovementDetail extends InventoryMovement {
  itemName: string;
  itemCategory: "solar_power" | "network";
  itemType: string;
  itemUnit: string;
  siteName: string | null;
}

/**
 * Lists all movements with item details and site names.
 */
export async function listInventoryMovements(filters?: {
  siteId?: number;
  itemId?: number;
  type?: string;
  limit?: number;
}): Promise<MovementDetail[]> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  let query = db.select().from(inventoryMovements);

  const movements = await query.orderBy(desc(inventoryMovements.movementDate)).limit(filters?.limit || 150);

  const items = await db.select().from(inventoryItems);
  const sites = await db.select().from(inventorySites);

  const itemMap = new Map(items.map(i => [i.id, i]));
  const siteMap = new Map(sites.map(s => [s.id, s.name]));

  let result: MovementDetail[] = movements.map(m => {
    const it = itemMap.get(m.itemId);
    return {
      ...m,
      itemName: it?.name || "صنف غير معروف",
      itemCategory: (it?.category as any) || "network",
      itemType: it?.itemType || "other",
      itemUnit: it?.unit || "قطعة",
      siteName: m.siteId ? siteMap.get(m.siteId) || null : null,
    };
  });

  if (filters?.siteId) {
    result = result.filter(m => m.siteId === filters.siteId);
  }
  if (filters?.itemId) {
    result = result.filter(m => m.itemId === filters.itemId);
  }
  if (filters?.type && filters.type !== "all") {
    result = result.filter(m => m.type === filters.type);
  }

  return result;
}

// ---------------- Site IP Devices & Credentials ----------------

export async function addSiteDevice(params: {
  siteId: number;
  name: string;
  deviceType: "dish" | "modem" | "switch" | "antenna" | "solar_controller" | "inverter" | "other";
  dishRole?: "transmitter" | "receiver" | "none";
  ipAddress?: string;
  macAddress?: string;
  username?: string;
  password?: string;
  notes?: string;
  deductFromItemId?: number;
  userId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // If deducting from warehouse stock
  if (params.deductFromItemId) {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, params.deductFromItemId));
    if (!item) throw new Error("المعدة المحددة للخصم غير موجودة في الكتالوج");
    if (item.warehouseStock < 1) {
      throw new Error(`رصيد الصنف (${item.name}) في المخزون غير كافٍ للخصم (الرصيد الحالي: ${item.warehouseStock})`);
    }

    // Decrement warehouse stock
    await db
      .update(inventoryItems)
      .set({ warehouseStock: item.warehouseStock - 1 })
      .where(eq(inventoryItems.id, item.id));

    // Update site equipment balance
    const [existingBalance] = await db
      .select()
      .from(siteEquipmentBalances)
      .where(
        sql`${siteEquipmentBalances.siteId} = ${params.siteId} AND ${siteEquipmentBalances.itemId} = ${item.id}`
      );

    if (existingBalance) {
      await db
        .update(siteEquipmentBalances)
        .set({ quantity: existingBalance.quantity + 1, updatedAt: new Date() })
        .where(eq(siteEquipmentBalances.id, existingBalance.id));
    } else {
      await db.insert(siteEquipmentBalances).values({
        siteId: params.siteId,
        itemId: item.id,
        quantity: 1,
        notes: `تركيب جهاز ${params.name}`,
      });
    }

    // Record movement
    await db.insert(inventoryMovements).values({
      movementNumber: `DSP-${Date.now().toString().slice(-6)}`,
      type: "dispatch_to_site",
      itemId: item.id,
      siteId: params.siteId,
      quantity: 1,
      recipientOrTech: params.name,
      reasonOrNotes: `خصم من المخزون وتركيب جهاز ${params.name} في الموقع`,
      createdByUserId: params.userId || null,
    });
  }

  const [inserted] = await db.insert(siteDevices).values({
    siteId: params.siteId,
    name: params.name.trim(),
    deviceType: params.deviceType,
    dishRole: params.dishRole || "none",
    ipAddress: params.ipAddress?.trim() || null,
    macAddress: params.macAddress?.trim() || null,
    username: params.username?.trim() || null,
    passwordEncrypted: params.password ? encryptInventorySecret(params.password) : null,
    notes: params.notes?.trim() || null,
  });

  return { id: inserted.insertId };
}

export async function updateSiteDevice(
  id: number,
  params: {
    name?: string;
    deviceType?: "dish" | "modem" | "switch" | "antenna" | "solar_controller" | "inverter" | "other";
    dishRole?: "transmitter" | "receiver" | "none";
    ipAddress?: string;
    macAddress?: string;
    username?: string;
    password?: string;
    notes?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const updateSet: Record<string, any> = {};
  if (params.name !== undefined) updateSet.name = params.name.trim();
  if (params.deviceType !== undefined) updateSet.deviceType = params.deviceType;
  if (params.dishRole !== undefined) updateSet.dishRole = params.dishRole;
  if (params.ipAddress !== undefined) updateSet.ipAddress = params.ipAddress.trim() || null;
  if (params.macAddress !== undefined) updateSet.macAddress = params.macAddress.trim() || null;
  if (params.username !== undefined) updateSet.username = params.username.trim() || null;
  if (params.password !== undefined) {
    updateSet.passwordEncrypted = params.password ? encryptInventorySecret(params.password) : null;
  }
  if (params.notes !== undefined) updateSet.notes = params.notes.trim() || null;

  await db.update(siteDevices).set(updateSet).where(eq(siteDevices.id, id));
  return { success: true };
}

export async function deleteSiteDevice(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(siteDevices).where(eq(siteDevices.id, id));
  return { success: true };
}

export async function revealDevicePassword(id: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [dev] = await db.select().from(siteDevices).where(eq(siteDevices.id, id));
  if (!dev || !dev.passwordEncrypted) return "";
  return decryptInventorySecret(dev.passwordEncrypted);
}

// ---------------- Dish Links & Credentials ----------------

export async function createDishLink(params: {
  siteId: number;
  transmitterDeviceId: number;
  receiverDeviceId: number;
  linkPassword?: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  if (params.transmitterDeviceId === params.receiverDeviceId) {
    throw new Error("لا يمكن ربط الصحن بنفسه");
  }

  const [inserted] = await db.insert(dishLinks).values({
    siteId: params.siteId,
    transmitterDeviceId: params.transmitterDeviceId,
    receiverDeviceId: params.receiverDeviceId,
    linkPasswordEncrypted: params.linkPassword ? encryptInventorySecret(params.linkPassword) : null,
    notes: params.notes?.trim() || null,
  });

  return { id: inserted.insertId };
}

export async function deleteDishLink(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(dishLinks).where(eq(dishLinks.id, id));
  return { success: true };
}

export async function revealDishLinkPassword(id: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [link] = await db.select().from(dishLinks).where(eq(dishLinks.id, id));
  if (!link || !link.linkPasswordEncrypted) return "";
  return decryptInventorySecret(link.linkPasswordEncrypted);
}

// ---------------- Home Modems & Credentials ----------------

export interface HomeModemDetail extends Omit<HomeModem, "passwordEncrypted"> {
  hasPassword: boolean;
  siteName: string | null;
}

export async function listHomeModems(filters?: { search?: string; siteId?: number }): Promise<HomeModemDetail[]> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const modems = await db.select().from(homeModems).orderBy(desc(homeModems.createdAt));
  const sites = await db.select().from(inventorySites);
  const siteMap = new Map(sites.map(s => [s.id, s.name]));

  let result: HomeModemDetail[] = modems.map(m => ({
    id: m.id,
    ownerName: m.ownerName,
    ipAddress: m.ipAddress,
    siteId: m.siteId,
    username: m.username,
    notes: m.notes,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    hasPassword: Boolean(m.passwordEncrypted && m.passwordEncrypted.length > 0),
    siteName: m.siteId ? siteMap.get(m.siteId) || null : null,
  }));

  if (filters?.siteId) {
    result = result.filter(m => m.siteId === filters.siteId);
  }
  if (filters?.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    result = result.filter(
      m =>
        m.ownerName.toLowerCase().includes(q) ||
        m.ipAddress.toLowerCase().includes(q) ||
        (m.username && m.username.toLowerCase().includes(q)) ||
        (m.notes && m.notes.toLowerCase().includes(q))
    );
  }

  return result;
}

export async function createHomeModem(data: {
  ownerName: string;
  ipAddress: string;
  siteId?: number;
  username?: string;
  password?: string;
  notes?: string;
  deductFromItemId?: number;
  userId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // If deducting from warehouse stock
  if (data.deductFromItemId) {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, data.deductFromItemId));
    if (!item) throw new Error("المعدة المحددة للخصم غير موجودة في الكتالوج");
    if (item.warehouseStock < 1) {
      throw new Error(`رصيد المودم (${item.name}) في المخزون غير كافٍ للخصم (الرصيد الحالي: ${item.warehouseStock})`);
    }

    // Decrement warehouse stock
    await db
      .update(inventoryItems)
      .set({ warehouseStock: item.warehouseStock - 1 })
      .where(eq(inventoryItems.id, item.id));

    // If siteId provided, also update site equipment balance
    if (data.siteId) {
      const [existingBalance] = await db
        .select()
        .from(siteEquipmentBalances)
        .where(
          sql`${siteEquipmentBalances.siteId} = ${data.siteId} AND ${siteEquipmentBalances.itemId} = ${item.id}`
        );

      if (existingBalance) {
        await db
          .update(siteEquipmentBalances)
          .set({ quantity: existingBalance.quantity + 1, updatedAt: new Date() })
          .where(eq(siteEquipmentBalances.id, existingBalance.id));
      } else {
        await db.insert(siteEquipmentBalances).values({
          siteId: data.siteId,
          itemId: item.id,
          quantity: 1,
          notes: `مودم منزلي للمشترك ${data.ownerName}`,
        });
      }
    }

    // Record movement
    await db.insert(inventoryMovements).values({
      movementNumber: `DSP-${Date.now().toString().slice(-6)}`,
      type: "dispatch_to_site",
      itemId: item.id,
      siteId: data.siteId || null,
      quantity: 1,
      recipientOrTech: data.ownerName,
      reasonOrNotes: `خصم من المخزون وتركيب مودم منزلي للمشترك ${data.ownerName}`,
      createdByUserId: data.userId || null,
    });
  }

  const [inserted] = await db.insert(homeModems).values({
    ownerName: data.ownerName.trim(),
    ipAddress: data.ipAddress.trim(),
    siteId: data.siteId || null,
    username: data.username?.trim() || null,
    passwordEncrypted: data.password ? encryptInventorySecret(data.password) : null,
    notes: data.notes?.trim() || null,
  });

  return { id: inserted.insertId };
}

export async function updateHomeModem(
  id: number,
  data: {
    ownerName?: string;
    ipAddress?: string;
    siteId?: number | null;
    username?: string;
    password?: string;
    notes?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const updateSet: Record<string, any> = {};
  if (data.ownerName !== undefined) updateSet.ownerName = data.ownerName.trim();
  if (data.ipAddress !== undefined) updateSet.ipAddress = data.ipAddress.trim();
  if (data.siteId !== undefined) updateSet.siteId = data.siteId;
  if (data.username !== undefined) updateSet.username = data.username.trim() || null;
  if (data.password !== undefined) {
    updateSet.passwordEncrypted = data.password ? encryptInventorySecret(data.password) : null;
  }
  if (data.notes !== undefined) updateSet.notes = data.notes.trim() || null;

  await db.update(homeModems).set(updateSet).where(eq(homeModems.id, id));
  return { success: true };
}

export async function deleteHomeModem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(homeModems).where(eq(homeModems.id, id));
  return { success: true };
}

export async function revealHomeModemPassword(id: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [m] = await db.select().from(homeModems).where(eq(homeModems.id, id));
  if (!m || !m.passwordEncrypted) return "";
  return decryptInventorySecret(m.passwordEncrypted);
}
