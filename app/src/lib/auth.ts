/**
 * 인증/인가 모듈
 * ===============
 * - 사용자 관리 (CRUD)
 * - 비밀번호 해싱 (bcryptjs)
 * - JWT 세션 (jose)
 * - 일일 조회 제한
 * - 활동 로그
 */

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ─── Types ───────────────────────────────────────────────────

export type UserRole = "admin" | "user";

export interface User {
  id: string;
  username: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
  dailyLimit: number; // 0 = unlimited
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserPublic {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  active: boolean;
  dailyLimit: number;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  username: string;
  action: "login" | "logout" | "query" | "download" | "admin_action";
  detail: string;
  ip?: string;
  createdAt: string;
}

interface AuthStoreData {
  users: User[];
  activityLogs: ActivityLog[];
}

// ─── JWT Config ──────────────────────────────────────────────

const JWT_SECRET_KEY = process.env.JWT_SECRET || "loan-app-jwt-secret-key-2024-change-in-production";
const secret = new TextEncoder().encode(JWT_SECRET_KEY);
const COOKIE_NAME = "loan-app-token";
const TOKEN_EXPIRY = "7d";

// ─── Store (Firestore 우선, 로컬 fallback) ──────────────────

import { getApps, cert, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let _authDb: Firestore | null = null;
function getAuthDb(): Firestore | null {
  if (_authDb) return _authDb;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) return null;
  try {
    const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(JSON.parse(key)) });
    _authDb = getFirestore(app);
    return _authDb;
  } catch { return null; }
}

const AUTH_STORE_PATH = path.join(os.tmpdir(), "loan-app-auth.json");

// 메모리 캐시 (TTL 기반 — Firestore 호출 최소화)
let _cachedStore: AuthStoreData | null = null;
let _cacheTime = 0;
const CACHE_TTL = 10_000; // 10초 — 쓰기 시 즉시 갱신되므로 읽기만 캐시

async function readAuthStore(): Promise<AuthStoreData> {
  // 1) 메모리 캐시가 유효하면 바로 반환 (Firestore 호출 안 함)
  if (_cachedStore && _cachedStore.users.length > 0 && Date.now() - _cacheTime < CACHE_TTL) {
    return _cachedStore;
  }
  // 2) Firestore에서 읽기
  const db = getAuthDb();
  if (db) {
    try {
      const doc = await db.collection("auth").doc("store").get();
      if (doc.exists) {
        const d = doc.data()!;
        const users = JSON.parse(d.users || "[]") as User[];
        const activityLogs = JSON.parse(d.activityLogs || "[]") as ActivityLog[];
        if (users.length > 0) {
          const store: AuthStoreData = { users, activityLogs };
          _cachedStore = store;
          _cacheTime = Date.now();
          return store;
        }
      }
    } catch (e) {
      console.error("[Auth] Firestore read error:", e);
    }
  }
  // 3) 만료된 캐시라도 있으면 사용
  if (_cachedStore) return _cachedStore;
  // 4) 로컬 파일 fallback
  try {
    if (fs.existsSync(AUTH_STORE_PATH)) {
      const raw = fs.readFileSync(AUTH_STORE_PATH, "utf-8");
      const data = JSON.parse(raw) as AuthStoreData;
      _cachedStore = data;
      _cacheTime = Date.now();
      return data;
    }
  } catch { /* ignore */ }
  return { users: [], activityLogs: [] };
}

