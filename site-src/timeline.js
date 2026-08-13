// Session timelines: replay a real frame log in order, so the two things prose
// works hardest to explain -- a push arriving on a tag the client already
// resolved, and 102 Processing not being terminal -- are visible rather than
// described.

/**
 * @param {Element} element
 * @param {{id: string, note: string, frames: any[]}} log
 */
export function mountTimeline(element, log) {
  const first = log.frames[0];
  const start = Number(first?.atMs ?? 0);

  const list = document.createElement("ol");
  for (const frame of log.frames) {
    const isPush = frame.CommuniqueType === "ReadResponse" && !frame.Body;
    const item = document.createElement("li");
    item.dataset.push = String(Boolean(frame.pushed));

    const at = document.createElement("span");
    at.className = "at";
    at.textContent =
      frame.atMs === undefined ? "" : `+${Number(frame.atMs) - start}ms`;

    const label = document.createElement("span");
    label.textContent =
      `${frame.CommuniqueType} ${frame.Header?.Url ?? ""} ${frame.Header?.StatusCode ?? ""}`.trim();

    item.append(at, label);

    const tag = frame.Header?.ClientTag;
    if (tag) {
      const note = document.createElement("span");
      note.className = "pushnote";
      note.textContent = ` ${tag}`;
      item.append(note);
    }
    if (isPush) item.dataset.push = "true";

    list.append(item);
  }
  element.append(list);

  const play = document.createElement("button");
  play.type = "button";
  play.textContent = "Replay";
  element.append(play);

  const items = [...list.children];
  const reveal = () => {
    for (const item of items) item.classList.remove("shown");
    items.forEach((item, index) => {
      setTimeout(() => item.classList.add("shown"), index * 220);
    });
  };
  play.addEventListener("click", reveal);
  // Static pages must not depend on JS to be readable, so everything starts
  // visible; replay is an extra, not a gate.
  for (const item of items) item.classList.add("shown");
}
