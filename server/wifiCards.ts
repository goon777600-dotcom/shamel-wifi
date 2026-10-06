import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  networkRouters,
  wifiCardBatches,
  wifiCardProfiles,
  wifiCards,
  NetworkRouter,
  WifiCardProfile,
  WifiCardBatch,
  WifiCard,
  cashMovements,
  currencies,
  cashBalances,
} from "../drizzle/schema";
import { RouterosClient } from "./mikrotik/routerosClient";

export interface TestRouterResult {
  ok: boolean;
  message: string;
  identity?: string;
  version?: string;
  boardName?: string;
  uptime?: string;
  cpuLoad?: string;
  freeMemoryMb?: number;
  userManagerMode?: "v6" | "v7" | "none";
  userManagerProfiles?: string[];
  hotspotProfiles?: string[];
  diagnosticHint?: string;
}

export async function listRouters(): Promise<NetworkRouter[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(networkRouters).orderBy(desc(networkRouters.isDefault), desc(networkRouters.id));
}

export async function getRouter(id: number): Promise<NetworkRouter | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [res] = await db.select().from(networkRouters).where(eq(networkRouters.id, id)).limit(1);
  return res;
}

export async function getDefaultRouter(): Promise<NetworkRouter | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [res] = await db.select().from(networkRouters).where(eq(networkRouters.isDefault, true)).limit(1);
  if (res) return res;
  const [fallback] = await db.select().from(networkRouters).limit(1);
  return fallback;
}

export async function saveRouter(
  userId: number,
  input: {
    id?: number;
    name: string;
    host: string;
    apiPort?: number;
    username: string;
    password?: string;
    useTls?: boolean;
    mode?: "usermanager_v6" | "usermanager_v7" | "hotspot";
    customer?: string;
    isDefault?: boolean;
  }
): Promise<NetworkRouter> {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");

  const port = input.apiPort || 8728;
  const mode = input.mode || "usermanager_v6";
  const customer = input.customer || "admin";
  const isDefault = input.isDefault ?? true;

  if (isDefault) {
    // Reset other defaults
    await db.update(networkRouters).set({ isDefault: false });
  }

  if (input.id) {
    await db
      .update(networkRouters)
      .set({
        name: input.name,
        host: input.host,
        apiPort: port,
        username: input.username,
        password: input.password ?? "",
        useTls: input.useTls ?? false,
        mode,
        customer,
        isDefault,
      })
      .where(eq(networkRouters.id, input.id));

    const [updated] = await db.select().from(networkRouters).where(eq(networkRouters.id, input.id));
    return updated;
  } else {
    const [inserted] = await db.insert(networkRouters).values({
      name: input.name,
      host: input.host,
      apiPort: port,
      username: input.username,
      password: input.password ?? "",
      useTls: input.useTls ?? false,
      mode,
      customer,
      isDefault,
      status: "unknown",
    });

    const [created] = await db.select().from(networkRouters).where(eq(networkRouters.id, (inserted as any).insertId));
    return created;
  }
}

