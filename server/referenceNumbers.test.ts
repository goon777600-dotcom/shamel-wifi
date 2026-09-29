import { describe, expect, it } from "vitest";
import { temporaryReference } from "./accounting";

describe("أرقام المستندات المؤقتة", () => {
  it("تبقى أقصر من حد عمود رقم المستند", () => {
    for (const prefix of ["INV", "RCP", "EXP", "TRN"]) {
      const value = temporaryReference(prefix);
      expect(value).toMatch(new RegExp(`^TMP-${prefix}-`));
      expect(value.length).toBeLessThanOrEqual(40);
    }
  });
});
