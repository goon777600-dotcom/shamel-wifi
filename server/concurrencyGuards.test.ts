import { describe, expect, it, vi } from "vitest";
import { lockCashCurrencies, lockReceiptResources } from "./accounting";

describe("أقفال العملات", () => {
  it("يقفل كل عملة مرة واحدة قبل قراءة أو تعديل الرصيد", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const onDuplicateKeyUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onDuplicateKeyUpdate });
    const insert = vi.fn().mockReturnValue({ values });
    await lockCashCurrencies({ execute, insert }, ["USD", "YER", "USD"]);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("يقفل فواتير سند القبض قبل قفل عملة الصندوق", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const lockCurrencies = vi.fn().mockResolvedValue(undefined);
    await lockReceiptResources({ execute }, [11, 12], "YER", lockCurrencies);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(lockCurrencies).toHaveBeenCalledWith(expect.anything(), ["YER"]);
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(lockCurrencies.mock.invocationCallOrder[0]);
  });
});
