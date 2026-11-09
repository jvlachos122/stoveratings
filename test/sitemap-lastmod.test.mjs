import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSitemapLastmods,
  chooseLastmod,
  isSitemapLastmod,
  isW3cDateTime,
} from "../src/lib/sitemap-lastmod.js";

test("sitemap datetimes match the W3C forms Google documents", () => {
  assert.equal(isW3cDateTime("2026-10-23"), true);
  assert.equal(isSitemapLastmod("2026-10-23"), true);
  assert.equal(isW3cDateTime("2026-11-08T02:24:44-06:00"), true);
  assert.equal(isSitemapLastmod("2026-11-08T02:24:44-06:00"), true);
  assert.equal(isW3cDateTime("2026-11-08T08:24:44Z"), true);
  assert.equal(isW3cDateTime("2026-10-23T00:00:00.000Z"), true);
  assert.equal(isSitemapLastmod("2026-10-23T00:00:00.000Z"), false);
  assert.equal(isSitemapLastmod("2026-10-23T00:00:00"), false);
  assert.equal(isW3cDateTime("2026-02-31"), false);
  assert.equal(isSitemapLastmod("10/23/2026"), false);
});

test("snapshot date is the fallback only when it is the latest real candidate", () => {
  assert.equal(chooseLastmod(["2026-10-23"]), "2026-10-23");
  assert.equal(
    chooseLastmod(["2026-10-23", "2026-11-08T02:24:44-06:00"]),
    "2026-11-08T02:24:44-06:00",
  );
  assert.equal(
    chooseLastmod(["2026-10-23T22:12:24-05:00", "2026-10-23"]),
    "2026-10-23T22:12:24-05:00",
  );
});

test("page lastmods follow content commits and not one shared clock", () => {
  const lastmods = buildSitemapLastmods();
  const pellet = lastmods.get("/cleanest-burning-pellet-stoves/");
  const contact = lastmods.get("/contact/");
  const privacy = lastmods.get("/privacy/");
  const stove = lastmods.get("/stoves/ac-component-specialists/620-9-and-620-10/");
  const brand = lastmods.get("/brands/509-fabrications-inc/");
  const compare = lastmods.get("/compare/");
  const tool = lastmods.get("/tools/stove-size-calculator/");
  for (const value of [pellet, contact, privacy, stove, brand, compare, tool]) {
    assert.ok(isW3cDateTime(value), value);
    assert.ok(isSitemapLastmod(value), value);
    assert.ok(Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value) <= Date.now() + 60_000, value);
  }
  assert.ok(pellet.slice(0, 10) > "2026-10-23", pellet);
  assert.equal(contact.slice(0, 10), "2026-10-23");
  assert.equal(privacy.slice(0, 10), "2026-10-23");
  assert.notEqual(pellet, contact);
  assert.ok(tool.slice(0, 10) > "2026-10-23", tool);
  const distinct = new Set([contact, brand, compare, stove, tool]);
  assert.ok(distinct.size >= 4, [...distinct].join(" | "));
});
