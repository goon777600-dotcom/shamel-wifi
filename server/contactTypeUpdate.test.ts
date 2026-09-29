import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  audits: [] as Record<string, unknown>[],
  invoices: [{ id: 70, contactId: 17, totalAmount: "100.00" }],
  receipts: [{ id: 71, contactId: 17, amount: "40.00" }],
  expenses: [{ id: 72, contactId: 17, amount: "20.00" }],
}));

vi.mock("./db", () => ({
  getDb: async () => ({
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => { state.updates.push(values); } }) }),
    insert: () => ({ values: async (values: Record<string, unknown>) => { state.audits.push(values); } }),
  }),
}));

import { updateContact } from "./accounting";

describe("تعديل نوع الحساب", () => {
  beforeEach(() => { state.updates.length = 0; state.audits.length = 0; });

  it("يحدّث بيانات الحساب ونوعه فقط دون تنفيذ أي تعديل على مستنداته المالية المرتبطة", async () => {
    const financialDocumentsBefore = JSON.parse(JSON.stringify({ invoices: state.invoices, receipts: state.receipts, expenses: state.expenses }));
    await updateContact(1, { id: 17, name: "بقالة النور", type: "grocery", phone: "+967777000000", isActive: true });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ name: "بقالة النور", type: "grocery", isActive: true });
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({ entityType: "contact", entityId: 17, action: "update" });
    expect({ invoices: state.invoices, receipts: state.receipts, expenses: state.expenses }).toEqual(financialDocumentsBefore);
    expect(state.invoices[0]?.contactId).toBe(17);
    expect(state.receipts[0]?.contactId).toBe(17);
    expect(state.expenses[0]?.contactId).toBe(17);
  });
});
