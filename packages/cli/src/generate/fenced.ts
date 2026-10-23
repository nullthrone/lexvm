/**
 * Parser for files embedded in LLM output as fenced code blocks.
 *
 * The expected form is a fence whose info string carries a file attribute:
 *
 *     ```yaml file=rooms.yaml
 *     rooms: ...
 *     ```
 *
 * Models do not always follow the format exactly, so the parser is lenient
 * about *how* a block is named (attribute variants, a bare file name in the
 * info string, a file name on the line just before the fence) but strict
 * about *what* a name may be: a plain file name with a `.yaml` or `.md`
 * extension. Anything with a directory part, `..`, a leading dot, control
 * characters or another extension is rejected, so model output can never
 * write outside the target directory. Prose between blocks is ignored.
 */

export type FileExtension = "yaml" | "md";

export interface FencedFile {
  /** Plain file name, e.g. "rooms.yaml". Validated by `checkFileName`. */
  name: string;
  /** Block content, always ending with a single newline. */
  content: string;
  /** Language tag of the fence, if any (e.g. "yaml"). */
  lang: string | null;
  /** 1-based line of the opening fence in the model output. */
  line: number;
}

export interface FenceIssue {
  severity: "error" | "warning";
  /** 1-based line of the opening fence. */
  line: number;
  message: string;
}

export interface FencedParseResult {
  files: FencedFile[];
  issues: FenceIssue[];
  /** Fenced blocks without a usable file name (and not claimed by `defaultName`). */
  unnamed: Array<{ lang: string | null; content: string; line: number }>;
}

export interface FencedParseOptions {
  /** Extensions accepted for this response. Default: yaml and md. */
  allowed?: readonly FileExtension[];
  /**
   * If the response contains exactly one unnamed block whose language fits,
   * it is treated as this file (e.g. "pack.yaml" for one-shot answers).
   */
  defaultName?: string;
}

const FILE_ATTR = /(?:^|[\s{,;])(?:file|filename|path|name|title)\s*[=:]\s*(?:"([^"]*)"|'([^']*)'|([^\s}]+))/i;
const NAME_LIKE = /^[^\s=]+\.[A-Za-z0-9]+$/;
const MAX_NAME_LENGTH = 64;

/**
 * Check that a model-supplied file name is a plain, safe file name.
 * Returns an error message, or null if the name is acceptable.
 */
export function checkFileName(name: string, allowed: readonly FileExtension[] = ["yaml", "md"]): string | null {
  if (name.length === 0) return "empty file name";
  if (name.length > MAX_NAME_LENGTH) return `file name longer than ${MAX_NAME_LENGTH} characters`;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
  if (/[\u0000-\u001f\u007f]/.test(name)) return "file name contains control characters";
  if (name.includes("/") || name.includes("\\")) return "file name must not contain a directory part ('/' or '\\')";
  if (name.includes("..")) return "file name must not contain '..'";
  if (name.startsWith(".")) return "file name must not start with '.'";
  if (/^[A-Za-z]:/.test(name)) return "file name must not be a drive path";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    return "file name may only contain letters, digits, '.', '_' and '-'";
  }
  const ext = name.slice(name.lastIndexOf(".") + 1);
  if (!(allowed as readonly string[]).includes(ext)) {
    return `extension '.${ext}' is not allowed here (allowed: ${allowed.map((e) => `.${e}`).join(", ")})`;
  }
  return null;
}

interface OpenFence {
  char: "`" | "~";
  length: number;
  indent: number;
  lang: string | null;
  name: string | null;
  line: number;
  body: string[];
}

