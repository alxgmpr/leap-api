import { type Callout, calloutsFor } from "../callouts.ts";
import type { Edge } from "../graph.ts";
import { href, ROOT_NESTED, ROOT_TOP } from "../href.ts";
import type { LeapModel, Operation, Resource } from "../model.ts";
import type { Provenance } from "../provenance.ts";
import { timelineFor } from "../timelines.ts";
import { renderReply, renderWire } from "./highlight.ts";
import { resourceGrid } from "./home.ts";
import { esc } from "./html.ts";
import type { Section } from "./layout.ts";
import { renderMarkdown, splitInjectedTable } from "./markdown.ts";
import { renderTimeline } from "./timeline.ts";

const VERDICT_NOTE: Record<string, string> = {
  confirmed: "A 200 was captured from hardware.",
  refused: "Hardware was asked and answered something other than 200.",
  "app-re":
    "Recovered from decompiled Lutron app binaries. The firmware route extraction has no commandprocessor routes at all.",
  firmware: "Present in the firmware extraction.",
  "not-established": "The specification marks this unresolved.",
  "never-asked": "No probe corpus ever sent this.",
  unverified:
    "Imported from the firmware route table without hand-refinement. No capture has exercised it and its shapes are the generator's staging output.",
};

/**
 * Corpora collapse to the two product lines. A reader wants to know that RA3
 * and Caseta answered, not which of the seven probe campaigns did the asking
 * -- that stays in the title, and in the platforms doc.
 */
function platformOf(corpus: string): string {
  return corpus.includes("caseta") ? "caseta" : "ra3";
}

