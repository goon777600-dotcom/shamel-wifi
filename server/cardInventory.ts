import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  wifiCardProfiles,
  cardInventoryMovements,
  contacts,
  WifiCardProfile,
  CardInventoryMovement,
} from "../drizzle/schema";
import { createInvoice } from "./accounting";

export interface CardInventorySummary {
  totalAvailableStock: number;
  totalStockValue: number;
  profilesCount: number;
  todaySalesCount: number;
  todaySalesRevenue: number;
  profiles: Array<
    WifiCardProfile & {
      totalPrinted: number;
      totalSold: number;
    }
  >;
}

export async function getCardInventorySummary(): Promise<CardInventorySummary> {
  const db = await getDb();
  if (!db) {
    return {
      totalAvailableStock: 0,
      totalStockValue: 0,
      profilesCount: 0,
      todaySalesCount: 0,
      todaySalesRevenue: 0,
      profiles: [],
    };
  }

  const profilesList = await db
    .select()
    .from(wifiCardProfiles)
    .where(eq(wifiCardProfiles.isActive, true))
    .orderBy(wifiCardProfiles.price);

  let totalAvailableStock = 0;
  let totalStockValue = 0;

  // Calculate totals per profile
  const enrichedProfiles = await Promise.all(
    profilesList.map(async profile => {
      const stock = Number(profile.currentStock || 0);
      const price = Number(profile.price || 0);
      totalAvailableStock += stock;
      totalStockValue += stock * price;

      // Get printed & sold statistics
      const [printedRes]: any = await db.execute(
        sql`SELECT COALESCE(SUM(quantity), 0) as total FROM card_inventory_movements WHERE profileId = ${profile.id} AND movementType = 'print_supply'`
      );
      const [soldRes]: any = await db.execute(
        sql`SELECT COALESCE(SUM(quantity), 0) as total FROM card_inventory_movements WHERE profileId = ${profile.id} AND movementType = 'sale_invoice'`
      );

      const totalPrinted = Number(printedRes?.[0]?.total || 0);
      const totalSold = Number(soldRes?.[0]?.total || 0);

      return {
        ...profile,
        totalPrinted,
        totalSold,
      };
    })
  );

  // Today's sales calculations (since midnight UTC)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todayRes]: any = await db.execute(
    sql`SELECT COALESCE(SUM(quantity), 0) as count, COALESCE(SUM(totalAmount), 0) as revenue 
        FROM card_inventory_movements 
        WHERE movementType = 'sale_invoice' AND movementDate >= ${todayStart}`
  );

  const todaySalesCount = Number(todayRes?.[0]?.count || 0);
  const todaySalesRevenue = Number(todayRes?.[0]?.revenue || 0);

  return {
    totalAvailableStock,
    totalStockValue,
    profilesCount: enrichedProfiles.length,
    todaySalesCount,
    todaySalesRevenue,
    profiles: enrichedProfiles,
  };
}

export async function addPrintedStockBatch(
  userId: number,
  input: {
    profileId: number;
    quantity: number;
    notes?: string;
    movementDate?: Date;
  }
): Promise<{ movement: CardInventoryMovement; newStock: number }> {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");

  const quantity = Math.floor(Number(input.quantity));
  if (!quantity || quantity <= 0) {
    throw new Error("يجب تحديد كمية صالحة أكبر من الصفر");
  }

  const [profile] = await db
    .select()
    .from(wifiCardProfiles)
    .where(eq(wifiCardProfiles.id, input.profileId))
    .limit(1);

  if (!profile) {
    throw new Error("فئة الكرت المحددة غير موجودة");
  }

  const date = input.movementDate || new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(Math.random() * 900 + 100);
  const movementNumber = `CRD-IN-${dateStr}-${rand}`;

  const unitPrice = Number(profile.price || 0).toFixed(2);
  const totalAmount = (Number(profile.price || 0) * quantity).toFixed(2);

  const oldStock = Number(profile.currentStock || 0);
  const newStock = oldStock + quantity;

  // 1. Update profile stock atomically
  await db
    .update(wifiCardProfiles)
    .set({
      currentStock: newStock,
      updatedAt: new Date(),
    })
    .where(eq(wifiCardProfiles.id, profile.id));

  // 2. Insert movement record (no impact on cash box)
  const [insertRes] = await db.insert(cardInventoryMovements).values({
    movementNumber,
    profileId: profile.id,
    movementType: "print_supply",
    quantity,
    unitPrice,
    totalAmount,
    contactId: null,
    contactName: null,
    invoiceId: null,
    invoiceNumber: null,
    paymentType: "none",
    cashAccountId: null,
    balanceAfter: newStock,
    notes: input.notes?.trim() || `توريد طباعة ${quantity} كرت ${profile.name}`,
    createdByUserId: userId,
    movementDate: date,
  });

  const [movement] = await db
    .select()
    .from(cardInventoryMovements)
    .where(eq(cardInventoryMovements.id, (insertRes as any).insertId));

  return { movement, newStock };
}