function parseInfo(info: string): { lang: string | null; name: string | null } {
  const trimmed = info.trim();
  if (trimmed === "") return { lang: null, name: null };
  let name: string | null = null;
  const attr = FILE_ATTR.exec(trimmed);
  if (attr) name = attr[1] ?? attr[2] ?? attr[3] ?? null;
  const tokens = trimmed.split(/\s+/);
  const first = tokens[0] ?? "";
  // A first token that is an attribute or a file name is not a language tag.
  const firstIsAttr = /[=:]/.test(first);
  const firstIsName = !firstIsAttr && NAME_LIKE.test(first);
  const lang = firstIsAttr || firstIsName ? null : first.replace(/[{}]/g, "").toLowerCase() || null;
  if (name === null) {
    const bare = tokens.find((t, i) => (i > 0 || firstIsName) && NAME_LIKE.test(t) && !t.includes("="));
    if (bare) name = bare;
  }
  if (name !== null) name = name.replace(/^[`*"']+|[`*"',;}]+$/g, "");
  return { lang, name };
}

/** A file name standing alone on the line before a fence: "**rooms.yaml**", "### rooms.yaml", "File: `rooms.yaml`". */
function nameFromLeadIn(line: string | undefined): string | null {
  if (line === undefined) return null;
  const stripped = line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^(?:file|datei|filename)\s*:\s*/i, "")
    .replace(/[*_`"':]+/g, "")
    .trim();
  return NAME_LIKE.test(stripped) ? stripped : null;
}

function extensionOf(name: string): string {
  return name.slice(name.lastIndexOf(".") + 1).toLowerCase();
}

function langMatches(lang: string | null, ext: string): boolean {
  if (lang === null) return true;
  if (ext === "yaml") return lang === "yaml" || lang === "yml";
  if (ext === "md") return lang === "markdown" || lang === "md";
  return false;
}

/**
 * Extract named files from an LLM response.
 * Never throws; problems are reported in `issues`.
 */
export function parseFencedFiles(text: string, options: FencedParseOptions = {}): FencedParseResult {
  const allowed = options.allowed ?? ["yaml", "md"];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const files: FencedFile[] = [];
  const issues: FenceIssue[] = [];
  const unnamed: FencedParseResult["unnamed"] = [];
  let open: OpenFence | null = null;
  let lastNonBlank: string | undefined;

  const close = (fence: OpenFence) => {
    const content = `${fence.body.join("\n").replace(/\s+$/, "")}\n`;
    if (fence.name === null) {
      unnamed.push({ lang: fence.lang, content, line: fence.line });
      return;
    }
    const problem = checkFileName(fence.name, allowed);
    if (problem !== null) {
      issues.push({ severity: "error", line: fence.line, message: `rejected file '${fence.name}': ${problem}` });
      return;
    }
    files.push({ name: fence.name, content, lang: fence.lang, line: fence.line });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (open === null) {
      const m = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
      if (m && !(m[2]!.startsWith("`") && m[3]!.includes("`"))) {
        const { lang, name } = parseInfo(m[3]!);
        open = {
          char: m[2]!.startsWith("`") ? "`" : "~",
          length: m[2]!.length,
          indent: m[1]!.length,
          lang,
          name: name ?? nameFromLeadIn(lastNonBlank),
          line: i + 1,
          body: [],
        };
      } else if (line.trim() !== "") {
        lastNonBlank = line;
      }
      continue;
    }
    const closing = new RegExp(`^ {0,3}\\${open.char}{${open.length},}\\s*$`);
    if (closing.test(line)) {
      close(open);
      open = null;
      lastNonBlank = undefined;
      continue;
    }
    // Remove up to `indent` spaces of the opening fence's indentation (CommonMark).
    let body = line;
    for (let k = 0; k < open.indent && body.startsWith(" "); k++) body = body.slice(1);
    open.body.push(body);
  }

  if (open !== null) {
    issues.push({
      severity: "error",
      line: open.line,
      message: `code block${open.name ? ` for '${open.name}'` : ""} is not closed (output truncated?); it was ignored`,
    });
  }

  // Duplicates: the last block wins.
  const seen = new Map<string, number>();
  for (let i = files.length - 1; i >= 0; i--) {
    const f = files[i]!;
    if (seen.has(f.name)) {
      issues.push({
        severity: "warning",
        line: f.line,
        message: `'${f.name}' appears more than once; the last block wins`,
      });
      files.splice(i, 1);
    } else {
      seen.set(f.name, i);
    }
  }

  if (options.defaultName !== undefined && files.length === 0) {
    const ext = extensionOf(options.defaultName);
    const fitting = unnamed.filter((u) => langMatches(u.lang, ext));
    if (fitting.length === 1) {
      const block = fitting[0]!;
      files.push({ name: options.defaultName, content: block.content, lang: block.lang, line: block.line });
      unnamed.splice(unnamed.indexOf(block), 1);
    } else if (fitting.length > 1) {
      issues.push({
        severity: "error",
        line: fitting[0]!.line,
        message: `found ${fitting.length} unnamed code blocks; expected exactly one for '${options.defaultName}'`,
      });
    }
  }

  return { files, issues, unnamed };
}

/** Wrap content in a fence that cannot be closed by anything inside it. */
export function fenceFile(name: string, content: string): string {
  const lang = extensionOf(name) === "md" ? "markdown" : extensionOf(name);
  const longestRun = Math.max(2, ...[...content.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(longestRun + 1);
  const body = content.endsWith("\n") ? content : `${content}\n`;
  return `${fence}${lang} file=${name}\n${body}${fence}`;
}