export async function testRouterConnection(config: {
  id?: number;
  host: string;
  port?: number;
  username: string;
  password?: string;
  useTls?: boolean;
}): Promise<TestRouterResult> {
  const db = await getDb();
  const client = new RouterosClient({
    host: config.host,
    port: config.port || 8728,
    user: config.username,
    password: config.password || "",
    useTls: config.useTls || false,
    timeoutMs: 3500,
  });

  try {
    await client.connect();
    const sysInfo = await client.getSystemInfo();

    // Check user manager
    let userManagerMode: "v6" | "v7" | "none" = "none";
    let umProfiles: string[] = [];
    try {
      const um = await client.getUserManagerProfiles();
      userManagerMode = um.mode;
      umProfiles = um.profiles.map(p => p.name).filter(Boolean);
    } catch {
      userManagerMode = "none";
    }

    // Check hotspot
    let hsProfiles: string[] = [];
    try {
      const hp = await client.getHotspotProfiles();
      hsProfiles = hp.map(p => p.name).filter(Boolean);
    } catch {}

    client.destroy();

    // Update status in DB if router ID is provided
    if (db && config.id) {
      await db
        .update(networkRouters)
        .set({
          status: "online",
          lastCheckedAt: new Date(),
          lastError: null,
          systemIdentity: sysInfo.identity,
          routerosVersion: sysInfo.version,
          boardName: sysInfo.boardName,
          uptime: sysInfo.uptime,
        })
        .where(eq(networkRouters.id, config.id));
    }

    return {
      ok: true,
      message: `تم الاتصال بنجاح بموجّه ${sysInfo.identity} (إصدار RouterOS ${sysInfo.version})`,
      identity: sysInfo.identity,
      version: sysInfo.version,
      boardName: sysInfo.boardName,
      uptime: sysInfo.uptime,
      cpuLoad: sysInfo.cpuLoad,
      freeMemoryMb: sysInfo.freeMemoryMb,
      userManagerMode,
      userManagerProfiles: umProfiles,
      hotspotProfiles: hsProfiles,
    };
  } catch (err: any) {
    client.destroy();
    const errMsg = err.message || "فشل الاتصال غير محدد";

    let diagnosticHint = "";
    if (errMsg.includes("ECONNREFUSED") || errMsg.includes("8728")) {
      diagnosticHint =
        "منفذ الـ API (8728) مغلق في الميكروتك! لتفعيله:\n" +
        "1. افتح WinBox واتصل بالموجّه.\n" +
        "2. اضغط New Terminal ونفّذ الأمر التالي:\n" +
        "   /ip service enable api\n" +
        "3. أو اذهب إلى IP -> Services -> api واضغط تفعيل (Checkmark).";
    } else if (errMsg.includes("ETIMEDOUT") || errMsg.includes("انتهت مهلة")) {
      diagnosticHint =
        "تعذر الوصول لعنوان الميكروتك. تأكد من أن جهاز الكمبيوتر متصل بنفس شبكة الواي فاي للراوتر أو أن العنوان صحيح (مثل 3.3.3.3 أو 172.16.0.1).";
    } else if (errMsg.includes("تسجيل الدخول") || errMsg.includes("invalid user")) {
      diagnosticHint = "اسم المستخدم أو كلمة المرور للميكروتك غير صحيحة. راجع بيانات الدخول المسجلة في WinBox.";
    }

    if (db && config.id) {
      await db
        .update(networkRouters)
        .set({
          status: "error",
          lastCheckedAt: new Date(),
          lastError: errMsg,
        })
        .where(eq(networkRouters.id, config.id));
    }

    return {
      ok: false,
      message: errMsg,
      diagnosticHint,
    };
  }
}

// ----------------------------------------------------
// Profiles
// ----------------------------------------------------
export async function listCardProfiles(): Promise<WifiCardProfile[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(wifiCardProfiles).where(eq(wifiCardProfiles.isActive, true)).orderBy(wifiCardProfiles.price);
}

export async function saveCardProfile(input: {
  id?: number;
  name: string;
  price: string;
  currencyCode?: string;
  timeLimit?: string;
  dataLimitBytes?: string;
  dataLimitLabel?: string;
  routerProfileName?: string;
  notes?: string;
}): Promise<WifiCardProfile> {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");

  const currencyCode = input.currencyCode || "YER";
  const dataLimitBytes = input.dataLimitBytes ? input.dataLimitBytes : "0";

  if (input.id) {
    await db
      .update(wifiCardProfiles)
      .set({
        name: input.name,
        price: input.price,
        currencyCode,
        timeLimit: input.timeLimit || null,
        dataLimitBytes,
        dataLimitLabel: input.dataLimitLabel || null,
        routerProfileName: input.routerProfileName || null,
        notes: input.notes || null,
      })
      .where(eq(wifiCardProfiles.id, input.id));

    const [updated] = await db.select().from(wifiCardProfiles).where(eq(wifiCardProfiles.id, input.id));
    return updated;
  } else {
    const [inserted] = await db.insert(wifiCardProfiles).values({
      name: input.name,
      price: input.price,
      currencyCode,
      timeLimit: input.timeLimit || null,
      dataLimitBytes,
      dataLimitLabel: input.dataLimitLabel || null,
      routerProfileName: input.routerProfileName || null,
      notes: input.notes || null,
      isActive: true,
    });

    const [created] = await db
      .select()
      .from(wifiCardProfiles)
      .where(eq(wifiCardProfiles.id, (inserted as any).insertId));
    return created;
  }
}

export async function deleteCardProfile(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(wifiCardProfiles).set({ isActive: false }).where(eq(wifiCardProfiles.id, id));
}

