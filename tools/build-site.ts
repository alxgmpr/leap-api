import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildModel } from "../lib/site/model.ts";
import { renderHome } from "../lib/site/render/home.ts";
import type { Page } from "../lib/site/render/layout.ts";
import { renderResourcePages } from "../lib/site/render/resource.ts";

const OUT = "site";

const model = buildModel();
const pages: Page[] = [...renderHome(model), ...renderResourcePages(model)];

rmSync(OUT, { recursive: true, force: true });
for (const p of pages) {
  const target = join(OUT, p.path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, p.html, "utf8");
}
cpSync("site-src", join(OUT, "assets"), { recursive: true });
writeFileSync(join(OUT, "model.json"), JSON.stringify(model), "utf8");
console.log(`built ${pages.length} pages into ${OUT}/`);
