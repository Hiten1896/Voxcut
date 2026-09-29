import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { isValidStorageKey } from "@/lib/security";

export interface ProjectAssetPaths {
  root: string;
  videoDir: string;
  sourceKey: string;
  transcriptKey: string;
  transcriptionStatusKey: string;
  exportKey: string;
}

export interface StorageAdapter {
  uploadFile(file: File, userId: string, projectId: string, videoId: string): Promise<{ filePath: string; sourceKey: string; videoDir: string }>;
  getFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
  writeJson(key: string, data: unknown): Promise<string>;
  readJson<T>(key: string): Promise<T>;
}

export class LocalStorageAdapter implements StorageAdapter {
  rootDir = path.join(process.cwd(), "storage");

  async ensureDir(dirPath: string) {
    await fs.mkdir(dirPath, { recursive: true });
  }

  getProjectVideoDir(userId: string, projectId: string, videoId: string) {
    return path.join(this.rootDir, "users", userId, "projects", projectId, "videos", videoId);
  }

  getProjectAssetKeys(userId: string, projectId: string, videoId: string): ProjectAssetPaths {
    const videoDir = this.getProjectVideoDir(userId, projectId, videoId);
    const sourceKey = `users/${userId}/projects/${projectId}/videos/${videoId}/source.mp4`;
    const transcriptKey = `users/${userId}/projects/${projectId}/videos/${videoId}/transcript.json`;
    const transcriptionStatusKey = `users/${userId}/projects/${projectId}/videos/${videoId}/transcription-status.json`;
    const exportKey = `users/${userId}/projects/${projectId}/videos/${videoId}/exports/trimmed-output.mp4`;

    return {
      root: this.rootDir,
      videoDir,
      sourceKey,
      transcriptKey,
      transcriptionStatusKey,
      exportKey,
    };
  }

  resolveKey(key: string) {
    if (!isValidStorageKey(key)) {
      throw new Error("Invalid storage key.");
    }

    return path.join(this.rootDir, key.replace(/^\/+/g, ""));
  }

  async uploadFile(file: File, userId: string, projectId: string, videoId: string) {
    const { videoDir, sourceKey } = this.getProjectAssetKeys(userId, projectId, videoId);
    await this.ensureDir(videoDir);
    const filePath = this.resolveKey(sourceKey);
    const temporaryPath = path.join(videoDir, `.upload-${randomUUID()}.tmp`);
    try {
      await pipeline(Readable.fromWeb(file.stream() as import("node:stream/web").ReadableStream<Uint8Array>), createWriteStream(temporaryPath, { flags: "wx" }));
      await fs.rename(temporaryPath, filePath);
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }

    return {
      filePath,
      sourceKey,
      videoDir,
    };
  }

  async getFile(key: string) {
    return fs.readFile(this.resolveKey(key));
  }

  async deleteFile(key: string) {
    await fs.rm(this.resolveKey(key), { force: true });
  }

  async writeJson(key: string, data: unknown) {
    const absPath = this.resolveKey(key);
    await this.ensureDir(path.dirname(absPath));
    await fs.writeFile(absPath, JSON.stringify(data, null, 2), "utf8");
    return absPath;
  }

  async readJson<T>(key: string): Promise<T> {
    const absPath = this.resolveKey(key);
    const text = await fs.readFile(absPath, "utf8");
    return JSON.parse(text) as T;
  }
}

export const storage = new LocalStorageAdapter();