// ----------------------------------------------------
// Card Generation & Batches
// ----------------------------------------------------
function generateRandomCode(length: number, type: "numbers" | "alphanumeric"): string {
  if (type === "numbers") {
    // Digits only: e.g. 6 digits, without leading 0 for clarity
    const firstDigit = Math.floor(Math.random() * 9) + 1;
    let rest = "";
    for (let i = 1; i < length; i++) {
      rest += Math.floor(Math.random() * 10).toString();
    }
    return `${firstDigit}${rest}`;
  } else {
    // Alphanumeric excluding ambiguous chars (0, O, 1, I, l)
    const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    let code = "";
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}

export async function generateCardsBatch(
  userId: number,
  input: {
    routerId?: number;
    profileId: number;
    quantity: number;
    codeFormat?: "username_only" | "username_password";
    codeLength?: number;
    codeType?: "numbers" | "alphanumeric";
    prefix?: string;
    notes?: string;
  }
): Promise<{ batch: WifiCardBatch; cards: WifiCard[]; syncResult: { synced: boolean; message: string } }> {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");

  const [profile] = await db.select().from(wifiCardProfiles).where(eq(wifiCardProfiles.id, input.profileId)).limit(1);
  if (!profile) throw new Error("الباقة المحددة غير موجودة");

  const router = input.routerId ? await getRouter(input.routerId) : await getDefaultRouter();

  const quantity = Math.min(Math.max(input.quantity, 1), 500); // limit to 500 per batch for performance
  const codeFormat = input.codeFormat || "username_only";
  const codeLength = input.codeLength ? Math.min(Math.max(input.codeLength, 4), 12) : 6;
  const codeType = input.codeType || "numbers";
  const prefix = (input.prefix || "").trim().toUpperCase();

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const timeStr = Math.floor(now.getTime() / 1000).toString().slice(-4);
  const batchNumber = `B-${dateStr}-${timeStr}-${Math.floor(Math.random() * 900 + 100)}`;

  const unitPriceNum = Number(profile.price);
  const totalAmount = (unitPriceNum * quantity).toFixed(2);

  // Generate unique codes
  const generatedCodes = new Set<string>();
  const cardItems: Array<{ username: string; password: string }> = [];

  while (cardItems.length < quantity) {
    const rawCode = generateRandomCode(codeLength, codeType);
    const code = prefix ? `${prefix}${rawCode}` : rawCode;

    if (!generatedCodes.has(code)) {
      generatedCodes.add(code);
      if (codeFormat === "username_only") {
        cardItems.push({ username: code, password: code });
      } else {
        const pass = generateRandomCode(codeLength, codeType);
        cardItems.push({ username: code, password: pass });
      }
    }
  }

  // Insert batch
  const [batchInsert] = await db.insert(wifiCardBatches).values({
    batchNumber,
    routerId: router?.id || null,
    profileId: profile.id,
    profileName: profile.name,
    quantity,
    unitPrice: profile.price,
    totalAmount,
    currencyCode: profile.currencyCode,
    codeFormat,
    codeLength,
    codeType,
    prefix,
    status: "ready",
    notes: input.notes || null,
    createdByUserId: userId,
  });

  const batchId = (batchInsert as any).insertId;

  // Insert cards in DB
  const cardsToInsert = cardItems.map(c => ({
    batchId,
    routerId: router?.id || null,
    profileId: profile.id,
    username: c.username,
    password: c.password,
    price: profile.price,
    currencyCode: profile.currencyCode,
    profileName: profile.name,
    timeLimit: profile.timeLimit,
    dataLimitLabel: profile.dataLimitLabel,
    status: "available" as const,
    syncedToRouter: false,
  }));

  // Batch insert
  await db.insert(wifiCards).values(cardsToInsert);

  const [batch] = await db.select().from(wifiCardBatches).where(eq(wifiCardBatches.id, batchId));
  const createdCards = await db.select().from(wifiCards).where(eq(wifiCards.batchId, batchId));

  // Try to sync to MikroTik Router if router is configured
  let syncResult = { synced: false, message: "لم يتم تحديد موجّه للمزامنة المباشرة" };

  if (router) {
    syncResult = await syncCardsToRouterInternal(db, router, batchId, createdCards, profile);
  }

  return {
    batch,
    cards: createdCards,
    syncResult,
  };
}

async function syncCardsToRouterInternal(
  db: any,
  router: NetworkRouter,
  batchId: number,
  cards: WifiCard[],
  profile: WifiCardProfile
): Promise<{ synced: boolean; message: string }> {
  const client = new RouterosClient({
    host: router.host,
    port: router.apiPort,
    user: router.username,
    password: router.password || "",
    useTls: router.useTls,
    timeoutMs: 3500,
  });

  try {
    await client.connect();

    const mode = router.mode;
    let successCount = 0;
    const errors: string[] = [];

    for (const card of cards) {
      try {
        if (mode === "usermanager_v6") {
          await client.addUserManagerCard(
            "v6",
            {
              username: card.username,
              password: card.password,
              profileName: profile.routerProfileName || undefined,
              comment: `Batch ${batchId}`,
            },
            router.customer || "admin"
          );
        } else if (mode === "usermanager_v7") {
          await client.addUserManagerCard("v7", {
            username: card.username,
            password: card.password,
            profileName: profile.routerProfileName || undefined,
            comment: `Batch ${batchId}`,
          });
        } else {
          // Hotspot mode
          await client.addHotspotCard({
            username: card.username,
            password: card.password,
            profileName: profile.routerProfileName || undefined,
            timeLimit: profile.timeLimit || undefined,
            dataLimitBytes: profile.dataLimitBytes ? Number(profile.dataLimitBytes) : undefined,
            comment: `Batch ${batchId}`,
          });
        }

        successCount++;
        // Update individual card sync
        await db.update(wifiCards).set({ syncedToRouter: true }).where(eq(wifiCards.id, card.id));
      } catch (cardErr: any) {
        errors.push(`${card.username}: ${cardErr.message}`);
      }
    }

    client.destroy();

    if (successCount === cards.length) {
      await db.update(wifiCardBatches).set({ status: "synced", syncError: null }).where(eq(wifiCardBatches.id, batchId));
      return { synced: true, message: `تمت مزامنة جميع الكروت (${successCount} كرت) بنجاح إلى الميكروتك!` };
    } else if (successCount > 0) {
      await db
        .update(wifiCardBatches)
        .set({ status: "partial_sync", syncError: errors.slice(0, 3).join("; ") })
        .where(eq(wifiCardBatches.id, batchId));
      return {
        synced: true,
        message: `تمت مزامنة ${successCount} من أصل ${cards.length} كرت. بعض الكروت واجهت مشاكل: ${errors[0]}`,
      };
    } else {
      const errSummary = errors[0] || "تعذر إضافة الكروت إلى الميكروتك";
      await db
        .update(wifiCardBatches)
        .set({ status: "sync_failed", syncError: errSummary })
        .where(eq(wifiCardBatches.id, batchId));
      return { synced: false, message: `فشلت مزامنة الكروت إلى الميكروتك: ${errSummary}` };
    }
  } catch (err: any) {
    client.destroy();
    const errMsg = err.message || "تعذر الاتصال بالموجّه للمزامنة";
    await db
      .update(wifiCardBatches)
      .set({ status: "sync_failed", syncError: errMsg })
      .where(eq(wifiCardBatches.id, batchId));
    return {
      synced: false,
      message: `تم حفظ الكروت في النظام ولكن تعذر رفعها للميكروتك الآن (${errMsg}). يمكنك المزامنة لاحقاً بعد تشغيل أو ضبط الراوتر.`,
    };
  }
}

export async function syncBatchToRouter(
  batchId: number,
  routerId?: number
): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");

  const [batch] = await db.select().from(wifiCardBatches).where(eq(wifiCardBatches.id, batchId)).limit(1);
  if (!batch) throw new Error("دفعة الكروت غير موجودة");

  const router = routerId ? await getRouter(routerId) : (batch.routerId ? await getRouter(batch.routerId) : await getDefaultRouter());
  if (!router) throw new Error("لم يتم العثور على موجّه الميكروتك للمزامنة");

  const [profile] = await db.select().from(wifiCardProfiles).where(eq(wifiCardProfiles.id, batch.profileId!)).limit(1);
  if (!profile) throw new Error("باقة الكروت غير موجودة");

  const unSyncedCards = await db
    .select()
    .from(wifiCards)
    .where(sql`${wifiCards.batchId} = ${batchId} AND ${wifiCards.syncedToRouter} = false`);

  if (unSyncedCards.length === 0) {
    return { success: true, message: "جميع الكروت في هذه الدفعة متزامنة بالفعل مع الميكروتك!" };
  }

  const result = await syncCardsToRouterInternal(db, router, batchId, unSyncedCards, profile);
  return { success: result.synced, message: result.message };
}

