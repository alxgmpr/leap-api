// Progressive enhancement entry point. Every page is complete without this
// file: frames, tables, schemas and platform data are all in the HTML. This
// adds the composer, copy buttons, search, the provenance filter and the
// session timelines.

import { composeFrame } from "./compose.js";
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
    if (note)
      note.innerHTML = `<span class="unresolved">No parameter field is established for <code>${select.value}</code></span> — ${option.dataset.established ?? ""}`;
    return payload;
  }

  if (note)
    note.innerHTML = `Parameter field <code>${field}</code> — ${option.dataset.established ?? ""}`;
  payload[field] = {};
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

  const send = form.querySelector("button.send");
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

export { root };
