import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getClientKey, isStorageKeyOwnedByUser, rateLimitAllow } from "@/lib/security";
import { storage } from "@/lib/storage";
import { parseByteRange } from "@/lib/media-range";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const clientKey = getClientKey(request);
  if (!rateLimitAllow(`media:${clientKey}`, 300)) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key || !isStorageKeyOwnedByUser(key, user.id)) {
    return NextResponse.json({ error: "Missing or invalid media key." }, { status: 400 });
  }

  try {
    const filePath = storage.resolveKey(key);
    const stat = await fs.stat(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const contentType = extension === ".mp4" ? "video/mp4" : extension === ".json" ? "application/json" : "application/octet-stream";
    const range = request.headers.get("range");

    // TODO: replace free source previews with a low-resolution watermarked proxy and reserve full-quality access for export after subscription checks are introduced.

    if (range && contentType.startsWith("video/")) {
      const parsedRange = parseByteRange(range, stat.size);
      if (!parsedRange) {
        return new NextResponse(null, { status: 416, headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes */${stat.size}` } });
      }
      const { start, end } = parsedRange;
      const body = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream<Uint8Array>;
      return new NextResponse(body, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
        },
      });
    }

    const body = contentType.startsWith("video/")
      ? Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>
      : await fs.readFile(filePath);
    const headers: Record<string, string> = {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Accept-Ranges": contentType.startsWith("video/") ? "bytes" : "none",
        "Cache-Control": "no-store",
      };
    if (contentType === "video/mp4" && searchParams.get("download") === "1") {
      headers["Content-Disposition"] = `attachment; filename="${path.basename(filePath).replace(/[\"\\\\]/g, "_")}"`;
    }
    return new NextResponse(body, {
      headers,
    });
  } catch {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }
}
