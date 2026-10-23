import type { Diagnostic } from "@lexvm/engine";
import { flag, parseArgs, UsageError } from "../args.ts";
import { compileSource, expandTargets, readPackSource } from "../sources.ts";
import { color, formatDiagnostic, out, summarizeCounts } from "../term.ts";

export const VALIDATE_HELP = `Usage: lexvm validate <packDir|packsDir|file.yaml|file.lexpack.json>... [options]

Schema and semantic checks of content packs. A directory without pack.yaml
stands for all pack directories directly inside it.

Output: one line per diagnostic, "file:line  severity  code  path  message".

Options:
  --json           Machine-readable output: [{ target, pack, ok, diagnostics }]
  --errors-only    Print errors only (warnings and info are still counted)
  -h, --help       Show this help

Exit codes: 0 no errors, 1 errors found, 2 usage error.`;

export interface ValidateEntry {
  target: string;
  pack: string | null;
  ok: boolean;
  diagnostics: Diagnostic[];
}

export function runValidate(argv: string[]): number {
  const args = parseArgs(argv, {
    json: { type: "boolean" },
    "errors-only": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  });
  if (flag(args, "help")) {
    out(VALIDATE_HELP);
    return 0;
  }
  if (args.positionals.length === 0) throw new UsageError("validate needs at least one pack, packs directory or file");
  const entries: ValidateEntry[] = [];
  let failed = false;
  for (const target of expandTargets(args.positionals)) {
    const source = readPackSource(target);
    const result = compileSource(source);
    const ok = result.pack !== null;
    if (!ok) failed = true;
    if (flag(args, "json")) {
      entries.push({ target, pack: result.pack?.id ?? null, ok, diagnostics: result.diagnostics });
      continue;
    }
    const shown = flag(args, "errors-only")
      ? result.diagnostics.filter((d) => d.severity === "error")
      : result.diagnostics;
    for (const d of shown) out(formatDiagnostic(d, source.baseDir, target));
    out(`${ok ? color.green("ok") : color.red("FAILED")}  ${target}: ${summarizeCounts(result.diagnostics)}`);
  }
  if (flag(args, "json")) out(JSON.stringify(entries, null, 2));
  return failed ? 1 : 0;
}