export async function listBatches(): Promise<Array<WifiCardBatch & { availableCount: number; soldCount: number }>> {
  const db = await getDb();
  if (!db) return [];

  const batches = await db.select().from(wifiCardBatches).orderBy(desc(wifiCardBatches.id));

  // Get counts per batch
  const counts = await db
    .select({
      batchId: wifiCards.batchId,
      status: wifiCards.status,
      count: sql<number>`count(*)`,
    })
    .from(wifiCards)
    .groupBy(wifiCards.batchId, wifiCards.status);

  return batches.map(b => {
    let availableCount = 0;
    let soldCount = 0;
    for (const c of counts) {
      if (c.batchId === b.id) {
        if (c.status === "available") availableCount = Number(c.count);
        if (c.status === "sold" || c.status === "used") soldCount += Number(c.count);
      }
    }
    return {
      ...b,
      availableCount,
      soldCount,
    };
  });
}

export async function listCards(filters?: {
  batchId?: number;
  profileId?: number;
  status?: "available" | "sold" | "used" | "disabled";
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ cards: WifiCard[]; total: number }> {
  const db = await getDb();
  if (!db) return { cards: [], total: 0 };

  const conditions = [];
  if (filters?.batchId) conditions.push(eq(wifiCards.batchId, filters.batchId));
  if (filters?.profileId) conditions.push(eq(wifiCards.profileId, filters.profileId));
  if (filters?.status) conditions.push(eq(wifiCards.status, filters.status));
  if (filters?.search) {
    const s = `%${filters.search.trim()}%`;
    conditions.push(sql`(${wifiCards.username} LIKE ${s} OR ${wifiCards.password} LIKE ${s})`);
  }

  const whereClause = conditions.length > 0 ? sql.join(conditions, sql` AND `) : undefined;

  const [countRes] = await db
    .select({ count: sql<number>`count(*)` })
    .from(wifiCards)
    .where(whereClause);

  const query = db
    .select()
    .from(wifiCards)
    .where(whereClause)
    .orderBy(desc(wifiCards.id))
    .limit(filters?.limit || 100)
    .offset(filters?.offset || 0);

  const cards = await query;
  return { cards, total: Number(countRes?.count || 0) };
}

export async function sellCard(
  userId: number,
  input: {
    cardId: number;
    contactId?: number;
    soldNotes?: string;
    recordToCashBox?: boolean;
  }
): Promise<WifiCard> {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");

  const [card] = await db.select().from(wifiCards).where(eq(wifiCards.id, input.cardId)).limit(1);
  if (!card) throw new Error("الكرت غير موجود");
  if (card.status === "sold") throw new Error("الكرت مسجل كمباع مسبقاً");

  const soldAt = new Date();

  await db
    .update(wifiCards)
    .set({
      status: "sold",
      soldAt,
      soldToContactId: input.contactId || null,
      soldNotes: input.soldNotes || null,
    })
    .where(eq(wifiCards.id, input.cardId));

  // Record to cash box if requested
  if (input.recordToCashBox !== false) {
    try {
      const amount = card.price;
      const currency = card.currencyCode;

      // Update cash balance atomically
      await db.execute(
        sql`UPDATE cash_balances SET balance = balance + ${amount} WHERE currencyCode = ${currency}`
      );

      // Record cash movement
      await db.insert(cashMovements).values({
        direction: "in",
        type: "cash_invoice",
        currencyCode: currency,
        amount,
        occurredAt: soldAt,
        sourceType: "wifi_card",
        sourceId: card.id,
        description: `مبيعات كرت واي فاي: ${card.username} (${card.profileName})`,
        notes: input.soldNotes || `بيع كرت رقم ${card.username}`,
        createdByUserId: userId,
      });
    } catch (cashErr: any) {
      console.warn("Could not record card sale to cash box:", cashErr.message);
    }
  }

  const [updated] = await db.select().from(wifiCards).where(eq(wifiCards.id, input.cardId));
  return updated;
}

export async function deleteCard(cardId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(wifiCards).where(eq(wifiCards.id, cardId));
}

export async function deleteBatch(batchId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(wifiCards).where(eq(wifiCards.batchId, batchId));
  await db.delete(wifiCardBatches).where(eq(wifiCardBatches.id, batchId));
}
