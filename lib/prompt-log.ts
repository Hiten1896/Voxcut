import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { Feedback, PromptLogRecord } from "@/lib/types";

const PROMPT_LOG_PATH = path.join(process.cwd(), "storage", "prompt-logs.json");

async function ensureLogFile() {
  await fs.mkdir(path.dirname(PROMPT_LOG_PATH), { recursive: true });
  try {
    await fs.access(PROMPT_LOG_PATH);
  } catch {
    await fs.writeFile(PROMPT_LOG_PATH, "[]", "utf8");
  }
}

export async function listPromptLogs(): Promise<PromptLogRecord[]> {
  await ensureLogFile();
  const raw = await fs.readFile(PROMPT_LOG_PATH, "utf8");
  return JSON.parse(raw || "[]") as PromptLogRecord[];
}

export async function createPromptLog(record: Omit<PromptLogRecord, "id" | "timestamp">): Promise<PromptLogRecord> {
  await ensureLogFile();
  const logs = await listPromptLogs();
  const newRecord: PromptLogRecord = {
    ...record,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
  };

  await fs.writeFile(PROMPT_LOG_PATH, JSON.stringify([...logs, newRecord], null, 2), "utf8");
  return newRecord;
}

export async function updatePromptLogFeedback(id: string, feedback: Feedback): Promise<PromptLogRecord | null> {
  await ensureLogFile();
  const logs = await listPromptLogs();
  const index = logs.findIndex((entry) => entry.id === id);

  if (index === -1) {
    return null;
  }

  const updated = {
    ...logs[index],
    feedback,
  };

  logs[index] = updated;
  await fs.writeFile(PROMPT_LOG_PATH, JSON.stringify(logs, null, 2), "utf8");
  return updated;
}
