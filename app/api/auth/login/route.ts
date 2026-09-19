import { NextResponse } from "next/server";

import { loginUser, setAuthCookie, signSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  const result = await loginUser(email, password);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, user: result.user });
  setAuthCookie(response, signSession(result.user));
  return response;
}
