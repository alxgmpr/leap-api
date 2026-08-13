import type { SchemaNode } from "../graph.ts";
import type { LeapModel, SchemaEntry } from "../model.ts";
import { classifyField } from "../provenance.ts";
import { siteNav } from "./home.ts";
import { esc } from "./html.ts";
import { type Page, page } from "./layout.ts";

const ROOT = "../../";

function typeLabel(node: SchemaNode): string {
  const ref = node.$ref;
  if (typeof ref === "string") {
    const name = ref.split("/").pop() as string;
    return `<a href="${ROOT}schema/${esc(name)}/index.html">${esc(name)}</a>`;
  }
  if (node.type === "array") {
    const items = node.items as SchemaNode | undefined;
    return `array of ${items ? typeLabel(items) : "unknown"}`;
  }
  if (typeof node.type === "string") return esc(node.type);
  return "unknown";
}

function renderField(
  name: string,
  node: SchemaNode,
  required: Set<string>,
): string {
  const verdict = classifyField(node);
  const observed = node["x-observed-values"];
  const isRequired = required.has(name);
  return `<tr${isRequired ? ' class="required"' : ""} data-verdict="${esc(verdict)}">
<td><code>${esc(name)}</code>${isRequired ? ' <span class="req">required</span>' : ""}</td>
<td>${typeLabel(node)}</td>
<td><span class="chip chip-verdict chip-${verdict}">${esc(verdict.replace("-", " "))}</span></td>
<td>${Array.isArray(observed) ? `<span class="observed">observed: ${esc(observed.map(String).join(", "))}</span>` : ""}${node.description ? `<p class="fielddesc">${esc(String(node.description))}</p>` : ""}</td>
</tr>`;
}

function renderSchema(entry: SchemaEntry, model: LeapModel): Page {
  const node = entry.node;
  const properties = (node.properties ?? {}) as Record<string, SchemaNode>;
  const required = new Set(
    Array.isArray(node.required) ? (node.required as string[]) : [],
  );
  const enumValues = Array.isArray(node.enum) ? (node.enum as unknown[]) : null;
  const items = node.type === "array" ? (node.items as SchemaNode) : null;
  const observed = node["x-observed-values"];
  const verdict = classifyField(node);

  // A type can carry observed values without being an enum at all -- the six
  // deliberately-open string types (ServiceType, Role and the rest) record
  // what hardware has shown without claiming the set is bounded.
  const schemaEvidence = Array.isArray(observed)
    ? `<p class="bodytype"><span class="chip chip-verdict chip-${verdict}">${esc(verdict.replace("-", " "))}</span> <span class="observed">observed: ${esc(observed.map(String).join(", "))}</span>${enumValues ? "" : " — recorded as an open <code>string</code>, not a closed set"}</p>`
    : "";

  const main = `<h1>${esc(entry.name)}</h1>
<p class="lede">This describes the <strong>unwrapped payload</strong> — the value
under <code>Body</code>'s single key, not the wrapper around it.</p>
${schemaEvidence}
${node.description ? `<div class="schema-desc"><p>${esc(String(node.description))}</p></div>` : ""}
${items ? `<h2>Element type</h2><p>${typeLabel(node)}</p>` : ""}
${
  enumValues
    ? `<h2>Members</h2><p class="lede">Every closed enum here is a lower bound — the firmware extraction can never bound a member set. See <a href="${ROOT}docs/mapping/index.html">the mapping notes</a>.</p><ul class="enum">${enumValues
        .map((v) => `<li><code>${esc(String(v))}</code></li>`)
        .join("")}</ul>`
    : ""
}
${
  Object.keys(properties).length > 0
    ? `<h2>Fields</h2><div class="tablewrap"><table class="fields"><thead><tr><th>Field</th><th>Type</th><th>Evidence</th><th>Notes</th></tr></thead><tbody>${Object.entries(
        properties,
      )
        .map(([name, prop]) => renderField(name, prop, required))
        .join("")}</tbody></table></div>`
    : ""
}
${
  entry.usedBy.length > 0
    ? `<h2>Used by</h2><ul class="usedby">${[...new Set(entry.usedBy)]
        .map(
          (url) =>
            `<li><a href="${ROOT}resource/${esc(url.split("/")[1] ?? "misc")}/index.html"><code>${esc(url)}</code></a></li>`,
        )
        .join("")}</ul>`
    : ""
}`;

  return {
    path: `schema/${entry.name}/index.html`,
    html: page({
      title: entry.name,
      relativeRoot: ROOT,
      nav: siteNav(model),
      main,
    }),
  };
}

export function renderSchemaPages(model: LeapModel): Page[] {
  return model.schemas.map((entry) => renderSchema(entry, model));
}
