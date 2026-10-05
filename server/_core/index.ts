import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { scheduledDailyBackupHandler } from "../dailyBackup";
import { APP_LOCK_COOKIE_NAME, APP_LOCK_MAX_AGE_MS, canAttemptAppLock, clearFailedAppLockAttempts, createAppLockSessionToken, isAppLockRequestUnlocked, recordFailedAppLockAttempt, verifyAppLockPassword } from "../appLock";
import { getSessionCookieOptions } from "./cookies";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  app.set("trust proxy", true);
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  const getAppLockCookieOptions = (req: express.Request) => {
    const options = getSessionCookieOptions(req);
    return { ...options, sameSite: options.secure ? "none" as const : "lax" as const };
  };
  app.get("/api/app-lock/status", async (req, res) => {
    res.json({ unlocked: await isAppLockRequestUnlocked(req) });
  });
  app.post("/api/app-lock/unlock", async (req, res) => {
    const attemptKey = req.ip || req.socket.remoteAddress || "unknown";
    if (!canAttemptAppLock(attemptKey)) {
      res.status(429).json({ ok: false, message: "تم إيقاف المحاولات مؤقتاً. انتظر خمس دقائق ثم حاول مرة أخرى." });
      return;
    }
    const verification = verifyAppLockPassword(typeof req.body?.password === "string" ? req.body.password : undefined);
    if (!verification.ok) {
      const attempt = recordFailedAppLockAttempt(attemptKey);
      if (attempt.blocked) {
        res.status(429).json({ ok: false, message: "تم إيقاف المحاولات مؤقتاً. انتظر خمس دقائق ثم حاول مرة أخرى." });
        return;
      }
      res.status(verification.reason === "not_configured" ? 503 : 401).json({ ok: false, message: verification.reason === "not_configured" ? "لم تُضبط كلمة مرور التطبيق بعد" : "كلمة المرور غير صحيحة" });
      return;
    }
    clearFailedAppLockAttempts(attemptKey);
    const token = await createAppLockSessionToken();
    res.cookie(APP_LOCK_COOKIE_NAME, token, { ...getAppLockCookieOptions(req), maxAge: APP_LOCK_MAX_AGE_MS });
    res.json({ ok: true, token });
  });
  app.post("/api/app-lock/lock", async (req, res) => {
    res.clearCookie(APP_LOCK_COOKIE_NAME, { ...getAppLockCookieOptions(req), maxAge: -1 });
    res.json({ ok: true });
  });
  app.post("/api/scheduled/daily-backup", scheduledDailyBackupHandler);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
