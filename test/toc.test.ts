import assert from "node:assert/strict";
import test from "node:test";

import { pickActiveTocId } from "../src/lib/toc";

test("picks the most visible table-of-contents entry", () => {
  assert.equal(
    pickActiveTocId(
      ["intro", "details", "api"],
      [
        { id: "intro", isIntersecting: true, ratio: 0.2 },
        { id: "details", isIntersecting: true, ratio: 0.8 },
        { id: "api", isIntersecting: false, ratio: 0 },
      ],
      "intro",
    ),
    "details",
  );
});

test("falls back to previous active entry when no heading is visible", () => {
  assert.equal(
    pickActiveTocId(
      ["intro", "details"],
      [{ id: "intro", isIntersecting: false, ratio: 0 }],
      "details",
    ),
    "details",
  );
});
