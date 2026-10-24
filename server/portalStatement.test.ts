import { describe, expect, it } from "vitest";
import {
  createContact,
  getContactByPortalToken,
  rotateContactPortalToken,
  getContactStatement,
} from "./accounting";
import { getDb } from "./db";
import { contacts } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Public Statement Portal by Token", () => {
  it("should generate a portalToken on contact creation and allow fetching statement", async () => {
    const db = await getDb();
    if (!db) {
      console.warn("DB not available for unit test, skipping.");
      return;
    }

    // 1. Create a test contact
    const created = await createContact(1, {
      name: `بقالة التجربة ${Date.now()}`,
      type: "grocery",
      phone: "777000111",
      address: "شارع تعز",
    });

    expect(created.id).toBeGreaterThan(0);

    // 2. Fetch contact to get portalToken
    const statement = await getContactStatement(created.id);
    expect(statement.contact.portalToken).toBeDefined();
    expect(statement.contact.portalToken).toMatch(/^shm_[a-f0-9]{24}$/);

    const initialToken = statement.contact.portalToken!;

    // 3. Fetch via public portal token
    const portalData = await getContactByPortalToken(initialToken);
    expect(portalData.contact.id).toBe(created.id);
    expect(portalData.contact.name).toBe(statement.contact.name);
    expect(portalData.invoices).toBeDefined();
    expect(portalData.receipts).toBeDefined();

    // 4. Test invalid token
    await expect(getContactByPortalToken("shm_invalidtoken123456789")).rejects.toThrow();

    // 5. Test rotating token
    const rotated = await rotateContactPortalToken(1, created.id);
    expect(rotated.portalToken).toBeDefined();
    expect(rotated.portalToken).not.toBe(initialToken);

    // 6. Old token must now fail
    await expect(getContactByPortalToken(initialToken)).rejects.toThrow();

    // 7. New token must now succeed
    const newPortalData = await getContactByPortalToken(rotated.portalToken);
    expect(newPortalData.contact.id).toBe(created.id);

    // Clean up test contact
    await db.delete(contacts).where(eq(contacts.id, created.id));
  });
});