export async function sellCardsToContact(
  userId: number,
  input: {
    profileId: number;
    contactId: number;
    quantity: number;
    unitPrice?: string;
    paymentType: "cash" | "credit";
    cashAccountId?: number;
    discountAmount?: string;
    notes?: string;
    issueDate?: Date;
  }
): Promise<{
  movement: CardInventoryMovement;
  invoiceId: number;
  invoiceNumber: string;
  newStock: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");

  const quantity = Math.floor(Number(input.quantity));
  if (!quantity || quantity <= 0) {
    throw new Error("يجب إدخال كمية كروت صحيحة أكبر من الصفر");
  }

  const [profile] = await db
    .select()
    .from(wifiCardProfiles)
    .where(eq(wifiCardProfiles.id, input.profileId))
    .limit(1);

  if (!profile) {
    throw new Error("فئة الكرت المحددة غير موجودة");
  }

  const currentStock = Number(profile.currentStock || 0);
  if (currentStock < quantity) {
    throw new Error(
      `الكمية المطلوبة (${quantity} كرت) غير متوفرة في المخزن! الرصيد المتبقي حالياً: ${currentStock} كرت فقط.`
    );
  }

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, input.contactId))
    .limit(1);

  if (!contact) {
    throw new Error("العميل أو البقالة المحددة غير موجودة في النظام");
  }

  const unitPrice = input.unitPrice && Number(input.unitPrice) > 0
    ? Number(input.unitPrice).toFixed(2)
    : Number(profile.price || 0).toFixed(2);

  const discount = input.discountAmount ? Number(input.discountAmount).toFixed(2) : "0.00";
  const date = input.issueDate || new Date();

  // 1. Create accounting invoice:
  // If paymentType === "cash": puts money directly into the cash box (creates cash movement).
  // If paymentType === "credit": records receivable debt on the contact, cash box is UNTOUCHED!
  const invoiceResult = await createInvoice(userId, {
    contactId: contact.id,
    movementCategoryId: 1, // مبيعات الكروت
    cashAccountId: input.paymentType === "cash" ? (input.cashAccountId || 1) : undefined,
    type: input.paymentType,
    issueDate: date,
    currencyCode: profile.currencyCode || "YER",
    exchangeRateToBase: "1",
    discountAmount: discount,
    notes: input.notes?.trim() || `فاتورة بيع ${quantity} كرت (${profile.name}) - ${contact.name}`,
    items: [
      {
        description: `كروت واي فاي: ${profile.name} (عدد ${quantity} كرت)`,
        quantity: String(quantity),
        unitPrice,
      },
    ],
  });

  // 2. Decrement profile stock
  const newStock = currentStock - quantity;
  await db
    .update(wifiCardProfiles)
    .set({
      currentStock: newStock,
      updatedAt: new Date(),
    })
    .where(eq(wifiCardProfiles.id, profile.id));

  // 3. Record movement in card inventory
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(Math.random() * 900 + 100);
  const movementNumber = `CRD-OUT-${dateStr}-${rand}`;
  const totalAmount = (Number(unitPrice) * quantity - Number(discount)).toFixed(2);

  const [insertRes] = await db.insert(cardInventoryMovements).values({
    movementNumber,
    profileId: profile.id,
    movementType: "sale_invoice",
    quantity,
    unitPrice,
    totalAmount,
    contactId: contact.id,
    contactName: contact.name,
    invoiceId: invoiceResult.id,
    invoiceNumber: invoiceResult.invoiceNumber,
    paymentType: input.paymentType,
    cashAccountId: input.paymentType === "cash" ? (input.cashAccountId || 1) : null,
    balanceAfter: newStock,
    notes: input.notes?.trim() || `صرف كروت لـ ${contact.name} (${input.paymentType === "cash" ? "نقداً" : "آجل"})`,
    createdByUserId: userId,
    movementDate: date,
  });

  const [movement] = await db
    .select()
    .from(cardInventoryMovements)
    .where(eq(cardInventoryMovements.id, (insertRes as any).insertId));

  return {
    movement,
    invoiceId: invoiceResult.id,
    invoiceNumber: invoiceResult.invoiceNumber,
    newStock,
  };
}

