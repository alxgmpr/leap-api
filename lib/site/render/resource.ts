import type { CommandRow } from "../command-table.ts";
import type { Edge } from "../graph.ts";
import type { LeapModel, Operation, Resource } from "../model.ts";
import { renderFrame } from "./highlight.ts";
import { siteNav } from "./home.ts";
import { esc } from "./html.ts";
import { type Page, page } from "./layout.ts";

const ROOT = "../../";

const VERDICT_NOTE: Record<string, string> = {
  confirmed: "A 200 was captured from hardware.",
  refused: "Hardware was asked and answered something other than 200.",
  "app-re":
    "Recovered from decompiled Lutron app binaries. The firmware route extraction has no commandprocessor routes at all.",
  firmware: "Present in the firmware extraction.",
  "not-established": "The specification marks this unresolved.",
  "never-asked": "No probe corpus ever sent this.",
};

function verdictChip(operation: Operation): string {
  const { verdict, observations } = operation.provenance;
  const detail = [
    VERDICT_NOTE[verdict] ?? "",
    ...observations.map((o) => `${o.corpus}: ${o.status}`),
  ]
    .filter(Boolean)
    .join(" — ");
  return `<span class="chip chip-verdict chip-${verdict}" title="${esc(detail)}">${esc(verdict.replace("-", " "))}</span>`;
}

function observationTable(operation: Operation): string {
  const { observations } = operation.provenance;
  if (observations.length === 0) return "";
  return `<div class="tablewrap"><table class="observations"><thead><tr><th>Corpus</th><th>Answered</th></tr></thead><tbody>${observations
    .map(
      (o) =>
        `<tr><td><code>${esc(o.corpus)}</code></td><td>${esc(o.status)}</td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}

function composer(operation: Operation, commandTable: CommandRow[]): string {
  const isCommand = operation.url.endsWith("/commandprocessor");
  const options = isCommand
    ? commandTable
        .map(
          (row) =>
            `<option value="${esc(row.commandType)}" data-field="${esc(row.parameterField ?? "")}" data-established="${esc(row.establishedBy)}">${esc(row.commandType)}</option>`,
        )
        .join("")
    : "";
  const params = operation.url.match(/\{(\w+)\}/g) ?? [];
  return `<form class="composer" data-url="${esc(operation.url)}" data-communique="${esc(operation.communiqueType)}" data-wrapper="${esc(operation.requestSchema ?? "")}">
${params
  .map(
    (p) =>
      `<label>${esc(p)}<input name="${esc(p.slice(1, -1))}" data-param value="1"></label>`,
  )
  .join("")}
${
  isCommand
    ? `<label>CommandType<select name="CommandType" data-command>${options}</select></label><div class="command-field" data-command-field></div>`
    : ""
}
<output class="composed"></output>
<button type="button" class="send" disabled title="Enable by running the local playground">Send</button>
</form>`;
}

