import fs from "node:fs/promises";

export type ProviderTranscript = {
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
  words: Array<{ start: number; end: number; text: string }>;
};

export class TranscriptionError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "TranscriptionError";
    this.status = status;
  }
}

export function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new TranscriptionError("Transcription is not configured. Add GEMINI_API_KEY to the server environment.", 503);
  return apiKey;
}

function parseOffset(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : null;
}

export function parseGeminiTranscript(value: unknown, duration: number): ProviderTranscript {
  if (!value || typeof value !== "object" || !Number.isFinite(duration) || duration <= 0) {
    throw new TranscriptionError("Gemini returned invalid media data.");
  }
  const interaction = value as Record<string, unknown>;
  if (interaction.status !== "completed" || !Array.isArray(interaction.steps)) {
    throw new TranscriptionError("Gemini did not complete the transcription request.");
  }
  let text = "";
  const words: ProviderTranscript["words"] = [];
  for (const step of interaction.steps) {
    if (!step || typeof step !== "object") continue;
    const contents = (step as Record<string, unknown>).content;
    if (!Array.isArray(contents)) continue;
    for (const content of contents) {
      if (!content || typeof content !== "object") continue;
      const item = content as Record<string, unknown>;
      if (typeof item.text === "string") text += item.text;
      if (!Array.isArray(item.annotations)) continue;
      for (const annotation of item.annotations) {
        if (!annotation || typeof annotation !== "object") continue;
        const word = annotation as Record<string, unknown>;
        if (word.type !== "word_info") continue;
        const start = parseOffset(word.start_offset);
        const end = parseOffset(word.end_offset);
        if (typeof word.text !== "string" || start === null || end === null || start < 0 || end <= start || end > duration + 0.05) {
          throw new TranscriptionError("Gemini returned invalid word timestamps.");
        }
        words.push({ start, end, text: word.text });
      }
    }
  }
  if (words.some((word, index) => index > 0 && word.start < words[index - 1].start)) {
    throw new TranscriptionError("Gemini returned timestamps out of order.");
  }
  if (text.trim() && words.length === 0) {
    throw new TranscriptionError("Gemini returned transcript text without word timestamps.");
  }
  if (!text.trim() && words.length > 0) text = words.map((word) => word.text).join(" ");
  return {
    text,
    words,
    // Each visible transcript segment uses the provider's exact word interval.
    segments: words.map((word) => ({ ...word })),
  };
}

async function checkedJson(response: Response, genericError: string): Promise<Record<string, unknown>> {
  if (!response.ok) {
    throw new TranscriptionError(genericError, response.status === 429 ? 429 : 502);
  }
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    throw new TranscriptionError("Gemini returned an unreadable response.");
  }
}

export async function requestGeminiTranscription(
  audioPath: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const audio = await fs.readFile(audioPath);
  const apiBase = "https://generativelanguage.googleapis.com";
  let uploadedFileName: string | null = null;
  try {
    const startResponse = await fetchImpl(`${apiBase}/upload/v1beta/files`, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(audio.byteLength),
        "X-Goog-Upload-Header-Content-Type": "audio/mpeg",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: "voxcut-audio.mp3" } }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!startResponse.ok) throw new TranscriptionError("Gemini could not start the secure audio upload.", startResponse.status === 429 ? 429 : 502);
    const uploadUrl = startResponse.headers.get("x-goog-upload-url");
    if (!uploadUrl) throw new TranscriptionError("Gemini did not return an audio upload session.");
    const parsedUploadUrl = new URL(uploadUrl);
    if (parsedUploadUrl.protocol !== "https:" || parsedUploadUrl.hostname !== "generativelanguage.googleapis.com") {
      throw new TranscriptionError("Gemini returned an invalid audio upload session.");
    }

    const uploadResponse = await fetchImpl(parsedUploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(audio.byteLength),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: new Uint8Array(audio),
      signal: AbortSignal.timeout(120_000),
    });
    const uploadResult = await checkedJson(uploadResponse, "Gemini could not store the audio for transcription.");
    const file = uploadResult.file;
    if (!file || typeof file !== "object") throw new TranscriptionError("Gemini returned invalid uploaded-file metadata.");
    const fileData = file as Record<string, unknown>;
    if (typeof fileData.name !== "string" || typeof fileData.uri !== "string") {
      throw new TranscriptionError("Gemini returned invalid uploaded-file metadata.");
    }
    uploadedFileName = fileData.name;

    const interactionResponse = await fetchImpl(`${apiBase}/v1beta/interactions`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-3.5-transcribe",
        input: [{ type: "audio", uri: fileData.uri, mime_type: "audio/mpeg" }],
        generation_config: {
          transcription_config: { mode: { type: "verbatim", timestamp_granularities: ["word"] } },
        },
      }),
      signal: AbortSignal.timeout(15 * 60_000),
    });
    return await checkedJson(interactionResponse, "Gemini could not transcribe this video. Please try again.");
  } catch (error) {
    if (error instanceof TranscriptionError) throw error;
    throw new TranscriptionError("Gemini could not be reached to transcribe this video.");
  } finally {
    if (uploadedFileName) {
      const encodedName = uploadedFileName.split("/").map(encodeURIComponent).join("/");
      await fetchImpl(`${apiBase}/v1beta/${encodedName}`, {
        method: "DELETE",
        headers: { "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(30_000),
      }).catch(() => undefined);
    }
  }
}
