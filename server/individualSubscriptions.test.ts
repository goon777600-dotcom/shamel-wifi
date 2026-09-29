import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditLogs, cashBalances, cashMovements, contacts, currencies, individualSubscriptionAccounts, individualSubscriptionAdjustments, individualSubscriptionCashBalances, individualSubscriptionCashMovements, individualSubscriptionCharges, individualSubscriptionPayments, individualSubscriptions, invoices, receipts } from "../drizzle/schema";

const state = vi.hoisted(() => ({
  inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
  charge: { id: 501, accountId: 88, currencyCode: "YER", amount: "4000.00", paidAmount: "0.00", discountAmount: "0.00", description: "اشتراك إنترنت", chargedAt: new Date("2026-08-25T09:00:00Z"), notes: null, status: "unpaid" },
}));

vi.mock("./db", () => {
  const db = {
    transaction: async (callback: (transaction: typeof db) => Promise<unknown>) => callback(db),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        state.inserts.push({ table, values });
        const result = [{ insertId: state.inserts.length }];
        return Object.assign(Promise.resolve(result), { onDuplicateKeyUpdate: async () => result });
      },
    }),
    select: () => ({
      from: (table: unknown) => {
        const rows = table === individualSubscriptionAccounts
          ? [{ id: 88, name: "خالد الخضر", status: "active" }]
          : table === individualSubscriptionCharges
            ? [state.charge]
            : table === currencies
              ? [{ code: "YER" }]
              : [];
        return {
          where: () => ({ limit: async () => rows }),
          orderBy: async () => rows,
          limit: async () => rows,
        };
      },
    }),
    execute: async () => [],
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push({ table, values });
          return [{ affectedRows: 1 }];
        },
      }),
    }),
  };
  return { getDb: async () => db };
});

import { createIndividualSubscriptionAccount, createIndividualSubscriptionCharge, createIndividualSubscriptionDiscount, recordIndividualSubscriptionPayment, updateIndividualSubscriptionCharge } from "./accounting";

describe("حسابات اشتراكات الأفراد المستقلة", () => {
  beforeEach(() => {
    state.inserts.splice(0);
    state.updates.splice(0);
    state.charge = { id: 501, accountId: 88, currencyCode: "YER", amount: "4000.00", paidAmount: "0.00", discountAmount: "0.00", description: "اشتراك إنترنت", chargedAt: new Date("2026-08-25T09:00:00Z"), notes: null, status: "unpaid" };
  });

  it("يفتح الحساب والسجل الأولي فقط دون إنشاء أي عميل أو فاتورة أو حركة صندوق", async () => {
    await createIndividualSubscriptionAccount(7, {
      name: "أحمد",
      phone: "+967777000000",
      initialSubscription: { name: "واي فاي المنزل", status: "active" },
    });

    const insertedTables = state.inserts.map(row => row.table);
    expect(insertedTables).toContain(individualSubscriptionAccounts);
    expect(insertedTables).toContain(individualSubscriptions);
    expect(insertedTables).toContain(auditLogs);
    expect(insertedTables).not.toContain(contacts);
    expect(insertedTables).not.toContain(invoices);
    expect(insertedTables).not.toContain(cashMovements);

    const accountInsert = state.inserts.find(row => row.table === individualSubscriptionAccounts)?.values;
    expect(accountInsert).toMatchObject({ name: "أحمد", phone: "+967777000000", status: "active", createdByUserId: 7 });
    expect(accountInsert).not.toHaveProperty("contactId");
    expect(accountInsert).not.toHaveProperty("packageId");
  });

  it("يسجل مبلغ الاشتراك والسداد في صندوق الأفراد فقط دون فاتورة أو سند قبض أو صندوق عام", async () => {
    await createIndividualSubscriptionCharge(7, { accountId: 88, currencyCode: "YER", amount: "4000", chargedAt: new Date("2026-08-25T09:00:00Z") });
    await recordIndividualSubscriptionPayment(7, { accountId: 88, chargeId: 501, amount: "4000", paymentDate: new Date("2026-08-25T10:00:00Z") });

    const insertedTables = state.inserts.map(row => row.table);
    expect(insertedTables).toContain(individualSubscriptionCharges);
    expect(insertedTables).toContain(individualSubscriptionPayments);
    expect(insertedTables).toContain(individualSubscriptionCashMovements);
    expect(insertedTables).toContain(individualSubscriptionCashBalances);
    expect(insertedTables).not.toContain(invoices);
    expect(insertedTables).not.toContain(receipts);
    expect(insertedTables).not.toContain(cashMovements);
    expect(insertedTables).not.toContain(cashBalances);
    expect(insertedTables).not.toContain(contacts);

    const payment = state.inserts.find(row => row.table === individualSubscriptionPayments)?.values;
    const movement = state.inserts.find(row => row.table === individualSubscriptionCashMovements)?.values;
    expect(payment).toMatchObject({ accountId: 88, chargeId: 501, amount: "4000.00", currencyCode: "YER" });
    expect(movement).toMatchObject({ direction: "in", type: "payment", amount: "4000.00", currencyCode: "YER" });
    expect(state.updates.some(row => row.table === individualSubscriptionCharges && row.values.status === "paid")).toBe(true);
  });

  it("يعدل مبلغ الاشتراك ويسجل خصماً دون أي حركة نقدية", async () => {
    await updateIndividualSubscriptionCharge(7, { accountId: 88, chargeId: 501, description: "اشتراك خالد", amount: "5000", chargedAt: new Date("2026-08-25T09:00:00Z") });
    await createIndividualSubscriptionDiscount(7, { accountId: 88, chargeId: 501, amount: "500", adjustmentDate: new Date("2026-08-25T10:00:00Z"), notes: "تخفيض" });

    const insertedTables = state.inserts.map(row => row.table);
    expect(insertedTables).toContain(individualSubscriptionAdjustments);
    expect(insertedTables).not.toContain(individualSubscriptionPayments);
    expect(insertedTables).not.toContain(individualSubscriptionCashMovements);
    expect(insertedTables).not.toContain(individualSubscriptionCashBalances);
    expect(insertedTables).not.toContain(cashMovements);
    expect(insertedTables).not.toContain(cashBalances);
    expect(state.updates.some(row => row.table === individualSubscriptionCharges && row.values.amount === "5000.00")).toBe(true);
    expect(state.updates.some(row => row.table === individualSubscriptionCharges && row.values.discountAmount === "500.00")).toBe(true);
  });
});