function renderOperation(operation: Operation, model: LeapModel): string {
  const anchor = operation.operationId || operation.url;
  return `<article class="operation" id="${esc(anchor)}" data-verdict="${esc(operation.provenance.verdict)}">
<h3><span class="communique">${esc(operation.communiqueType)}</span> <code>${esc(operation.url)}</code> ${verdictChip(operation)}${operation.subscribable ? ' <span class="chip chip-sub">Subscribable</span>' : ""}</h3>
${operation.summary ? `<p class="summary">${esc(operation.summary)}</p>` : ""}
${operation.bodyType ? `<p class="bodytype">Wire <code>MessageBodyType</code>: <code>${esc(operation.bodyType)}</code> — <code>Body</code> is <code>{"${esc(operation.bodyType)}": …}</code>, and the schema below describes what is under that key.</p>` : ""}
${
  operation.eventSchema
    ? `<p class="pushes">Subscribing pushes <a href="${ROOT}schema/${esc(operation.eventSchema)}/index.html">${esc(operation.eventSchema)}</a> — a partial carrying only changed fields, so its <code>required</code> list does not hold for a push. See <a href="${ROOT}docs/subscriptions/index.html">Subscriptions</a>.</p>`
    : ""
}
${renderFrame(operation.request, "Request")}
${operation.responses.map((f) => renderFrame(f, `Response (${f.source})`)).join("")}
${composer(operation, model.commandTable)}
${observationTable(operation)}
${
  operation.responseSchema
    ? `<p class="schema-link">Payload schema: <a href="${ROOT}schema/${esc(operation.responseSchema)}/index.html">${esc(operation.responseSchema)}</a></p>`
    : ""
}
${
  operation.requestSchema
    ? `<p class="schema-link">Request payload schema: <a href="${ROOT}schema/${esc(operation.requestSchema)}/index.html">${esc(operation.requestSchema)}</a></p>`
    : ""
}
<details class="openapi-mapping"><summary>OpenAPI mapping</summary><p>Rendered in <code>dist/openapi.yaml</code> as <code>${esc(operation.httpVerb || "(no HTTP verb — subscribe-only)")} ${esc(operation.url)}</code>${operation.operationId ? `, operationId <code>${esc(operation.operationId)}</code>` : ""}. See <a href="${ROOT}docs/mapping/index.html">Mapping LEAP onto OpenAPI</a>.</p></details>
</article>`;
}

function renderEdges(edges: Edge[], documented: Set<string>): string {
  if (edges.length === 0) return "";

  // Three states, and the middle one is real: hardware returns hrefs pointing
  // at routes this reference does not document. Linking those to a page that
  // does not exist would be worse than saying so.
  const renderEdge = (edge: Edge): string => {
    const label = `<code>${esc(edge.schema)}.${esc(edge.property)}</code>`;
    if (!edge.target)
      return `<li data-target="">${label} → <span class="unresolved">target not established — no capture ever populated this link</span></li>`;

    const evidence = `<span class="evidence">observed ${esc(edge.observedHref ?? "")} in ${esc(edge.corpus ?? "")}</span>`;
    if (!documented.has(edge.target))
      return `<li data-target="${esc(edge.target)}">${label} → <code>/${esc(edge.target)}</code> ${evidence} — <span class="unresolved">not documented in this reference; see <a href="${ROOT}coverage/index.html">coverage</a></span></li>`;

    return `<li data-target="${esc(edge.target)}">${label} → <a href="${ROOT}resource/${esc(edge.target)}/index.html">${esc(edge.target)}</a> ${evidence}</li>`;
  };

  return `<h2>Links to other resources</h2>
<p class="lede">Targets are read off real captured <code>href</code> values. A link
no capture ever populated is left unresolved rather than guessed from its
property name.</p>
<ul class="edges">${edges.map(renderEdge).join("")}</ul>`;
}

function renderResource(
  resource: Resource,
  model: LeapModel,
  documented: Set<string>,
): Page {
  const subscribable = resource.operations.filter((o) => o.subscribable).length;
  const main = `<h1>${esc(resource.name)}</h1>
<p class="lede">${resource.operations.length} operation${resource.operations.length === 1 ? "" : "s"}${subscribable > 0 ? `, ${subscribable} subscribable` : ""}. Everything you can send about a
<code>${esc(resource.name)}</code>, the frames it answers with, and what it links to.</p>
${renderEdges(resource.edges, documented)}
<h2>Operations</h2>
${resource.operations.map((operation) => renderOperation(operation, model)).join("")}`;

  return {
    path: `resource/${resource.name}/index.html`,
    html: page({
      title: resource.name,
      relativeRoot: ROOT,
      nav: siteNav(model),
      main,
    }),
  };
}

export function renderResourcePages(model: LeapModel): Page[] {
  const documented = new Set(model.resources.map((r) => r.name));
  return model.resources.map((resource) =>
    renderResource(resource, model, documented),
  );
}
