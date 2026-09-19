import test from "node:test";
import assert from "node:assert/strict";

import { isValidProjectIdentifier, isValidStorageKey } from "./security.ts";

test("accepts valid user and project ids", () => {
  assert.equal(isValidProjectIdentifier("demo-user"), true);
  assert.equal(isValidProjectIdentifier("demo-project"), true);
  assert.equal(isValidProjectIdentifier("team_alpha"), true);
});

test("rejects malicious identifiers", () => {
  assert.equal(isValidProjectIdentifier("../../admin"), false);
  assert.equal(isValidProjectIdentifier("user;rm -rf /"), false);
  assert.equal(isValidProjectIdentifier(""), false);
});

test("accepts safe storage keys and blocks traversal", () => {
  const safeKey = "users/demo-user/projects/demo-project/videos/abc123/source.mp4";
  const unsafeKey = "../../etc/passwd";

  assert.equal(isValidStorageKey(safeKey), true);
  assert.equal(isValidStorageKey(unsafeKey), false);
  assert.equal(isValidStorageKey("users/demo-user/../admin/secret.json"), false);
});
