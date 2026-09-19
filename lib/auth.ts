import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isValidProjectIdentifier } from "@/lib/security";

export const AUTH_COOKIE_NAME = "voxcut_session";

export type AuthUser = {
  id: string;
  email: string;
};

type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
};

type SessionPayload = {
  sub: string;
  email: string;
  iat: number;
  exp: number;
};

const AUTH_USERS_PATH = path.join(process.cwd(), "storage", "auth-users.json");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const SESSION_SECRET = process.env.VOXCUT_SESSION_SECRET ?? "voxcut-local-dev-secret-change-me";

function readAuthStore(): Promise<{ users: StoredUser[] }> {
  return fs
    .readFile(AUTH_USERS_PATH, "utf8")
    .then((text) => JSON.parse(text) as { users: StoredUser[] })
    .catch(() => ({ users: [] }));
}

async function writeAuthStore(users: StoredUser[]) {
  await fs.mkdir(path.dirname(AUTH_USERS_PATH), { recursive: true });
  await fs.writeFile(AUTH_USERS_PATH, JSON.stringify({ users }, null, 2), "utf8");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isStrongPassword(password: string): boolean {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

export function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, 120000, 64, "sha256").toString("hex");
}

export async function getUserById(userId: string): Promise<StoredUser | null> {
  const store = await readAuthStore();
  return store.users.find((user) => user.id === userId) ?? null;
}

export async function getUserByEmail(email: string): Promise<StoredUser | null> {
  const normalized = normalizeEmail(email);
  const store = await readAuthStore();
  return store.users.find((user) => user.email === normalized) ?? null;
}

export async function registerUser(email: string, password: string): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  if (!isStrongPassword(password)) {
    return { ok: false, error: "Password must be at least 8 characters and contain letters and numbers." };
  }

  const existing = await getUserByEmail(normalizedEmail);
  if (existing) {
    return { ok: false, error: "An account with this email already exists." };
  }

  const userId = `user_${randomBytes(12).toString("hex")}`;
  const salt = randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);
  const user: StoredUser = {
    id: userId,
    email: normalizedEmail,
    passwordHash,
    passwordSalt: salt,
    createdAt: new Date().toISOString(),
  };

  const store = await readAuthStore();
  store.users.push(user);
  await writeAuthStore(store.users);

  return {
    ok: true,
    user: { id: user.id, email: user.email },
  };
}

export async function loginUser(email: string, password: string): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  const normalizedEmail = normalizeEmail(email);
  const user = await getUserByEmail(normalizedEmail);

  if (!user) {
    return { ok: false, error: "Invalid email or password." };
  }

  const expectedHash = hashPassword(password, user.passwordSalt);
  const actualHash = user.passwordHash;

  if (expectedHash.length !== actualHash.length) {
    return { ok: false, error: "Invalid email or password." };
  }

  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(actualHash, "hex");

  if (!timingSafeEqual(expected, actual)) {
    return { ok: false, error: "Invalid email or password." };
  }

  return {
    ok: true,
    user: { id: user.id, email: user.email },
  };
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function signSession(user: AuthUser): string {
  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  };

  const payloadJson = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(payloadJson);
  const signature = createHmac("sha256", SESSION_SECRET).update(encodedPayload).digest("base64url");

  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string | null): SessionPayload | null {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = createHmac("sha256", SESSION_SECRET).update(encodedPayload).digest("base64url");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (!payload.sub || !payload.email || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function getCurrentUser(request: Request): Promise<AuthUser | null> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookiePairs = cookieHeader.split(";").map((entry) => entry.trim());
  const sessionCookie = cookiePairs.find((entry) => entry.startsWith(`${AUTH_COOKIE_NAME}=`));
  const rawToken = sessionCookie ? decodeURIComponent(sessionCookie.slice(AUTH_COOKIE_NAME.length + 1)) : null;
  const session = verifySessionToken(rawToken);

  if (!session) {
    return null;
  }

  const user = await getUserById(session.sub);
  if (!user) {
    return null;
  }

  return { id: user.id, email: user.email };
}

export function setAuthCookie(response: NextResponse, sessionToken: string): NextResponse {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}

export function clearAuthCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}

export async function getSessionFromServerCookies(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_COOKIE_NAME)?.value ?? null;
  const session = verifySessionToken(sessionToken);

  if (!session) {
    return null;
  }

  return {
    id: session.sub,
    email: session.email,
  };
}

export function ensureUserProject(userId: string, projectId: string): string {
  if (!isValidProjectIdentifier(userId)) {
    throw new Error("Invalid authenticated user.");
  }

  if (!isValidProjectIdentifier(projectId)) {
    throw new Error("Invalid project id.");
  }

  return projectId;
}
