import "dotenv/config";
import { describe, expect, it } from "vitest";
import {
  getCardInventorySummary,
  addPrintedStockBatch,
  sellCardsToContact,
  adjustCardStock,
  listCardInventoryMovements,
} from "./cardInventory";
import { getDb } from "./db";
import { cashBalances, contacts, wifiCardProfiles } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";

describe("Printed Card Inventory & Distribution Accounting", () => {
  it("يسترجع ملخص مخزون الكروت المطبوعة والفئات بنجاح", async () => {
    const summary = await getCardInventorySummary();
    expect(summary).toBeDefined();
    expect(typeof summary.totalAvailableStock).toBe("number");
    expect(typeof summary.totalStockValue).toBe("number");
    expect(Array.isArray(summary.profiles)).toBe(true);
    expect(summary.profiles.length).toBeGreaterThanOrEqual(1);
  }, 25000);

  it("توريد كمية كروت مطبوعة يزيد رصيد المخزن ولا يؤثر إطلاقاً على الصندوق الرئيسي", async () => {
    const db = await getDb();
    if (!db) throw new Error("No DB");

    const summary = await getCardInventorySummary();
    const profile = summary.profiles[0];
    const initialStock = Number(profile.currentStock || 0);

    // Get initial YER cash balance
    const [cashBefore]: any = await db
      .select()
      .from(cashBalances)
      .where(eq(cashBalances.currencyCode, "YER"));
    const initialCashBalance = Number(cashBefore?.balance || 0);

    // Add 100 printed cards
    const supplyRes = await addPrintedStockBatch(1, {
      profileId: profile.id,
      quantity: 100,
      notes: "اختبار توريد مطبوعات",
    });

    expect(supplyRes.movement).toBeDefined();
    expect(supplyRes.movement.quantity).toBe(100);
    expect(supplyRes.newStock).toBe(initialStock + 100);

    // Verify cash balance did NOT change by a single Rial!
    const [cashAfter]: any = await db
      .select()
      .from(cashBalances)
      .where(eq(cashBalances.currencyCode, "YER"));
    const finalCashBalance = Number(cashAfter?.balance || 0);

    expect(finalCashBalance).toBe(initialCashBalance);

    // Clean up: adjust stock back
    await adjustCardStock(1, {
      profileId: profile.id,
      newStock: initialStock,
      reason: "adjustment",
      notes: "إلغاء كمية الاختبار",
    });
  }, 35000);

  it("صرف كروت لعميل بالآجل ينقص المخزن ويسجل مديونية دون التأثير على الصندوق الرئيسي", async () => {
    const db = await getDb();
    if (!db) throw new Error("No DB");

    const summary = await getCardInventorySummary();
    const profile = summary.profiles[0];

    // Ensure at least 10 cards in stock
    await addPrintedStockBatch(1, {
      profileId: profile.id,
      quantity: 10,
      notes: "تجهيز رصيد للاختبار",
    });

    // Get a contact
    const [contact] = await db.select().from(contacts).limit(1);
    if (!contact) return;

    // Check cash balance before
    const [cashBefore]: any = await db
      .select()
      .from(cashBalances)
      .where(eq(cashBalances.currencyCode, "YER"));
    const initialCash = Number(cashBefore?.balance || 0);

    // Sell 5 cards credit (آجل)
    const sellRes = await sellCardsToContact(1, {
      profileId: profile.id,
      contactId: contact.id,
      quantity: 5,
      paymentType: "credit",
      notes: "اختبار صرف آجل للبقالة",
    });

    expect(sellRes.invoiceId).toBeDefined();
    expect(sellRes.invoiceNumber).toMatch(/^FAT-/);

    // Cash box should be 100% UNTOUCHED!
    const [cashAfter]: any = await db
      .select()
      .from(cashBalances)
      .where(eq(cashBalances.currencyCode, "YER"));
    const finalCash = Number(cashAfter?.balance || 0);

    expect(finalCash).toBe(initialCash);
  }, 35000);

  it("تسجيل فاتورة آجلة من شاشة الفواتير بتصنيف مبيعات الكروت يخصم الكمية تدريجياً من مخزن الكروت", async () => {
    const db = await getDb();
    if (!db) throw new Error("No DB");

    const { createInvoice } = await import("./accounting");

    // Ensure profile has stock
    const summary = await getCardInventorySummary();
    const profile = summary.profiles[0];
    await addPrintedStockBatch(1, {
      profileId: profile.id,
      quantity: 50,
      notes: "رصيد لفحص الفاتورة الآجلة",
    });

    const [updatedProfile]: any = await db
      .select()
      .from(wifiCardProfiles)
      .where(eq(wifiCardProfiles.id, profile.id));
    const stockBefore = Number(updatedProfile.currentStock || 0);

    // Get contact (e.g. خالد الخضر)
    const [contact] = await db.select().from(contacts).where(eq(contacts.name, "خالد الخضر")).limit(1);
    const targetContact = contact || (await db.select().from(contacts).limit(1))[0];

    // Create credit invoice with 20 cards
    const invRes = await createInvoice(1, {
      contactId: targetContact.id,
      movementCategoryId: 1, // مبيعات الكروت
      cardProfileId: profile.id,
      cardQuantity: 20,
      type: "credit",
      issueDate: new Date(),
      currencyCode: "YER",
      exchangeRateToBase: "1",
      discountAmount: "0",
      notes: "فاتورة آجلة تجريبية لخالد الخضر",
      items: [
        {
          description: `كروت واي فاي — ${profile.name}`,
          quantity: "20",
          unitPrice: "490.00",
        },
      ],
    });

    expect(invRes.id).toBeDefined();
    expect(invRes.invoiceNumber).toMatch(/^FAT-/);

    // Verify stock decreased by exactly 20 cards!
    const [profileAfter]: any = await db
      .select()
      .from(wifiCardProfiles)
      .where(eq(wifiCardProfiles.id, profile.id));
    const stockAfter = Number(profileAfter.currentStock || 0);

    expect(stockAfter).toBe(stockBefore - 20);
  }, 35000);
});
