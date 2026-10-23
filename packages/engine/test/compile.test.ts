import { describe, expect, it } from "vitest";
import lockedStudy from "../../../packs/locked-study/pack.yaml?raw";
import { compile } from "../src/compile.ts";
import type { Diagnostic, SourceFile } from "../src/types.ts";
import brokenYaml from "./fixtures/compile/broken.yaml?raw";
import multiPack from "./fixtures/compile/multi/pack.yaml?raw";
import multiRooms from "./fixtures/compile/multi/rooms.yaml?raw";
import multiRules from "./fixtures/compile/multi/rules.yaml?raw";
import semanticYaml from "./fixtures/compile/semantic.yaml?raw";

const MULTI: SourceFile[] = [
  { name: "pack.yaml", text: multiPack },
  { name: "rooms.yaml", text: multiRooms },
  { name: "rules.yaml", text: multiRules },
];

/** Header lines 1-12 of an otherwise complete single-file pack. */
const HEAD = `format: lexvm-pack/1
id: t
version: 1.0.0
title: T
description: Test.
language: en
author: Test
license: CC0-1.0
start: { room: hall }
endings:
  done: { title: Done, text: The end., win: true }
walkthrough: [wait]
`;

function one(text: string, name = "pack.yaml") {
  return compile([{ name, text }]);
}

function only(diagnostics: Diagnostic[], code: string): Diagnostic {
  const matches = diagnostics.filter((d) => d.code === code);
  expect(matches, JSON.stringify(diagnostics, null, 2)).toHaveLength(1);
  return matches[0]!;
}

function errors(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.filter((d) => d.severity === "error");
}