async function writeAuthStore(data: AuthStoreData): Promise<void> {
  _cachedStore = data;
  _cacheTime = Date.now();
  const db = getAuthDb();
  if (db) {
    try {
      // 안전장치: 기존 Firestore 데이터보다 사용자 수가 줄어들면 덮어쓰기 방지
      if (data.users.length > 0) {
        const existing = await db.collection("auth").doc("store").get();
        if (existing.exists) {
          const existingUsers = JSON.parse(existing.data()!.users || "[]");
          if (data.users.length < existingUsers.length) {
            // 기존보다 사용자가 줄어든 경우 — 삭제 작업이 아니면 병합
            const isDeleteOp = existingUsers.length - data.users.length === 1;
            if (!isDeleteOp) {
              console.warn(`[Auth] 사용자 수 감소 감지 (${existingUsers.length} → ${data.users.length}). 병합 처리.`);
              // 기존 사용자 중 새 데이터에 없는 것 보존
              const newIds = new Set(data.users.map((u: User) => u.id));
              for (const eu of existingUsers) {
                if (!newIds.has(eu.id)) data.users.push(eu);
              }
            }
          }
        }
      }
      await db.collection("auth").doc("store").set({
        users: JSON.stringify(data.users),
        activityLogs: JSON.stringify(data.activityLogs.slice(-500)),
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error("[Auth] Firestore write error:", e);
    }
  }
  // 로컬 파일에도 저장
  try {
    const tmp = AUTH_STORE_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmp, AUTH_STORE_PATH);
  } catch { /* serverless에서 실패 가능 */ }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ─── Init default admin ──────────────────────────────────────

export async function ensureDefaultAdmin(): Promise<void> {
  // 캐시 무시 — Firestore에서 직접 확인 (다른 인스턴스가 이미 생성했을 수 있음)
  _cachedStore = null;
  _cacheTime = 0;
  const store = await readAuthStore();
  const hasAdmin = store.users.some((u) => u.role === "admin");
  if (!hasAdmin) {
    const hash = await bcrypt.hash("9999", 10);
    store.users.push({
      id: generateId(),
      username: "admin",
      name: "관리자",
      passwordHash: hash,
      role: "admin",
      active: true,
      dailyLimit: 0,
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await writeAuthStore(store);
    console.log("[Auth] 기본 관리자 계정 생성: admin / admin1234");
  }
}

// ─── User CRUD ───────────────────────────────────────────────

export async function createUser(
  username: string,
  name: string,
  password: string,
  role: UserRole = "user",
  dailyLimit: number = 30
): Promise<UserPublic> {
  const store = await readAuthStore();
  if (store.users.find((u) => u.username === username)) {
    throw new Error("이미 존재하는 아이디입니다.");
  }
  const hash = await bcrypt.hash(password, 10);
  const user: User = {
    id: generateId(),
    username,
    name,
    passwordHash: hash,
    role,
    active: true,
    dailyLimit: role === "admin" ? 0 : dailyLimit,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.users.push(user);
  writeAuthStore(store);
  return toPublic(user);
}

export async function getUsers(): Promise<UserPublic[]> {
  const store = await readAuthStore();
  return store.users.map(toPublic);
}

export async function getUserById(id: string): Promise<User | null> {
  const store = await readAuthStore();
  return store.users.find((u) => u.id === id) || null;
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const store = await readAuthStore();
  return store.users.find((u) => u.username === username) || null;
}

export async function updateUser(
  id: string,
  updates: Partial<Pick<User, "name" | "role" | "active" | "dailyLimit">>
): Promise<UserPublic | null> {
  const store = await readAuthStore();
  const idx = store.users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  Object.assign(store.users[idx], updates, { updatedAt: new Date().toISOString() });
  writeAuthStore(store);
  return toPublic(store.users[idx]);
}

export async function resetPassword(id: string, newPassword: string): Promise<boolean> {
  const store = await readAuthStore();
  const idx = store.users.findIndex((u) => u.id === id);
  if (idx === -1) return false;
  store.users[idx].passwordHash = await bcrypt.hash(newPassword, 10);
  store.users[idx].mustChangePassword = false;
  store.users[idx].updatedAt = new Date().toISOString();
  writeAuthStore(store);
  return true;
}

export async function deleteUser(id: string): Promise<boolean> {
  const store = await readAuthStore();
  const idx = store.users.findIndex((u) => u.id === id);
  if (idx === -1) return false;
  // Don't allow deleting the last admin
  const user = store.users[idx];
  if (user.role === "admin") {
    const adminCount = store.users.filter((u) => u.role === "admin").length;
    if (adminCount <= 1) throw new Error("마지막 관리자 계정은 삭제할 수 없습니다.");
  }
  store.users.splice(idx, 1);
  writeAuthStore(store);
  return true;
}

function toPublic(user: User): UserPublic {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    active: user.active,
    dailyLimit: user.dailyLimit,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}

// ─── Authentication ──────────────────────────────────────────

export async function authenticate(
  username: string,
  password: string
): Promise<User | null> {
  await ensureDefaultAdmin();
  const user = await getUserByUsername(username);
  if (!user || !user.active) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user : null;
}

// ─── JWT / Session ───────────────────────────────────────────

export async function createToken(user: User): Promise<string> {
  return new SignJWT({
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(TOKEN_EXPIRY)
    .setIssuedAt()
    .sign(secret);
}

export async function verifyToken(
  token: string
): Promise<{ userId: string; username: string; name: string; role: UserRole } | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as { userId: string; username: string; name: string; role: UserRole };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<UserPublic | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    const payload = await verifyToken(token);
    if (!payload) return null;
    const user = await getUserById(payload.userId);
    if (!user || !user.active) return null;
    return toPublic(user);
  } catch {
    return null;
  }
}

export function getCookieName(): string {
  return COOKIE_NAME;
}

// ─── Daily Limit ─────────────────────────────────────────────

export async function getTodayQueryCount(userId: string): Promise<number> {
  const store = await readAuthStore();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();
  return store.activityLogs.filter(
    (log) => log.userId === userId && log.action === "query" && log.createdAt >= todayISO
  ).length;
}

export async function checkDailyLimit(userId: string): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const user = await getUserById(userId);
  if (!user) return { allowed: true, remaining: -1, limit: 0 };
  if (user.dailyLimit === 0) return { allowed: true, remaining: -1, limit: 0 }; // unlimited
  const count = await getTodayQueryCount(userId);
  const remaining = Math.max(0, user.dailyLimit - count);
  return { allowed: remaining > 0, remaining, limit: user.dailyLimit };
}

// ─── Activity Log ────────────────────────────────────────────

export async function logActivity(
  userId: string,
  username: string,
  action: ActivityLog["action"],
  detail: string,
  ip?: string
): Promise<void> {
  const store = await readAuthStore();
  store.activityLogs.push({
    id: generateId(),
    userId,
    username,
    action,
    detail,
    ip,
    createdAt: new Date().toISOString(),
  });
  // Keep last 10000 logs max
  if (store.activityLogs.length > 10000) {
    store.activityLogs = store.activityLogs.slice(-10000);
  }
  writeAuthStore(store);
}

export async function getActivityLogs(options?: {
  limit?: number;
  userId?: string;
  action?: ActivityLog["action"];
  since?: string;
}): Promise<ActivityLog[]> {
  const store = await readAuthStore();
  let logs = [...store.activityLogs];

  if (options?.userId) logs = logs.filter((l) => l.userId === options.userId);
  if (options?.action) logs = logs.filter((l) => l.action === options.action);
  if (options?.since) logs = logs.filter((l) => l.createdAt >= options.since);

  logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return logs.slice(0, options?.limit || 200);
}

// ─── Admin Stats ─────────────────────────────────────────────

export async function getUsageStats(period: "7d" | "30d" | "all" = "7d") {
  const store = await readAuthStore();
  let since: string | undefined;

  if (period !== "all") {
    const d = new Date();
    d.setDate(d.getDate() - (period === "7d" ? 7 : 30));
    since = d.toISOString();
  }

  let logs = store.activityLogs;
  if (since) logs = logs.filter((l) => l.createdAt >= since);

  // Per-user stats
  const userStats: Record<string, { username: string; queries: number; downloads: number; logins: number }> = {};
  for (const log of logs) {
    if (!userStats[log.userId]) {
      userStats[log.userId] = { username: log.username, queries: 0, downloads: 0, logins: 0 };
    }
    if (log.action === "query") userStats[log.userId].queries++;
    if (log.action === "download") userStats[log.userId].downloads++;
    if (log.action === "login") userStats[log.userId].logins++;
  }

  // Daily trend
  const dailyTrend: Record<string, number> = {};
  for (const log of logs) {
    if (log.action === "query") {
      const day = log.createdAt.substring(0, 10);
      dailyTrend[day] = (dailyTrend[day] || 0) + 1;
    }
  }

  const totalQueries = logs.filter((l) => l.action === "query").length;
  const totalDownloads = logs.filter((l) => l.action === "download").length;
  const totalLogins = logs.filter((l) => l.action === "login").length;
  const activeUsers = new Set(logs.map((l) => l.userId)).size;

  return {
    totalQueries,
    totalDownloads,
    totalLogins,
    activeUsers,
    userStats: Object.values(userStats).sort((a, b) => b.queries - a.queries),
    dailyTrend: Object.entries(dailyTrend)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
