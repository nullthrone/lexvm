/** Minimal argument parsing: `--name value`, `--name=value`, boolean flags, `-h`, and `--`. */

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export interface OptionSpec {
  type: "boolean" | "string";
  /** One-letter alias, e.g. "o" for -o. */
  short?: string;
}

export interface ParsedArgs {
  positionals: string[];
  options: Record<string, string | boolean | undefined>;
}

export function parseArgs(argv: readonly string[], spec: Record<string, OptionSpec>): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string | boolean | undefined> = {};
  const byShort = new Map(
    Object.entries(spec)
      .filter(([, s]) => s.short !== undefined)
      .map(([name, s]) => [s.short!, name]),
  );
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    let name: string | undefined;
    let inline: string | undefined;
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      name = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
      inline = eq >= 0 ? arg.slice(eq + 1) : undefined;
    } else if (arg.length === 2 && arg.startsWith("-") && arg !== "-") {
      name = byShort.get(arg[1]!);
      if (name === undefined) throw new UsageError(`unknown option ${arg}`);
    } else {
      positionals.push(arg);
      continue;
    }
    const option = spec[name];
    if (option === undefined) throw new UsageError(`unknown option --${name}`);
    if (option.type === "boolean") {
      if (inline !== undefined) throw new UsageError(`option --${name} does not take a value`);
      options[name] = true;
      continue;
    }
    const value = inline ?? argv[++i];
    if (value === undefined) throw new UsageError(`option --${name} needs a value`);
    options[name] = value;
  }
  return { positionals, options };
}

export function stringOption(args: ParsedArgs, name: string): string | undefined {
  const v = args.options[name];
  return typeof v === "string" ? v : undefined;
}

export function flag(args: ParsedArgs, name: string): boolean {
  return args.options[name] === true;
}

export function intOption(args: ParsedArgs, name: string): number | undefined {
  const v = stringOption(args, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new UsageError(`--${name} needs a positive integer, got "${v}"`);
  return n;
}
