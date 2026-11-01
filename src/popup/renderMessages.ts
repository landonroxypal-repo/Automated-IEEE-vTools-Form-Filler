import type { PopupMessage } from "./describeError";

const TONES = new Set(["info", "success", "error"]);

/**
 * Replaces the container's content with the message. Everything is inserted as text, so markup
 * that came from a JSON file is shown, never run.
 */
export function renderMessages(container: HTMLElement, message: PopupMessage): void {
  if (typeof container !== "object" || container === null || container.nodeType !== 1) {
    throw new TypeError("container must be an HTML element");
  }
  if (typeof message !== "object" || message === null) throw new TypeError("message must be an object");
  if (!TONES.has(message.tone)) throw new TypeError(`message.tone must be info, success, or error, got ${JSON.stringify(message.tone)}`);
  if (typeof message.title !== "string") throw new TypeError("message.title must be a string");
  if (!Array.isArray(message.lines) || !message.lines.every((l) => typeof l === "string")) {
    throw new TypeError("message.lines must be an array of strings");
  }

  const doc = container.ownerDocument;
  const title = doc.createElement("strong");
  title.textContent = message.title;
  const list = doc.createElement("ul");
  for (const line of message.lines) {
    const item = doc.createElement("li");
    item.textContent = line;
    list.append(item);
  }
  container.dataset.tone = message.tone;
  container.replaceChildren(title, ...(message.lines.length > 0 ? [list] : []));
}
