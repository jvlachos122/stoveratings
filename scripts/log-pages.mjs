import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (entry.endsWith(".html")) files.push(path.slice(dist.length).replaceAll("\\", "/"));
  }
  return files;
}

const files = walk(dist);
function count(predicate) {
  return files.filter(predicate).length;
}

const buckets = {
  home: count((file) => file === "/index.html"),
  finderAlias: count((file) => file === "/finder/index.html"),
  lookup: count((file) => file === "/lookup/index.html"),
  compare: count((file) => file === "/compare/index.html"),
  brandIndex: count((file) => file === "/brands/index.html"),
  brandHubs: count((file) => /^\/brands\/[^/]+\/index\.html$/.test(file)),
  modelPages: count((file) => /^\/stoves\/[^/]+\/[^/]+\/index\.html$/.test(file)),
  legal: count((file) => ["/about/index.html", "/methodology/index.html", "/privacy/index.html", "/disclosure/index.html", "/contact/index.html"].includes(file)),
  notFound: count((file) => file === "/404.html"),
  typeLists: count((file) =>
    [
      "/catalytic-wood-stoves/index.html",
      "/non-catalytic-wood-stoves/index.html",
      "/hybrid-wood-stoves/index.html",
      "/pellet-stoves/index.html",
      "/most-efficient-wood-stoves/index.html",
      "/most-efficient-pellet-stoves/index.html",
      "/cleanest-burning-wood-stoves/index.html",
      "/catalytic-vs-non-catalytic/index.html",
    ].includes(file),
  ),
  insertLists: count((file) => ["/wood-stove-inserts/index.html", "/pellet-stove-inserts/index.html"].includes(file)),
  centralLists: count((file) =>
    ["/outdoor-wood-boilers/index.html", "/wood-furnaces/index.html", "/pellet-boilers/index.html"].includes(file),
  ),
  firewood: count((file) => file === "/firewood-btu-chart/index.html"),
  calculator: count((file) => file === "/tools/stove-size-calculator/index.html"),
  heatingCost: count((file) => file === "/tools/heating-cost-calculator/index.html"),
  explainers: count((file) => ["/pellet-stove-vs-wood-stove/index.html", "/wood-stove-tax-credit/index.html"].includes(file)),
};
const named = Object.values(buckets).reduce((sum, value) => sum + value, 0);
buckets.other = files.length - named;
if (buckets.other) {
  const leftover = files.filter(
    (file) =>
      !/^\/brands\/[^/]+\/index\.html$/.test(file) &&
      !/^\/stoves\/[^/]+\/[^/]+\/index\.html$/.test(file) &&
      ![
        "/index.html",
        "/finder/index.html",
        "/lookup/index.html",
        "/compare/index.html",
        "/brands/index.html",
        "/404.html",
        "/about/index.html",
        "/methodology/index.html",
        "/privacy/index.html",
        "/disclosure/index.html",
        "/contact/index.html",
        "/catalytic-wood-stoves/index.html",
        "/non-catalytic-wood-stoves/index.html",
        "/hybrid-wood-stoves/index.html",
        "/pellet-stoves/index.html",
        "/most-efficient-wood-stoves/index.html",
        "/most-efficient-pellet-stoves/index.html",
        "/cleanest-burning-wood-stoves/index.html",
        "/catalytic-vs-non-catalytic/index.html",
        "/wood-stove-inserts/index.html",
        "/pellet-stove-inserts/index.html",
        "/outdoor-wood-boilers/index.html",
        "/wood-furnaces/index.html",
        "/pellet-boilers/index.html",
        "/firewood-btu-chart/index.html",
        "/tools/stove-size-calculator/index.html",
        "/tools/heating-cost-calculator/index.html",
        "/pellet-stove-vs-wood-stove/index.html",
        "/wood-stove-tax-credit/index.html",
      ].includes(file),
  );
  console.log("UNBUCKETED", leftover.join(" "));
}
const size = execSync("du -sh dist", { cwd: root }).toString().trim();
console.log("PAGE_COUNTS", JSON.stringify(buckets));
console.log("HTML_FILES", files.length);
console.log("BUILD_SIZE", size);
