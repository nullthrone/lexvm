/**
 * Per-pack precomputation shared by the runtime, the parser and the explorer:
 * rule lists by trigger, verb metadata, object order. Cached per Pack object
 * (packs are treated as immutable once parsed).
 */
import { type Messages, messagesFor } from "./messages/index.ts";
import {
  CORE_VERBS,
  type CommandTrigger,
  type CoreVerb,
  type Effect,
  type EventTrigger,
  type Pack,
  type Rule,
  type Verb,
} from "./schema.ts";

export interface RuleRef {
  index: number;
  rule: Rule;
  /** Key recorded in `state.fired` for `once` rules (the id, or "rules[i]" as a fallback); null otherwise. */
  onceKey: string | null;
  /** Diagnostic label: the id or "rules[i]". */
  label: string;
  /** Only prints text (say/look), never changes state. Used by the explorer to prune candidates. */
  pure: boolean;
}

export interface CommandRuleRef extends RuleRef {
  trigger: CommandTrigger;
}

export interface EventRuleRef extends RuleRef {
  trigger: EventTrigger;
}

export interface VerbInfo {
  id: string;
  core: boolean;
  /** Minimum and maximum number of objects (`object`, `with`) a command may carry. */
  min: number;
  max: number;
  /** Arity shown to the UI (VerbView). */
  sheetArity: 0 | 1 | 2;
  label: string;
  prep?: string;
  def?: Verb;
}

export interface PackIndex {
  m: Messages;
  objectIds: string[];
  roomIds: string[];
  npcIds: string[];
  commandRules: Map<string, CommandRuleRef[]>;
  startRules: EventRuleRef[];
  enterRules: EventRuleRef[];
  turnRules: EventRuleRef[];
  allRules: RuleRef[];
  verbs: Map<string, VerbInfo>;
  /** Verbs for the UI verb list, in display order (core verbs first, then pack verbs). */
  verbOrder: string[];
}

/** Object counts per core verb: [min, max, sheetArity]. `go`/`choose` take an exit/option id. */
const CORE_ARITY: Record<CoreVerb, [number, number, 0 | 1 | 2]> = {
  look: [0, 1, 1],
  take: [1, 1, 1],
  drop: [1, 1, 1],
  open: [1, 1, 1],
  close: [1, 1, 1],
  use: [1, 2, 2],
  talk: [1, 1, 1],
  give: [2, 2, 2],
  show: [2, 2, 2],
  push: [1, 1, 1],
  pull: [1, 1, 1],
  go: [1, 1, 0],
  wait: [0, 0, 0],
  inventory: [0, 0, 0],
  choose: [1, 1, 0],
};

const CORE_SET: ReadonlySet<string> = new Set(CORE_VERBS);

export function isCoreVerb(id: string): id is CoreVerb {
  return CORE_SET.has(id);
}

const cache = new WeakMap<Pack, PackIndex>();

export function indexPack(pack: Pack): PackIndex {
  let ix = cache.get(pack);
  if (!ix) {
    ix = buildIndex(pack);
    cache.set(pack, ix);
  }
  return ix;
}

function buildIndex(pack: Pack): PackIndex {
  const m = messagesFor(pack.language);
  const objectIds = Object.keys(pack.objects);
  const commandRules = new Map<string, CommandRuleRef[]>();
  const startRules: EventRuleRef[] = [];
  const enterRules: EventRuleRef[] = [];
  const turnRules: EventRuleRef[] = [];
  const allRules: RuleRef[] = [];

  pack.rules.forEach((rule, index) => {
    const label = rule.id ?? `rules[${index}]`;
    const base: RuleRef = {
      index,
      rule,
      onceKey: rule.once ? label : null,
      label,
      pure: !rule.once && effectsArePure(rule.do),
    };
    allRules.push(base);
    if ("verb" in rule.on) {
      const trigger = rule.on;
      const list = commandRules.get(trigger.verb) ?? [];
      list.push({ ...base, trigger });
      commandRules.set(trigger.verb, list);
    } else {
      const ref: EventRuleRef = { ...base, trigger: rule.on };
      if (rule.on.event === "start") startRules.push(ref);
      else if (rule.on.event === "enter") enterRules.push(ref);
      else turnRules.push(ref);
    }
  });

  const verbs = new Map<string, VerbInfo>();
  const verbOrder: string[] = [];
  for (const id of CORE_VERBS) {
    const def = pack.verbs[id];
    const [min, max, sheetArity] = CORE_ARITY[id];
    const prep = def?.prep ?? (id === "use" || id === "give" || id === "show" ? m.preps[id] : undefined);
    verbs.set(id, {
      id,
      core: true,
      min,
      max,
      sheetArity,
      label: def?.label ?? m.verbLabels[id],
      ...(prep !== undefined ? { prep } : {}),
      ...(def ? { def } : {}),
    });
    if (id !== "go" && id !== "choose") verbOrder.push(id);
  }
  for (const [id, def] of Object.entries(pack.verbs)) {
    if (isCoreVerb(id)) continue;
    const arity = def.arity ?? 1;
    verbs.set(id, {
      id,
      core: false,
      min: arity,
      max: arity,
      sheetArity: arity,
      label: def.label,
      ...(def.prep !== undefined ? { prep: def.prep } : {}),
      def,
    });
    verbOrder.push(id);
  }

  return {
    m,
    objectIds,
    roomIds: Object.keys(pack.rooms),
    npcIds: objectIds.filter((id) => pack.objects[id]?.npc === true),
    commandRules,
    startRules,
    enterRules,
    turnRules,
    allRules,
    verbs,
    verbOrder,
  };
}

/** Effects that only print (say, look) and branch on conditions. */
export function effectsArePure(effects: readonly Effect[] | undefined): boolean {
  if (!effects) return true;
  for (const e of effects) {
    if ("say" in e || "look" in e) continue;
    if ("if" in e) {
      if (effectsArePure(e.if.then) && effectsArePure(e.if.else)) continue;
      return false;
    }
    return false;
  }
  return true;
}
