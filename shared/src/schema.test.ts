import assert from "node:assert/strict";
import { test } from "node:test";

import { safeParseC2SMessage } from "./schema";

test("parses valid room.create message", () => {
  const result = safeParseC2SMessage({ t: "room.create", name: "Player One" });
  assert.equal(result.success, true);
});

test("rejects invalid tag payload", () => {
  const result = safeParseC2SMessage({ t: "room.join", code: "***", name: "A" });
  assert.equal(result.success, false);
});