export async function adjustCardStock(
  userId: number,
  input: {
    profileId: number;
    newStock: number;
    reason: "adjustment" | "damaged";
    notes?: string;
  }
): Promise<{ movement: CardInventoryMovement; newStock: number }> {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");

  const [profile] = await db
    .select()
    .from(wifiCardProfiles)
    .where(eq(wifiCardProfiles.id, input.profileId))
    .limit(1);

  if (!profile) throw new Error("فئة الكرت المحددة غير موجودة");

  const targetStock = Math.max(0, Math.floor(input.newStock));
  const currentStock = Number(profile.currentStock || 0);
  const diff = targetStock - currentStock;

  if (diff === 0) {
    throw new Error("الرصيد المدخل مطابق للرصيد الحالي، لم يتم إجراء أي تعديل");
  }

  await db
    .update(wifiCardProfiles)
    .set({
      currentStock: targetStock,
      updatedAt: new Date(),
    })
    .where(eq(wifiCardProfiles.id, profile.id));

  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  const movementNumber = `CRD-ADJ-${dateStr}-${Math.floor(Math.random() * 900 + 100)}`;

  const [insertRes] = await db.insert(cardInventoryMovements).values({
    movementNumber,
    profileId: profile.id,
    movementType: input.reason,
    quantity: Math.abs(diff),
    unitPrice: profile.price,
    totalAmount: (Math.abs(diff) * Number(profile.price || 0)).toFixed(2),
    contactId: null,
    contactName: null,
    invoiceId: null,
    invoiceNumber: null,
    paymentType: "none",
    cashAccountId: null,
    balanceAfter: targetStock,
    notes: input.notes?.trim() || `تسوية جردية من ${currentStock} إلى ${targetStock}`,
    createdByUserId: userId,
    movementDate: date,
  });

  const [movement] = await db
    .select()
    .from(cardInventoryMovements)
    .where(eq(cardInventoryMovements.id, (insertRes as any).insertId));

  return { movement, newStock: targetStock };
}

export async function listCardInventoryMovements(input?: {
  profileId?: number;
  contactId?: number;
  movementType?: string;
  limit?: number;
}): Promise<CardInventoryMovement[]> {
  const db = await getDb();
  if (!db) return [];

  const limit = Math.min(Math.max(input?.limit || 100, 1), 500);

  let query = db.select().from(cardInventoryMovements);

  if (input?.profileId) {
    query = query.where(eq(cardInventoryMovements.profileId, input.profileId)) as any;
  }
  if (input?.contactId) {
    query = query.where(eq(cardInventoryMovements.contactId, input.contactId)) as any;
  }
  if (input?.movementType) {
    query = query.where(eq(cardInventoryMovements.movementType, input.movementType as any)) as any;
  }

  return query
    .orderBy(desc(cardInventoryMovements.movementDate), desc(cardInventoryMovements.id))
    .limit(limit);
}

export async function saveCardInventoryProfile(input: {
  id?: number;
  name: string;
  price: string;
  currencyCode?: string;
  timeLimit?: string;
  dataLimitLabel?: string;
  notes?: string;
  initialStock?: number;
}): Promise<WifiCardProfile> {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");

  const price = Number(input.price).toFixed(2);
  const currencyCode = input.currencyCode || "YER";
  const initialStock = Math.max(0, Math.floor(input.initialStock || 0));

  if (input.id) {
    await db
      .update(wifiCardProfiles)
      .set({
        name: input.name.trim(),
        price,
        currencyCode,
        timeLimit: input.timeLimit?.trim() || null,
        dataLimitLabel: input.dataLimitLabel?.trim() || null,
        notes: input.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(wifiCardProfiles.id, input.id));

    const [updated] = await db
      .select()
      .from(wifiCardProfiles)
      .where(eq(wifiCardProfiles.id, input.id));
    return updated;
  } else {
    const [inserted] = await db.insert(wifiCardProfiles).values({
      name: input.name.trim(),
      price,
      currencyCode,
      timeLimit: input.timeLimit?.trim() || null,
      dataLimitLabel: input.dataLimitLabel?.trim() || null,
      notes: input.notes?.trim() || null,
      currentStock: initialStock,
      isActive: true,
    });

    const [created] = await db
      .select()
      .from(wifiCardProfiles)
      .where(eq(wifiCardProfiles.id, (inserted as any).insertId));
    return created;
  }
}