describe("compile: valid packs", () => {
  it("compiles the reference pack without errors or warnings", () => {
    const result = compile([{ name: "pack.yaml", text: lockedStudy }]);
    expect(result.pack?.id).toBe("locked-study");
    expect(result.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
  });

  it("normalises lenient forms and fills defaults", () => {
    const result = one(`${HEAD}rooms:
  hall: { name: Hall, description: A hall. }
flags: { f: false }
rules:
  - on: { verb: wait }
    when: { not: { flag: f } }
    do: { set: f }
hints:
  - id: h
    until: { flag: f }
    steps: [Wait.]
`);
    expect(errors(result.diagnostics)).toEqual([]);
    const pack = result.pack!;
    expect(pack.policy).toBe("forgiving");
    expect(pack.verbs).toEqual({});
    expect(pack.objects).toEqual({});
    expect(pack.counters).toEqual({});
    expect(pack.dialogues).toEqual({});
    expect(pack.rules[0]!.when).toEqual([{ not: { flag: "f" } }]);
    expect(pack.rules[0]!.do).toEqual([{ set: "f" }]);
    expect(pack.hints[0]!.until).toEqual([{ flag: "f" }]);
  });

  it("is idempotent: compiled JSON compiles to the same pack", () => {
    const first = compile(MULTI).pack!;
    const second = compile([{ name: "multi-file.lexpack.json", text: JSON.stringify(first) }]);
    expect(errors(second.diagnostics)).toEqual([]);
    expect(second.pack).toEqual(first);
  });
});

describe("compile: merging files", () => {
  it("merges maps and concatenates lists, pack.yaml first, then by name", () => {
    const result = compile(MULTI);
    expect(errors(result.diagnostics)).toEqual([]);
    const pack = result.pack!;
    expect(Object.keys(pack.rooms)).toEqual(["hall", "garden"]);
    expect(pack.rules.map((r) => r.id)).toEqual(["ring_bell", "wait_in_garden"]);
  });

  it("does not depend on the order files are passed in", () => {
    const shuffled = [MULTI[2]!, MULTI[0]!, MULTI[1]!];
    expect(compile(shuffled)).toEqual(compile(MULTI));
  });

  it("reports a map key defined in two files, naming both files and lines", () => {
    const result = compile([
      ...MULTI,
      { name: "zzz.yaml", text: "# extra\nrooms:\n  garden:\n    name: Garden 2\n    description: Again.\n" },
    ]);
    expect(result.pack).toBeNull();
    const d = only(result.diagnostics, "compile.duplicate-key");
    expect(d).toMatchObject({ severity: "error", path: "rooms.garden", file: "zzz.yaml", line: 3 });
    expect(d.message).toContain("rooms.yaml (line 2)");
    expect(d.message).toContain("zzz.yaml (line 3)");
  });

  it("reports a scalar set in two files", () => {
    const result = compile([...MULTI, { name: "meta.yaml", text: "title: Other title\n" }]);
    const d = only(result.diagnostics, "compile.duplicate-key");
    expect(d).toMatchObject({ path: "title", file: "meta.yaml", line: 1 });
    expect(d.message).toContain("pack.yaml (line 4)");
  });

  it("reports a key that is a map in one file and a list in another", () => {
    const result = compile([...MULTI, { name: "x.yaml", text: "rooms:\n  - hall\n" }]);
    expect(only(result.diagnostics, "compile.type-mismatch")).toMatchObject({ path: "rooms", file: "x.yaml" });
  });

  it("rejects a file whose top level is not a map", () => {
    const result = compile([...MULTI, { name: "list.yaml", text: "- a\n- b\n" }]);
    expect(only(result.diagnostics, "compile.not-a-map")).toMatchObject({ file: "list.yaml", line: 1 });
  });

  it("ignores empty files and empty sections", () => {
    const result = compile([
      ...MULTI,
      { name: "empty.yaml", text: "# nothing yet\n" },
      { name: "x.yaml", text: "rules:\n" },
    ]);
    expect(errors(result.diagnostics)).toEqual([]);
  });

  it("maps analyzer diagnostics back to the file and line that defined the element", () => {
    const rules = multiRules.replace("at: garden", "at: gardn");
    const result = compile([MULTI[0]!, MULTI[1]!, { name: "rules.yaml", text: rules }]);
    const d = only(result.diagnostics, "ref.unknown-room");
    // The normalised path has a list index; the source line is the one with "at:".
    expect(d).toMatchObject({ path: "rules[1].when[0].at", file: "rules.yaml", line: 5 });
    expect(d.message).toContain('Did you mean "garden"?');
  });

  it("maps paths through single conditions that were normalised to lists", () => {
    const result = compile([
      MULTI[0]!,
      MULTI[1]!,
      {
        name: "rules.yaml",
        text: "rules:\n  - on: { verb: wait }\n    when:\n      flag: rung\n    do: { end: done }\n",
      },
    ]);
    expect(only(result.diagnostics, "ref.unknown-flag")).toMatchObject({
      path: "rules[1].when[0].flag",
      file: "rules.yaml",
      line: 4,
    });
  });
});

describe("compile: YAML errors", () => {
  it("reports syntax errors with file, line and column", () => {
    const result = one(
      "format: lexvm-pack/1\nrooms:\n  hall:\n    name: Hall\n   description: bad indent\n",
      "rooms.yaml",
    );
    expect(result.pack).toBeNull();
    const d = result.diagnostics[0]!;
    expect(d.code).toMatch(/^yaml\./);
    expect(d).toMatchObject({ severity: "error", file: "rooms.yaml", line: 5 });
    expect(d.message).toContain("line 5, column");
  });

  it("explains an unquoted ': ' inside a string", () => {
    const result = one(`${HEAD}rooms:\n  hall:\n    name: Hall\n    description: Er sagt: Hallo\n`);
    const d = result.diagnostics[0]!;
    expect(d).toMatchObject({ code: "yaml.block-as-implicit-key", line: 16 });
    expect(d.message).toContain("Quote the whole string");
  });

  it("reports duplicate keys within one file", () => {
    const result = one("a: 1\nb: 2\na: 3\n");
    expect(only(result.diagnostics, "yaml.duplicate-key")).toMatchObject({ line: 3 });
  });

  it("accepts JSON sources and reports their lines", () => {
    const result = one('{\n  "format": "lexvm-pack/1",\n  "id": "Bad Id"\n}\n', "pack.json");
    const d = result.diagnostics.find((x) => x.path === "id");
    expect(d).toMatchObject({ code: "schema.invalid_format", file: "pack.json", line: 3 });
  });

  it("never throws, even without files or with absurd nesting", () => {
    expect(compile([]).diagnostics[0]!.code).toBe("compile.no-files");
    const deep = `${HEAD}rooms: { hall: { name: H, description: d } }\nrules:\n  - on: { verb: wait }\n    when: ${"{ not: ".repeat(3000)}{ flag: x }${" }".repeat(3000)}\n    do: { say: x }\n`;
    const result = one(deep);
    expect(result.pack).toBeNull();
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});

describe("compile: schema diagnostics for repair loops", () => {
  it("catches the flow-mapping prose trap with a quoting hint", () => {
    const result = one(brokenYaml, "broken.yaml");
    expect(result.pack).toBeNull();
    const prose = result.diagnostics.find((d) => d.path === 'rules[0].do["sagt er."]');
    expect(prose, JSON.stringify(result.diagnostics, null, 2)).toBeDefined();
    expect(prose).toMatchObject({ code: "schema.unrecognized_keys", file: "broken.yaml", line: 25 });
    expect(prose!.message).toContain("quote the string");
    expect(prose!.message).toContain("', ' and ': ' split values");
  });

  it("suggests the closest key for an unknown condition key and lists valid keys", () => {
    const result = one(brokenYaml, "broken.yaml");
    const d = result.diagnostics.find((x) => x.path === "rules[0].when.flagg");
    expect(d).toMatchObject({ code: "schema.unrecognized_keys", line: 24 });
    expect(d!.message).toContain('Did you mean "flag"?');
    expect(d!.message).toContain("has, at, here, in, flag, counter, visited, isOpen, isLocked, not, all, any");
    // The consequential "must have exactly one key" issue is not reported separately.
    expect(result.diagnostics.filter((x) => x.path === "rules[0].when")).toEqual([]);
  });

  it("flags a bare word left over from an unquoted comma in an option", () => {
    const result = one(`${HEAD}rooms: { hall: { name: H, description: d } }
dialogues:
  chat:
    start: a
    nodes:
      a:
        options:
          - { id: yes, text: Ja, gerne }
`);
    const d = result.diagnostics.find((x) => x.path === "dialogues.chat.nodes.a.options[0].gerne");
    expect(d, JSON.stringify(result.diagnostics, null, 2)).toBeDefined();
    expect(d!.message).toContain("quote the string");
  });

  it("collapses union errors to the most specific branch", () => {
    const result = one(`${HEAD}rooms: { hall: { name: H, description: d } }
rules:
  - on: { verb: wait }
    when: { all: [{ flag: x }, { counter: { name: c, gte: "3" } }] }
    do: { say: x }
  - on: { verb: look }
    do: say hello
  - on: { verb: look }
    do: { say: 42 }
  - on: { event: exit }
    do: { say: x }
  - on: { verb: look, event: turn }
    do: { say: x }
`);
    const byPath = Object.fromEntries(result.diagnostics.map((d) => [d.path, d]));
    expect(byPath["rules[0].when.all[1].counter.gte"]).toMatchObject({ code: "schema.invalid_type", line: 16 });
    expect(byPath["rules[1].do"]!.message).toContain('write { say: "…" }');
    expect(byPath["rules[2].do.say"]!.message).toContain("got the number 42");
    expect(byPath["rules[3].on.event"]!.message).toContain('"start" or "enter" or "turn"');
    expect(byPath["rules[4].on"]!.message).toContain("cannot have both 'verb' and 'event'");
    expect(result.diagnostics).toHaveLength(5);
  });

  it("explains missing keys, bad ids and unquoted numbers", () => {
    const result = one(`${HEAD.replace("version: 1.0.0", "version: 1.0")}rooms:
  hall:
    name: Hall
    description: A hall.
    exits:
      Nord: { to: hall }
  cellar:
    name: Cellar
`);
    const byPath = Object.fromEntries(result.diagnostics.map((d) => [d.path, d]));
    expect(byPath.version!.message).toContain('quote the value, e.g. version: "…"');
    expect(byPath["rooms.hall.exits.Nord"]).toMatchObject({ code: "schema.invalid_key", line: 18 });
    expect(byPath["rooms.hall.exits.Nord"]!.message).toContain('"nord"');
    expect(byPath["rooms.cellar.description"]).toMatchObject({ code: "schema.invalid_type", line: 19 });
    expect(byPath["rooms.cellar.description"]!.message).toContain('Missing required key "description"');
  });

  it("reports semantic errors only after the schema passes", () => {
    const result = one(semanticYaml, "semantic.yaml");
    expect(result.pack).toBeNull();
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes.filter((c) => c === "ref.unknown-room")).toHaveLength(2);
    expect(result.diagnostics.find((d) => d.path === "start.room")).toMatchObject({ file: "semantic.yaml", line: 2 });
    expect(result.diagnostics.find((d) => d.path === "rooms.hall.exits.north.to")).toMatchObject({ line: 16 });
  });
});
