import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "../../..");

describe("رابط تطبيق المالك تحت /api/app", () => {
  it("يبني الواجهة وWouter على المسار نفسه", () => {
    const viteConfig = readFileSync(path.join(projectRoot, "vite.config.ts"), "utf8");
    const appSource = readFileSync(path.join(projectRoot, "client/src/App.tsx"), "utf8");

    expect(viteConfig).toContain('base: command === "build" ? "/api/app/" : "/"');
    expect(appSource).toContain('base="/api/app"');
  });

  it("يضبط PWA على رابط المالك ولا يكرر بادئة المسار", () => {
    const manifest = JSON.parse(readFileSync(path.join(projectRoot, "client/public/manifest.webmanifest"), "utf8"));
    const html = readFileSync(path.join(projectRoot, "client/index.html"), "utf8");

    expect(manifest).toMatchObject({
      id: "/api/app/",
      start_url: "/api/app/",
      scope: "/api/app/",
    });
    expect(manifest.icons[0].src).toBe("/api/app/app-icon.svg");
    expect(html).toContain('href="manifest.webmanifest"');
    expect(html).not.toContain("/api/app/api/app/");
  });
});
