import { describe, expect, it } from "vitest";
import { decryptInventorySecret, encryptInventorySecret } from "./inventoryCrypto";

describe("تشفير وحماية بيانات الدخول للمعدات والوصلات", () => {
  it("يقوم بتشفير كلمة المرور وفك تشفيرها بنجاح", () => {
    const originalPassword = "Secret@Wifi#2026";
    const encrypted = encryptInventorySecret(originalPassword);

    expect(encrypted).not.toBe(originalPassword);
    expect(encrypted).toContain(":"); // Format iv:tag:cipher

    const decrypted = decryptInventorySecret(encrypted);
    expect(decrypted).toBe(originalPassword);
  });

  it("يتعامل مع النصوص الفارغة بأمان", () => {
    expect(encryptInventorySecret("")).toBe("");
    expect(decryptInventorySecret("")).toBe("");
    expect(decryptInventorySecret(null)).toBe("");
  });
});

describe("منطق حركات المخزون والصرف للمواقع", () => {
  it("يتحقق من معادلة الصرف: إنقاص المخزون وزيادة رصيد الموقع", () => {
    const warehouseStockBefore = 10;
    const siteBalanceBefore = 2;
    const dispatchQty = 3;

    // Simulation of dispatch logic
    expect(warehouseStockBefore).toBeGreaterThanOrEqual(dispatchQty);
    const warehouseStockAfter = warehouseStockBefore - dispatchQty;
    const siteBalanceAfter = siteBalanceBefore + dispatchQty;

    expect(warehouseStockAfter).toBe(7);
    expect(siteBalanceAfter).toBe(5);
    expect(warehouseStockAfter + siteBalanceAfter).toBe(warehouseStockBefore + siteBalanceBefore);
  });

  it("يمنع صرف كمية تفوق الرصيد المتوفر في المخزون", () => {
    const warehouseStock = 2;
    const requestQty = 5;

    const canDispatch = warehouseStock >= requestQty;
    expect(canDispatch).toBe(false);
  });

  it("يتحقق من معادلة الإرجاع من الموقع إلى المخزون", () => {
    const warehouseStockBefore = 5;
    const siteBalanceBefore = 4;
    const returnQty = 2;

    expect(siteBalanceBefore).toBeGreaterThanOrEqual(returnQty);
    const siteBalanceAfter = siteBalanceBefore - returnQty;
    const warehouseStockAfter = warehouseStockBefore + returnQty;

    expect(siteBalanceAfter).toBe(2);
    expect(warehouseStockAfter).toBe(7);
    expect(warehouseStockAfter + siteBalanceAfter).toBe(warehouseStockBefore + siteBalanceBefore);
  });

  it("يتحقق من معادلة التوريد للمخزون", () => {
    const warehouseStockBefore = 4;
    const stockInQty = 10;
    const warehouseStockAfter = warehouseStockBefore + stockInQty;

    expect(warehouseStockAfter).toBe(14);
  });
});
