import fs from "node:fs/promises";
import path from "node:path";

export default async function globalTeardown() {
  const workspace = path.resolve(process.cwd());
  const storage = path.resolve(workspace, ".e2e-storage");
  if (path.dirname(storage) !== workspace || path.basename(storage) !== ".e2e-storage") {
    throw new Error("Refusing to remove an unexpected Playwright storage directory.");
  }
  await fs.rm(storage, { recursive: true, force: true });
}
