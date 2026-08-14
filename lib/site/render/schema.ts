import type { SchemaNode } from "../graph.ts";
import { href, ROOT_TOP } from "../href.ts";
import type { LeapModel, SchemaEntry } from "../model.ts";
import { classifyField } from "../provenance.ts";
import { esc } from "./html.ts";
import type { Section } from "./layout.ts";
import { renderMarkdown } from "./markdown.ts";

function typeLabel(node: SchemaNode): string {
  const ref = node.$ref;
  if (typeof ref === "string") {
    const name = ref.split("/").pop() as string;
    return `<a href="${esc(href.schema(ROOT_TOP, name))}">${esc(name)}</a>`;
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
<td>${Array.isArray(observed) ? `<span class="observed">observed: ${esc(observed.map(String).join(", "))}</span>` : ""}${node.description ? `<div class="prose fielddesc">${renderMarkdown(String(node.description))}</div>` : ""}</td>
</tr>`;
}

function renderSchema(entry: SchemaEntry): string {
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

  return `<article class="schema-article" id="schema-${esc(entry.name)}">
<h3>${esc(entry.name)}</h3>
${schemaEvidence}
${node.description ? `<div class="prose schema-desc">${renderMarkdown(String(node.description))}</div>` : ""}
${items ? `<h4>Element type</h4><p>${typeLabel(node)}</p>` : ""}
${
  enumValues
    ? `<h4>Members</h4><p class="meta">Every closed enum here is a lower bound — the firmware extraction can never bound a member set.</p><ul class="enum">${enumValues
        .map((v) => `<li><code>${esc(String(v))}</code></li>`)
        .join("")}</ul>`
    : ""
}
${
  Object.keys(properties).length > 0
    ? `<h4>Fields</h4><div class="tablewrap"><table class="fields"><thead><tr><th>Field</th><th>Type</th><th>Evidence</th><th>Notes</th></tr></thead><tbody>${Object.entries(
        properties,
      )
        .map(([name, prop]) => renderField(name, prop, required))
        .join("")}</tbody></table></div>`
    : ""
}
${
  entry.usedBy.length > 0
    ? `<h4>Used by</h4><ul class="usedby">${[...new Set(entry.usedBy)]
        .map((url) => {
          const owner = url.split("/")[1] ?? "misc";
          return `<li><a href="${esc(href.resource(ROOT_TOP, owner))}"><code>${esc(url)}</code></a></li>`;
        })
        .join("")}</ul>`
    : ""
}
</article>`;
}

/**
 * All schemas in one section. The unwrapping rule is stated once at the top
 * instead of once per schema -- it applies identically to all of them.
 */
export function renderSchemaSection(model: LeapModel): Section {
  const html = `<h2 class="part">Schemas</h2>
<p class="lede">Each schema describes the <strong>unwrapped payload</strong> —
the value under <code>Body</code>'s single key, not the wrapper around it.</p>
${model.schemas.map((entry) => renderSchema(entry)).join("\n")}`;
  return { id: "schemas", html };
}
