import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { jwtVerify, SignJWT } from "jose";
import { parse } from "cookie";
import { ENV } from "./_core/env";

export type AppLockVerification = { ok: true } | { ok: false; reason: "invalid" | "not_configured" };
export const APP_LOCK_COOKIE_NAME = "shamel_app_lock";
export const APP_LOCK_TOKEN_HEADER = "x-app-lock-token";
const APP_LOCK_AUDIENCE = "shamel-app-lock";
const APP_LOCK_DURATION_SECONDS = 60 * 60 * 12;
const APP_LOCK_MAX_FAILED_ATTEMPTS = 25;
const APP_LOCK_BLOCK_DURATION_MS = 15 * 1000;
const failedAttempts = new Map<string, { count: number; blockedUntil: number }>();

function sameSecret(left: string, right: string) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

/** Lightweight server-side verification used by the app-lock API endpoint. */
export function verifyAppLockPassword(password: string | undefined): AppLockVerification {
  const configuredPassword = process.env.APP_LOCK_PASSWORD;
  if (!configuredPassword) return { ok: false, reason: "not_configured" };
  if (!password || !sameSecret(password, configuredPassword)) return { ok: false, reason: "invalid" };
  return { ok: true };
}

function appLockSigningKey() {
  if (!ENV.cookieSecret) throw new Error("تعذر تهيئة سر جلسة القفل");
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function createAppLockSessionToken() {
  return new SignJWT({ scope: APP_LOCK_AUDIENCE })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${APP_LOCK_DURATION_SECONDS}s`)
    .setAudience(APP_LOCK_AUDIENCE)
    .sign(appLockSigningKey());
}

export async function isAppLockSessionValid(token: string | undefined) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, appLockSigningKey(), { audience: APP_LOCK_AUDIENCE });
    return payload.scope === APP_LOCK_AUDIENCE;
  } catch {
    return false;
  }
}

export async function isAppLockRequestUnlocked(req: Request) {
  const cookies = parse(req.headers.cookie ?? "");
  if (await isAppLockSessionValid(cookies[APP_LOCK_COOKIE_NAME])) return true;

  // Fallback for installed PWAs and embedded browsers that refuse a secure
  // cookie. The signed token is session-only in the browser and is accepted
  // only after server-side password verification.
  return isAppLockSessionValid(req.header(APP_LOCK_TOKEN_HEADER) ?? undefined);
}

export const APP_LOCK_MAX_AGE_MS = APP_LOCK_DURATION_SECONDS * 1000;

export function canAttemptAppLock(key: string, now = Date.now()) {
  const entry = failedAttempts.get(key);
  if (!entry) return true;
  if (entry.blockedUntil > now) return false;
  if (entry.blockedUntil && entry.blockedUntil <= now) failedAttempts.delete(key);
  return true;
}

export function recordFailedAppLockAttempt(key: string, now = Date.now()) {
  const current = failedAttempts.get(key) ?? { count: 0, blockedUntil: 0 };
  const count = current.count + 1;
  const blockedUntil = count >= APP_LOCK_MAX_FAILED_ATTEMPTS ? now + APP_LOCK_BLOCK_DURATION_MS : 0;
  failedAttempts.set(key, { count: blockedUntil ? 0 : count, blockedUntil });
  return { blocked: Boolean(blockedUntil) };
}

export function clearFailedAppLockAttempts(key: string) {
  failedAttempts.delete(key);
}

export function resetAppLockAttemptStateForTests() {
  failedAttempts.clear();
}