/** One mark per URL: ink for answered on hardware, grey for everything else. */
function evidenceMark(provenances: Provenance[]): string {
  const observations = provenances.flatMap((p) => p.observations);
  const detail = observations.map((o) => `${o.corpus}: ${o.status}`).join(", ");
  const confirmed = provenances.some((p) => p.verdict === "confirmed");

  if (confirmed) {
    const answered = [
      ...new Set(
        observations
          .filter((o) => o.status.startsWith("200"))
          .map((o) => platformOf(o.corpus)),
      ),
    ].join(" ");
    return `<span class="chip chip-verdict chip-confirmed" title="${esc(`${VERDICT_NOTE.confirmed} ${detail}`)}"><span class="dot live">●</span> ${esc(answered)}</span>`;
  }

  const verdict = provenances[0]?.verdict ?? "never-asked";
  const note = VERDICT_NOTE[verdict] ?? "";
  return `<span class="chip chip-verdict chip-${verdict}" title="${esc(detail ? `${note} ${detail}` : note)}"><span class="dot">○</span> ${esc(verdict.replace("-", " "))}</span>`;
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

/**
 * Scalar fields of a parameter schema, so the composer can offer real inputs
 * rather than an empty object. Nested objects and $refs are skipped: they need
 * their own schema section, and the link to it is already on the operation.
 */
function parameterFields(
  schemaName: string | null,
  model: LeapModel,
): { name: string; type: string; example?: string }[] {
  if (!schemaName) return [];
  const entry = model.schemas.find((s) => s.name === schemaName);
  const properties = (entry?.node.properties ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  return Object.entries(properties)
    .filter(
      ([, node]) =>
        node.type === "string" ||
        node.type === "number" ||
        node.type === "integer",
    )
    .map(([name, node]) => ({
      name,
      type: String(node.type),
      example: typeof node.example === "string" ? node.example : undefined,
    }));
}

function composer(operation: Operation, model: LeapModel): string {
  const isCommand = operation.url.endsWith("/commandprocessor");
  const options = isCommand
    ? model.commandTable
        .map(
          (row) =>
            `<option value="${esc(row.commandType)}" data-field="${esc(row.parameterField ?? "")}" data-established="${esc(row.establishedBy)}" data-fields="${esc(JSON.stringify(parameterFields(row.parameterField, model)))}">${esc(row.commandType)}</option>`,
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
<button type="button" class="send-frame" disabled title="Enable by running the local playground">Send</button>
</form>`;
}

/** One exchange: the line you write, and the line you read back. */
function renderExchange(operation: Operation, model: LeapModel): string {
  const timeline = timelineFor(operation, model.frameLogs);
  const anchor = operation.operationId || operation.url;
  const prose = operation.description
    ? splitInjectedTable(operation.description).prose
    : "";

  // One reply per product line, not one per probe campaign. Seven corpora
  // answering the same read produced seven near-identical lines; RA3 and
  // Caseta can genuinely differ, and that is the comparison worth showing.
  // Every corpus that answered is still listed in the details below.
  // First wins, not last: captures.json lists the two original campaigns
  // ahead of the coverage-blind sweeps, and those carry the fuller bodies --
  // keeping the last would show /zone's 1-item spec-read capture instead of
  // the 14-item one.
  const byPlatform = new Map<string, (typeof operation.responses)[number]>();
  for (const frame of operation.responses) {
    const platform = platformOf(frame.source ?? "");
    if (!byPlatform.has(platform)) byPlatform.set(platform, frame);
  }
  const replies = [...byPlatform.values()];

  const isCommand = operation.url.endsWith("/commandprocessor");

  const notes = [
    operation.summary ? `<p class="summary">${esc(operation.summary)}</p>` : "",
    operation.bodyType
      ? `<p class="meta">Wire <code>MessageBodyType</code> <code>${esc(operation.bodyType)}</code> — <code>Body</code> wraps the payload under that key.</p>`
      : "",
    operation.eventSchema
      ? `<p class="meta">Subscribing pushes <a href="${esc(href.schema(ROOT_NESTED, operation.eventSchema))}">${esc(operation.eventSchema)}</a>, a partial carrying only changed fields. <a href="${esc(href.doc(ROOT_NESTED, "subscriptions"))}">Subscriptions</a>.</p>`
      : "",
    prose ? `<div class="prose opdesc">${renderMarkdown(prose)}</div>` : "",
    observationTable(operation),
    operation.responseSchema
      ? `<p class="meta">Payload schema <a href="${esc(href.schema(ROOT_NESTED, operation.responseSchema))}">${esc(operation.responseSchema)}</a>.</p>`
      : "",
    operation.requestSchema
      ? `<p class="meta">Request payload schema <a href="${esc(href.schema(ROOT_NESTED, operation.requestSchema))}">${esc(operation.requestSchema)}</a>.</p>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `<article class="op" id="${esc(anchor)}">
${calloutsFor(operation)
  .map(
    (c: Callout) =>
      `<p class="callout">${esc(c.text)} <a href="${esc(c.href)}">Read why</a>.</p>`,
  )
  .join("")}
<div class="send"><span class="dir" aria-hidden="true">→</span><span class="ct">${esc(operation.communiqueType.replace("Request", ""))}</span>${operation.subscribable ? '<span class="sub">subscribable</span>' : ""}</div>
${renderWire(operation.request)}
${
  replies.length > 0
    ? replies.map((frame) => renderReply(frame, ROOT_NESTED)).join("")
    : '<div class="reply reply-none"><span class="dir" aria-hidden="true">←</span><span class="shape">no captured reply</span></div>'
}
${timeline ? renderTimeline(timeline, "This exchange on hardware") : ""}
<details class="compose"${isCommand ? " open" : ""}><summary>Compose a frame</summary>${composer(operation, model)}</details>
<details class="more"><summary>Evidence and notes</summary>${notes}</details>
</article>`;
}

/**
 * A URL is one addressable thing; the CommuniqueTypes are what may be sent to
 * it. Grouping stops the same URL being restated once per verb.
 */
function renderUrlGroup(
  url: string,
  operations: Operation[],
  model: LeapModel,
): string {
  const verdict = operations.some((o) => o.provenance.verdict === "confirmed")
    ? "confirmed"
    : (operations[0]?.provenance.verdict ?? "never-asked");

  return `<section class="group" data-verdict="${esc(verdict)}">
<header class="url-head">
<h3 class="url">${esc(url)}</h3>
${evidenceMark(operations.map((o) => o.provenance))}
</header>
${operations.map((operation) => renderExchange(operation, model)).join("")}
</section>`;
}

function renderEdges(edges: Edge[], documented: Set<string>): string {
  if (edges.length === 0) return "";

  // Three states, and the middle one is real: hardware returns hrefs pointing
  // at routes this reference does not document. Linking those to a section
  // that does not exist would be worse than saying so.
  const renderEdge = (edge: Edge): string => {
    const label = `<code>${esc(edge.schema)}.${esc(edge.property)}</code>`;
    if (!edge.target)
      return `<li data-target=""><span class="dot">○</span> ${label} <span class="unresolved">target not established</span></li>`;

    const evidence = `<span class="evidence" title="observed ${esc(edge.observedHref ?? "")} in ${esc(edge.corpus ?? "")}">${esc(edge.observedHref ?? "")}</span>`;
    if (!documented.has(edge.target))
      return `<li data-target="${esc(edge.target)}"><span class="dot live">●</span> ${label} → <code>/${esc(edge.target)}</code> ${evidence} <span class="unresolved">not documented here</span></li>`;

    return `<li data-target="${esc(edge.target)}"><span class="dot live">●</span> ${label} → <a href="${esc(href.resource(ROOT_NESTED, edge.target))}">${esc(edge.target)}</a> ${evidence}</li>`;
  };

  return `<details class="links"><summary>Links to other resources · ${edges.length}</summary>
<p class="meta">Targets are read off captured <code>href</code> values. A link
no capture ever populated is left unresolved rather than guessed from its
property name.</p>
<ul class="edges">${edges.map(renderEdge).join("")}</ul>
</details>`;
}

/**
 * One resource, as its own page. Headings are promoted one level from the
 * shared-document form (the old h2 -> h1): a resource page owns its heading
 * hierarchy outright instead of nesting under the single-page document's h1.
 * The evidence legend that used to sit once above every resource section
 * now lives on `renderResourceIndex` instead -- restating it per page would
 * be the same "used to be restated on every resource page" mistake in
 * reverse.
 */
export function renderResourcePage(
  model: LeapModel,
  resource: Resource,
): Section {
  const documented = new Set(model.resources.map((r) => r.name));
  const byUrl = new Map<string, Operation[]>();
  for (const operation of resource.operations)
    byUrl.set(operation.url, [...(byUrl.get(operation.url) ?? []), operation]);

  const subscribable = resource.operations.filter((o) => o.subscribable).length;

  const html = `<header class="mast">
<h1>${esc(resource.name)}</h1>
<span class="count">${byUrl.size} URL${byUrl.size === 1 ? "" : "s"} · ${resource.operations.length} operation${resource.operations.length === 1 ? "" : "s"}${subscribable > 0 ? ` · ${subscribable} subscribable` : ""}</span>
</header>
${renderEdges(resource.edges, documented)}
${[...byUrl.entries()]
  .map(([url, operations]) => renderUrlGroup(url, operations, model))
  .join("")}`;

  return { id: `resource-${resource.name}`, html };
}

/**
 * The resources tier index: its own page (Task 5), carrying the evidence
 * legend once and a grid linking every resource with its operation count --
 * the same `.resource-grid` markup the overview's "Resources" section uses,
 * via the shared `resourceGrid` helper.
 */
export function renderResourceIndex(model: LeapModel): Section {
  const html = `<h1 class="part">Resources</h1>
<p class="lede">Every addressable URL, grouped by its first path segment, with
the frames a client writes and the replies hardware gave.</p>
<p class="legend"><span><span class="dot live">●</span> answered on hardware</span><span><span class="dot">○</span> not observed</span><span>→ you write · ← you read</span></p>
<ul class="resource-grid">${resourceGrid(model, ROOT_TOP)}</ul>`;
  return { id: "resources", html };
}
