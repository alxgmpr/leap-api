import { stringify } from "yaml";
import { censusToObject, deriveObserved } from "../lib/observed-census.ts";

/**
 * Print the `x-observed-census` block for every `x-observed-values` site in
 * `dist/openapi.yaml`, ready to paste into the schema file beside the
 * annotation it belongs to.
 *
 * Its whole purpose is that no count is ever hand-typed. Run it, paste the
 * block, run the suite. Requires a fresh `npm run bundle`: it reads the
 * bundle, not `spec/`, so a stale bundle prints stale counts.
 *
 *   $ npm run census                      # every site
 *   $ npm run census -- ZoneStatus        # sites whose id contains the filter
 *
 * THE CIRCULARITY, stated plainly: this generator and
 * `test/observed-values.test.ts` share one derivation
 * (`lib/observed-census.ts`), so the pair cannot catch a bug in that
 * derivation -- a miscount here is a miscount there, and the test agrees
 * with it. What the pair does catch is DRIFT: a fixture import, a redaction
 * change, a widened route, or an edited description that no longer matches
 * the corpus. That is the defect class this project actually suffers, and
 * the alternative -- two independent implementations -- gives two numbers
 * and no way to tell which is right.
 *
 * Counts are OBJECT OCCURRENCES, not entities: one per string encountered at
 * the site while walking the fixture bodies, so the same object reachable at
 * two URLs is counted twice. See lib/observed-census.ts.
 */

const filter = process.argv[2];
const { sites } = deriveObserved();

let printed = 0;
for (const site of sites.sort((a, b) => a.id.localeCompare(b.id))) {
  if (filter && !site.id.includes(filter)) continue;
  const derived = censusToObject(site.census);
  console.log(`# ${site.id}`);
  if (Object.keys(derived).length === 0) {
    // An annotated site neither anchor reaches. Emitting an empty block would
    // assert "the fixtures carry nothing here", which is a claim about the
    // corpus this tool has no standing to make -- the site is more likely
    // unreachable by the walker than genuinely unobserved. Report it.
    console.log("#   NO OCCURRENCES DERIVED -- neither anchor reaches this");
    console.log("#   site. Do not paste an empty census; investigate why the");
    console.log(
      `#   walker never lands here. claims: ${JSON.stringify(site.claimed)}`,
    );
  } else {
    console.log(stringify({ "x-observed-census": derived }).trimEnd());
  }
  console.log("");
  printed++;
}

console.log(`# ${printed} site(s)${filter ? ` matching "${filter}"` : ""}`);
