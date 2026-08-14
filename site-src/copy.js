// Copy controls for the wire blocks.
//
// The exact line is the reason this reference exists, so every block that
// holds one gets a control to take it. The controls are injected rather than
// rendered into the HTML for two reasons: a button baked into the markup
// would be dead on a page whose JavaScript never arrives, and a data-copy
// attribute would carry a second copy of every frame on a page that already
// runs to megabytes. The text comes out of the block itself at click time.

/** How long the control stays confirmed before returning to its icon. */
const CONFIRM_MS = 1200;

const COPY_ICON =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">' +
  '<rect x="5.5" y="5.5" width="8" height="9" rx="1.5" fill="none" stroke="currentColor"/>' +
  '<path d="M10.5 3.5v-1a1 1 0 0 0-1-1h-7a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1" fill="none" stroke="currentColor"/>' +
  "</svg>";

const DONE_ICON =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">' +
  '<path d="M3 8.5l3.5 3.5L13 4.5" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
  "</svg>";

/**
 * Give every wire block a copy control.
 *
 * Safe to call more than once: a block already wrapped is skipped, so a later
 * caller cannot leave a block wearing two buttons.
 *
 * @param {ParentNode} root
 * @param {(text: string) => Promise<void>} [write] where the text goes;
 *   the clipboard, unless a test says otherwise
 */
export function attachCopyButtons(root, write) {
  const document = /** @type {Document} */ (
    /** @type {any} */ (root).ownerDocument ?? root
  );
  const put = write ?? ((text) => navigator.clipboard.writeText(text));

  for (const block of root.querySelectorAll("pre.wire")) {
    if (block.parentElement?.classList.contains("copywrap")) continue;

    // The button is a sibling of the block, not a child: a body block is a
    // scroll container, and a control inside one scrolls away with the text.
    const wrap = document.createElement("div");
    wrap.className = "copywrap";
    block.replaceWith(wrap);
    wrap.append(block);

    const button = document.createElement("button");
    button.className = "copy";
    button.type = "button";
    button.setAttribute("aria-label", "Copy");
    button.innerHTML = COPY_ICON;

    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let revert;
    button.addEventListener("click", async () => {
      await put(block.textContent ?? "");
      button.setAttribute("aria-label", "Copied");
      button.innerHTML = DONE_ICON;
      clearTimeout(revert);
      revert = setTimeout(() => {
        button.setAttribute("aria-label", "Copy");
        button.innerHTML = COPY_ICON;
      }, CONFIRM_MS);
    });

    wrap.append(button);
  }
}
