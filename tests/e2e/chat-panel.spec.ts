import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const fixture = (name: string) => path.join(process.cwd(), "tests", "fixtures", name);

async function createAuthenticatedUser(page: Page) {
  await page.goto("/editor");
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await page.getByRole("button", { name: "Create account", exact: true }).first().click();
  await page.locator('input[type="email"]').fill(`voxcut-e2e-${randomUUID()}@example.invalid`);
  await page.locator('input[type="password"]').fill(`Vx${randomUUID()}9!`);
  await page.getByRole("button", { name: "Create account", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "AI editor" })).toBeVisible();
}

async function uploadVideo(page: Page, filename: string) {
  const uploadResponse = page.waitForResponse((response) => response.url().includes("/api/upload") && response.request().method() === "POST");
  await page.locator('input[type="file"]').setInputFiles(fixture(filename));
  const response = await uploadResponse;
  const payload = await response.json().catch(() => ({})) as { videoId?: string; projectId?: string; error?: string };
  expect(response.status(), payload.error ?? "Upload request failed.").toBe(200);
  expect(payload.videoId).toBeTruthy();
  expect(payload.projectId).toBeTruthy();
  const video = page.locator("[data-player-surface] video");
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(1);
  return { video, payload: payload as { videoId: string; projectId: string } };
}

async function requestTimingPlan(page: Page) {
  await page.getByLabel("Describe an edit").fill("Cut from 2 to 5 seconds");
  await page.getByRole("button", { name: "Send prompt" }).click();
  const planCard = page.getByRole("article", { name: "Edit plan" });
  await expect(planCard).toBeVisible();
  await expect(planCard).toContainText("Remove 1 source range");
  return planCard;
}

test("no-audio video shows an explicit transcript capability message", async ({ page }) => {
  await createAuthenticatedUser(page);
  const { payload } = await uploadVideo(page, "no-audio-20s.mp4");

  await expect(page.getByRole("status").filter({ hasText: "No audio track" })).toBeVisible();
  await expect(page.getByText("This video has no sound, so transcript edits are unavailable. Timing edits still work.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Transcribe", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo", exact: true }).first()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Redo", exact: true }).first()).toBeDisabled();
  const transcription = await page.request.post("/api/transcription", { data: payload });
  expect(transcription.status()).toBe(422);
  expect(await transcription.json()).toMatchObject({ code: "NO_AUDIO_TRACK" });
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "No audio track" })).toBeVisible();
});

test("timing prompt creates a plan without a transcript and its operation row seeks", async ({ page }) => {
  await createAuthenticatedUser(page);
  const { video } = await uploadVideo(page, "speech-tone-20s.mp4");
  await expect(page.getByRole("status").filter({ hasText: "Transcript not ready" })).toBeVisible();
  await expect(page.getByText("Timing edits work now. Transcribe this video to enable transcript-based planning.")).toBeVisible();

  const planCard = await requestTimingPlan(page);
  await expect(planCard).toContainText("00:20 before · 00:17 after");
  await planCard.getByRole("button", { name: /Remove 00:02/ }).click();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThanOrEqual(1.9);
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeLessThan(2.2);
  await expect(page.getByText("Timeline · 00:20")).toBeVisible();
});

test("applying an AI plan changes the timeline and plan Undo restores it", async ({ page }) => {
  await createAuthenticatedUser(page);
  await uploadVideo(page, "speech-tone-20s.mp4");
  const headerUndo = page.locator("header").getByRole("button", { name: "Undo", exact: true });
  const headerRedo = page.locator("header").getByRole("button", { name: "Redo", exact: true });
  await expect(headerUndo).toBeDisabled();
  await expect(headerRedo).toBeDisabled();

  const planCard = await requestTimingPlan(page);
  await planCard.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(planCard.getByText("Applied", { exact: true })).toBeVisible();
  await expect(page.getByText("00:17 runtime", { exact: true })).toBeVisible();
  await expect(headerUndo).toBeEnabled();

  await planCard.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(planCard.getByText("Undone", { exact: true })).toBeVisible();
  await expect(page.getByText("00:20 runtime", { exact: true })).toBeVisible();
  await expect(headerUndo).toBeDisabled();
  await expect(headerRedo).toBeEnabled();
});
