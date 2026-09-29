import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { isAppLockRequestUnlocked } from "../appLock";
import * as db from "../db";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  appLockGranted: boolean;
};

async function getLockedOwner(): Promise<User | null> {
  if (shouldUseExistingAdminOwner()) {
    const existingAdmin = await db.getFirstAdminUser();
    if (existingAdmin) return existingAdmin;
  }

  const ownerOpenId = getAppLockOwnerOpenId();

  try {
    let owner = await db.getUserByOpenId(ownerOpenId);
    if (!owner) {
      await db.upsertUser({
        openId: ownerOpenId,
        name: "مالك الشامل",
        loginMethod: "app-lock",
        role: "admin",
        lastSignedIn: new Date(),
      });
      owner = await db.getUserByOpenId(ownerOpenId);
    } else if (owner.role !== "admin") {
      await db.upsertUser({ openId: ownerOpenId, role: "admin", lastSignedIn: new Date() });
      owner = await db.getUserByOpenId(ownerOpenId);
    }
    return owner ?? null;
  } catch (error) {
    console.error("[AppLock] Failed to resolve the locked owner:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

export function getAppLockOwnerOpenId(configuredOpenId = ENV.ownerOpenId): string {
  return configuredOpenId.trim() || "shamel-app-lock-owner";
}

export function shouldUseExistingAdminOwner(configuredOpenId = ENV.ownerOpenId): boolean {
  return !configuredOpenId.trim();
}

export async function resolveAppLockUser(
  authenticatedUser: User | null,
  appLockGranted: boolean,
  getOwner: () => Promise<User | null> = getLockedOwner,
): Promise<User | null> {
  if (!appLockGranted || authenticatedUser) return authenticatedUser;
  return getOwner();
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let appLockGranted = false;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  try {
    appLockGranted = await isAppLockRequestUnlocked(opts.req);
  } catch {
    appLockGranted = false;
  }

  // The published owner link may be deliberately public at the hosting edge.
  // A verified app-lock session remains mandatory, then resolves to the single
  // configured owner account so accounting actions keep their existing audit
  // identity and admin checks without requiring a separate Manus login.
  user = await resolveAppLockUser(user, appLockGranted);

  return {
    req: opts.req,
    res: opts.res,
    user,
    appLockGranted,
  };
}
