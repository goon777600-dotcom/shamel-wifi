import "dotenv/config";
import { describe, expect, it } from "vitest";
import {
  generateCardsBatch,
  listCardProfiles,
  listRouters,
  testRouterConnection,
} from "./wifiCards";

describe("Wi-Fi Cards & MikroTik Router Integration", () => {
  it("يسترجع قائمة أجهزة الميكروتك المسجلة بنجاح", async () => {
    const routers = await listRouters();
    expect(Array.isArray(routers)).toBe(true);
    expect(routers.length).toBeGreaterThan(0);
    expect(routers[0].host).toBeDefined();
  });

  it("يسترجع باقات كروت الواي فاي الافتراضية للشبكة (200, 500, 1000 ريال)", async () => {
    const profiles = await listCardProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(3);
    const profile200 = profiles.find(p => p.name.includes("200"));
    expect(profile200).toBeDefined();
    expect(Number(profile200?.price)).toBe(200);
  });

  it("يعطي توجيهاً تشخيصياً واضحاً ومباشراً عندما يكون منفذ API مغلقاً", async () => {
    const result = await testRouterConnection({
      host: "127.0.0.1",
      port: 59999,
      username: "admin",
      password: "",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBeDefined();
  });

  it("يولد دفعة كروت واي فاي برموز فريدة وصحيحة وغير مكررة", async () => {
    const profiles = await listCardProfiles();
    const profile = profiles[0];

    const result = await generateCardsBatch(1, {
      profileId: profile.id,
      quantity: 5,
      codeFormat: "username_only",
      codeLength: 6,
      codeType: "numbers",
      prefix: "TEST-",
    });

    expect(result.batch).toBeDefined();
    expect(result.batch.quantity).toBe(5);
    expect(result.cards.length).toBe(5);

    // Verify all codes start with prefix and are 6 digits after prefix
    const codes = result.cards.map(c => c.username);
    expect(new Set(codes).size).toBe(5); // all unique
    for (const code of codes) {
      expect(code.startsWith("TEST-")).toBe(true);
      expect(code.length).toBe(11); // "TEST-" (5) + 6 digits
    }
  }, 15000);
});
