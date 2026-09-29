import { createHmac, timingSafeEqual } from "node:crypto";

export type SessionIdentity = {
  id: string;
  email: string;
};

type SessionPayload = {
  sub: string;
  email: string;
  iat: number;
  exp: number;
};

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const DEFAULT_SESSION_SECRET = "voxcut-local-dev-secret-change-me";

function getSessionSecret() {
  return process.env.VOXCUT_SESSION_SECRET ?? DEFAULT_SESSION_SECRET;
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function signSessionToken(user: SessionIdentity, now = Date.now()): string {
  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string | null, now = Date.now()): SessionPayload | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const [encodedPayload, signature] = parts;
  const expectedSignature = createHmac("sha256", getSessionSecret()).update(encodedPayload).digest();
  const actualSignature = Buffer.from(signature, "base64url");
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<SessionPayload>;
    if (
      typeof payload.sub !== "string" || !payload.sub ||
      typeof payload.email !== "string" || !payload.email ||
      typeof payload.iat !== "number" || !Number.isFinite(payload.iat) ||
      typeof payload.exp !== "number" || !Number.isFinite(payload.exp) ||
      payload.exp <= now
    ) {
      return null;
    }
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
