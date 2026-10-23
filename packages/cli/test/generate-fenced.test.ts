import { describe, expect, it } from "vitest";
import { checkFileName, fenceFile, parseFencedFiles } from "../src/generate/fenced.ts";

describe("parseFencedFiles", () => {
  it("extracts named blocks and ignores prose", () => {
    const text = [
      "Here are the files.",
      "",
      "```yaml file=rooms.yaml",
      "rooms:",
      "  hall:",
      "    name: Hall",
      "```",
      "",
      "Some notes in between.",
      "",
      "```yaml file=objects.yaml",
      "objects: {}",
      "```",
      "Done.",
    ].join("\n");
    const result = parseFencedFiles(text);
    expect(result.issues).toEqual([]);
    expect(result.files.map((f) => f.name)).toEqual(["rooms.yaml", "objects.yaml"]);
    expect(result.files[0]!.content).toBe("rooms:\n  hall:\n    name: Hall\n");
    expect(result.files[0]!.lang).toBe("yaml");
    expect(result.files[1]!.content).toBe("objects: {}\n");
  });

  it("accepts common variations of naming a block", () => {
    const text = [
      "```file=a.yaml",
      "a: 1",
      "```",
      '```yaml file="b.yaml"',
      "b: 1",
      "```",
      "```yaml c.yaml",
      "c: 1",
      "```",
      "**d.yaml**",
      "```yaml",
      "d: 1",
      "```",
      "### e.yaml",
      "",
      "```",
      "e: 1",
      "```",
      "```yaml {file=f.yaml}",
      "f: 1",
      "```",
      "~~~yaml filename: g.yaml",
      "g: 1",
      "~~~",
      "```g2.yaml",
      "g2: 1",
      "```",
    ].join("\n");
    const result = parseFencedFiles(text);
    expect(result.issues).toEqual([]);
    expect(result.files.map((f) => [f.name, f.content])).toEqual([
      ["a.yaml", "a: 1\n"],
      ["b.yaml", "b: 1\n"],
      ["c.yaml", "c: 1\n"],
      ["d.yaml", "d: 1\n"],
      ["e.yaml", "e: 1\n"],
      ["f.yaml", "f: 1\n"],
      ["g.yaml", "g: 1\n"],
      ["g2.yaml", "g2: 1\n"],
    ]);
    expect(result.files[0]!.lang).toBeNull();
  });

  it("rejects malicious or non-plain file names", () => {
    const names = [
      "../evil.yaml",
      "../../etc/passwd.yaml",
      "/etc/evil.yaml",
      "sub/dir.yaml",
      "..\\evil.yaml",
      "C:evil.yaml",
      ".hidden.yaml",
      "evil.sh",
      "evil.json",
      "evil.yml",
      "pack.yaml.exe",
      `${"x".repeat(80)}.yaml`,
      "a..b.yaml",
    ];
    const text = names.map((n) => `\`\`\`yaml file=${n}\nx: 1\n\`\`\``).join("\n\n");
    const result = parseFencedFiles(text);
    expect(result.files).toEqual([]);
    expect(result.issues).toHaveLength(names.length);
    for (const issue of result.issues) expect(issue.severity).toBe("error");
    expect(result.issues[0]!.message).toContain("rejected file '../evil.yaml'");
    expect(result.issues[3]!.message).toContain("directory");
    expect(result.issues.at(-1)!.message).toContain("'..'");
  });

  it("rejects control characters and unsafe names from lead-in lines", () => {
    expect(checkFileName("pack\u0000.yaml")).toMatch(/control/);
    expect(checkFileName("rooms.yaml")).toBeNull();
    expect(checkFileName("concept.md")).toBeNull();
    expect(checkFileName("concept.md", ["yaml"])).toMatch(/not allowed/);
    const result = parseFencedFiles("**../x.yaml**\n```yaml\nx: 1\n```");
    expect(result.files).toEqual([]);
    expect(result.issues[0]!.message).toContain("rejected file '../x.yaml'");
  });

  it("only accepts the allowed extensions", () => {
    const text = "```markdown file=notes.md\n# Notes\n```\n```yaml file=rules.yaml\nrules: []\n```";
    const result = parseFencedFiles(text, { allowed: ["yaml"] });
    expect(result.files.map((f) => f.name)).toEqual(["rules.yaml"]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.message).toContain(".md");
  });

  it("reports an unclosed (truncated) block and drops it", () => {
    const text = "```yaml file=a.yaml\na: 1\n```\n```yaml file=b.yaml\nb: [1, 2";
    const result = parseFencedFiles(text);
    expect(result.files.map((f) => f.name)).toEqual(["a.yaml"]);
    expect(result.issues).toEqual([expect.objectContaining({ severity: "error", line: 4 })]);
    expect(result.issues[0]!.message).toContain("b.yaml");
  });

  it("handles longer fences containing inner fences", () => {
    const text = "````markdown file=puzzles.md\n# Puzzles\n\n```mermaid\nflowchart TD\n  a --> b\n```\n\nEnd.\n````\n";
    const result = parseFencedFiles(text);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.content).toBe("# Puzzles\n\n```mermaid\nflowchart TD\n  a --> b\n```\n\nEnd.\n");
  });

  it("lets the last of duplicate blocks win", () => {
    const text = "```yaml file=a.yaml\nv: 1\n```\n```yaml file=a.yaml\nv: 2\n```";
    const result = parseFencedFiles(text);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.content).toBe("v: 2\n");
    expect(result.issues).toEqual([expect.objectContaining({ severity: "warning" })]);
  });

  it("uses defaultName for a single unnamed block and reports ambiguity", () => {
    const one = parseFencedFiles("Design...\n```yaml\nformat: lexvm-pack/1\n```\nSelf-check: ok", {
      defaultName: "pack.yaml",
    });
    expect(one.files.map((f) => f.name)).toEqual(["pack.yaml"]);
    expect(one.unnamed).toEqual([]);
    const mermaidAndYaml = parseFencedFiles("```mermaid\nflowchart TD\n```\n```yaml\na: 1\n```", {
      defaultName: "pack.yaml",
    });
    expect(mermaidAndYaml.files.map((f) => f.content)).toEqual(["a: 1\n"]);
    const two = parseFencedFiles("```yaml\na: 1\n```\n```yaml\nb: 1\n```", { defaultName: "pack.yaml" });
    expect(two.files).toEqual([]);
    expect(two.issues[0]!.message).toContain("unnamed");
  });

  it("strips CRLF and the opening fence's indentation", () => {
    const result = parseFencedFiles("  ```yaml file=a.yaml\r\n  a:\r\n    b: 1\r\n  ```\r\n");
    expect(result.files[0]!.content).toBe("a:\n  b: 1\n");
  });
});

describe("fenceFile", () => {
  it("round-trips content that itself contains fences", () => {
    const content = "# Doc\n\n````text\nx\n````\n";
    const fenced = fenceFile("doc.md", content);
    expect(fenced.startsWith("`````markdown file=doc.md\n")).toBe(true);
    const parsed = parseFencedFiles(`Intro\n\n${fenced}\n\nOutro`);
    expect(parsed.files).toEqual([expect.objectContaining({ name: "doc.md", content })]);
  });
});
