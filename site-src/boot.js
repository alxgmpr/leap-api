// Progressive enhancement entry point. Every page is complete without this
// file: frames, tables, schemas and platform data are all in the HTML. This
// adds the composer, copy buttons, search and the provenance filter. The
// session timelines are static, rendered at build time.

import { composeFrame } from "./compose.js";
import { buildSearchIndex, filterIndex } from "./search-index.js";
import { getTransport } from "./transport.js";

const root = document.body.dataset.root ?? "";

/* ---------- copy buttons ---------- */

for (const button of document.querySelectorAll("button.copy")) {
  button.addEventListener("click", async () => {
    await navigator.clipboard.writeText(button.dataset.copy ?? "");
    const original = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => {
      button.textContent = original;
    }, 1200);
  });
}

/* ---------- frame composer ---------- */

/**
 * Build the payload for a command processor from the selected CommandType.
 * The pairing comes from Command.yaml's own table, parsed at build time -- so
 * a CommandType the table does not pair with a field offers no input at all
 * rather than an invented one.
 * @param {HTMLFormElement} form
 */
function commandPayload(form) {
  const select = form.querySelector("[data-command]");
  if (!(select instanceof HTMLSelectElement)) return undefined;
  const option = select.selectedOptions[0];
  if (!option) return undefined;

  const field = option.dataset.field ?? "";
  const note = form.querySelector("[data-command-field]");
  /** @type {Record<string, unknown>} */
  const payload = { CommandType: select.value };

  if (!field) {
    if (note) {
      // Update the guard on this path too. Without it, switching to a
      // fieldless CommandType and back leaves the guard stale and the
      // parameter inputs never come back.
      note.dataset.for = select.value;
      note.innerHTML = `<span class="unresolved">No parameter field is established for <code>${select.value}</code></span> — ${option.dataset.established ?? ""}`;
    }
    return payload;
  }

  // Render an input per scalar field of the parameter schema, so the composed
  // frame is complete without opening the schema page to learn that
  // DimmedLevelParameters holds a Level.
  const fields = JSON.parse(option.dataset.fields || "[]");
  if (note && note.dataset.for !== select.value) {
    note.dataset.for = select.value;
    note.innerHTML =
      `Parameter field <code>${field}</code> — ${option.dataset.established ?? ""}` +
      (fields.length > 0
        ? `<div class="paramfields">${fields
            .map(
              (/** @type {any} */ f) =>
                `<label>${f.name}<input data-payload="${f.name}" data-kind="${f.type}" placeholder="${f.example ?? f.type}"></label>`,
            )
            .join("")}</div>`
        : "");
  }

  /** @type {Record<string, unknown>} */
  const parameters = {};
  for (const input of form.querySelectorAll("[data-payload]")) {
    if (!(input instanceof HTMLInputElement) || input.value === "") continue;
    const numeric = input.dataset.kind !== "string";
    parameters[input.dataset.payload ?? ""] =
      numeric && input.value.trim() !== "" && !Number.isNaN(Number(input.value))
        ? Number(input.value)
        : input.value;
  }
  payload[field] = parameters;
  return payload;
}

/** @param {HTMLFormElement} form */
function refresh(form) {
  const output = form.querySelector("output.composed");
  if (!output) return;

  /** @type {Record<string, string>} */
  const params = {};
  for (const input of form.querySelectorAll("[data-param]"))
    if (input instanceof HTMLInputElement) params[input.name] = input.value;

  const wrapperKey = form.dataset.wrapper || undefined;
  const isCommand = !!form.querySelector("[data-command]");
  const payload = isCommand ? commandPayload(form) : undefined;

  try {
    output.textContent = composeFrame({
      url: form.dataset.url ?? "",
      communiqueType: form.dataset.communique ?? "ReadRequest",
      params,
      wrapperKey,
      payload,
    });
  } catch (error) {
    output.textContent = String(error instanceof Error ? error.message : error);
  }
}

const transport = getTransport();

for (const form of document.querySelectorAll("form.composer")) {
  if (!(form instanceof HTMLFormElement)) continue;
  form.addEventListener("input", () => refresh(form));
  form.addEventListener("change", () => refresh(form));
  refresh(form);

  const send = form.querySelector("button.send-frame");
  if (!(send instanceof HTMLButtonElement)) continue;
  if (!transport) {
    send.title =
      "The published docs cannot reach hardware. Run the local playground to enable this.";
    continue;
  }
  send.disabled = false;
  send.title = "Send this frame over the local bridge";
  send.addEventListener("click", async () => {
    const output = form.querySelector("output.composed");
    if (!output) return;
    send.disabled = true;
    try {
      output.textContent = await transport.send(output.textContent ?? "");
    } catch (error) {
      output.textContent = String(
        error instanceof Error ? error.message : error,
      );
    } finally {
      send.disabled = false;
    }
  });
}

/* ---------- provenance filter ---------- */

const filter = document.getElementById("confirmed-only");
if (filter instanceof HTMLInputElement)
  filter.addEventListener("change", () => {
    document.body.classList.toggle("confirmed-only", filter.checked);
  });

/* ---------- search ---------- */

const search = document.getElementById("search");
const results = document.getElementById("search-results");

if (search instanceof HTMLInputElement && results) {
  const model = await fetch(`${root}model.json`).then((r) => r.json());
  const index = buildSearchIndex(model);

  const render = () => {
    const hits = filterIndex(index, search.value);
    results.innerHTML = hits
      .map(
        (hit) =>
          `<li role="option"><a href="${root}${hit.href}" tabindex="-1">${hit.title}<span class="kind">${hit.kind}</span></a></li>`,
      )
      .join("");
    results.hidden = hits.length === 0;
    search.setAttribute("aria-expanded", String(!results.hidden));
    active = -1;
  };

  // Arrow keys move a selection through the results and Enter follows it, so
  // the search is usable without a mouse. Escape returns to the field.
  let active = -1;
  const options = () => [...results.querySelectorAll("li")];
  const highlight = (next) => {
    const items = options();
    if (items.length === 0) return;
    active = (next + items.length) % items.length;
    items.forEach((li, i) => {
      li.id = `search-hit-${i}`;
      li.classList.toggle("active", i === active);
    });
    items[active]?.scrollIntoView({ block: "nearest" });
    search.setAttribute("aria-activedescendant", `search-hit-${active}`);
  };

  search.addEventListener("input", render);
  search.addEventListener("focus", render);
  search.addEventListener("blur", () => {
    // Let a click on a result land before the list disappears.
    setTimeout(() => {
      results.hidden = true;
      search.setAttribute("aria-expanded", "false");
    }, 150);
  });
  search.addEventListener("keydown", (event) => {
    if (results.hidden) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      highlight(active + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      highlight(active - 1);
    } else if (event.key === "Enter" && active >= 0) {
      const link = options()[active]?.querySelector("a");
      if (link) {
        event.preventDefault();
        link.click();
      }
    } else if (event.key === "Escape") {
      results.hidden = true;
      search.setAttribute("aria-expanded", "false");
      active = -1;
    }
  });
}

export { root };
