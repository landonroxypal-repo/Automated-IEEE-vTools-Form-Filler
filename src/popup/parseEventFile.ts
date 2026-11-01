/** Far beyond any real event (the longest field is 8,192 characters), but small enough to parse instantly. */
export const MAX_EVENT_FILE_CHARS = 1_000_000;
/** A UTF-8 character is at most 4 bytes, so a file this big cannot be within the character limit. */
const MAX_EVENT_FILE_BYTES = MAX_EVENT_FILE_CHARS * 4;

export type EventFileReason = "empty" | "too-large" | "syntax" | "duplicate-key";
export type JsonPath = (string | number)[];

export class EventFileError extends Error {
  /** Only set for duplicate-key: the repeated key, the line of the repeat, and the object it is in. */
  key = "";
  line = 0;
  path: JsonPath = [];

  constructor(
    readonly reason: EventFileReason,
    message: string,
  ) {
    super(message);
    this.name = "EventFileError";
  }
}

const describePath = (path: JsonPath) =>
  path.length === 0
    ? "at the top level"
    : `inside ${path.map((p) => (typeof p === "number" ? `[${p}]` : JSON.stringify(p))).join(" > ")}`;

/**
 * Walks JSON text that JSON.parse has already accepted and throws on the first key repeated
 * within one object. Keys are compared after decoding escapes, so "a" and "a" collide.
 */
function assertNoDuplicateKeys(text: string): void {
  let i = 0;
  const skipSpace = () => {
    while (/\s/.test(text[i] ?? "")) i++;
  };
  const readString = () => {
    const start = i++;
    while (text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };
  const readValue = (path: JsonPath): void => {
    skipSpace();
    const c = text[i];
    if (c === "{") {
      i++;
      const keys = new Set<string>();
      skipSpace();
      if (text[i] === "}") {
        i++;
        return;
      }
      for (;;) {
        skipSpace();
        const keyStart = i;
        const key = readString();
        if (keys.has(key)) {
          const line = text.slice(0, keyStart).split("\n").length;
          const error = new EventFileError(
            "duplicate-key",
            `the key ${JSON.stringify(key)} appears more than once ${describePath(path)} (repeated on line ${line})`,
          );
          Object.assign(error, { key, line, path });
          throw error;
        }
        keys.add(key);
        skipSpace();
        i++; // the ':' JSON.parse already guaranteed
        readValue([...path, key]);
        skipSpace();
        if (text[i++] === "}") return;
      }
    }
    if (c === "[") {
      i++;
      skipSpace();
      if (text[i] === "]") {
        i++;
        return;
      }
      for (let index = 0; ; index++) {
        readValue([...path, index]);
        skipSpace();
        if (text[i++] === "]") return;
      }
    }
    if (c === '"') {
      readString();
      return;
    }
    while (i < text.length && !/[\s,\]}]/.test(text[i]!)) i++; // number, true, false, null
  };
  readValue([]);
}

/** Parses an event file's text, rejecting empty, oversized, invalid, or duplicate-key JSON. */
export function parseEventFile(text: string): unknown {
  if (typeof text !== "string") throw new TypeError(`text must be a string, got ${typeof text}`);
  if (text.length > MAX_EVENT_FILE_CHARS) {
    throw new EventFileError("too-large", `is ${text.length.toLocaleString()} characters; the limit is ${MAX_EVENT_FILE_CHARS.toLocaleString()}`);
  }
  const body = text.startsWith("﻿") ? text.slice(1) : text;
  if (body.trim() === "") throw new EventFileError("empty", "the file is empty");

  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch (e) {
    throw new EventFileError("syntax", `is not valid JSON: ${(e as Error).message}`);
  }
  assertNoDuplicateKeys(body);
  return value;
}

/** Reads and parses a chosen File. Rejects oversized files before reading them. */
export async function readEventFile(file: File): Promise<unknown> {
  const f = file as Partial<File> | null;
  if (typeof f !== "object" || f === null || typeof f.size !== "number" || typeof f.text !== "function") {
    throw new TypeError("file must be a File");
  }
  if (f.size > MAX_EVENT_FILE_BYTES) {
    throw new EventFileError("too-large", `is ${f.size.toLocaleString()} bytes; event files are far smaller than that`);
  }
  return parseEventFile(await file.text());
}
