import { describe, expect, it, vi } from "vitest";
import { EventFileError, MAX_EVENT_FILE_CHARS, parseEventFile, readEventFile } from "../../src/popup/parseEventFile";

function expectReason(fn: () => unknown, reason: EventFileError["reason"]): EventFileError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(EventFileError);
    expect((e as EventFileError).reason).toBe(reason);
    return e as EventFileError;
  }
  throw new Error(`expected EventFileError(${reason}) but nothing was thrown`);
}

describe("parseEventFile: valid input", () => {
  it("parses a JSON object", () => {
    expect(parseEventFile('{"meeting[title]": "Workshop", "meeting[require_terms]": true}')).toEqual({
      "meeting[title]": "Workshop",
      "meeting[require_terms]": true,
    });
  });

  it("strips the byte-order mark Windows editors add", () => {
    expect(parseEventFile('﻿{"meeting[title]": "Workshop"}')).toEqual({ "meeting[title]": "Workshop" });
  });

  it("does not treat the same key in different objects as a duplicate", () => {
    expect(parseEventFile('{"a": {"k": 1}, "b": {"k": 2}}')).toEqual({ a: { k: 1 }, b: { k: 2 } });
  });

  it("does not treat keys that differ only in case as duplicates", () => {
    expect(parseEventFile('{"A": 1, "a": 2}')).toEqual({ A: 1, a: 2 });
  });

  it("is not confused by braces, quotes, and backslashes inside strings", () => {
    expect(parseEventFile(String.raw`{"a": "}\"{,:[", "b": "\\", "c": "x"}`)).toEqual({ a: '}"{,:[', b: "\\", c: "x" });
  });

  it("accepts a file of exactly the maximum size", () => {
    const text = `{"a": "${"x".repeat(MAX_EVENT_FILE_CHARS - 9)}"}`;
    expect(text).toHaveLength(MAX_EVENT_FILE_CHARS);
    expect(() => parseEventFile(text)).not.toThrow();
  });
});

describe("parseEventFile: invalid input throws", () => {
  it.each([null, undefined, 5, {}, ["{}"]])("throws TypeError for the non-string %j", (text) => {
    expect(() => parseEventFile(text as string)).toThrow(TypeError);
    expect(() => parseEventFile(text as string)).toThrow(/text must be a string/);
  });

  it.each(["", "   \n\t ", "﻿"])("rejects the empty file %j", (text) => {
    expectReason(() => parseEventFile(text), "empty");
  });

  it.each(['{"a": 1,}', "{'a': 1}", '{"a": 1} // note', '{"a": 1', "{a: 1}", '{"a": 1}{"b": 2}'])(
    "rejects the invalid JSON %j",
    (text) => {
      expectReason(() => parseEventFile(text), "syntax");
    },
  );

  it("rejects a file larger than the maximum", () => {
    expectReason(() => parseEventFile(`{"a": "${"x".repeat(MAX_EVENT_FILE_CHARS)}"}`), "too-large");
  });
});

describe("parseEventFile: duplicate keys", () => {
  it("rejects a duplicated top-level key, naming the key and the line of the repeat", () => {
    const error = expectReason(
      () => parseEventFile('{\n  "meeting[title]": "First",\n  "meeting[city]": "X",\n  "meeting[title]": "Second"\n}'),
      "duplicate-key",
    );
    expect(error).toMatchObject({ key: "meeting[title]", line: 4, path: [] });
    expect(error.message).toMatch(/"meeting\[title\]".*line 4/);
  });

  it("recognizes duplicates written with escape sequences", () => {
    const error = expectReason(() => parseEventFile(String.raw`{"a": 1, "a": 2}`), "duplicate-key");
    expect(error.key).toBe("a");
  });

  it("recognizes a duplicate after a key ending in an escaped backslash", () => {
    expectReason(() => parseEventFile(String.raw`{"x\\": 1, "x\\": 2}`), "duplicate-key");
  });

  it("rejects duplicates inside nested objects, giving the path", () => {
    const error = expectReason(() => parseEventFile('{"meeting": {"x": 1, "x": 2}}'), "duplicate-key");
    expect(error.path).toEqual(["meeting"]);
    expect(error.message).toMatch(/inside "meeting"/);
  });

  it("rejects duplicates inside objects within arrays", () => {
    const error = expectReason(() => parseEventFile('[{"ok": 1}, {"a": 1, "a": 2}]'), "duplicate-key");
    expect(error.path).toEqual([1]);
  });
});

describe("readEventFile", () => {
  it("reads and parses a File", async () => {
    const file = new File(['{"meeting[title]": "Workshop"}'], "event.json", { type: "application/json" });
    await expect(readEventFile(file)).resolves.toEqual({ "meeting[title]": "Workshop" });
  });

  it("passes through duplicate-key errors from the content", async () => {
    const file = new File(['{"a": 1, "a": 2}'], "event.json");
    await expect(readEventFile(file)).rejects.toMatchObject({ reason: "duplicate-key" });
  });

  it("rejects an oversized file without reading it", async () => {
    const text = vi.fn();
    const huge = { name: "huge.json", size: MAX_EVENT_FILE_CHARS * 4 + 1, text };
    await expect(readEventFile(huge as unknown as File)).rejects.toMatchObject({ reason: "too-large" });
    expect(text).not.toHaveBeenCalled();
  });

  it.each([null, undefined, "event.json", {}, { size: 10 }])("throws TypeError for the non-file %j", async (file) => {
    await expect(readEventFile(file as never)).rejects.toThrow(/file must be a File/);
  });
});
