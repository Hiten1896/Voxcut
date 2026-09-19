import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { getClientKey, isValidStorageKey, rateLimitAllow } from "@/lib/security";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const clientKey = getClientKey(request);
  if (!rateLimitAllow(clientKey)) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key || !isValidStorageKey(key)) {
    return NextResponse.json({ error: "Missing or invalid media key." }, { status: 400 });
  }

  try {
    const filePath = storage.resolveKey(key);
    const buffer = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const contentType =
      extension === ".mp4" ? "video/mp4" : extension === ".json" ? "application/json" : "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }
}
