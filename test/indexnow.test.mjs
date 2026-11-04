import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { changedUrls, indexNowAccepted } from "../scripts/indexnow.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("IndexNow submits every URL when there is no previous manifest, then only hash changes", () => {
  const current = {
    urls: {
      "https://stoveratings.com/": "aaa",
      "https://stoveratings.com/lookup/": "bbb",
    },
  };
  assert.deepEqual(changedUrls(current, null), [
    "https://stoveratings.com/",
    "https://stoveratings.com/lookup/",
  ]);
  assert.deepEqual(changedUrls(current, { urls: { "https://stoveratings.com/": "aaa", "https://stoveratings.com/lookup/": "old" } }), [
    "https://stoveratings.com/lookup/",
  ]);
  assert.deepEqual(changedUrls(current, current), []);
});

test("IndexNow acceptance requires HTTP 200 or 202 for every batch", () => {
  assert.equal(indexNowAccepted(0, []), true);
  assert.equal(indexNowAccepted(10, [200]), true);
  assert.equal(indexNowAccepted(10, [202]), true);
  assert.equal(indexNowAccepted(10, [200, 202]), true);
  assert.equal(indexNowAccepted(1875, [403]), false);
  assert.equal(indexNowAccepted(10, [200, 422]), false);
  assert.equal(indexNowAccepted(10, []), false);
  assert.equal(indexNowAccepted(10, [0]), false);
});

test("the deploy workflow promotes the IndexNow manifest only after a successful submit", () => {
  for (const name of ["deploy.yml", "refresh.yml"]) {
    const text = readFileSync(join(root, ".github/workflows", name), "utf8");
    const submit = text.split("Submit changed URLs to IndexNow")[1].split("Promote IndexNow manifest")[0];
    assert.match(submit, /scripts\/indexnow\.mjs --submit/);
    assert.doesNotMatch(submit, /\bcp\b/);
    assert.match(
      text,
      /name: Promote IndexNow manifest\n\s+if: success\(\)\n\s+run: cp \.indexnow\/manifest\.json \.indexnow\/previous-manifest\.json/,
    );
  }
});
